import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { FacetChip } from '@/components/listing';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { carryForward, type PriceObservation } from '@/lib/prices/history';
import type { DeckCardRow } from '@/lib/deck/deckCards';

/**
 * What this deck has been worth.
 *
 * ## The largest single gap between what this app knows and what it showed
 *
 * `card_price_history` is a table this product already writes nightly and
 * already charts: `CardPriceHistory` and `CardPriceHistoryChart` both query it.
 * **No deck surface read it.** The census put it top of the Value tab's list of
 * unused data and said why it matters: *"Your deck was $812 in June and is $888
 * now, and Rhystic Study is $61 of the change"* is one query and a chart that
 * already exists, and neither Moxfield nor Archidekt shows deck value over time
 * to a free user.
 *
 * ## One query for the set
 *
 * `card_price_history` keyed on `card_id`, chunked at a hundred ids the way
 * `fetchCardsByIds` chunks for the same URL-length reason. Not one query per
 * card: a hundred-card deck asking a hundred times is the shape that has taken
 * this database down twice.
 *
 * ## The two ways a deck price chart can lie, and what is done about each
 *
 * **A missing day means the price did not move.** Rows are written only on the
 * days a price changed — that is what makes tracking every printing affordable,
 * and `lib/prices/history` opens with the rule in full. Drawing the stored rows
 * straight would put a hole in the line and a reader would see a crash that
 * never happened. `carryForward` fills each gap with the last price actually
 * read and marks it as carried, so the chart's tooltip can say which is which.
 * Nothing is interpolated and nothing is averaged across time.
 *
 * **Cards enter the record on different days.** This is the trap that belongs
 * to a deck rather than to a card, and it is worse than a hole. If one card's
 * record starts in June, summing whatever we hold on each day makes the DECK
 * appear to gain that card's value in June — a jump in the line that is a
 * change in coverage, not a change in price. So the series starts on the first
 * day every covered card has a reading, and the set of cards summed is constant
 * from end to end. The panel says how many cards that is out of how many are in
 * the deck, because a line over 60 of 100 cards is a real answer and a
 * mislabelled one is not.
 *
 * A card we have never priced is simply not in the line. It is not a card worth
 * zero.
 */

const CardPriceChart = lazy(() => import('@/components/cards/CardPriceChart'));

/** Matches the loading skeleton exactly so nothing shifts when the chart lands. */
const ChartSkeleton = (
  <div className="h-[180px] w-full min-w-0 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
);

const RANGES = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: 'A year', days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/** Ids per request. Same limit `fetchCardsByIds` uses, for the same reason. */
const CHUNK = 100;

interface Point {
  date: string;
  label: string;
  usd: number | null;
  eur: number | null;
  observed: boolean;
  observedOn: string;
}

interface Mover {
  name: string;
  copies: number;
  from: number;
  to: number;
  change: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export interface DeckValueHistoryProps {
  /** Every non-sideboard row. Quantities are what make it a deck total. */
  rows: DeckCardRow[];
  className?: string;
}

export function DeckValueHistory({ rows, className }: DeckValueHistoryProps) {
  const [range, setRange] = useState<RangeKey>('90');
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Point[]>([]);
  const [covered, setCovered] = useState(0);
  const [movers, setMovers] = useState<Mover[]>([]);

  /* Keyed on the ids and quantities rather than on the row objects, so a
     re-render that rebuilds the array without changing the deck does not
     re-query. */
  const signature = useMemo(
    () =>
      rows
        .filter(row => !row.is_sideboard)
        .map(row => `${row.card_id}:${row.quantity}`)
        .sort()
        .join(','),
    [rows]
  );

  const days = RANGES.find(r => r.key === range)?.days ?? 90;

  useEffect(() => {
    const lines = rows
      .filter(row => !row.is_sideboard)
      .map(row => ({
        id: row.card_id,
        name: row.card?.name || row.card_name,
        copies: Math.max(1, row.quantity),
      }))
      .filter(line => line.id);

    if (lines.length === 0) {
      setPoints([]);
      setCovered(0);
      setMovers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const from = iso(since);
      const to = iso(new Date());

      const byCard = new Map<string, PriceObservation[]>();

      try {
        const ids = [...new Set(lines.map(line => line.id))];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data, error } = await supabase
            .from('card_price_history')
            .select('card_id, snapshot_date, price_usd')
            .in('card_id', ids.slice(i, i + CHUNK))
            .gte('snapshot_date', from)
            .order('snapshot_date', { ascending: true });

          if (error) throw error;

          for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
            const usd = num(raw.price_usd);
            if (usd === null || usd <= 0) continue;
            const cardId = String(raw.card_id);
            const list = byCard.get(cardId) ?? [];
            /* Hundredths, the way the rest of the price code carries them, so
               `carryForward`'s output can be divided once at the end rather
               than accumulating float error per card per day. */
            list.push({ d: String(raw.snapshot_date).slice(0, 10), usd: Math.round(usd * 100) });
            byCard.set(cardId, list);
          }
        }
      } catch (error) {
        console.error('Could not read the price record for this deck:', error);
        if (!cancelled) {
          setPoints([]);
          setCovered(0);
          setMovers([]);
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      /* Every covered card, densified to a daily series. A card with no row in
         the window is left out entirely rather than treated as worth nothing. */
      const series = lines
        .map(line => ({
          line,
          points: carryForward(byCard.get(line.id) ?? [], {
            to,
            /* The sweep writes a heartbeat row every 30 days even when nothing
               moved, so a gap longer than that means we stopped looking rather
               than the price holding still. Same 45 the card page uses. */
            maxCarryDays: 45,
          }),
        }))
        .filter(entry => entry.points.length > 0);

      if (series.length === 0) {
        setPoints([]);
        setCovered(0);
        setMovers([]);
        setLoading(false);
        return;
      }

      /* THE COVERAGE RULE.
         Start on the first day every covered card has a reading, so the set of
         cards summed is the same on every point of the line. Starting earlier
         would draw the deck gaining value on the day a card entered the record,
         which is a change in what we know rather than a change in price. */
      const start = series.reduce(
        (latest, entry) => (entry.points[0].d > latest ? entry.points[0].d : latest),
        series[0].points[0].d
      );

      const totals = new Map<string, { cents: number; observed: boolean }>();
      for (const entry of series) {
        for (const point of entry.points) {
          if (point.d < start) continue;
          const bucket = totals.get(point.d) ?? { cents: 0, observed: false };
          bucket.cents += (point.usd ?? 0) * entry.line.copies;
          /* A day is "observed" when at least one card was actually read on it.
             That is the honest reading for a total: the deck's value did move
             that day, even if most of its cards did not. */
          if (point.observed) bucket.observed = true;
          totals.set(point.d, bucket);
        }
      }

      const dates = [...totals.keys()].sort();
      let lastObserved = dates[0] ?? start;
      const built: Point[] = dates.map(date => {
        const bucket = totals.get(date)!;
        if (bucket.observed) lastObserved = date;
        return {
          date,
          label: format(parseISO(date), 'd MMM'),
          usd: bucket.cents / 100,
          eur: null,
          observed: bucket.observed,
          observedOn: lastObserved,
        };
      });

      /* Which cards moved the total, first day of the line against last. */
      const first = dates[0];
      const last = dates[dates.length - 1];
      const moved: Mover[] = series
        .map(entry => {
          const at = (day: string) => {
            const point = entry.points.find(p => p.d === day);
            return point?.usd == null ? null : point.usd / 100;
          };
          const a = at(first);
          const b = at(last);
          if (a === null || b === null) return null;
          return {
            name: entry.line.name,
            copies: entry.line.copies,
            from: a,
            to: b,
            change: (b - a) * entry.line.copies,
          };
        })
        .filter((m): m is Mover => Boolean(m) && Math.abs(m!.change) >= 0.01)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 6);

      setPoints(built);
      setCovered(series.length);
      setMovers(moved);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `signature` stands in for `rows`: same deck, same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, days]);

  const total = rows.filter(row => !row.is_sideboard).length;

  const change = useMemo(() => {
    const priced = points.filter(p => p.usd != null);
    if (priced.length < 2) return null;
    const first = priced[0].usd as number;
    const last = priced[priced.length - 1].usd as number;
    if (!first) return null;
    return { pct: ((last - first) / first) * 100, from: first, to: last };
  }, [points]);

  return (
    <Card className={cn(className)}>
      <CardContent className="space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">What this deck has been worth</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              From the nightly price record, summed over the deck at its own quantities. A day
              with no reading means the price did not move, not that it fell.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGES.map(option => (
              <FacetChip
                key={option.key}
                selected={range === option.key}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </FacetChip>
            ))}
          </div>
        </div>

        {loading ? (
          ChartSkeleton
        ) : points.length < 2 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            {covered === 0
              ? 'No card in this deck has a price record over this window yet. The nightly capture covers every card anybody owns, wishlists, decks or lists, plus everything at $5 or more, so a deck of cheap cards nobody holds may genuinely have none.'
              : 'Not enough days on record over this window to draw a line. Try a wider range.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">
                ${(points[points.length - 1].usd ?? 0).toFixed(2)}
              </span>
              {change && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-sm tabular-nums',
                    /* Direction is the one thing a price line has to make
                       unmistakable, and up-is-good is not true here: a deck
                       getting dearer is worse for the person still buying it.
                       So the arrow carries the direction and the colour stays
                       out of it, which is the monochrome rule anyway. */
                    'text-muted-foreground'
                  )}
                >
                  {change.pct >= 0 ? (
                    <TrendingUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <TrendingDown className="h-4 w-4" aria-hidden />
                  )}
                  {change.pct >= 0 ? '+' : ''}
                  {change.pct.toFixed(1)}% from ${change.from.toFixed(2)}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                over {covered} of {total} cards on record
              </span>
            </div>

            <Suspense fallback={ChartSkeleton}>
              <CardPriceChart points={points} hasEur={false} />
            </Suspense>

            {movers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  What moved it
                </h4>
                <ul className="space-y-1.5">
                  {movers.map(mover => (
                    <li
                      key={mover.name}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {mover.copies > 1 ? `${mover.copies}× ` : ''}
                        {mover.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        ${mover.from.toFixed(2)} → ${mover.to.toFixed(2)}
                        <span className="ml-2 font-medium text-foreground">
                          {mover.change >= 0 ? '+' : '−'}${Math.abs(mover.change).toFixed(2)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default DeckValueHistory;
