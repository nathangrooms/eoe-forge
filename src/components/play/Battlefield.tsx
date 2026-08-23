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
import { CARD_RATIO } from './boardMetrics';
/* One row layout, measured in `seatLayout.ts` (where `node --test` can reach
   it) and rendered here. They were two copies of the same arithmetic once and
   the copies disagreed about tapped cards, which is how the layout shift got
   in. There is now nothing here to disagree with. */
import { layoutRow, tapLean } from './seatLayout';
/* The block's arithmetic, in a `.ts` for the same reason `seatLayout.ts` is:
   `node --test` cannot import a file with JSX in it, and while this lived here
   the block kept a card COUNT in its geometry long after the rows had lost
   theirs. `blockLayout.test.ts` is what stops that coming back. */
import {
  BLOCK_LABEL,
  BLOCK_PADDING,
  blockGap,
  blockLayout,
} from './blockLayout';
export { blockColumns, blockInner, blockCardWidth, blockLayout } from './blockLayout';

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
}

export function PermanentRow({
  cards,
  cardWidth,
  available,
  renderCard,
  className,
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
        /* Always laid from the LEFT. `layoutRow` rule three: the pitch is a
           constant, so card k sits in the same place whether the row holds k+1
           permanents or twelve — which it cannot do if the run is centred. */
        'flex flex-nowrap items-center justify-start overflow-visible',
        className
      )}
      style={{ paddingLeft: layout.edge || undefined, paddingRight: layout.edge || undefined }}
    >
      {cards.map((card, index) => (
        <span
          key={card.instanceId}
          className="relative block transition-[z-index] hover:z-30"
          /* One number, from one place. `layout.gap` is the pitch minus a card,
             so it is the positive space of a sparse row and the negative margin
             of a crowded one — the two used to be computed separately here and
             from `overlap`, which is two ways for the paint and the measurement
             to disagree. */
          style={{ marginLeft: index === 0 ? 0 : layout.gap, zIndex: index }}
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
   * The printed bed this row sits in, as a surface. Never a border.
   *
   * A real playmat has its areas PRINTED on it. Until now only the mana row
   * carried one and the creature row was bare mat, which is part of why the
   * surface read as one undifferentiated field. Both rows have a bed now, at
   * different weights: two identical beds four pixels apart read as one bed
   * rather than as two areas, and that difference is the whole of "separated by
   * surface and spacing, never a line".
   */
  bed?: 'none' | 'soft' | 'strong';
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

/**
 * Width the row keeps for its own name, plus the breathing room after the last
 * card. `SeatMat` subtracts exactly this before it works out how wide the run
 * may be, because a measurement taken in a box the cards are not laid out in is
 * the way every previous version of this file came to overlap its own edge.
 */
export const ROW_LABEL_GUTTER = 18;

/** One band of a seat's mat: a labelled, tinted strip that holds its height. */
/** The two printed beds, and bare mat. See `ZoneRowProps.bed`. */
const BED: Record<'none' | 'soft' | 'strong', string> = {
  none: '',
  soft: 'bg-foreground/[0.03]',
  strong: 'bg-foreground/[0.07]',
};

export function ZoneRow({
  label,
  cards,
  cardWidth,
  height,
  available,
  bed = 'none',
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
        /* `justify-start`, not centre: the run inside is already laid from the
           left at a constant pitch, and centring the WRAPPER would undo that
           the moment the run's width changed. */
        'relative flex w-full shrink-0 items-stretch justify-start overflow-visible rounded-xl',
        BED[bed],
        className
      )}
      style={{ height, paddingLeft: insetStart || undefined, paddingRight: insetEnd || undefined }}
      aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
    >
      {/*
        The row's name, in a gutter of its own down the left edge.

        It used to be printed across the top of the row at 30% opacity, which
        was fine on an empty row and a render fault on a full one: with the row
        laid from the left, "CREATURES" was drawn straight over the first
        creature's title bar. A gutter costs 14px of row width and cannot
        collide with anything, because the cards start after it.
      */}
      {labelFits && (
        <span
          aria-hidden="true"
          className="pointer-events-none flex w-[14px] shrink-0 select-none items-center justify-center overflow-hidden text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/25"
        >
          <span className="whitespace-nowrap" style={{ writingMode: 'vertical-rl', rotate: '180deg' }}>
            {label}
          </span>
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-center overflow-visible pr-1">
      <PermanentRow
        cards={cards}
        cardWidth={cardWidth}
        available={available}
        renderCard={renderCard}
      />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The support block — artifacts, enchantments, planeswalkers                  */
/* -------------------------------------------------------------------------- */

export interface ZoneBlockProps {
  /** Stays on the mat at low contrast whether or not the block holds anything. */
  label: string;
  cards: CardInstance[];
  /**
   * The largest card the block may draw: a CEILING, not a size.
   *
   * `blockLayout` comes down from it to whatever the block's own box will hold,
   * and having done so it holds that size whether the block has one permanent
   * in it or ten.
   */
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
  /* Empty: the zone still says where it is, so the mat keeps its geography and
     a player still knows where an enchantment will appear.

     It keeps its full width while it does. It used to collapse to a 22px spine
     and hand the width to the two rows, which meant the rows moved every time
     an artifact resolved or died — one of the reflows behind the owner's *"keep
     getting weird layout shifting when things happen"*. `supportBlockWidth` is
     now a constant fraction of the mat and this branch honours it. */
  if (cards.length === 0 || width < BLOCK_SPINE) {
    const spine = width < BLOCK_SPINE;
    return (
      <div
        className={cn(
          'relative flex shrink-0 overflow-hidden rounded-lg bg-foreground/[0.045]',
          spine ? 'items-start justify-center pt-2' : 'items-start justify-start px-2 pt-0.5',
          className
        )}
        style={{ width, height }}
        aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none select-none truncate whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.16em] text-foreground/30"
          style={spine ? { writingMode: 'vertical-rl' } : undefined}
        >
          {label}
        </span>
      </div>
    );
  }

  /* One plan for the whole block, and `cardWidth` is a CEILING here rather than
     a size. `blockLayout` picks the card from the block's own box, so a
     permanent arriving cannot resize the ones already there, and steps the rows
     under each other off a ladder when the block fills — the same two rules
     `layoutRow` follows for a row, turned ninety degrees. See
     `blockLayout.ts`; the measurement that forced it is in its header. */
  const plan = blockLayout(cards.length, width, height, cardWidth);
  const drawWidth = plan.cardWidth;
  const gap = blockGap(drawWidth);
  const cardHeight = drawWidth / CARD_RATIO;
  const cols = plan.columns;
  const step = plan.step;

  const grid: CardInstance[][] = [];
  for (let i = 0; i < cards.length; i += cols) grid.push(cards.slice(i, i + cols));

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col items-start overflow-visible rounded-lg bg-foreground/[0.045] pt-3.5',
        className
      )}
      /*
       * The turning room is PADDING, not something the centring happens to
       * leave over. `blockInner` subtracts exactly this before it counts
       * columns, and the rows inside are laid from the left, so a centred
       * container put the whole reserve on the right and left a tapped card in
       * the first column hanging over the left edge — measured at 9px past the
       * box on a four-seat table with the block tapped.
       */
      style={{
        width,
        height,
        paddingLeft: tapLean(drawWidth) + BLOCK_PADDING / 2,
        paddingRight: tapLean(drawWidth) + BLOCK_PADDING / 2,
      }}
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
          className="relative flex w-full flex-nowrap items-start justify-start"
          style={{
            gap,
            marginTop: rowIndex === 0 ? 0 : step - cardHeight,
            zIndex: rowIndex,
          }}
        >
          {row.map((card, columnIndex) => (
            <span key={card.instanceId} className="relative block transition-[z-index] hover:z-30">
              {renderCard(card, rowIndex * cols + columnIndex, drawWidth)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default ZoneRow;
