/**
 * The arithmetic behind a seat's mat, kept out of the component so it can be
 * tested.
 *
 * All of this used to live inside `SeatMat.tsx`, where nothing could reach it:
 * the test runner is `node --test` over `src/**\/*.test.ts` and a `.tsx`
 * component full of JSX is not importable from it. So a change that is almost
 * entirely arithmetic — how two rows share a fixed height, how wide a row of
 * cards actually paints — shipped with no test of any kind. These functions are
 * that arithmetic, and `seatLayout.test.ts` is the test.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THIS FILE NOW ENFORCES: geometry is a function of the BOX
 * ---------------------------------------------------------------------------
 *
 * Owner: *"keep getting weird layout shifting when things happen"*.
 *
 * That was measured on 2026-08-19, driving a real four-seat game and recording
 * every card's rectangle before and after each action. Tapping, untapping,
 * drawing, damage, counters, life and step changes were all clean. What moved
 * the board was a card ENTERING or LEAVING a row:
 *
 *     CREATURE ENTERS (mine)      17 of 89 boxes moved, worst 15.6px
 *     CREATURE DIES (mine)        17 of 90 boxes moved, worst 21.6px
 *     LAND ENTERS (mine)          20 of 89 boxes moved, worst 33.6px
 *
 * and the cards did not merely slide, they RESIZED: 68px → 62px, 133px → 120px.
 * Every permanent on the seat changed size because one more permanent arrived.
 *
 * The cause was a chain that started at a count. `rowAsk(count, …)` asked for a
 * height, `shareBandHeight` divided the mat by those asks, `fitRowCard(count,
 * …)` sized the card from the height it got, and `planIdentityInset(…, count,
 * …)` decided whether the top row stepped aside. Four functions, all of them
 * reading how many cards were on the board, all of them feeding the size and
 * position of every card on the seat.
 *
 * So the counts are gone from the geometry. A seat's row heights and its card
 * size are decided by the seat's rectangle and the player's size ceiling, and
 * by nothing else. Adding a permanent cannot change them, because the numbers
 * it would have to change are not computed from anything it touches.
 *
 * What a count is still allowed to affect is the SPACING inside one row —
 * `layoutRow`'s gap, and its overlap once the row is genuinely full. A row
 * closing up when a creature dies is a row doing its job; a mat resizing every
 * card on it is not.
 */

import { CARD_RATIO, MIN_BOARD_CARD } from './boardMetrics.ts';

/** Breathing room inside a row, above and below the card. */
export const ROW_PADDING = 6;

/**
 * The height a row holding cards is given before any surplus is shared out:
 * exactly enough for a card at `MIN_BOARD_CARD`, the size below which the art
 * stops reading and the name stops being a shape you recognise.
 */
export const ROW_FLOOR = Math.round(MIN_BOARD_CARD / CARD_RATIO) + ROW_PADDING;

/** The tightest a row ever packs: cards nearly touching. */
export const rowGap = (cardWidth: number) => Math.round(cardWidth * 0.08);

/**
 * The extra width a TAPPED card paints beyond its layout box, on each side.
 *
 * A tapped permanent turns ninety degrees, so it covers a rectangle wider than
 * the box the row laid out for it. `GameCardView` puts that rotation on an
 * inner element precisely so the turn cannot reflow the row — which means the
 * row has to reserve the room itself, because nothing else will.
 */
export const tapLean = (cardWidth: number) => Math.round((cardWidth / CARD_RATIO - cardWidth) / 2);

/**
 * The widest a row lets its cards drift apart: a card and a quarter.
 *
 * This exists so a row USES the width it has instead of huddling in the middle
 * of it. Owner: *"playmats dont use 100% of the page which I thought they
 * would"* — measured at 1024px, a row reaching x=935 stopped its cards at x=737
 * and left blank mat at both ends.
 *
 * There has to be a cap, because two permanents pushed into opposite corners of
 * a 1460px mat is not a playmat either. The number was measured rather than
 * picked: four creatures at 121px on the 1460px row that a 1680px window gives
 * a two-seat table reach 52% of it at three quarters of a card and 64% at a
 * card and a quarter, and past that the row stops reading as one row.
 */
export const MAX_ROW_GAP = (cardWidth: number) => Math.round(cardWidth * 1.25);

export interface BandShare {
  creatureHeight: number;
  landHeight: number;
}

/**
 * How the mat's board area divides between the two rows: exactly in half.
 *
 * It used to divide by what each row could USE, so an empty creatures row
 * collapsed to a label strip and handed the mana row underneath it the whole
 * mat. That is a flattering picture of a board with one creature on it and a
 * reflow the moment a second arrives: the measurement in this file's header is
 * that reflow, twenty boxes moving and every card resizing because one land
 * landed.
 *
 * An even split is also what the spec asks for in as many words — *"A row that
 * is empty still holds its place, so the board does not reflow as permanents
 * enter and leave. Its label stays visible at low contrast."* — and it makes
 * the creature row, which is the row every other player at the table has to
 * read, the same size as the mana row instead of half of it. Measured before
 * this change on a four-seat table at 1680: creatures 62px against lands 134px.
 */
export function splitBands(bandsUsable: number): BandShare {
  const creatureHeight = Math.floor(bandsUsable / 2);
  return { creatureHeight, landHeight: bandsUsable - creatureHeight };
}

/**
 * Everything about how one row of permanents is laid out, in one place.
 *
 * ## Rule one: the layout does not know which cards are tapped
 *
 * Owner: *"Sometimes when cards are tapped/untapped on opponents side it causes
 * layout shifting"*. That is exactly what the old arithmetic did. It gave each
 * tapped card an extra `tapLean` of margin on each side, so tapping one card in
 * a row of six made the row 40% wider — and because the row is centred, every
 * OTHER card on it moved as well.
 *
 * So `tapped` is not a parameter here and cannot be one. Turning room is
 * reserved at the two ENDS of the run, for the whole row, whether or not
 * anything in it is turned.
 *
 * ## Rule two: the turning room is not optional
 *
 * It used to be granted only when the row happened to have width to spare, and
 * dropped to zero on a full row. Measured on a four-seat table at 1680 with
 * eight lands down and everything tapped, that row painted **25px past each end
 * of its own box** — 110% of the width it had been given. The reserve is now
 * unconditional: `available` is reduced by a lean at each end before anything
 * else is decided, so a full row of tapped permanents still paints inside its
 * own rectangle. It costs about a tenth of a card of width and it is the whole
 * of the owner's *"they clip off board"* for the two rows.
 *
 * ## Rule three: a constant pitch, filled from the left
 *
 * This is the last of the measured reflows, and it is a genuine trade rather
 * than a free win, so it is written down here in full.
 *
 * The row used to spread its surplus into the gaps and then CENTRE what was
 * left. That makes a sparse row reach across the mat, which is what an earlier
 * round asked for — *"playmats dont use 100% of the page which I thought they
 * would"* — and it means the gap and the starting point are both functions of
 * how many cards are on the row. Measured after the card size had been fixed,
 * that was still moving six or seven permanents by up to 55px every time a
 * creature entered or died.
 *
 * A row cannot both fill its width at every count and hold every card still
 * when the count changes; those are contradictory. So the pitch is chosen from
 * a fixed LADDER of densities and the run is laid from the left rather than
 * centred. Adding a permanent that does not push the row down a rung moves
 * nothing at all, and a rung holds several counts, so most of a game is spent
 * adding permanents that move nothing.
 *
 * The width complaint it trades against was measured before the identity band
 * moved out of the creature row: that row was using 41% of the mat. After both
 * changes it uses 92% at seven creatures, so the thing the centring was buying
 * has largely been bought another way.
 *
 * ## Rule four: crowded rows overlap, by rungs
 *
 * Past capacity the cards slide under each other. The card SIZE is never
 * reduced to make a row fit — that is the resize the owner was watching, and
 * overlapping is what a player does with a crowded board anyway.
 *
 * The rungs are what makes the crowding stable. Solving the overlap exactly for
 * the count gives a different pitch for every count, so every permanent that
 * arrives on a full row shuffles the whole row: measured at 54px for the 8th
 * creature. Stepping instead means the row re-packs when it crosses a rung and
 * not otherwise, which is a rare, single, explicable movement rather than a
 * constant one.
 */

/**
 * The density ladder: the only pitches a row is allowed to use, as a multiple
 * of a card's width.
 *
 * 1.08 is a row not quite touching, which is `rowGap`'s tight packing and the
 * top of the ladder. 0.08 is the floor, where only a card's title strip shows
 * and a row holds about a dozen permanents per card width — which is what a
 * real Commander board of thirty tokens looks like.
 *
 * The SPACING of the rungs is the thing that was tuned, and it was tuned by
 * measuring. A card at index k moves by `k x (p1 - p2)` when the row steps from
 * rung p1 to rung p2, so coarse rungs mean rare but violent repacks: a first
 * attempt at 1.08 / 0.85 / 0.62 / 0.45 moved the seventh creature 102px when
 * the eighth arrived. Steps of roughly 8% keep that under about half a card
 * while still holding several counts per rung.
 *
 * There is deliberately no "spread to fill" rung above 1.08. An earlier version
 * had one, computed so that a tight row exactly reached both ends, and it made
 * the FIRST step the worst one: the fifth creature arriving on a four-slot row
 * moved its neighbours 123px, because the row fell off a bespoke pitch onto the
 * ladder in one go. The spread pitch was also worth almost nothing — measured
 * at 115px against the tight 110px on the row it was computed for — because it
 * is bounded by the same capacity arithmetic. Losing it costs a row of four
 * about 8% of the mat and halves the largest movement on the board.
 */
const PITCH_RUNGS: readonly number[] = [
  1.08, 1.0, 0.92, 0.85, 0.78, 0.71, 0.65, 0.59, 0.54, 0.49, 0.44, 0.4, 0.36, 0.32, 0.28, 0.24,
  0.21, 0.18, 0.15, 0.12, 0.1, 0.08,
];

export interface RowLayout {
  /** Space between two adjacent card boxes, px. Negative when the row overlaps. */
  gap: number;
  /** Fraction of a card hidden by its neighbour. Zero unless crowded. */
  overlap: number;
  /** Clear mat reserved before the first card and after the last, px. */
  edge: number;
  /** Total width the run occupies, including both edges. */
  span: number;
  /** Where the run begins inside `available`, px. */
  start: number;
  /** How many cards this rung holds before the row steps down to the next. */
  slots: number;
}

export function layoutRow(count: number, cardWidth: number, available: number): RowLayout {
  if (count <= 0 || cardWidth <= 0) {
    return { gap: 0, overlap: 0, edge: 0, span: 0, start: 0, slots: 0 };
  }

  /* Turning room at each end, always. See rule two. Bounded by what is left
     once one card is on the row, so a mat too narrow for a card plus its
     turning room gives up the turning room rather than the card. */
  const edge = Math.max(0, Math.min(tapLean(cardWidth), Math.floor((available - cardWidth) / 2)));
  const usable = Math.max(cardWidth, available - edge * 2);

  /** How many cards of this pitch fit in the row. */
  const fits = (pitch: number) => Math.max(1, Math.floor((usable - cardWidth) / pitch) + 1);

  /* The first rung that holds this many, walking down. `Math.floor` rather than
     `round`, so a rung whose pitch rounds UP past what fits is not chosen and
     then found to overflow. */
  let pitch = Math.max(1, Math.floor(cardWidth * PITCH_RUNGS[PITCH_RUNGS.length - 1]));
  for (const rung of PITCH_RUNGS) {
    const candidate = Math.max(1, Math.floor(cardWidth * rung));
    if (count <= fits(candidate)) {
      pitch = candidate;
      break;
    }
  }

  const run = Math.min(usable, (count - 1) * pitch + cardWidth);
  return {
    gap: pitch - cardWidth,
    overlap: pitch >= cardWidth ? 0 : 1 - pitch / cardWidth,
    edge,
    span: run + edge * 2,
    start: edge,
    slots: fits(pitch),
  };
}

/**
 * How wide `count` cards of `cardWidth` occupy in a row of `available` px.
 *
 * A thin read of `layoutRow`, kept because "how wide is this row" is the
 * question every caller upstream actually has.
 */
export function rowSpan(count: number, cardWidth: number, available: number): number {
  return layoutRow(count, cardWidth, available).span;
}

/**
 * The card size a row of `rowHeight` draws at — and the whole reason a
 * permanent entering the board no longer resizes the board.
 *
 * It takes no count. A row that cannot fit its cards side by side overlaps them
 * (`layoutRow`, rule four) instead of shrinking them, so the width of a card on
 * this mat depends on the mat and on the player's ceiling and on nothing that
 * happens during the game.
 *
 * The floor is `MIN_BOARD_CARD` unless the row is genuinely shorter than that,
 * in which case the row draws what it has rather than spilling into the seat
 * below — a mat is allowed to be too small for a readable card, it is not
 * allowed to lie about where it ends.
 */
export function seatCardWidth(rowHeight: number, ceiling: number): number {
  const byHeight = (rowHeight - ROW_PADDING) * CARD_RATIO;
  return Math.round(Math.max(Math.min(MIN_BOARD_CARD, byHeight), Math.min(ceiling, byHeight)));
}

/**
 * The width a seat gives its non-creature block.
 *
 * Owner: *"non-creatures sit far too right, they clip off board"*, and from the
 * spec: *"enchanements/artifacts etc should have its own square right side or
 * something"*. So it stays on the right — that is what was asked for — and two
 * things about it change.
 *
 * It is a **constant fraction of the mat**, not a function of how many
 * permanents are in it. It used to grow a column at a time as artifacts landed
 * and collapse to a 22px spine when the last one left, which moved the two rows
 * beside it every time and was one of the measured reflows.
 *
 * And it is **smaller**. Measured on a four-seat table at 1680 it was taking
 * 257px of an 828px mat — 31% — to hold three Rancors, while the creature row
 * next to it was squeezed to 62px cards. A fifth of the mat holds a real block
 * of artifacts and leaves the rows the width they need.
 */
export function supportBlockWidth(matWidth: number): number {
  return Math.round(Math.max(76, Math.min(matWidth * 0.2, 220)));
}

/**
 * The width a seat gives its outer rail: the identity block, then the piles.
 *
 * Sized from the mat's HEIGHT as well as its width, because the rail's job is
 * to hold four stacked card-shaped tiles. A rail set purely as a fraction of
 * the width is a wide empty strip on a short quadrant.
 */
export function railWidth(matWidth: number, matHeight: number): number {
  const byHeight = Math.round((matHeight - 16) / 4 / CARD_RATIO) + 12;
  return Math.round(Math.max(52, Math.min(matWidth * 0.15, byHeight, 120)));
}

/**
 * The height a seat reserves for its identity band: life, name, commander,
 * mana, hand.
 *
 * It used to reserve nothing and FLOAT over the top of the creatures row
 * instead, to buy back 70px of card height. Measured on a four-seat table at
 * 1680, that trade had gone badly wrong in both directions at once: the strip
 * painted about 500px of the 493px row it was floating over — the life badge
 * and name at one end, the mana chip and the fanned hand-backs at the other —
 * so the creatures row was inset to 200px of usable width, drew its cards at
 * the 62px floor, and had them drawn UNDER the hand-backs anyway.
 *
 * Reserving the band costs about 46px of height, which the two rows pay for out
 * of a card size they were not getting: measured after, the creature row goes
 * from 62px cards to the same size as the mana row. A band is also the only
 * arrangement in which a seat can say something — *under attack, 12 incoming* —
 * without covering the creatures the sentence is about.
 */
export function identityBandHeight(matHeight: number): number {
  return Math.round(Math.max(34, Math.min(matHeight * 0.14, 54)));
}
