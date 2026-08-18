import type { CSSProperties, ReactNode } from 'react';
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

export function CardGrid({
  width = CARD_WIDTH_DEFAULT,
  gap,
  className,
  style,
  children,
}: CardGridProps) {
  const gutter = gap ?? (width < 120 ? 8 : width < 200 ? 12 : 16);

  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${width}px, 100%), 1fr))`,
        gap: gutter,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

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
