import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { carryForward, type PriceObservation } from '@/lib/prices/history';
import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { CardPrices } from '@/components/pricing';

/**
 * Price, and only price that exists.
 *
 * Two real sources, both read live:
 *  - the printing's current `prices` blob (USD, USD foil, etched, EUR, EUR foil, tix),
 *  - `card_price_history`, the daily snapshot table the nightly price capture
 *    writes into. That is now pg_cron job 1 calling
 *    `public.capture_daily_prices('relevant', 5)` directly in SQL, not the
 *    `daily-price-capture` edge function, which used to die mid-loop every
 *    night after ~400 cards.
 *
 * Coverage is deliberately partial and this component must not pretend
 * otherwise. Measured 19 Aug 2026: history exists for 3,528 of the 34,088
 * catalogue rows — every card any user owns, wishlists, decks or lists, plus
 * everything priced at $5 or more. The bulk-common tail is excluded on
 * purpose; the storage arithmetic is in
 * supabase/migrations/20260819000648_repoint_daily_price_capture_to_set_based_rpc.sql.
 * So a cheap card nobody holds still has no history at all, and that is stated
 * plainly rather than padded with a synthetic curve — design law item 7, and a
 * fabricated price chart is the kind of thing a player would make a buying
 * decision on.
 */

interface Point {
  date: string;
  label: string;
  usd: number | null;
  eur: number | null;
  /** True when we read this price on this date. False when it is carried. */
  observed: boolean;
  /** The date the carried value was actually read on. */
  observedOn: string;
}

type Basis = 'printing' | 'oracle' | null;

const RANGES = [
  { key: '30', label: '30d', days: 30 },
  { key: '90', label: '90d', days: 90 },
  { key: 'all', label: 'All', days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * The "prices now" grid this file used to draw itself is gone.
 *
 * It labelled the columns USD, EUR, USD foil and EUR foil, which is the money
 * rather than the shop, so the card page still did not answer the owner's
 * question: "if I go marketplace, then click a card, I don't see prices per
 * platform, only tcgplayer?". It also printed an em-dash for a price we do not
 * have, which breaks the copy rule, and printed the ticket price as a bare
 * number that reads as dollars.
 *
 * `CardPrices` names the shops, says "No price yet" in words, and keeps
 * tickets labelled as Magic Online currency. One price display, not two.
 */

export interface CardPriceHistoryProps {
  /** The printing currently on screen — its `prices` blob is the "now" row. */
  card: any;
  oracleId?: string;
  /**
   * `card` is a standalone panel; `inset` sits inside one that already has the
   * card surface, so it drops the shadow and tints one step further in.
   */
  surface?: 'card' | 'inset';
  className?: string;
}

export function CardPriceHistory({
  card,
  oracleId,
  surface = 'card',
  className,
}: CardPriceHistoryProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [basis, setBasis] = useState<Basis>(null);
  const [printingCount, setPrintingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('all');

  const cardId: string | undefined = card?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      /**
       * Stored rows are sparse ON PURPOSE: a price is only written on the days
       * it moved, which is what makes tracking every printing affordable.
       *
       * So a missing day means UNCHANGED. Drawing the stored rows straight
       * would put a hole in the line and a reader would see a crash that never
       * happened. carryForward() fills each gap with the last price we actually
       * read, and marks it as carried so the chart can say so. Nothing is
       * averaged across time and nothing is interpolated.
       *
       * Averaging across PRINTINGS on the same day is different and is kept:
       * several printings of one card can report on the same date, and one
       * expensive foil promo must not become the card's price line.
       */
      const collect = (rows: any[] | null): Point[] => {
        if (!rows?.length) return [];

        const byDate = new Map<string, { usd: number[]; eur: number[] }>();
        for (const row of rows) {
          const bucket = byDate.get(row.snapshot_date) ?? { usd: [], eur: [] };
          const usd = num(row.price_usd);
          const eur = num(row.price_eur);
          if (usd != null && usd > 0) bucket.usd.push(usd);
          if (eur != null && eur > 0) bucket.eur.push(eur);
          byDate.set(row.snapshot_date, bucket);
        }
        const avg = (xs: number[]) =>
          xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

        const observations: PriceObservation[] = Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, b]) => ({
            d: date,
            // Hundredths, the way the database stores them.
            usd: avg(b.usd) == null ? null : Math.round(avg(b.usd)! * 100),
            eur: avg(b.eur) == null ? null : Math.round(avg(b.eur)! * 100),
          }))
          .filter(o => o.usd != null || o.eur != null);

        return carryForward(observations, {
          to: new Date().toISOString().slice(0, 10),
          // The sweep writes a row every 30 days even when nothing moved, so a
          // gap longer than that means we stopped looking rather than the price
          // holding still. The line ends instead of running flat through it.
          maxCarryDays: 45,
        }).map(p => ({
          date: p.d,
          label: format(parseISO(p.d), 'd MMM'),
          usd: p.usd == null ? null : p.usd / 100,
          eur: p.eur == null ? null : p.eur / 100,
          observed: p.observed,
          observedOn: p.observedOn,
        }));
      };

      try {
        // 1. Exactly this printing.
        if (cardId) {
          const { data } = await supabase
            .from('card_price_history')
            .select('snapshot_date, price_usd, price_eur')
            .eq('card_id', cardId)
            .order('snapshot_date', { ascending: true })
            .limit(1000);

          const series = collect(data);
          if (series.length > 0) {
            if (cancelled) return;
            setPoints(series);
            setBasis('printing');
            setPrintingCount(1);
            return;
          }
        }

        // 2. Any printing of the same card.
        if (oracleId) {
          const { data } = await supabase
            .from('card_price_history')
            .select('snapshot_date, price_usd, price_eur, card_id')
            .eq('oracle_id', oracleId)
            .order('snapshot_date', { ascending: true })
            .limit(2000);

          const series = collect(data);
          if (cancelled) return;
          setPoints(series);
          setBasis(series.length ? 'oracle' : null);
          setPrintingCount(new Set((data ?? []).map((r: any) => r.card_id)).size);
          return;
        }

        if (cancelled) return;
        setPoints([]);
        setBasis(null);
      } catch {
        if (cancelled) return;
        setPoints([]);
        setBasis(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, oracleId]);

  const visible = useMemo(() => {
    const days = RANGES.find(r => r.key === range)?.days ?? Infinity;
    if (!Number.isFinite(days)) return points;
    const cut = new Date();
    cut.setDate(cut.getDate() - days);
    const iso = cut.toISOString().slice(0, 10);
    return points.filter(p => p.date >= iso);
  }, [points, range]);

  const change = useMemo(() => {
    const priced = visible.filter(p => p.usd != null);
    if (priced.length < 2) return null;
    const first = priced[0].usd!;
    const last = priced[priced.length - 1].usd!;
    if (!first) return null;
    return { pct: ((last - first) / first) * 100, from: first, to: last };
  }, [visible]);

  const hasEur = visible.some(p => p.eur != null);
  /* Days we read a price against days the price simply did not move. Shown so a
     flat line never reads as a fresh daily measurement it was not. */
  const readDays = visible.filter(p => p.observed).length;
  const carriedDays = visible.length - readDays;
  /** One step lighter than whatever surface this panel is sitting on. */
  const tint = surface === 'inset' ? 'bg-muted/50' : 'bg-muted/30';

  return (
    <section
      className={cn(
        'min-w-0 max-w-full overflow-hidden rounded-xl p-4',
        surface === 'inset' ? 'bg-muted/20' : 'bg-card shadow-lg shadow-black/20',
        className
      )}
    >
      {/* Every shop we hold a price from, in its own money, with buy links. */}
      <CardPrices card={card as never} surface="bare" className="p-0" />

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Snapshot history</h3>
            {change && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[0.7rem] tabular-nums',
                  'text-muted-foreground'
                )}
              >
                {change.pct >= 0 ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                )}
                {change.pct >= 0 ? '+' : ''}
                {change.pct.toFixed(1)}%
              </span>
            )}
          </div>

          {points.length > 1 && (
            <div className="flex gap-1">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    range === r.key
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-[180px] w-full min-w-0 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
        ) : visible.length < 2 ? (
          /* ONE LINE, not a panel.

             This rendered a padded box with two paragraphs in it, and since
             almost no card has two days of prices yet it was reserving a tall
             empty region on every card page. The owner: "card detail is a bit
             too long, on normal desktop you cant see art variants". A message
             saying there is nothing to show should not occupy more space than
             the thing it is standing in for. */
          <p className="text-xs text-muted-foreground">
            {points.length === 0
              ? 'No price history yet. A chart appears once this card has two days of prices.'
              : points.length === 1
                ? 'One snapshot so far. A line needs two.'
                : 'No snapshots in this range.'}
          </p>
        ) : (
          <>
            {/* min-w-0 and overflow-hidden are LOAD BEARING here.

              recharts' ResponsiveContainer measures its parent and writes an
              explicit pixel width onto itself. A grid or flex child defaults to
              min-width:auto, so once the chart has measured wide it can never
              shrink back, and the whole column ratchets outward. That is the
              classic recharts overflow, and it is why the card page hung past
              its container. */}
            <div className="h-[180px] w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visible} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="dm-price-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.15}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.3 }}
                    formatter={(value: number, key: string, item: any) => {
                      const money =
                        key === 'eur' ? `€${value.toFixed(2)}` : `$${value.toFixed(2)}`;
                      const label = key === 'eur' ? 'EUR' : 'USD';
                      // Say so when the value is held over from an earlier day,
                      // rather than letting a flat line imply a fresh reading.
                      return item?.payload?.observed
                        ? [money, label]
                        : [`${money} (unchanged since ${item?.payload?.observedOn ?? 'earlier'})`, label];
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: 'none',
                      borderRadius: '10px',
                      boxShadow: '0 12px 32px -8px hsl(0 0% 0% / 0.6)',
                      fontSize: '12px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="usd"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    fill="url(#dm-price-fill)"
                    /* A dot marks a day we actually read a price. The line
                       between dots is the last read price held steady, which is
                       what a missing row means. It is not a guess and it is not
                       a fall to zero, and the reader can see which is which. */
                    dot={(props: any) =>
                      props?.payload?.observed ? (
                        <circle
                          key={props.payload.date}
                          cx={props.cx}
                          cy={props.cy}
                          r={2}
                          fill="hsl(var(--foreground))"
                        />
                      ) : (
                        <g key={props?.payload?.date} />
                      )
                    }
                    activeDot={{ r: 3, fill: 'hsl(var(--foreground))' }}
                    connectNulls
                    name="usd"
                  />
                  {hasEur && (
                    <Line
                      type="monotone"
                      dataKey="eur"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls
                      name="eur"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {readDays} day{readDays === 1 ? '' : 's'} we checked a price
              {carriedDays > 0
                ? `, ${carriedDays} day${carriedDays === 1 ? '' : 's'} the price did not change`
                : ''}{' '}
              ·{' '}
              {basis === 'printing'
                ? 'this printing'
                : `averaged across ${printingCount} printing${printingCount === 1 ? '' : 's'} we hold`}
              {hasEur ? ' · solid USD, dashed EUR' : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Prices are recorded only on the days they move. A flat stretch means the price stayed
              where it was, not that we stopped looking.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default CardPriceHistory;
