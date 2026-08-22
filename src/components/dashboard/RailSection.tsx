import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardRail } from '@/components/cards/CardRail';
import { cn } from '@/lib/utils';
import { RailTileSkeleton } from './RailTile';

/**
 * A titled rail of card tiles, with the states it has to have.
 *
 * Every section of the dashboard is one of these, so the page has one rhythm
 * rather than five slightly different panels. The heading carries the count of
 * whatever it holds, which is where the four small number tiles that used to sit
 * across the top went: a number belongs beside its subject, not in a separate
 * box above it.
 *
 * Scrolling is `CardRail`, the same one the card page uses. It hides the bar and
 * pages with arrows that appear only when there is somewhere to scroll, which is
 * what the owner asked for and why there is no second implementation here.
 */

export interface RailSectionProps {
  title: string;
  /** Sits beside the title, e.g. "9 decks" or "$340.72 to buy". */
  count?: ReactNode;
  /** Right-hand link out to the full page. */
  to?: string;
  linkLabel?: string;
  /** Tiles per screenful. Drives the width of each child. */
  perView: number;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  /** True when there is nothing to show. `empty` renders instead of the rail. */
  isEmpty?: boolean;
  empty?: ReactNode;
  /** Extra control in the heading, e.g. a filter toggle. */
  action?: ReactNode;
  className?: string;
}

/**
 * The width of one tile, as a share of the rail it sits in.
 *
 * This is the arithmetic behind the owner's "three decks and two activity, five
 * across, all the same size". The two rails live in one five-column grid, so a
 * span of three columns is three tiles plus the two gaps between them and a span
 * of two is two tiles plus one gap. Subtract those gaps back out and both rails
 * arrive at the identical tile width, exactly, at any screen size.
 *
 * `gap-4` is 1rem, hence 2rem for a three-up rail and 1rem for a two-up one.
 * Written out in full per case because Tailwind only ships classes it can see
 * spelled out in the source; a template string compiles to no CSS at all.
 *
 * Below `lg` the grid collapses to one column and a tile sized to a third of a
 * phone would be a stamp, so small screens show about one and a half tiles
 * instead, which also makes it obvious the rail scrolls.
 */
const TILE_WIDTH: Record<number, string> = {
  1: 'w-[62%] sm:w-[42%] lg:w-full',
  2: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-1rem)/2)]',
  3: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-2rem)/3)]',
  4: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-3rem)/4)]',
  5: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-4rem)/5)]',
  6: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-5rem)/6)]',
  7: 'w-[62%] sm:w-[42%] lg:w-[calc((100%-6rem)/7)]',
};

export function railTileWidth(perView: number): string {
  return cn('shrink-0 snap-start', TILE_WIDTH[perView] ?? TILE_WIDTH[3]);
}

export function RailSection({
  title,
  count,
  to,
  linkLabel = 'See all',
  perView,
  children,
  loading,
  error,
  isEmpty,
  empty,
  action,
  className,
}: RailSectionProps) {
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label={title}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          {count !== undefined && count !== null && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {to && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={to}>
                {linkLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: perView }, (_, i) => (
            <div key={i} className={railTileWidth(perView)}>
              <RailTileSkeleton />
            </div>
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      ) : isEmpty ? (
        <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/30 p-6">
          {empty}
        </div>
      ) : (
        <CardRail label={title} contentClassName="gap-4" arrowsInside>
          {children}
        </CardRail>
      )}
    </section>
  );
}

/** The honest empty state: what is missing, why, and the one thing to do next. */
export function RailEmpty({
  icon: Icon,
  headline,
  body,
  actionLabel,
  actionTo,
}: {
  icon: LucideIcon;
  headline: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="max-w-sm py-6 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{headline}</p>
      <p className="mx-auto mt-1 text-sm text-muted-foreground">{body}</p>
      {actionLabel && actionTo && (
        <Button className="mt-4" asChild>
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
