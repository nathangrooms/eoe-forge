/**
 * Shared data plumbing for the platform-feature sections of the homepage.
 *
 * These loaders used to run the queries. They no longer talk to the database at
 * all: `scripts/homepage-snapshot.mjs` runs them once after the nightly card
 * sync and writes the answers to `src/data/homepage-snapshot.json`, and what is
 * left here is a lookup.
 *
 * Three things that survive the change:
 *
 *   1. **Nothing loads above the fold.** These sections still wait for
 *      `useNearViewport` before they render their cards. There is no request to
 *      defer any more, but the gate also keeps a hundred card images out of the
 *      initial load, and images are what this page actually weighs.
 *   2. **One answer per fact, for the whole page.** Two sections wanting the
 *      same rows read the same object.
 *   3. **Real rows or nothing.** Every card drawn in these sections is a row out
 *      of the `cards` table and every price is a row out of `card_price_history`
 *      as they stood at the last sync. There is no seeded data here and no
 *      placeholder art.
 *
 * One bug went with it. `loadCardsByName` asked for `names.length * 5` rows
 * over an `.in()` against `cards`, which holds every printing: Forest has 792
 * printings, Swamp 791, Mountain 789, Plains 768, Island 741. PostgREST applies
 * the limit to the whole result set, so the play table's 115-row budget was
 * spent entirely on basic lands and the lookup returned 2 of its 23 cards. The
 * snapshot reads `cards_unique`, one row per card, where there is nothing to
 * starve.
 */

import { useEffect, useRef, useState } from 'react';
import {
  playTableCards,
  powerCards,
  priceTracking as snapshotPriceTracking,
  tournamentCards,
} from '@/lib/homepage/snapshot';

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

/* -------------------------------------------------------------------------- */
/* Viewport gate                                                              */
/* -------------------------------------------------------------------------- */

/**
 * True once the element has come within `rootMargin` of the viewport, and true
 * for good after that — these sections load once and never unload.
 *
 * It no longer gates a database request, because there are none left. It gates
 * the CARD IMAGES, which are what this page actually weighs: a first visit
 * transfers well over ten megabytes of Scryfall artwork and almost none of it
 * belongs above the fold.
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
 * Run a loader once the section is near the viewport.
 *
 * The loaders are synchronous now — they read a bundled file — but they still
 * return promises, so this stays a one-render effect rather than a rewrite of
 * every caller. `load` is deliberately not a dependency: every loader below is
 * a module-level function whose identity never changes, and listing it would
 * re-run the effect on each render of any caller that passes an inline arrow.
 */
export function useDeferred<T>(near: boolean, load: () => Promise<T>): T | null {
  return useDeferredResult(near, load).data;
}

/**
 * `useDeferred`, plus whether the loader has actually run.
 *
 * The plain version cannot tell "not fetched yet" from "fetched, and the answer
 * is nothing", because both are `null`. For a loader that can genuinely answer
 * nothing that is not a nuance, it is a bug on the live site: `loadPriceTracking`
 * returns null whenever no card has two price snapshots, so `HomeMarketplace`
 * sat on the homepage showing a pulsing skeleton chart and four pulsing rows,
 * for ever, telling every visitor that data was on its way. A section with
 * nothing to show has to say so; a permanent loading state is a claim that
 * something is coming.
 *
 * `settled` is true once the promise has resolved or rejected, so a caller can
 * draw a skeleton before it and the real answer, empty or not, after it.
 */
export function useDeferredResult<T>(
  near: boolean,
  load: () => Promise<T>
): { data: T | null; settled: boolean } {
  const [state, setState] = useState<{ data: T | null; settled: boolean }>({
    data: null,
    settled: false,
  });

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    load()
      .then(result => {
        if (!cancelled) setState({ data: result, settled: true });
      })
      .catch(() => {
        /* A section that cannot load its rows has still finished trying, and
           the honest rendering of "we could not get this" is the same as the
           one for "there is nothing here". */
        if (!cancelled) setState({ data: null, settled: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  return state;
}

/* -------------------------------------------------------------------------- */
/* Card lookups                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Cards keyed by lower-cased name, out of the snapshot.
 *
 * `key` names which set of cards is wanted; it is the same key the generator
 * wrote them under. The promise is kept so callers, and `useDeferred`, do not
 * have to change shape.
 */
const BY_NAME: Record<string, () => Record<string, MarketingCard> | null> = {
  'play-table': () => playTableCards() as Record<string, MarketingCard> | null,
  'power-game-changers': () => powerCards() as Record<string, MarketingCard> | null,
};

export function loadCardsByName(
  key: string,
  _names: readonly string[]
): Promise<Map<string, MarketingCard>> {
  const rows = BY_NAME[key]?.() ?? null;
  return Promise.resolve(new Map(Object.entries(rows ?? {})));
}

const BY_ID: Record<string, () => Record<string, MarketingCard> | null> = {
  'tournament-entrants': () => tournamentCards() as Record<string, MarketingCard> | null,
};

/** Cards keyed by Scryfall printing id — the join `precon-index` is built on. */
export function loadCardsById(
  key: string,
  _ids: readonly string[]
): Promise<Map<string, MarketingCard>> {
  const rows = BY_ID[key]?.() ?? null;
  return Promise.resolve(new Map(Object.entries(rows ?? {})));
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

/**
 * The cards DeckMatrix is currently price-tracking, with their real history.
 *
 * Three queries once ran here on every visit that reached this section: the
 * newest snapshot's rows banded to $5–$150, every stored snapshot for the
 * handful that survives, and those cards' rows for the art. All three now run
 * nightly in `scripts/homepage-snapshot.mjs`.
 *
 * Null is a real answer and the section handles it. A card needs at least two
 * snapshots before it has a line worth drawing, and price history only began
 * covering the catalogue broadly on 2026-08-19, so there is genuinely nothing
 * to chart yet. An empty chart is the honest rendering of that; an invented one
 * is what the old homepage did.
 */
export function loadPriceTracking(): Promise<PriceTracking | null> {
  return Promise.resolve(snapshotPriceTracking() as PriceTracking | null);
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
