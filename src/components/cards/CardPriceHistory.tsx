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
import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp } from 'lucide-react';

/**
 * Price, and only price that exists.
 *
 * Two real sources, both read live:
 *  - the printing's current `prices` blob (USD, USD foil, etched, EUR, EUR foil, tix),
 *  - `card_price_history`, the daily snapshot table the `daily-price-capture`
 *    cron writes into.
 *
 * The snapshot table currently covers 685 of 33,037 cards, so most cards have
 * no history at all. That is stated plainly rather than padded with a synthetic
 * curve — design law item 7, and a fabricated price chart is the kind of thing
 * a player would make a buying decision on.
 */

interface Point {
  date: string;
  label: string;
  usd: number | null;
  eur: number | null;
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

const money = (v: number | null, symbol: string) =>
  v == null ? '—' : `${symbol}${v.toFixed(2)}`;

function PriceCell({
  label,
  value,
  symbol,
  strong,
  tint,
}: {
  label: string;
  value: number | null;
  symbol: string;
  strong?: boolean;
  /** One step lighter than whatever surface the panel is sitting on. */
  tint: string;
}) {
  return (
    <div className={cn('rounded-lg px-3 py-2', tint)}>
      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular-nums',
          strong ? 'text-xl font-semibold text-foreground' : 'text-sm text-foreground'
        )}
      >
        {money(value, symbol)}
      </p>
    </div>
  );
}

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
      const collect = (rows: any[] | null): Point[] => {
        if (!rows?.length) return [];
        // Several printings can report on the same day; average them so a single
        // expensive foil promo does not become the card's price line.
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

        return Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, b]) => ({
            date,
            label: format(parseISO(date), 'd MMM'),
            usd: avg(b.usd),
            eur: avg(b.eur),
          }))
          .filter(p => p.usd != null || p.eur != null);
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

  const prices = (card?.prices ?? {}) as Record<string, string | null>;
  const hasEur = visible.some(p => p.eur != null);
  const tint = surface === 'inset' ? 'bg-muted/50' : 'bg-muted/30';

  return (
    <section
      className={cn(
        'min-w-0 rounded-xl p-4',
        surface === 'inset' ? 'bg-muted/20' : 'bg-card shadow-lg shadow-black/20',
        className
      )}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Price
      </h2>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <PriceCell label="USD" value={num(prices.usd)} symbol="$" strong tint={tint} />
        <PriceCell label="EUR" value={num(prices.eur)} symbol="€" strong tint={tint} />
        <PriceCell label="USD foil" value={num(prices.usd_foil)} symbol="$" tint={tint} />
        <PriceCell label="EUR foil" value={num(prices.eur_foil)} symbol="€" tint={tint} />
        {num(prices.usd_etched) != null && (
          <PriceCell label="USD etched" value={num(prices.usd_etched)} symbol="$" tint={tint} />
        )}
        {num(prices.tix) != null && (
          <PriceCell label="MTGO tix" value={num(prices.tix)} symbol="" tint={tint} />
        )}
      </div>

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
          <div className="h-[180px] animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
        ) : visible.length < 2 ? (
          <div className={cn('rounded-lg px-4 py-6', tint)}>
            <p className="text-sm text-foreground">
              {points.length === 0
                ? 'No price snapshots have been recorded for this card yet.'
                : points.length === 1
                  ? 'Only one snapshot has been recorded so far, and a line needs two.'
                  : 'No snapshots fall in this range.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              DeckMatrix captures prices once a day into <code>card_price_history</code>. The chart
              appears as soon as this card has two days of data.
            </p>
          </div>
        ) : (
          <>
            <div className="h-[180px] w-full">
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
                    formatter={(value: number, key: string) => [
                      key === 'eur' ? `€${value.toFixed(2)}` : `$${value.toFixed(2)}`,
                      key === 'eur' ? 'EUR' : 'USD',
                    ]}
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
                    dot={false}
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
              {visible.length} daily snapshot{visible.length === 1 ? '' : 's'} ·{' '}
              {basis === 'printing'
                ? 'this printing'
                : `averaged across ${printingCount} printing${printingCount === 1 ? '' : 's'} in our database`}
              {hasEur ? ' · solid USD, dashed EUR' : ''}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default CardPriceHistory;
