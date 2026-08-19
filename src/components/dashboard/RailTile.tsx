import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CardImage, CardImageSkeleton, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * One tile in a dashboard rail: a Magic card, at the tile's full width, with
 * three lines under it.
 *
 * The first row of the dashboard is five of these, and the owner asked for them
 * to be equal in size across two rails of different lengths. Equal means every
 * tile draws the same card at the same width and reserves the same height for
 * its text, so this is one component used by both rails rather than two that
 * agree by coincidence. The two lines under the title render a reserved blank
 * when they have nothing to say, so a deck with no commander and an activity
 * entry with no detail still stand as tall as one that has both and the row
 * stays flat.
 *
 * The art is never cropped. The box is the card's own aspect ratio, so the whole
 * card is visible at the size the tile is drawn, which is the point of giving it
 * the full width in the first place.
 */
export interface RailTileProps {
  /** Where the tile goes. Cards go to /cards/:id, decks to /deck/:id. */
  to: string;
  /** A row from `cards`. Null draws the colour-identity fallback instead. */
  card: unknown | null;
  /** Fallback colour pips when there is no card art to show. */
  colors?: string[];
  /** Fallback caption, e.g. "No cards in this deck yet". */
  fallbackNote?: string;
  /** Load this one immediately. True for the tiles visible without scrolling. */
  eager?: boolean;
  /** Drawn over the bottom corner of the art, e.g. a copies count. */
  overlay?: ReactNode;
  /** Sits at the top right of the text block, e.g. the star toggle. */
  action?: ReactNode;
  title: string;
  /** Second line. Renders as a reserved blank when absent. */
  subtitle?: ReactNode;
  /** Third line. Same. */
  meta?: ReactNode;
  className?: string;
}

export function RailTile({
  to,
  card,
  colors = [],
  fallbackNote,
  eager,
  overlay,
  action,
  title,
  subtitle,
  meta,
  className,
}: RailTileProps) {
  return (
    <div
      className={cn(
        // No border anywhere. Depth is the raised surface and the shadow under it.
        'group relative flex flex-col overflow-hidden rounded-xl bg-muted/30',
        'shadow-lg shadow-black/20 transition-colors duration-200',
        'hover:bg-accent focus-within:bg-accent motion-reduce:transition-none',
        className
      )}
    >
      <div className="relative w-full">
        {card ? (
          <CardImage card={card} fill hideFlip eager={eager} imageClassName="rounded-none">
            {overlay}
          </CardImage>
        ) : (
          <div
            className="flex w-full flex-col items-center justify-center gap-3 bg-muted/40"
            style={{ aspectRatio: CARD_ASPECT }}
          >
            {colors.length > 0 && <ColorIdentity colors={colors} size="lg" className="scale-150" />}
            {fallbackNote && (
              <span className="px-4 text-center text-xs text-muted-foreground">{fallbackNote}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          {/* The stretched ::after makes the whole tile one target while leaving
              the action above it independently focusable. */}
          <Link
            to={to}
            title={title}
            className="block min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {title}
          </Link>
          {action}
        </div>

        <div className="mt-0.5 min-w-0 text-xs text-muted-foreground">
          {subtitle ?? <span className="block">&nbsp;</span>}
        </div>
        <div className="mt-1 min-w-0 text-[11px] text-muted-foreground">
          {meta ?? <span className="block">&nbsp;</span>}
        </div>
      </div>
    </div>
  );
}

export function RailTileSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-muted/30 shadow-lg shadow-black/20">
      <CardImageSkeleton fill size="lg" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}
