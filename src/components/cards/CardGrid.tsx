import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardImageSkeleton } from './CardImage';
import { CARD_WIDTH_DEFAULT } from './CardSizeSlider';

/**
 * The grid every card surface lays out in.
 *
 * Columns come from `repeat(auto-fill, minmax(<width>px, 1fr))` so the layout is
 * a pure function of the slider width — drag the slider and the grid reflows
 * with no breakpoint table and no re-render of the cards themselves.
 *
 * `min(<width>px, 100%)` is what keeps a 320px card from overflowing a 300px
 * phone: the track can never be wider than the container.
 *
 * ## Two columns on a phone, measured
 *
 * That `100%` alone was not enough, and the gap it left was six pixels wide. A
 * 390px phone gives this grid a 366px content box. Two 180px tracks with the
 * 12px gutter want 372, so `auto-fill` dropped to ONE column and every card
 * rendered 366px wide. Every listing surface picks its own `defaultSize` and
 * they are 170, 176, 180, 190 and 200, so all but the smallest fell off that
 * edge. Measured on the built bundle at 390 before this line changed:
 *
 *   /collection      366px cards   15,136px tall
 *   /marketplace     366px cards   25,979px tall
 *   /shopping        366px cards   16,419px tall
 *   /deck/:id?tab=value            366px cards   63,754px tall
 *
 * Sixty-four thousand pixels is seventy-five phone screens to scroll one
 * hundred cards. So the track minimum is additionally capped at what two
 * columns need, and the `max(150px, …)` keeps that cap from biting inside a
 * genuinely narrow box — a right-hand slide-out at 240px still draws one card
 * per row rather than two thumbnails.
 */

export interface CardGridProps {
  /** Minimum card width in px — normally straight from `useCardSize`. */
  width?: number;
  /** Gap in px. Scales down a little for very small cards. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Forwards its ref so `useFlipOnChange` can be handed the grid itself rather
 * than the page around it. Without that, a list whose rows move would have to
 * be wrapped in an extra box to have something to measure inside — a new
 * element in the layout of every card surface, bought with an animation.
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(function CardGrid(
  { width = CARD_WIDTH_DEFAULT, gap, className, style, children },
  ref
) {
  const gutter = gap ?? (width < 120 ? 8 : width < 200 ? 12 : 16);

  return (
    <div
      ref={ref}
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${width}px, max(150px, calc(50% - ${gutter / 2}px)), 100%), 1fr))`,
        gap: gutter,
        ...style,
      }}
    >
      {children}
    </div>
  );
});

/** Placeholder grid with the same geometry, for the first paint of a search. */
export function CardGridSkeleton({
  width = CARD_WIDTH_DEFAULT,
  count = 12,
  gap,
  className,
}: {
  width?: number;
  count?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <CardGrid width={width} gap={gap} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <CardImageSkeleton key={i} width={width} fill />
      ))}
    </CardGrid>
  );
}

export default CardGrid;
