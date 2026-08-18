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
          {renderCard(card, index, cardWidth)}
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
  /**
   * Two rows when the seat is tall enough for them; one when it is not.
   *
   * A four-player pinwheel hands the top and bottom seats a strip barely two
   * hundred pixels deep. Two rows of cards in that strip means cards too small
   * to identify, which is worse than losing the row: so a short seat gets a
   * single band with the lands set apart and dropped a few pixels — still
   * plainly a separate group, still the same size card.
   */
  rows?: 1 | 2;
  renderCard: (card: CardInstance, index: number, width: number) => ReactNode;
  /** Shown when the seat controls nothing. Plain text on the mat, never a box. */
  emptyLabel?: string;
  className?: string;
  align?: 'center' | 'start';
}

export function Battlefield({
  cards,
  cardWidth,
  capacity,
  rows = 2,
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

  if (rows === 1) {
    // Share the width between the two groups in proportion to what is in them,
    // so a seat with eleven lands and one creature does not overlap the lands
    // into illegibility while the creature sits in open space.
    const total = Math.max(1, permanents.length + lands.length);
    const share = (count: number) =>
      Math.max(2, Math.round((capacity * count) / total));

    return (
      <div
        className={cn(
          'flex items-end gap-4 overflow-visible',
          align === 'center' ? 'justify-center' : 'justify-start',
          className
        )}
      >
        <PermanentRow
          cards={permanents}
          cardWidth={cardWidth}
          capacity={share(permanents.length)}
          renderCard={renderCard}
          align={align}
        />
        <PermanentRow
          cards={lands}
          cardWidth={cardWidth}
          capacity={share(lands.length)}
          renderCard={renderCard}
          align={align}
          className="translate-y-1.5"
        />
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
      {/* Lands keep the same footprint — they are the same object in paper. The
          separation is the row, not a size change. */}
      <PermanentRow
        cards={lands}
        cardWidth={cardWidth}
        capacity={capacity}
        renderCard={renderCard}
        align={align}
      />
    </div>
  );
}

export default Battlefield;
