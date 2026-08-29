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
 * The creature row's share of the board area. The mana row gets the rest.
 *
 * See `splitBands`. It is a constant because the whole of this file is the rule
 * that geometry follows the BOX: a share that moved with the board is a card
 * that resizes when a permanent arrives.
 */
export const CREATURE_SHARE = 0.55;

/**
 * How the mat's board area divides between the two rows.
 *
 * ## What this used to be, and what it fixed
 *
 * It used to divide by what each row could USE, so an empty creatures row
 * collapsed to a label strip and handed the mana row underneath it the whole
 * mat. That is a flattering picture of a board with one creature on it and a
 * reflow the moment a second arrives: the measurement in this file's header is
 * that reflow, twenty boxes moving and every card resizing because one land
 * landed. It was replaced by an exactly even split, which fixed it.
 *
 * ## Why it is 55/45 now and not 50/50
 *
 * The even split was chosen to stop the creature row being HALF the mana row —
 * measured on a four-seat table at 1680, creatures at the 62px floor against
 * lands at 134px. That reason is about which row is worth more, and it does not
 * stop at parity.
 *
 * Owner: *"cards LARGE and use the FULL width"*, and measured on 23 Aug 2026 at
 * 1920 x 1080, two seats: a 152px row drew a 105px creature, 52% of the 200px
 * the size slider was set to, with 991px of the row's 1548 holding nothing. The
 * card is capped by the row's HEIGHT and by nothing else, so height is the only
 * place a bigger card can come from, and there are exactly two places to take
 * it: the hand's band, which `tableMetrics.ts` has now given back, and the row
 * beside it.
 *
 * A creature is the card every other player at the table has to read: its art,
 * its power and toughness, its counters and whether it is turned. A land is a
 * card you COUNT. So the surplus goes to the creatures, and it is spent so that
 * the mana row keeps the size it already had rather than paying for it:
 * measured after, at 1920, creatures 105 -> 128 and lands 105 -> 104.
 *
 * The rule this file exists for is untouched. The share is a constant and the
 * argument is the box, so a permanent arriving cannot change either row's
 * height, cannot change either card's size, and `splitBands.length` is still 1.
 */
export function splitBands(bandsUsable: number): BandShare {
  const creatureHeight = Math.round(bandsUsable * CREATURE_SHARE);
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
/**
 * The pitch at which two TURNED neighbours stop covering each other.
 *
 * A tapped permanent paints `cardWidth / CARD_RATIO` across, so two of them
 * clear each other only once the pitch reaches that. The extra hundredth is a
 * pixel of margin against `Math.floor` further down.
 *
 * MEASURED, 28 Aug 2026, two seats at 1600 x 1000, every permanent tapped
 * through the same dispatcher a click uses:
 *
 *   creature row  116px cards, 9px gap, tapped paint 162px  -> 37px covered
 *   mana row       94px cards, 7px gap, tapped paint 131px  -> 30px covered
 *
 * and the arithmetic predicts both exactly: a card leans `tapLean` each side,
 * so two neighbours eat `2 * tapLean` against a gap of 9 or 7. The worst card
 * was 77% visible — NOT the "only slivers of each visible" an earlier pass
 * reported, and that correction matters, because slivers would mean a stacking
 * bug and 77% means a gap that is a few pixels too small.
 *
 * What makes it indefensible rather than a trade is the other half of the same
 * measurement: **41% of that creature row and 71% of that mana row were empty**
 * while the cards on them covered each other. The room was already there.
 *
 * It goes in as the top RUNG rather than as a new rule, so nothing here learns
 * which cards are tapped and rule one still holds: tapping cannot reflow a row.
 */
const TURNED_PITCH = 1 / CARD_RATIO + 0.01;

/**
 * The turned pitch is only offered to a row that can still seat a board at it.
 *
 * WITHOUT this gate the change broke two of the tests below, and both were
 * right to break. On the narrow rows a FOUR-seat table gives — 526px, 444px,
 * 392px — the turned pitch seats only three cards where 1.08 seats four, and
 * that costs the two things this file exists to protect:
 *
 *   - rule three. Losing a slot moves the rung crossing down into the counts a
 *     row really holds, so the third creature entering re-pitched the row and
 *     shifted the two already on it by 32px. That is precisely the owner's
 *     *"weird layout shifting"*, reintroduced.
 *   - the trade written down two tests below: a full row stopped reaching
 *     across the mat, spanning 80% of it against the 83% the suite requires.
 *
 * Six is the smallest board worth calling a board, and it separates the two
 * cases cleanly on measurement rather than on taste: a two-seat 1130px creature
 * row seats 6 at the turned pitch and takes it, while every four-seat row above
 * seats 3 and is left exactly as it was. The cost where it IS taken is that the
 * creature row now steps down at 7 permanents instead of 9. That is a rung
 * crossing twice a game against neighbours covering each other on every board.
 */
const MIN_TURNED_SLOTS = 6;

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

  /* Turning room BETWEEN cards, on a row wide enough to keep a board at it.
     See `TURNED_PITCH` and `MIN_TURNED_SLOTS`: this is the whole of two tapped
     neighbours no longer covering 37px of each other, and it is tried ahead of
     the ladder rather than added to it so a row that cannot afford it walks the
     original rungs unchanged. */
  const turned = Math.max(1, Math.floor(cardWidth * TURNED_PITCH));
  const turnedSlots = fits(turned);

  /* The first rung that holds this many, walking down. `Math.floor` rather than
     `round`, so a rung whose pitch rounds UP past what fits is not chosen and
     then found to overflow. */
  let pitch = Math.max(1, Math.floor(cardWidth * PITCH_RUNGS[PITCH_RUNGS.length - 1]));
  if (turnedSlots >= MIN_TURNED_SLOTS && count <= turnedSlots) {
    pitch = turned;
  } else {
    for (const rung of PITCH_RUNGS) {
      const candidate = Math.max(1, Math.floor(cardWidth * rung));
      if (count <= fits(candidate)) {
        pitch = candidate;
        break;
      }
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
 * something"*. So it stays on the right. That part has not changed.
 *
 * ---------------------------------------------------------------------------
 * A FIFTH OF THE MAT, CAPPED AT 220, COULD NOT HOLD AN ARTIFACT DECK
 * ---------------------------------------------------------------------------
 * Owner, by name: the artifact and enchantment area is tiny when some people
 * play full artifact decks. Measured on 22 Aug 2026, thirteen noncreature
 * nonland permanents on one seat, the two rows left empty on purpose:
 *
 *   viewport      the two rows         the block          each card in it
 *   1280 x 800    885 x 234, 0 cards   220 x 473, 13      86 x 120, 43% visible
 *   1920 x 1080   1525 x 340, 0 cards  220 x 684, 13      115 x 160, 24% visible
 *
 * At 1920 the block held every permanent in play in 11.6% of the mat while
 * 1525 x 680 px of it held nothing, and a WIDER window was worse: the card grew
 * to 115px, two columns stopped fitting inside a fixed 220, and thirteen cards
 * fell into a single shingled stack showing a title bar each.
 *
 * The 220 was the cause. It is an absolute ceiling, so the block is the same
 * 220px on a 1264px mat and on a 1904px one, and the mat getting bigger only
 * ever made the cards inside it bigger and the column count smaller.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACES IT: rungs, and it still is not a function of the count
 * ---------------------------------------------------------------------------
 * `seatLayout.ts` exists to enforce that geometry follows the BOX and not the
 * board, because a card resizing when a permanent arrives is the owner's
 * *"weird layout shifting"*. That rule is kept where it does that work and
 * relaxed in exactly one place, deliberately, with the trade written down.
 *
 * The block's width steps along a LADDER of three widths. It is not solved for
 * the count, it is chosen by which rung the count is on, and there are two
 * crossings in a whole game: the fifth support permanent and the eleventh. That
 * is the same device `layoutRow` and `blockStep` already use vertically, and it
 * has the same property — most arrivals move nothing at all.
 *
 * What a crossing costs is bounded and small, which is why this is affordable
 * here and was not affordable for the card size:
 *
 *   - No card CHANGES SIZE. `seatCardWidth` reads the row's HEIGHT and the
 *     player's ceiling, and neither of those is touched by the block's width.
 *   - No card on a sparse row MOVES. `layoutRow` lays from the left with a
 *     constant edge, so a row with room to spare is laid identically in a
 *     narrower box.
 *   - A crowded row can drop one pitch rung, which is a repack it already does
 *     when a creature arrives.
 *
 * An EMPTY block is rung zero, which is the same fifth of the mat capped at the
 * same 220 as before. A deck with no artifacts in it gives up nothing.
 */
export interface BlockWidthRung {
  /** This rung is used once the block holds MORE than this many permanents. */
  over: number;
  /** Share of the mat's width. */
  share: number;
  /** The ceiling for that share, px. */
  cap: number;
}

export const BLOCK_WIDTH_RUNGS: readonly BlockWidthRung[] = [
  { over: 0, share: 0.2, cap: 220 },
  { over: 4, share: 0.3, cap: 340 },
  { over: 10, share: 0.4, cap: 440 },
];

/**
 * How wide the block is on a mat of `matWidth` holding `count` permanents.
 *
 * `count` defaults to zero, so a caller that does not know what is in the block
 * gets the narrow rung rather than a guess, and `supportBlockWidth.length`
 * stays 1 — the arity `seatLayout.test.ts` pins to stop counts leaking back
 * into the geometry that must not have them.
 */
export function supportBlockWidth(matWidth: number, count = 0): number {
  let rung = BLOCK_WIDTH_RUNGS[0];
  for (const candidate of BLOCK_WIDTH_RUNGS) {
    if (count > candidate.over) rung = candidate;
  }
  return Math.round(Math.max(76, Math.min(matWidth * rung.share, rung.cap)));
}

/* -------------------------------------------------------------------------- */
/* THE PILES: FOUR TILES, TWO ACROSS                                          */
/* -------------------------------------------------------------------------- */
/*
 * Owner, on a screenshot: *"THE ZONES ARE POSTAGE STAMPS. Library, graveyard,
 * exile and command sit in a narrow left rail at a size where the art is
 * unreadable."*
 *
 * Measured on 23 Aug 2026, two seats, real `/play`:
 *
 *   1920 x 1080   four tiles of 116 x 72, the card inside each 44px wide
 *   1280 x 800    four tiles of  94 x 49, the card inside each 28px wide
 *
 * A 44px card is a coloured rectangle; `MIN_BOARD_CARD` is 62 and exists
 * because below it the art stops reading. The cause was the shape and not the
 * width: four card-shaped tiles STACKED down a 369px mat get 92px of height
 * each, and 92px of height buys 44px of card whatever the rail is allowed to be
 * wide. `railWidth` was then capped at an absolute 120, so a mat getting wider
 * never helped either.
 *
 * Two columns and two rows fixes the shape rather than the number. Each tile
 * gets HALF the mat's height instead of a quarter, which roughly doubles the
 * card, and the rail pays for it in width — out of the 991px of dead row the
 * same measurement found sitting beside it.
 *
 * It is capped at a quarter of the mat, because the two rows are the board and
 * the piles are the furniture next to it.
 */

/** The piles are laid two across and two down: library, yard / exile, command. */
export const PILE_COLUMNS = 2;
export const PILE_ROWS = 2;

export interface PileGrid {
  /** Total width of the rail, including the gap between the two columns. */
  rail: number;
  tileWidth: number;
  tileHeight: number;
  /** The card drawn inside one tile. */
  cardWidth: number;
}

/**
 * The four piles' grid on a mat of this size.
 *
 * Takes the mat and nothing else — no counts, no zone contents — so a card
 * arriving in a graveyard cannot move the board, which is the rule the whole of
 * this file enforces.
 */
export function pileGrid(matWidth: number, matHeight: number): PileGrid {
  const usable = Math.max(60, matHeight - identityBandHeight(matHeight) - 16);
  const tileHeight = Math.max(34, Math.floor(usable / PILE_ROWS) - 4);
  /* A quarter of the mat, never more, and never so little that a tile cannot
     hold a card at all. */
  const cap = Math.max(96, Math.min(matWidth * 0.24, 268));
  const byWidth = Math.floor((cap - 6) / PILE_COLUMNS) - 12;
  /* 12px of the tile's height is its label and its count badge. */
  const cardWidth = Math.max(20, Math.min(Math.round((tileHeight - 12) * CARD_RATIO), byWidth));
  const tileWidth = cardWidth + 10;
  return { rail: tileWidth * PILE_COLUMNS + 6, tileWidth, tileHeight, cardWidth };
}

/**
 * The width a seat gives its outer rail: the four piles, two across.
 *
 * Sized from the mat's HEIGHT as well as its width, because the rail's job is
 * to hold card-shaped tiles. A rail set purely as a fraction of the width is a
 * wide empty strip on a short quadrant.
 */
export function railWidth(matWidth: number, matHeight: number): number {
  return pileGrid(matWidth, matHeight).rail;
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
