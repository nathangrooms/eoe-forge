/**
 * Shared data plumbing for the platform-feature sections of the homepage.
 *
 * Three jobs, all of them there for a measured reason:
 *
 *   1. **Nothing loads above the fold.** Every one of these sections sits deep
 *      down the page, so each waits for `useNearViewport` before it asks the
 *      database anything. First paint is unaffected by them.
 *   2. **One request per fact, for the whole page.** The loaders are memoised at
 *      module level and return the same promise to every caller, so two sections
 *      wanting the same rows make one round trip, not two.
 *   3. **Real rows or nothing.** Every card drawn in these sections is a row out
 *      of the `cards` table and every price is a row out of `card_price_history`.
 *      There is no seeded data here and no placeholder art.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** A `cards` row, narrowed to what the marketing sections actually draw. */
export interface MarketingCard {
  id: string;
  name: string;
  type_line: string;
  mana_cost: string | null;
  cmc: number | null;
  power: string | null;
  toughness: string | null;
  color_identity: string[] | null;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
  set_code: string;
  rarity: string | null;
}

const CARD_COLUMNS =
  'id,name,type_line,mana_cost,cmc,power,toughness,color_identity,image_uris,prices,set_code,rarity';

function hasArt(card: MarketingCard | undefined): card is MarketingCard {
  return Boolean(card?.image_uris?.normal);
}

/* -------------------------------------------------------------------------- */
/* Viewport gate                                                              */
/* -------------------------------------------------------------------------- */

/**
 * True once the element has come within `rootMargin` of the viewport, and true
 * for good after that — these sections load once and never unload.
 *
 * Falls open when `IntersectionObserver` is missing so an old browser gets the
 * content rather than an empty section.
 */
export function useNearViewport<T extends HTMLElement>(rootMargin = '600px') {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return [ref, near] as const;
}

/**
 * True on a narrow viewport.
 *
 * `CardImage` sizes in real pixels — it has to, because the resolution it asks
 * Scryfall for follows the rendered width, and a tapped permanent is rotated by
 * a transform that needs its box swapped in advance. Neither can be expressed in
 * a Tailwind breakpoint, so the one card scale on the page is chosen here.
 */
export function useCompact(query = '(max-width: 639px)'): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setCompact(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return compact;
}

/**
 * Run a memoised loader once the section is near the viewport.
 *
 * `load` is deliberately not a dependency: every loader below is a module-level
 * function whose identity never changes, and listing it would re-run the effect
 * on each render of any caller that passes an inline arrow.
 */
export function useDeferred<T>(near: boolean, load: () => Promise<T>): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    load()
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        /* A section that cannot load its rows renders its skeleton. */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  return data;
}

/* -------------------------------------------------------------------------- */
/* Card lookups                                                               */
/* -------------------------------------------------------------------------- */

const byNameCache = new Map<string, Promise<Map<string, MarketingCard>>>();

/**
 * Cards keyed by lower-cased name.
 *
 * A name can have several printings in the table and the older rows may carry
 * no imagery, so the first printing *with art* wins rather than the first row
 * full stop — the same rule `useMatArt` uses.
 */
export function loadCardsByName(
  key: string,
  names: readonly string[]
): Promise<Map<string, MarketingCard>> {
  const hit = byNameCache.get(key);
  if (hit) return hit;

  const promise = (async () => {
    const { data } = await supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .in('name', names as string[])
      .limit(names.length * 5);

    const rows = (data ?? []) as unknown as MarketingCard[];
    const out = new Map<string, MarketingCard>();
    for (const row of rows) {
      if (!row?.name) continue;
      const slot = row.name.trim().toLowerCase();
      const existing = out.get(slot);
      if (!existing || (!hasArt(existing) && hasArt(row))) out.set(slot, row);
    }
    return out;
  })();

  byNameCache.set(key, promise);
  return promise;
}

const byIdCache = new Map<string, Promise<Map<string, MarketingCard>>>();

/** Cards keyed by Scryfall printing id — the join `precon-index` is built on. */
export function loadCardsById(
  key: string,
  ids: readonly string[]
): Promise<Map<string, MarketingCard>> {
  const hit = byIdCache.get(key);
  if (hit) return hit;

  const promise = (async () => {
    const { data } = await supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .in('id', ids as string[])
      .limit(ids.length);

    const rows = (data ?? []) as unknown as MarketingCard[];
    return new Map(rows.filter(hasArt).map(row => [row.id, row]));
  })();

  byIdCache.set(key, promise);
  return promise;
}

/* -------------------------------------------------------------------------- */
/* Price history                                                              */
/* -------------------------------------------------------------------------- */

export interface TrackedCard {
  card: MarketingCard;
  /** Every snapshot for this card, oldest first. */
  series: number[];
  first: number;
  last: number;
  low: number;
  high: number;
  /** Fractional change across the whole tracked window. */
  change: number;
}

export interface PriceTracking {
  cards: TrackedCard[];
  /** ISO date of the oldest snapshot in the returned series. */
  from: string;
  /** ISO date of the newest snapshot in the returned series. */
  to: string;
  /** Distinct snapshot dates covered — the honest word for the x axis. */
  snapshots: number;
}

/** How many tracked cards the marketplace section draws. First one is the hero. */
const TRACKED_COUNT = 5;

/**
 * The cards DeckMatrix is currently price-tracking, with their real history.
 *
 * Three queries, none of them a count:
 *
 *   1. the newest snapshot's rows, most valuable first, banded to $5–$150 so
 *      the section shows cards a Commander player recognises rather than the
 *      one four-figure outlier at the top of the table;
 *   2. every stored snapshot for the handful that survives step 1;
 *   3. those cards' rows, for the art, the set and the mana cost.
 *
 * Steps 2 and 3 run together.
 */
let pricePromise: Promise<PriceTracking | null> | null = null;

export function loadPriceTracking(): Promise<PriceTracking | null> {
  pricePromise ??= (async () => {
    const { data: latest } = await supabase
      .from('card_price_history')
      .select('card_id,card_name,price_usd,snapshot_date')
      .not('price_usd', 'is', null)
      .gte('price_usd', 5)
      .lte('price_usd', 150)
      .order('snapshot_date', { ascending: false })
      .order('price_usd', { ascending: false })
      .limit(60);

    if (!latest || latest.length === 0) return null;

    /* The first row carries the newest date; keep only that day's rows so the
       ranking is "most valuable today", not "most valuable at some point". */
    const newest = latest[0].snapshot_date;
    const today = latest.filter(row => row.snapshot_date === newest);
    const ids = today.slice(0, TRACKED_COUNT).map(row => row.card_id);
    if (ids.length === 0) return null;

    const [{ data: history }, cards] = await Promise.all([
      supabase
        .from('card_price_history')
        .select('card_id,price_usd,snapshot_date')
        .in('card_id', ids)
        .not('price_usd', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(1000),
      loadCardsById('price-tracked', ids),
    ]);

    const seriesById = new Map<string, number[]>();
    let from = '';
    let to = '';
    const dates = new Set<string>();

    for (const row of history ?? []) {
      const price = Number(row.price_usd);
      if (!Number.isFinite(price)) continue;
      const list = seriesById.get(row.card_id) ?? [];
      list.push(price);
      seriesById.set(row.card_id, list);
      dates.add(row.snapshot_date);
      if (!from || row.snapshot_date < from) from = row.snapshot_date;
      if (!to || row.snapshot_date > to) to = row.snapshot_date;
    }

    const tracked: TrackedCard[] = [];
    for (const id of ids) {
      const card = cards.get(id);
      const series = seriesById.get(id);
      if (!card || !series || series.length < 2) continue;
      const first = series[0];
      const last = series[series.length - 1];
      tracked.push({
        card,
        series,
        first,
        last,
        low: Math.min(...series),
        high: Math.max(...series),
        change: first > 0 ? (last - first) / first : 0,
      });
    }

    if (tracked.length === 0) return null;

    /* Biggest mover leads — it is the one whose chart is worth the large slot. */
    tracked.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return { cards: tracked, from, to, snapshots: dates.size };
  })();

  return pricePromise;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
