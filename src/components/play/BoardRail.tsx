/**
 * The board's right-hand rail.
 *
 * Owner: *"Make sure no modals in play, it should be beautiful within the
 * playmat system."*
 *
 * Everything that would otherwise have been a dialog on this screen lives here
 * instead: the card preview, a zone's contents, the game menu. The rail is a
 * real column of the layout, not an overlay — when it opens the table narrows
 * and re-fits its cards, so a player reading a card is still watching the game
 * rather than looking at a panel sitting on top of it.
 *
 * It is drawn on `Playmat` in the board tone, which is the same material the
 * table itself is made of. No border, no backdrop, no focus trap: the rail is
 * part of the table, and it reads that way.
 */

import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';

export interface BoardRailProps {
  width: number;
  /** Room along the top edge for the HUD that floats over the table. */
  topInset?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * How wide the rail is on a given viewport.
 *
 * The card in the preview has to be readable — that is the entire point of the
 * preview — so the rail is sized from the viewport rather than fixed, and it
 * never gets so wide that the table it sits beside stops being the main event.
 */
export function railWidthFor(viewportWidth: number): number {
  return Math.round(Math.min(430, Math.max(250, viewportWidth * 0.26)));
}

export function BoardRail({ width, topInset = 0, children, className }: BoardRailProps) {
  return (
    <aside
      className={cn('relative h-full shrink-0', className)}
      style={{ width }}
      aria-label="Board rail"
    >
      <Playmat tone="board" rounded="rounded-none" className="absolute inset-0 h-full w-full" />
      {/* A pool of shadow along the seam, so the rail reads as a raised part of
          the table rather than a rectangle painted on it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-6 -translate-x-full"
        style={{ background: 'linear-gradient(to right, transparent, hsl(0 0% 2% / 0.55))' }}
      />
      <div className="relative flex h-full flex-col" style={{ paddingTop: topInset }}>
        {children}
      </div>
    </aside>
  );
}

export default BoardRail;
