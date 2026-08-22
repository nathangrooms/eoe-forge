import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Changed } from '@/components/motion';
import { cn } from '@/lib/utils';
import { METRIC_TILE, type MetricGround } from './listing-view';

/**
 * The metric tiles.
 *
 * This is `DecksSummaryStats`' treatment, lifted out and given nothing else.
 * The owner named that row good and named the collection's row bad, and the
 * audit measured the gap: a deck figure gets a 204.7 x 95px tile with a 24px
 * number, a collection figure got a 126.7 x 20px slot with a 14px one. Thirteen
 * per cent of the area, at 58% of the type size, for the same kind of fact.
 *
 * Two rules are carried over from the original because both were paid for:
 *
 * **No icons.** Owner: *"Deck manage metrics dont need icons - makes it look
 * like ai slop"*. There is no `icon` prop and adding one is not a small change.
 * The number is the thing; the label already says what it is.
 *
 * **The column count follows the container, never the content.** A row that
 * wrapped on its own figures resolved from 20px to 64px depending on how wide
 * the numbers turned out to be, and shoved everything below it down when the
 * data landed. Cumulative Layout Shift measured 0.038 at 390px. Columns are a
 * function of width alone, and a tile whose value has not arrived yet holds its
 * box with a bar rather than being absent.
 *
 * ## The slot
 *
 * `children` land in the same grid after the metrics, so a page that needs a
 * tile the shape of a tile but not the shape of a figure keeps it. Build it out
 * of `MetricTile` and it wears the same skin.
 *
 * ```tsx
 * <MetricRow metrics={stats} columns={6}>
 *   <MetricTile label="Storage">
 *     <Link to="/collection/storage">4 boxes</Link>
 *   </MetricTile>
 * </MetricRow>
 * ```
 */

export interface Metric {
  /** Distinct within the row. Falls back to the label. */
  id?: string;
  label: string;
  /** Formatted figure, or `null` while it is still being worked out. */
  value: string | null;
  /** Small trailing unit, e.g. `/10`. Never part of the value itself. */
  suffix?: string;
  /** One short line under the number, usually its denominator. */
  subtext?: string;
  /**
   * The figure as a number, when it is one. Supplying it animates the tile when
   * the figure moves, which is how somebody notices that adding a card changed
   * their collection value. The formatted string is not used for the comparison
   * because "$4.10" to "$4.14" can round to the same text.
   */
  raw?: number;
  title?: string;
  /**
   * This figure is asking to be acted on right now.
   *
   * A property of the figure, not of the page. The wishlist had one tile drawn
   * on `bg-primary` when a card you are watching has fallen to your target
   * price, which is the difference between a number and a prompt, and it was
   * the only thing that treatment was used for anywhere. It is here rather than
   * hand-built beside the row because a tile built by hand is the drift this
   * folder exists to stop: it would carry its own copy of the 24px value, the
   * `Changed` animation and the subtext reservation, and those three would
   * start agreeing with `MetricRow` and stop.
   *
   * Use it only where the emphasis is earned by the data, never to make a page
   * look livelier. A row where two tiles are emphasised has emphasised nothing.
   */
  emphasis?: boolean;
  /**
   * How far along this figure is, 0 to 100, drawn as a hairline bar under it.
   *
   * Only for a figure that genuinely has a denominator you can be a fraction
   * of. Two exist in the product and both were hand-built before this: a deck's
   * card count against the format's 100 or 60, and how much of a deck you own
   * out of your collection. A number moving towards a target reads faster as a
   * length than as a percentage, and both places had already worked that out
   * separately.
   *
   * Not a decoration. A bar under a figure with no target is a progress
   * indicator for nothing, and it will be read as one.
   */
  meter?: number;
}

/**
 * Literal classes, because Tailwind reads this file for strings and cannot see
 * a template. Two columns on a phone in every case: a single column of tiles is
 * a stack of cards, and six of those is the whole first screen.
 */
const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

export function MetricTile({
  label,
  children,
  title,
  on = 'page',
  className,
}: {
  label: string;
  children: ReactNode;
  title?: string;
  on?: MetricGround;
  className?: string;
}) {
  return (
    <Card className={cn(METRIC_TILE[on], className)} title={title}>
      <CardContent className="p-4">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export interface MetricRowProps {
  metrics: (Metric | null | undefined | false)[];
  /**
   * Slots across the row. Defaults to however many metrics were given, capped
   * at six, which is where a 1288px band stops giving a figure enough room.
   */
  columns?: number;
  /** Draws every value as a bar without the caller having to null them out. */
  loading?: boolean;
  /** The surface this row sits on. See `MetricGround`. */
  on?: MetricGround;
  /** Extra tiles, in the same grid. Use `MetricTile` so they match. */
  children?: ReactNode;
  className?: string;
}

export function MetricRow({
  metrics,
  columns,
  loading = false,
  on = 'page',
  children,
  className,
}: MetricRowProps) {
  const shown = metrics.filter((m): m is Metric => Boolean(m));
  const count = Math.min(6, Math.max(1, columns ?? shown.length ?? 1));

  /*
   * Every tile reserves a line for its subtext when any tile in the row has
   * one. Without it the row's height depends on which figures happened to need
   * a denominator, so an account whose average power is unscored gets a row
   * 14px shorter than the same page on another account, and the grid below
   * moves when the data arrives.
   */
  const reserveSubtext = shown.some(m => m.subtext);
  /* Same reason as the subtext line, one row down: a bar under one tile and
     nothing under its neighbour makes the two tiles different heights. */
  const reserveMeter = shown.some(m => m.meter !== undefined);

  return (
    <div className={cn('grid gap-3', COLUMNS[count] ?? COLUMNS[6], className)}>
      {shown.map(metric => (
        <Card
          key={metric.id ?? metric.label}
          title={metric.title}
          className={cn(
            METRIC_TILE[on],
            metric.emphasis && 'bg-primary text-primary-foreground shadow-lg shadow-black/20'
          )}
        >
          <CardContent className="p-4">
            <p
              className={cn(
                'truncate text-xs',
                metric.emphasis ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}
            >
              {metric.label}
            </p>
            <div className="flex h-8 items-baseline gap-0.5">
              {loading || metric.value === null ? (
                <span
                  className={cn(
                    'h-6 w-16 animate-pulse self-center rounded motion-reduce:animate-none',
                    metric.emphasis ? 'bg-primary-foreground/20' : 'bg-muted'
                  )}
                  aria-hidden="true"
                />
              ) : (
                <>
                  <Changed
                    value={metric.raw ?? metric.value}
                    className="text-2xl font-semibold tabular-nums"
                  >
                    {metric.value}
                  </Changed>
                  {metric.suffix && (
                    <span
                      className={cn(
                        'text-xs',
                        metric.emphasis ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      )}
                    >
                      {metric.suffix}
                    </span>
                  )}
                </>
              )}
            </div>
            {reserveMeter && (
              /* A track and a fill, not a `Progress`: this is one hairline high
                 and wants no transition, and the shared component's animation
                 reads as a loading bar at this size. */
              <div
                className={cn(
                  'mt-1 h-1 w-full overflow-hidden rounded-full',
                  metric.emphasis ? 'bg-primary-foreground/25' : 'bg-muted'
                )}
                aria-hidden="true"
              >
                {metric.meter !== undefined && !loading && (
                  <div
                    className={cn(
                      'h-full rounded-full',
                      metric.emphasis ? 'bg-primary-foreground' : 'bg-foreground'
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, metric.meter))}%` }}
                  />
                )}
              </div>
            )}
            {reserveSubtext && (
              <p
                className={cn(
                  'truncate text-[10px]',
                  metric.emphasis ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}
              >
                {metric.subtext ?? ' '}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      {children}
    </div>
  );
}

export default MetricRow;
