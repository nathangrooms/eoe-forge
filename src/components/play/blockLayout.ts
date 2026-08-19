/**
 * The arithmetic behind the support block — artifacts, enchantments and
 * planeswalkers, the square on the right of every mat.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 *
 * `seatLayout.ts` was extracted so the seat's geometry could be tested, and its
 * header records the rule that extraction was for: **geometry is a function of
 * the BOX**, never of how many permanents are on the board. Four functions that
 * read a card count were deleted to enforce it, and `seatLayout.test.ts` pins
 * their replacements' arities so the counts cannot come back.
 *
 * A fifth one survived, because it was in `Battlefield.tsx` where `node --test`
 * cannot reach it. `fitBlockCardWidth(width, height, count, preferred)` searched
 * downward from the preferred size until `count` cards tiled inside the block,
 * so every card in the block resized whenever one arrived. Measured on
 * 2026-08-19, four-seat table at 1680, Rancors arriving one at a time on the
 * viewer's mat:
 *
 *     2nd enchantment    102px -> 100px      1 card resized
 *     3rd enchantment    100px ->  66px      2 cards resized, one moved 49px
 *     4th enchantment     66px ->  64px      3 cards resized, one moved 101px
 *
 * A 34% shrink of everything in the block because a third aura resolved. It is
 * contained — the block's outer width is fixed, so the two rows beside it and
 * the other three seats do not move — but it is the same defect, in the same
 * words the owner used, and it left the block's cards at 64px while the rows
 * beside them drew at 102px.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACES IT: the row's answer, turned ninety degrees
 * ---------------------------------------------------------------------------
 *
 * A row solved exactly this problem twice over and both answers apply here:
 *
 *   1. **Never shrink to fit.** `layoutRow` overlaps crowded cards instead of
 *      resizing them, because the resize is the thing that reads as broken.
 *      `ZoneBlock` already overlaps its rows downward — it simply was not being
 *      allowed to, because the size search shrank the card first.
 *   2. **Step the density down a fixed LADDER.** Solving the overlap exactly
 *      for the count gives a different answer at every count, so every arrival
 *      shuffles everything. Rungs mean the block re-packs when it crosses one
 *      and not otherwise.
 *
 * So `blockCardWidth(width, height, ceiling)` takes no count. It sizes the card
 * so the block's grid holds a CONSTANT number of permanents — `BLOCK_CAPACITY`,
 * four — which is what fixes the column count, and the column count is what the
 * old search was really changing when a third aura arrived. `blockStep` then
 * absorbs whatever else lands there vertically, off the ladder.
 *
 * The size that rule picks on a four-seat 1680 mat is 64px, which is exactly
 * what the old search produced once four cards were down. So the block looks
 * the same when it is full and stops moving when it is filling.
 *
 * The count has ONE remaining job, and it is a genuine one rather than a
 * leftover: a block whose bottom rung still cannot hold what is in it would
 * paint past its own height, onto the quadrant below, and that is worse than a
 * resize. `blockLayout` comes down in card size only in that case, which on a
 * real mat takes about fifty permanents in one seat's block.
 */

import { CARD_RATIO, MIN_BOARD_CARD } from './boardMetrics.ts';
import { tapLean } from './seatLayout.ts';

/** Horizontal padding inside the block, counted once on each side. */
export const BLOCK_PADDING = 8;

/** Vertical room the block's label takes before any card is drawn. */
export const BLOCK_LABEL = 14;

/** The tightest two rows of the block ever sit: not quite touching. */
export const blockGap = (cardWidth: number) => Math.max(2, Math.round(cardWidth * 0.07));

/**
 * The width inside the block that cards may actually be laid out in.
 *
 * It reserves a `tapLean` at each end, exactly as `layoutRow` does for a row,
 * and for the same measured reason: a tapped permanent paints a card-HEIGHT
 * wide while its layout box stays a card wide, because `GameCardView` puts the
 * rotation on an inner element so that turning a card cannot reflow anything.
 *
 * Owner: *"non-creatures sit far too right, they clip off board"*. The block is
 * the right-most thing on every mat, so its overflow is the one that leaves the
 * board altogether and lands in the next quadrant.
 */
export function blockInner(width: number, cardWidth: number): number {
  return Math.max(cardWidth, width - BLOCK_PADDING - tapLean(cardWidth) * 2);
}

/** Whether a card of `cardWidth` fits the block's inner width at all. */
export function blockFitsColumn(width: number, cardWidth: number): boolean {
  return width - BLOCK_PADDING - tapLean(cardWidth) * 2 >= cardWidth;
}

/**
 * How many cards of `cardWidth` tile across a block of the given outer width.
 *
 * Shared by the layout and the renderer on purpose. They disagreed once — one
 * counted the block's full width and the other counted it minus its padding —
 * and the eight pixels between them were enough to turn a tidy two-column block
 * into a single column of four cards stacked on each other.
 */
export function blockColumns(width: number, cardWidth: number): number {
  const gap = blockGap(cardWidth);
  return Math.max(1, Math.floor((blockInner(width, cardWidth) + gap) / (cardWidth + gap)));
}

/** How many rows of `cardHeight` a block of `height` holds at a given pitch. */
function rowsAt(height: number, cardHeight: number, step: number): number {
  const room = height - BLOCK_LABEL - cardHeight;
  if (room < 0) return 1;
  return 1 + Math.floor(room / Math.max(1, step));
}

/**
 * How many permanents the block commits to holding side by side and clear of
 * each other, before any overlapping starts.
 *
 * A constant, not the board's count — that is the entire point. It is what
 * decides the card size, so it decides how many COLUMNS the block has, and the
 * column count is the thing that must not move: a block that goes from one
 * column to two because a third aura resolved is the 34% resize this file's
 * header measured.
 *
 * Four is a realistic support board — a mana rock, a signet, a couple of
 * enchantments — and on the narrowest mat this project draws (a four-seat
 * quadrant at 1680, a 166px block) it lands on exactly the size the old
 * count-driven search produced for four cards. So the picture at four is
 * unchanged and the picture at one, two and three no longer moves.
 */
export const BLOCK_CAPACITY = 4;

/**
 * The card size the block draws at, from its BOX and the ceiling alone.
 *
 * The widest card, at or under the ceiling, whose grid still holds
 * `BLOCK_CAPACITY` permanents clear of each other inside this box. Coming down
 * in size is what buys a second column, and buying the second column from the
 * box rather than from the board is what makes the size constant.
 *
 * Floored at `MIN_BOARD_CARD` unless the box is genuinely smaller than that — a
 * block is allowed to be too small for a readable card, it is not allowed to
 * lie about where it ends.
 *
 * It takes no count, and `blockLayout.test.ts` pins that arity, so a future
 * change that wants the count back has to delete a test that says why.
 */
export function blockCardWidth(width: number, height: number, ceiling: number): number {
  const byHeight = Math.floor((height - BLOCK_LABEL) * CARD_RATIO);
  const top = Math.max(1, Math.min(Math.floor(ceiling), byHeight));

  let widestThatFits = 0;
  for (let w = top; w >= MIN_BOARD_CARD; w -= 1) {
    if (!blockFitsColumn(width, w)) continue;
    if (!widestThatFits) widestThatFits = w;
    const cardHeight = w / CARD_RATIO;
    const clearRows = rowsAt(height, cardHeight, cardHeight + blockGap(w));
    if (blockColumns(width, w) * clearRows >= BLOCK_CAPACITY) return w;
  }
  /* Nothing at a readable size holds four. Draw the largest readable card the
     box will take and let the ladder overlap the rest. */
  if (widestThatFits) return widestThatFits;

  for (let w = Math.min(top, MIN_BOARD_CARD); w >= 1; w -= 1) {
    if (blockFitsColumn(width, w)) return w;
  }
  return Math.max(1, Math.min(top, Math.floor(width - BLOCK_PADDING)));
}

/**
 * The vertical pitches the block is allowed to use, as a multiple of a card's
 * height.
 *
 * The same device as `layoutRow`'s `PITCH_RUNGS` and, for the same reason, the
 * same spacing: a card in row k moves by `k x (s1 - s2)` when the block steps
 * from pitch s1 to s2, so coarse rungs mean rare but violent repacks. 1.07 is
 * two rows clear of each other, which is a card plus `blockGap`.
 */
const STEP_RUNGS: readonly number[] = [
  1.07, 1.0, 0.92, 0.85, 0.78, 0.71, 0.65, 0.59, 0.54, 0.49, 0.44, 0.4, 0.36, 0.32, 0.28, 0.24,
  0.21, 0.18, 0.15, 0.12, 0.1, 0.08,
];

/** The floor a step is never allowed below: two rows must not share a pixel. */
export const MIN_BLOCK_STEP = 8;

export interface BlockLayout {
  /** Card width, px. A function of the box unless the block is overfull. */
  cardWidth: number;
  columns: number;
  rows: number;
  /** Distance between the tops of two consecutive rows, px. */
  step: number;
  /** Fraction of a card hidden by the row below it. Zero unless crowded. */
  overlap: number;
  /** Total height the grid occupies, label included. */
  height: number;
}

/**
 * The pitch a block of `rows` rows uses: the first rung that holds them.
 *
 * Laid from the TOP, so a block that does not step down a rung when a permanent
 * arrives moves nothing at all — which is the whole point, and the same trade
 * `layoutRow` makes horizontally.
 */
export function blockStep(rows: number, cardWidth: number, height: number): number {
  if (rows <= 1) return 0;
  const cardHeight = cardWidth / CARD_RATIO;
  for (const rung of STEP_RUNGS) {
    const step = Math.max(MIN_BLOCK_STEP, Math.floor(cardHeight * rung));
    if (rows <= rowsAt(height, cardHeight, step)) return step;
  }
  return MIN_BLOCK_STEP;
}

/**
 * Everything about how the block lays `count` cards out, in one place.
 *
 * The card size is the box's, not the count's, right up until the bottom rung
 * of the ladder cannot hold what is on the board — at which point the block
 * would paint onto the seat below, and coming down in size is the lesser harm.
 */
export function blockLayout(
  count: number,
  width: number,
  height: number,
  ceiling: number
): BlockLayout {
  const top = blockCardWidth(width, height, ceiling);
  if (count <= 0) {
    return { cardWidth: top, columns: 1, rows: 0, step: 0, overlap: 0, height: BLOCK_LABEL };
  }

  for (let w = top; w >= MIN_BOARD_CARD; w -= 2) {
    if (!blockFitsColumn(width, w)) continue;
    const columns = blockColumns(width, w);
    const rows = Math.ceil(count / columns);
    const cardHeight = w / CARD_RATIO;
    if (rows > rowsAt(height, cardHeight, MIN_BLOCK_STEP)) continue;
    const step = blockStep(rows, w, height);
    return {
      cardWidth: w,
      columns,
      rows,
      step,
      overlap: step === 0 || step >= cardHeight ? 0 : 1 - step / cardHeight,
      height: BLOCK_LABEL + cardHeight + Math.max(0, rows - 1) * step,
    };
  }

  /* Genuinely more permanents than the block can hold at any size it is allowed
     to draw. It packs at the floor and lets the last rows sit almost on each
     other rather than growing past its own box: the mat below belongs to the
     seat in the next quadrant, and spilling onto it is worse than a card you
     can only see the title bar of. */
  const w = Math.min(top, MIN_BOARD_CARD);
  const columns = blockColumns(width, w);
  const rows = Math.ceil(count / columns);
  const cardHeight = w / CARD_RATIO;
  const room = Math.max(0, height - BLOCK_LABEL - cardHeight);
  const step =
    rows > 1 ? Math.max(1, Math.min(MIN_BLOCK_STEP, Math.floor(room / (rows - 1)))) : 0;
  return {
    cardWidth: w,
    columns,
    rows,
    step,
    overlap: step === 0 || step >= cardHeight ? 0 : 1 - step / cardHeight,
    height: BLOCK_LABEL + cardHeight + Math.max(0, rows - 1) * step,
  };
}
