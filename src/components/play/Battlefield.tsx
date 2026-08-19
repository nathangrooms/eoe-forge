/**
 * The permanents a seat controls, laid out the way they lie on a table.
 *
 * Three rules, all of them things Magic players do without thinking:
 *
 *   1. **Each kind of permanent has its own place.** Creatures on the top row
 *      because they attack across the table, lands on the bottom row because
 *      that is the mana you count, and every other permanent in a block on the
 *      right — *"2 main rows, enchanements/artifacts etc should have its own
 *      square right side"*. `boardRows.ts` owns which place a card belongs to;
 *      this file draws them.
 *   2. **An empty row or block keeps its place.** A row that collapses when its
 *      last creature dies makes the whole board jump, and a board that jumps is
 *      a board you have to re-read. The label stays, at low contrast.
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

/* The row arithmetic lives in `boardMetrics.ts` so `node --test` can reach it —
   it cannot parse this file's JSX. Re-exported here because every existing
   importer asks `./Battlefield` for these, and moving a file is not a reason to
   make thirty other files change their import. */
export {
  CARD_RATIO,
  MAX_OVERLAP,
  MIN_BOARD_CARD,
  fitRowCardWidth,
  overlapFor,
} from './boardMetrics';
import { CARD_RATIO, MIN_BOARD_CARD, fitRowCardWidth } from './boardMetrics';
/* One row layout, measured in `seatLayout.ts` (where `node --test` can reach
   it) and rendered here. They were two copies of the same arithmetic once and
   the copies disagreed about tapped cards, which is how the layout shift got
   in. There is now nothing here to disagree with. */
import { layoutRow } from './seatLayout';

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

  /*
   * Every number below comes from `layoutRow`, and not one of them looks at
   * which cards are tapped.
   *
   * That is the fix for the owner's *"sometimes when cards are tapped/untapped
   * on opponents side it causes layout shifting"*. This row used to add a
   * lean's worth of margin per TAPPED card, which changed the run's total
   * width — and a centred run of a different width means every card on it
   * moves, including the ones nobody touched. Turning room is now held at the
   * two ENDS of the run, for the whole row, whether or not anything is turned.
   * A card rotating inside its own box then changes nothing outside it, which
   * is exactly what `GameCardView`'s inner rotation element was always meant to
   * guarantee.
   *
   * `layoutRow` also spreads the surplus width into the gaps before centring
   * whatever is left, so a sparse row reaches across the mat instead of
   * clumping in the middle of it — owner: *"playmats dont use 100% of the page
   * which I thought they would"*.
   */
  const layout = layoutRow(cards.length, cardWidth, available);

  return (
    <div
      className={cn(
        'flex flex-nowrap items-center overflow-visible',
        align === 'center' ? 'justify-center' : 'justify-start',
        className
      )}
      style={{ paddingLeft: layout.edge || undefined, paddingRight: layout.edge || undefined }}
    >
      {cards.map((card, index) => (
        <span
          key={card.instanceId}
          className="relative block transition-[z-index] hover:z-30"
          style={{
            marginLeft:
              index === 0 ? 0 : layout.overlap > 0 ? -cardWidth * layout.overlap : layout.gap,
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
  /**
   * Room to keep clear at each end of the row, in px.
   *
   * The seat's identity strip — life, name, commander, mana — floats over the
   * top of the mat instead of reserving a full-width band above it, because
   * that band cost 70px of HEIGHT out of every card on the seat while the row
   * underneath it had 900px of WIDTH going spare. The strip is therefore paid
   * for in the direction the mat can afford: the top row keeps its ends clear
   * and centres its cards in what is left.
   *
   * `available` is reduced by the same amount by the caller, so the overlap
   * arithmetic still measures the space the cards can really use.
   */
  insetStart?: number;
  insetEnd?: number;
  /**
   * Where the row's own name is printed, independent of the card inset.
   *
   * The cards only move out of the strip's way when they would actually reach
   * it, but the label sits in the top-left corner where the strip always is, so
   * it needs to stand clear whether the cards do or not.
   */
  labelInset?: number;
  /**
   * How much clear mat the label has before the first card starts.
   *
   * Without it the label was printed at `labelInset` and the cards were centred
   * independently, so on a crowded inset row the two landed on top of each
   * other and "CREATURES" was drawn at 30% opacity across the art of the first
   * creature. That reads as a render fault, which is the exact thing the label
   * was moved to avoid. Given the real gutter it truncates on empty mat, and
   * when the gutter is too narrow to say anything honest it says nothing —
   * a row packed with creatures is not ambiguous about what it holds, and the
   * label matters for the EMPTY row, which always has the whole row to print in.
   */
  labelMaxWidth?: number;
  renderCard: (card: CardInstance, index: number, width: number) => ReactNode;
  className?: string;
}

/** Narrower than this and the label can only lie about itself, so it is dropped. */
const LABEL_MIN_WIDTH = 30;

/** One band of a seat's mat: a labelled, tinted strip that holds its height. */
export function ZoneRow({
  label,
  cards,
  cardWidth,
  height,
  available,
  tinted,
  insetStart = 0,
  insetEnd = 0,
  labelInset,
  labelMaxWidth,
  renderCard,
  className,
}: ZoneRowProps) {
  const labelFits = labelMaxWidth === undefined || labelMaxWidth >= LABEL_MIN_WIDTH;
  return (
    <div
      className={cn(
        'relative flex w-full shrink-0 items-center justify-center overflow-visible rounded-lg px-1',
        tinted && 'bg-foreground/[0.045]',
        className
      )}
      style={{ height, paddingLeft: insetStart || undefined, paddingRight: insetEnd || undefined }}
      aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
    >
      {/* Above the cards, not behind them. A full row used to slice its own
          label in half — "CREATURES" arriving as "CR" reads as a broken render
          rather than as a zone name printed on the mat. */}
      {labelFits && (
        <span
          aria-hidden="true"
          /* Clear of the identity strip, not underneath it — the row's name and
             the player's name overlapping read as a render fault. Bounded by
             the gutter it actually has, so it never runs onto card art. */
          style={{
            left: (labelInset ?? insetStart) + 8,
            maxWidth: labelMaxWidth,
          }}
          className="pointer-events-none absolute top-0.5 z-10 max-w-[calc(100%-1rem)] select-none truncate text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/30 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
        >
          {label}
        </span>
      )}

      <PermanentRow
        cards={cards}
        cardWidth={cardWidth}
        available={available}
        renderCard={renderCard}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The support block — artifacts, enchantments, planeswalkers                  */
/* -------------------------------------------------------------------------- */

/** Horizontal padding inside the block, counted once on each side. */
const BLOCK_PADDING = 8;
/** Vertical room the block's label takes before any card is drawn. */
const BLOCK_LABEL = 14;

const blockGap = (cardWidth: number) => Math.max(2, Math.round(cardWidth * 0.07));

/**
 * How many cards of `cardWidth` tile across a block of the given outer width.
 *
 * Shared by the fit search and the renderer on purpose. They disagreed once —
 * the search counted the block's full width and the renderer counted it minus
 * its padding — and the eight pixels between them were enough to turn a tidy
 * two-column block into a single column of four cards stacked on each other.
 */
export function blockColumns(width: number, cardWidth: number): number {
  const gap = blockGap(cardWidth);
  return Math.max(1, Math.floor((width - BLOCK_PADDING + gap) / (cardWidth + gap)));
}

/**
 * The widest card that lets `count` of them tile inside a `width × height` box.
 *
 * The block is the one part of the mat that grows in two directions, so its
 * arithmetic is a search rather than a division: try the ceiling, work down
 * two pixels at a time, and take the first size whose grid fits. It stops at
 * `minimum` and lets the rows overlap vertically from there, exactly as a row
 * overlaps horizontally.
 */
export function fitBlockCardWidth(
  width: number,
  height: number,
  count: number,
  preferred: number,
  minimum = MIN_BOARD_CARD
): number {
  if (count <= 0 || width <= 0 || height <= 0) return preferred;

  for (let w = Math.floor(preferred); w >= minimum; w -= 2) {
    const rows = Math.ceil(count / blockColumns(width, w));
    if (rows * (w / CARD_RATIO + blockGap(w)) - blockGap(w) <= height - BLOCK_LABEL) return w;
  }
  return minimum;
}

export interface ZoneBlockProps {
  /** Stays on the mat at low contrast whether or not the block holds anything. */
  label: string;
  cards: CardInstance[];
  cardWidth: number;
  /** Fixed box, so permanents entering and leaving never move the two rows. */
  width: number;
  height: number;
  renderCard: (card: CardInstance, index: number, width: number) => ReactNode;
  className?: string;
}

/**
 * Below this the block has no room to draw a card, so it draws itself instead:
 * a spine with its name running up it, holding the geography without holding
 * the space.
 */
const BLOCK_SPINE = 34;

/**
 * The non-creature permanents, as their own square on the right of the mat.
 *
 * Owner: *"enchanements/artifacts etc should have its own square right side or
 * something. Doesn't follow normal playmat setups at all."* So this is not a
 * third full-width band — it is a block that tiles, wrapping into as many
 * columns as it has room for and then overlapping its rows downward rather than
 * shrinking forever. Same surface tint and spacing as a row, no border.
 *
 * **An empty block does not hold a rectangle open.** It used to reserve a fixed
 * ~23% of the mat whether or not anything was in it, which on a real game was a
 * 393 x 282px hole for most of the match — owner: *"no weird small windows or
 * unutilised space"*. It now collapses to a labelled spine and hands that width
 * to the two rows, and takes it back the moment a permanent lands there. The
 * width is animated by `SeatMat` so the board does not jump when it does.
 */
export function ZoneBlock({
  label,
  cards,
  cardWidth,
  width,
  height,
  renderCard,
  className,
}: ZoneBlockProps) {
  /* Collapsed: the zone still says where it is, so the mat keeps its geography
     and a player still knows where an enchantment will appear. */
  if (cards.length === 0 || width < BLOCK_SPINE) {
    return (
      <div
        className={cn(
          'relative flex shrink-0 items-start justify-center overflow-hidden rounded-lg bg-foreground/[0.045] pt-2',
          className
        )}
        style={{ width, height }}
        aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none select-none whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/30"
          style={{ writingMode: 'vertical-rl' }}
        >
          {label}
        </span>
      </div>
    );
  }

  const gap = blockGap(cardWidth);
  const cardHeight = cardWidth / CARD_RATIO;
  const cols = blockColumns(width, cardWidth);

  const grid: CardInstance[][] = [];
  for (let i = 0; i < cards.length; i += cols) grid.push(cards.slice(i, i + cols));

  /* Rows slide under each other once the block is full, in the same way cards
     in a row slide under each other. The step is whatever fits the box, capped
     at "not overlapping at all" and floored only so two rows can never land on
     exactly the same pixel — the block must stay inside its own height, because
     the mat below it belongs to the seat in the next quadrant. */
  const step =
    grid.length > 1
      ? Math.max(
          8,
          Math.min(cardHeight + gap, (height - BLOCK_LABEL - cardHeight) / (grid.length - 1))
        )
      : 0;

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col items-center overflow-visible rounded-lg bg-foreground/[0.045] px-1 pt-3.5',
        className
      )}
      style={{ width, height }}
      aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-0.5 z-10 max-w-[calc(100%-1rem)] select-none truncate text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/30 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
      >
        {label}
      </span>

      {grid.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="relative flex flex-nowrap items-start justify-center"
          style={{
            gap,
            marginTop: rowIndex === 0 ? 0 : step - cardHeight,
            zIndex: rowIndex,
          }}
        >
          {row.map((card, columnIndex) => (
            <span key={card.instanceId} className="relative block transition-[z-index] hover:z-30">
              {renderCard(card, rowIndex * cols + columnIndex, cardWidth)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default ZoneRow;
