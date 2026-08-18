/**
 * The permanents a seat controls, laid out the way they lie on a table.
 *
 * Three rules, all of them things Magic players do without thinking:
 *
 *   1. **Each kind of permanent has its own band.** Lands at the back, the
 *      non-creature permanents behind the line, creatures nearest the middle.
 *      `boardRows.ts` owns which band a card belongs to; this file draws them.
 *   2. **An empty band keeps its place.** A row that collapses when its last
 *      creature dies makes the whole board jump, and a board that jumps is a
 *      board you have to re-read. The label stays, at low contrast.
 *   3. **A full row overlaps before it shrinks, and shrinks before it spills.**
 *      Six creatures and twelve creatures are the same size card — the twelve
 *      just sit on each other. Only when even maximum overlap will not fit does
 *      the card get smaller, and it never goes below `MIN_BOARD_CARD`.
 *
 * That third rule is the one the owner reported broken: *"I loaded in smaller
 * screen and cards went off page — might need to be dynamic to scale cards
 * smaller automatically if that happens - could have 10+ cards in some cases."*
 * `fitRowCardWidth` is the arithmetic; the chosen card size is only a ceiling.
 *
 * Rows are drawn with `overflow-visible` on purpose: a tapped permanent rotates
 * ninety degrees and has to be allowed to hang outside its box.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/lib/game';

/** Fraction of a card that may be hidden by its neighbour before it stops. */
const MAX_OVERLAP = 0.62;

/** Below this, a card on the battlefield stops being identifiable at a glance. */
export const MIN_BOARD_CARD = 44;

/** A real card is 63 × 88 mm: height = width ÷ this. */
export const CARD_RATIO = 0.7176;

/**
 * How far each card slides under the one before it so `count` cards occupy the
 * width of `capacity` cards.
 */
export function overlapFor(count: number, capacity: number): number {
  if (count <= capacity || count < 2) return 0;
  return Math.min(MAX_OVERLAP, Math.max(0, 1 - (capacity - 1) / (count - 1)));
}

/**
 * The widest card that still lets `count` of them fit inside `available` px.
 *
 * A row of n overlapped cards occupies `w * (1 + (n-1) * (1 - overlap))`, so
 * solving that at maximum overlap gives the largest card that can possibly fit.
 * `preferred` is the ceiling the player chose with the size slider; this only
 * ever comes down from it.
 */
export function fitRowCardWidth(
  available: number,
  count: number,
  preferred: number,
  minimum = MIN_BOARD_CARD
): number {
  if (count <= 0 || available <= 0) return preferred;
  const spans = 1 + (count - 1) * (1 - MAX_OVERLAP);
  return Math.max(minimum, Math.min(preferred, Math.floor(available / spans)));
}

export interface PermanentRowProps {
  cards: CardInstance[];
  cardWidth: number;
  /** Width the row has to play with. Drives overlap, not card size. */
  available: number;
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
  available,
  renderCard,
  className,
  align = 'center',
}: PermanentRowProps) {
  if (cards.length === 0) return null;

  const gap = Math.round(cardWidth * 0.08);
  const capacity = Math.max(1, Math.floor(available / Math.max(1, cardWidth + gap)));
  const overlap = overlapFor(cards.length, capacity);

  return (
    <div
      className={cn(
        'flex flex-nowrap items-center overflow-visible',
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

export interface ZoneRowProps {
  /** Stays on the mat at low contrast whether or not the row holds anything. */
  label: string;
  cards: CardInstance[];
  cardWidth: number;
  /** Fixed band height in px, so permanents entering and leaving never reflow. */
  height: number;
  /** Width the band has, for the overlap arithmetic. */
  available: number;
  /**
   * Alternate bands carry a faint surface tint. That is the *only* thing
   * separating them — surface and spacing, never a border.
   */
  tinted?: boolean;
  renderCard: (card: CardInstance, index: number, width: number) => ReactNode;
  className?: string;
}

/** One band of a seat's mat: a labelled, tinted strip that holds its height. */
export function ZoneRow({
  label,
  cards,
  cardWidth,
  height,
  available,
  tinted,
  renderCard,
  className,
}: ZoneRowProps) {
  return (
    <div
      className={cn(
        'relative flex w-full shrink-0 items-center justify-center overflow-visible rounded-lg px-1',
        tinted && 'bg-foreground/[0.045]',
        className
      )}
      style={{ height }}
      aria-label={`${label} — ${cards.length} card${cards.length === 1 ? '' : 's'}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-0.5 max-w-[calc(100%-1rem)] select-none truncate text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/25 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
      >
        {label}
      </span>

      <PermanentRow
        cards={cards}
        cardWidth={cardWidth}
        available={available}
        renderCard={renderCard}
      />
    </div>
  );
}

export default ZoneRow;
