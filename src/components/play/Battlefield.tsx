/**
 * The permanents a seat controls, laid out the way they lie on a table.
 *
 * Two rules, both of them things Magic players do without thinking:
 *
 *   1. **Lands go in their own row, below the rest.** At a glance you count the
 *      untapped mana first and the threats second. One undifferentiated pile
 *      makes both harder, which is why paper players separate them.
 *   2. **A full row overlaps; it never shrinks.** Six creatures and sixteen
 *      creatures are the same size card — the sixteen just sit on each other,
 *      fanned, the way a wide board actually looks. Scaling cards down until
 *      they are unreadable is the failure mode this exists to avoid.
 *
 * Rows are rendered with `overflow-visible` on purpose: a tapped permanent
 * rotates ninety degrees and has to be allowed to hang outside its box.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/lib/game';
import { isLand } from '@/lib/game';

/** Fraction of a card that may be hidden by its neighbour before it stops. */
const MAX_OVERLAP = 0.62;

/**
 * How far each card slides under the one before it so `count` cards occupy the
 * width of `capacity` cards.
 */
export function overlapFor(count: number, capacity: number): number {
  if (count <= capacity || count < 2) return 0;
  return Math.min(MAX_OVERLAP, Math.max(0, 1 - (capacity - 1) / (count - 1)));
}

export interface PermanentRowProps {
  cards: CardInstance[];
  cardWidth: number;
  /** Cards that fit side by side before overlapping starts. */
  capacity: number;
  /**
   * The row owns the width so its overlap arithmetic and the card it draws can
   * never disagree — hence the third argument.
   */
  renderCard: (card: CardInstance, index: number, width: number) => ReactNode;
  className?: string;
  align?: 'center' | 'start';
}

export function PermanentRow({
  cards,
  cardWidth,
  capacity,
  renderCard,
  className,
  align = 'center',
}: PermanentRowProps) {
  if (cards.length === 0) return null;

  const overlap = overlapFor(cards.length, capacity);
  const gap = overlap === 0 ? Math.round(cardWidth * 0.08) : 0;

  return (
    <div
      className={cn(
        'flex flex-nowrap items-end overflow-visible',
        align === 'center' ? 'justify-center' : 'justify-start',
        className
      )}
    >
      {cards.map((card, index) => (
        <span
          key={card.instanceId}
          className="relative block transition-[z-index] hover:z-30"
          style={{
            marginLeft: index === 0 ? 0 : overlap > 0 ? -cardWidth * overlap : gap,
            zIndex: index,
          }}
        >
          {renderCard(card, index)}
        </span>
      ))}
    </div>
  );
}

export interface BattlefieldProps {
  cards: CardInstance[];
  cardWidth: number;
  /** Cards that fit side by side in one row before overlapping starts. */
  capacity: number;
  renderCard: (card: CardInstance, index: number) => ReactNode;
  /** Shown when the seat controls nothing. Plain text on the mat, never a box. */
  emptyLabel?: string;
  className?: string;
  align?: 'center' | 'start';
}

export function Battlefield({
  cards,
  cardWidth,
  capacity,
  renderCard,
  emptyLabel = 'Empty battlefield',
  className,
  align = 'center',
}: BattlefieldProps) {
  const lands = cards.filter(isLand);
  const permanents = cards.filter(card => !isLand(card));

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col justify-end gap-1.5 overflow-visible', className)}>
      <PermanentRow
        cards={permanents}
        cardWidth={cardWidth}
        capacity={capacity}
        renderCard={renderCard}
        align={align}
      />
      {/* Lands sit lower and a touch smaller in presence, never in a box. */}
      <PermanentRow
        cards={lands}
        cardWidth={Math.round(cardWidth * 0.88)}
        capacity={Math.max(3, Math.round(capacity * 1.12))}
        renderCard={renderCard}
        align={align}
      />
    </div>
  );
}

export default Battlefield;
