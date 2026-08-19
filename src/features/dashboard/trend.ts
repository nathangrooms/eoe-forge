import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { OwnedHolding } from './hooks';

/**
 * What the cards you own were worth on each day we have prices for them.
 *
 * "What changed" is one of the four questions a dashboard exists to answer, and
 * this is the only honest way to answer it here. `collection_value_history` is
 * the table designed for it and holds three rows for one user in total, because
 * nothing schedules `capture-collection-value`. Drawing a line off that would be
 * drawing a line through one point.
 *
 * `card_price_history` is the table that is actually filled: a nightly snapshot
 * of every card any user owns, wishlists or decks, plus everything over $5. So
 * the series is rebuilt from it, card by card, against the copies you hold
 * today. Every number is a real recorded price. Nothing is interpolated, carried
 * forward, or estimated.
 *
 * Two consequences, and the interface has to state both rather than hide them:
 *
 *   1. It values TODAY'S collection at yesterday's prices. It is a price line,
 *      not a portfolio history, and a card bought last week appears on every
 *      earlier day too. Saying "your collection went up" would be wrong; saying
 *      "the cards you own are worth more than they were" is exactly right, and
 *      that is the sentence the widget prints.
 *   2. Coverage varies by day, so days are only ever compared like with like.
 *      Nightly capture reached its current shape on 2026-08-19 and earlier days
 *      hold a fraction of the catalogue, so a day that priced a tenth of your
 *      cards is not a dip in value, it is a gap in the data. The most recent day
 *      sets the baseline: whichever of your cards it priced are the cards every
 *      point is measured over, and an earlier day joins the line only if it
 *      priced nearly all of those same cards. A day that cannot be compared is
 *      left out rather than plotted low.
 */

/** How much of the baseline an earlier day must also price to be comparable. */
const COVERAGE_FLOOR = 0.9;

/** How far back to look. Long enough to be interesting, short enough to be one query. */
const WINDOW_DAYS = 90;

/**
 * PostgREST puts `in.(…)` in the URL, so the id list cannot grow without bound.
 * The most valuable holdings are the ones that move the total, so those are the
 * ones asked about, and the widget says how many cards the line covers.
 */
const MAX_IDS = 200;

export interface TrendPoint {
  /** ISO date, e.g. '2026-08-19'. */
  date: string;
  valueUSD: number;
  /** Owned printings this day held a price for. */
  covered: number;
}

export interface CollectionTrend {
  points: TrendPoint[];
  /** Owned printings the line was computed over. */
  tracked: number;
  /** Change between the first and last plotted day, or null when there is one day or none. */
  changeUSD: number | null;
  loading: boolean;
}

interface HistoryRow {
  card_id: string;
  snapshot_date: string;
  price_usd: number | null;
  price_usd_foil: number | null;
}

const EMPTY: CollectionTrend = { points: [], tracked: 0, changeUSD: null, loading: false };

export function useCollectionTrend(holdings: OwnedHolding[]): CollectionTrend {
  const [trend, setTrend] = useState<CollectionTrend>({ ...EMPTY, loading: true });

  // Keyed on the holdings themselves, so the query reruns when the collection
  // changes and not when React hands over a new array of the same rows.
  const key = holdings
    .map(h => `${h.cardId}:${h.quantity}:${h.foil}`)
    .sort()
    .join(',');

  useEffect(() => {
    let cancelled = false;

    const owned = holdings
      .filter(h => h.cardId && h.quantity + h.foil > 0)
      .slice(0, MAX_IDS);

    if (owned.length === 0) {
      setTrend({ ...EMPTY });
      return;
    }

    setTrend(prev => ({ ...prev, loading: true }));

    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

    (async () => {
      const { data, error } = await supabase
        .from('card_price_history')
        .select('card_id, snapshot_date, price_usd, price_usd_foil')
        .in('card_id', owned.map(h => h.cardId))
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error('Error loading collection price history:', error);
        setTrend({ ...EMPTY });
        return;
      }

      const copies = new Map(owned.map(h => [h.cardId, h]));
      /** Per day, what each owned printing was worth. */
      const byDate = new Map<string, Map<string, number>>();

      for (const row of (data ?? []) as HistoryRow[]) {
        const holding = copies.get(row.card_id);
        if (!holding) continue;

        // Foils are priced separately and plenty of collections are mostly foil,
        // so valuing a foil copy at the non-foil price is a real error, not a
        // rounding one. A missing foil price leaves that copy out and the day's
        // coverage drops, which is the honest outcome.
        const plain = typeof row.price_usd === 'number' ? row.price_usd : null;
        const foil = typeof row.price_usd_foil === 'number' ? row.price_usd_foil : plain;
        if (plain === null && foil === null) continue;

        let value = 0;
        if (holding.quantity > 0 && plain !== null) value += plain * holding.quantity;
        if (holding.foil > 0 && foil !== null) value += foil * holding.foil;
        if (value <= 0) continue;

        const day = byDate.get(row.snapshot_date) ?? new Map<string, number>();
        day.set(row.card_id, value);
        byDate.set(row.snapshot_date, day);
      }

      const dates = [...byDate.keys()].sort();
      if (dates.length === 0) {
        setTrend({ points: [], tracked: 0, changeUSD: null, loading: false });
        return;
      }

      /* The newest day is the best covered one and sets the baseline. Every
         point is the value of THOSE cards, so two points always describe the
         same set of cards and the difference between them is a price move
         rather than a change in what we happened to know that night. */
      const baseline = byDate.get(dates[dates.length - 1])!;
      const floor = Math.ceil(baseline.size * COVERAGE_FLOOR);

      const points: TrendPoint[] = [];
      for (const date of dates) {
        const day = byDate.get(date)!;
        let value = 0;
        let covered = 0;
        for (const cardId of baseline.keys()) {
          const price = day.get(cardId);
          if (price === undefined) continue;
          value += price;
          covered += 1;
        }
        if (covered < floor) continue;
        points.push({ date, valueUSD: Math.round(value * 100) / 100, covered });
      }

      const changeUSD =
        points.length >= 2
          ? Math.round((points[points.length - 1].valueUSD - points[0].valueUSD) * 100) / 100
          : null;

      setTrend({ points, tracked: baseline.size, changeUSD, loading: false });
    })().catch(err => {
      console.error('Error building collection trend:', err);
      if (!cancelled) setTrend({ ...EMPTY });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return trend;
}
