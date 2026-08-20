import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart as LineChartIcon, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { formatPrice } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';

/**
 * What the collection has been worth, over time.
 *
 * ## The shape, which is the thing the owner complained about
 *
 * *"Value history stretches so far"*. It was a fixed 300px plot in a cell that
 * grew with the page, so on a wide screen two recorded snapshots were drawn as a
 * near-flat line across a thousand pixels. A time series with a handful of
 * points and no vertical range is unreadable at that ratio.
 *
 * The box is an aspect now, clamped at both ends: it gets taller as it gets
 * wider and stops at 320px, and never falls below 220px on a phone. The
 * skeleton, the Suspense fallback and the drawn chart all carry the identical
 * class string, so the box exists before the data does and nothing moves when
 * either arrives. `PLOT_BOX` is that string, written once, for exactly that
 * reason.
 *
 * ## Real snapshots only
 *
 * An earlier version ran a `Math.random()` walk with a deliberate upward bias
 * whenever fewer than two snapshots existed, and fed it to the same chart and
 * the same headline change figures as real readings. Inventing price movement in
 * a tool people sell cards with is not a placeholder. There is no synthetic
 * path; when there is nothing to draw it says so.
 *
 * ## Where the current value comes from
 *
 * The caller passes it. This component used to run its own reduce over
 * `usd`/`usd_foil`, which was the second of four separate valuations of the same
 * collection on one page. There is one now, in `spread.ts`.
 */

const ValueHistoryLine = lazy(() => import('@/components/collection/ValueHistoryLine'));

/**
 * The reserved plot box, as one string used in three places.
 *
 * Aspect rather than a fixed height so the chart keeps a sensible ratio at any
 * width; `max-h` so an ultrawide monitor cannot stretch it into a strip; `min-h`
 * so a phone still gets a plot rather than a smear. `min-w-0` and
 * `overflow-hidden` are load bearing: ResponsiveContainer writes a pixel width
 * onto itself after measuring its parent, and a grid child defaults to
 * `min-width:auto`, so without them a chart that measures wide once can never
 * shrink back and ratchets its column outward.
 */
const PLOT_BOX = 'aspect-[16/6] max-h-[320px] min-h-[220px] w-full min-w-0 overflow-hidden';

/**
 * The summary row above the plot: three slots whose column count follows the
 * container width and nothing else, so the number of rows is settled before the
 * figures are known. `13rem` is the floor because the longest of the three
 * ("+$1,234.56 across 12 snapshots") measures just under it at `text-sm`, so no
 * slot truncates at any width the page is laid out for.
 */
const SUMMARY_GRID =
  'mb-4 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] items-start gap-x-6 gap-y-1 text-sm';

/** One `text-sm` line box per slot, placeholder or figure. */
const SUMMARY_SLOT = 'flex h-5 items-baseline gap-1.5';

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

interface Point {
  date: string;
  value: number;
}

export interface ValueOverTimeProps {
  /** Today's total, from the one valuation in `spread.ts`. Not recomputed here. */
  currentValue: number;
  /**
   * True while the collection itself is still loading, so `currentValue` is not
   * yet a real figure.
   *
   * It matters for two reasons. A collection that has not loaded is worth
   * unknown, not $0.00, and that rule is the whole of `src/lib/pricing`. And a
   * figure that starts at "$0.00" and becomes "$1,284.60" gets wider, which
   * pushes the figures beside it sideways: measured at 0.00009 of layout shift
   * before this prop existed, which is small and is still not nothing.
   */
  loading?: boolean;
  className?: string;
}

export function ValueOverTime({ currentValue, loading = false, className }: ValueOverTimeProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [points, setPoints] = useState<Point[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        setPoints([]);
        return;
      }

      const start = new Date();
      start.setDate(start.getDate() - RANGE_DAYS[timeRange]);

      /* One query for the whole range, aggregated by the database's own
         snapshot rows. Never a read per day and never a read per card: this
         page runs over a whole collection and per-row queries here are what
         took the database down twice. */
      const { data, error } = await supabase
        .from('collection_value_history')
        .select('snapshot_date, total_value_usd')
        .eq('user_id', session.session.user.id)
        .gte('snapshot_date', start.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      setPoints(
        (data ?? []).map(record => ({
          date: new Date(record.snapshot_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          value: Number(record.total_value_usd) || 0,
        }))
      );
    } catch (err) {
      console.error('Error loading collection value history:', err);
      setPoints([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const capture = async () => {
    setCapturing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        showError('Not signed in', 'Sign in to record what your collection is worth');
        return;
      }
      const response = await supabase.functions.invoke('capture-collection-value', {
        body: { user_id: session.session.user.id },
      });
      if (response.error) throw response.error;
      showSuccess('Snapshot saved', "Today's total has been recorded");
      await load();
    } catch (err) {
      console.error('Error capturing collection value:', err);
      showError('Could not save', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setCapturing(false);
    }
  };

  const change = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    return { amount: last - first, percent: first > 0 ? ((last - first) / first) * 100 : 0 };
  }, [points]);

  const rising = (change?.amount ?? 0) >= 0;

  return (
    <section
      aria-label="Value over time"
      className={cn('flex min-w-0 flex-col rounded-xl bg-card p-4 shadow-lg shadow-black/20 sm:p-5', className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Value over time</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only days you saved a snapshot. Nothing between them is guessed.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={capture} disabled={capturing} className="gap-1.5">
            <RefreshCw
              className={cn('h-3.5 w-3.5', capturing && 'animate-spin motion-reduce:animate-none')}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{capturing ? 'Saving' : 'Save today'}</span>
          </Button>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Three figures on one line rather than three boxes. The boxed version of
          this row repeated a total that the page header already carries.

          It was `flex flex-wrap` under a `min-h-5`, and that reserved one line
          for a row that takes two below about 900px and three on a phone: the
          figures arrived, the row grew, and the plot below it was pushed down.
          Measured, that was the whole of the 0.0067 layout shift left on the
          analytics tab at 768 and the 0.0012 at 820. So the row is three fixed
          slots in a width-driven grid now, exactly as the page header is, and
          the placeholder fills the same three. Empty slots are rendered rather
          than omitted, because a figure that arrives into a slot that was not
          there is the same shift by another route. */}
      <div className={SUMMARY_GRID}>
        {loading ? (
          Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={SUMMARY_SLOT}>
              <span
                className="h-3 w-full max-w-40 self-center animate-pulse rounded bg-muted motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>
          ))
        ) : (
          <>
            <span className={SUMMARY_SLOT}>
              <span className="font-semibold tabular-nums text-foreground">
                {formatPrice(currentValue)}
              </span>
              <span className="text-muted-foreground">today</span>
            </span>
            {change ? (
              <span className={cn(SUMMARY_SLOT, 'items-center')}>
                {rising ? (
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="font-semibold tabular-nums text-foreground">
                  {rising ? '+' : ''}
                  {change.percent.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">over {timeRange}</span>
              </span>
            ) : (
              <span className={SUMMARY_SLOT} aria-hidden="true" />
            )}
            {change ? (
              <span className={SUMMARY_SLOT}>
                <span className="font-semibold tabular-nums text-foreground">
                  {rising ? '+' : '−'}
                  {formatPrice(Math.abs(change.amount))}
                </span>
                <span className="text-muted-foreground">
                  across {points.length} snapshot{points.length === 1 ? '' : 's'}
                </span>
              </span>
            ) : (
              <span className={SUMMARY_SLOT} aria-hidden="true" />
            )}
          </>
        )}
      </div>

      <div className={PLOT_BOX}>
        {historyLoading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
        ) : points.length < 2 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <LineChartIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {points.length === 0
                ? 'Save a snapshot and the line starts here.'
                : 'One snapshot saved. One more and the line appears.'}
            </p>
            <Button size="sm" onClick={capture} disabled={capturing}>
              {capturing ? 'Saving' : 'Save today'}
            </Button>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="h-full w-full animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
            }
          >
            <ValueHistoryLine points={points} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

export default ValueOverTime;
