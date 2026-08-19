/**
 * The arithmetic behind a seat's mat, kept out of the component so it can be
 * tested.
 *
 * All of this used to live inside `SeatMat.tsx`, where nothing could reach it:
 * the test runner is `node --test` over `src/**\/*.test.ts` and a `.tsx`
 * component full of JSX is not importable from it. So a change that is almost
 * entirely arithmetic — how two rows share a fixed height, how wide a row of
 * cards actually paints, whether that row runs under the floating identity
 * strip — shipped with no test of any kind. These functions are that
 * arithmetic, and `seatLayout.test.ts` is the test.
 */

import { CARD_RATIO, MAX_OVERLAP, MIN_BOARD_CARD, fitRowCardWidth } from './boardMetrics.ts';

/**
 * What a row with nothing in it keeps for itself.
 *
 * A zone holds its place so the board does not reflow as permanents come and
 * go — the label stays, the tint stays, the geography stays. What it does not
 * get to do is hold half the mat open: an empty creatures row was reserving
 * 139px of the only scarce resource on this screen.
 */
export const EMPTY_ROW_HEIGHT = 24;

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
 * the box the row laid out for it. The row reserves this at each END of the run
 * — see `layoutRow` — and it is deliberately NOT counted per tapped card.
 */
export const tapLean = (cardWidth: number) => Math.round((cardWidth / CARD_RATIO - cardWidth) / 2);

/**
 * The widest a row lets its cards drift apart: a card and a quarter.
 *
 * This exists so a row USES the width it has instead of huddling in the middle
 * of it. Owner: *"playmats dont use 100% of the page which I thought they would"*
 * — measured at 1024px, a row reaching x=935 stopped its cards at x=737 and left
 * blank mat at both ends.
 *
 * There has to be a cap, because two permanents pushed into opposite corners of
 * a 1460px mat is not a playmat either. The number was measured rather than
 * picked: four creatures at 121px on the 1460px row that a 1680px window gives a
 * two-seat table reach 52% of it at three quarters of a card and 64% at a card
 * and a quarter, and past that the row stops reading as one row.
 *
 * It also has to clear a card's turning room, which is about 0.70 of a card in
 * total (`tapLean` at each side), so a spread row can hold tapped cards without
 * them touching. Anything at or above that is safe on that count.
 *
 * Card SIZE is not the lever here, and it is worth writing down why. On a
 * two-seat table the seat is about 366px tall, the two rows split that, and
 * `fitRowCard` is therefore HEIGHT-bound at about 121px against a ceiling of
 * 200. The row has width going spare and no way at all to spend it on a bigger
 * card; spreading is the only thing it can do with it.
 */
export const MAX_ROW_GAP = (cardWidth: number) => Math.round(cardWidth * 1.25);

/** The height a row needs to show `count` cards at the widest width it can use. */
export function rowAsk(count: number, available: number, ceiling: number): number {
  if (count === 0) return EMPTY_ROW_HEIGHT;
  const widest = Math.min(ceiling, fitRowCardWidth(available, count, ceiling));
  return Math.round(widest / CARD_RATIO) + ROW_PADDING;
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
 * OTHER card on it moved as well. The identity-strip inset was fed the same
 * tapped count, so the whole row could also jump sideways by 300px the moment a
 * sixth land was tapped. `GameCardView` was innocent throughout: it puts the
 * rotation on an inner element precisely so a turn cannot reflow anything.
 *
 * So `tapped` is not a parameter here and cannot be one. Turning room is
 * reserved at the two ENDS of the run, for the whole row, whether or not
 * anything in it is turned — a constant, therefore never a shift. Between
 * cards, the gap is at least the turning room whenever the row has the width to
 * spare, which is the same guarantee bought without the same cost.
 *
 * ## Rule two: spread before you centre
 *
 * The surplus width goes into the gaps first, up to `MAX_ROW_GAP`, and only
 * what is left after that is centred. A row of three creatures on a wide mat
 * now reaches nearly both ends of it instead of sitting in a clump in the
 * middle with dead mat either side.
 *
 * ## Rule three: crowded rows overlap, exactly as before
 *
 * Past capacity the cards slide under each other and the run gets NARROWER than
 * its natural width, so there is no surplus to spread and no room to turn in.
 * That branch is unchanged.
 *
 * `PermanentRow` renders precisely this and nothing else, so the measurement
 * and the paint cannot disagree.
 */
export interface RowLayout {
  /** Space between two adjacent card boxes, px. Zero when the row overlaps. */
  gap: number;
  /** Fraction of a card hidden by its neighbour. Zero unless crowded. */
  overlap: number;
  /** Clear mat reserved before the first card and after the last, px. */
  edge: number;
  /** Total width the run occupies, including both edges. */
  span: number;
  /** Where the run begins inside `available`, px. */
  start: number;
}

export function layoutRow(count: number, cardWidth: number, available: number): RowLayout {
  if (count <= 0 || cardWidth <= 0) {
    return { gap: 0, overlap: 0, edge: 0, span: 0, start: 0 };
  }

  const base = rowGap(cardWidth);
  const lean = tapLean(cardWidth);
  const capacity = Math.max(1, Math.floor(available / Math.max(1, cardWidth + base)));

  if (count > capacity && count >= 2) {
    const overlap = Math.min(MAX_OVERLAP, Math.max(0, 1 - (capacity - 1) / (count - 1)));
    const span = Math.round(cardWidth * (1 + (count - 1) * (1 - overlap)));
    return { gap: 0, overlap, edge: 0, span, start: Math.max(0, Math.round((available - span) / 2)) };
  }

  const natural = count * cardWidth + (count - 1) * base;
  /* Turning room at the ends, for the row, granted only if the row still fits
     with it. Constant in the tapped count by construction. */
  const edge = natural + lean * 2 <= available ? lean : 0;

  const room = available - edge * 2 - count * cardWidth;
  const gap =
    count > 1
      ? Math.max(base, Math.min(MAX_ROW_GAP(cardWidth), Math.floor(room / (count - 1))))
      : 0;

  const span = count * cardWidth + (count - 1) * gap + edge * 2;
  return { gap, overlap: 0, edge, span, start: Math.max(0, Math.round((available - span) / 2)) };
}

/**
 * How wide `count` cards of `cardWidth` occupy in a row of `available` px.
 *
 * A thin read of `layoutRow`, kept because "how wide is this row" is the
 * question every caller upstream actually has. It no longer takes a tapped
 * count: see rule one above.
 */
export function rowSpan(count: number, cardWidth: number, available: number): number {
  return layoutRow(count, cardWidth, available).span;
}

export interface BandShare {
  creatureHeight: number;
  landHeight: number;
}

/**
 * How the two rows split the height the mat has.
 *
 * Not 50/50. An even split means an empty creatures row holds half the mat open
 * while the mana row underneath squeezes eight lands into 139px, and it means
 * the card size is decided by whichever row is worse off.
 *
 * Each row asks for the height it can actually USE. When the asks fit, the band
 * is shared in proportion to them, which is what makes one creature on an
 * otherwise empty board large. When they do not fit, every row holding cards is
 * given a readable floor FIRST and only the surplus is shared by ask — because
 * a crowded row asks for LESS height than a sparse one (its cards already
 * overlap), and sharing purely by ask starved the busy row down to 39px while
 * five lands beside it sat at 80.
 */
export function shareBandHeight(
  bandsUsable: number,
  creatures: number,
  lands: number,
  askCreatures: number,
  askLands: number
): BandShare {
  const askTotal = askCreatures + askLands;
  const floorCreatures = creatures === 0 ? EMPTY_ROW_HEIGHT : ROW_FLOOR;
  const floorLands = lands === 0 ? EMPTY_ROW_HEIGHT : ROW_FLOOR;

  let creatureHeight: number;
  if (askTotal <= bandsUsable) {
    creatureHeight = Math.round((askCreatures * bandsUsable) / Math.max(1, askTotal));
  } else if (floorCreatures + floorLands >= bandsUsable) {
    /* A window too short for the board. Squeeze both rather than pick a winner,
       so they say so together. */
    creatureHeight = Math.round(
      (floorCreatures * bandsUsable) / Math.max(1, floorCreatures + floorLands)
    );
  } else {
    const surplus = bandsUsable - floorCreatures - floorLands;
    const wantC = Math.max(0, askCreatures - floorCreatures);
    const wantL = Math.max(0, askLands - floorLands);
    creatureHeight =
      floorCreatures + (wantC + wantL > 0 ? Math.round((surplus * wantC) / (wantC + wantL)) : 0);
  }
  return { creatureHeight, landHeight: bandsUsable - creatureHeight };
}

/** The widest card a row of `count` can show in `rowHeight` x `available`. */
export function fitRowCard(
  count: number,
  rowHeight: number,
  available: number,
  ceiling: number
): number {
  if (count === 0) return 0;
  const byHeight = (rowHeight - ROW_PADDING) * CARD_RATIO;
  const fitted = Math.min(ceiling, byHeight, fitRowCardWidth(available, count, ceiling));
  /* Rounded at the end, not in the middle. The floor branch was returning the
     raw `byHeight` float, so a short row drew its cards at 60.2784px: every gap
     in the row landed on a different sub-pixel and the tapped-card lean, which
     is derived from the width, inherited the fraction. */
  return Math.round(Math.max(Math.min(MIN_BOARD_CARD, byHeight), fitted));
}

export interface InsetPlan {
  /** Room the cards keep clear at the start of the row. */
  start: number;
  /** Room the cards keep clear at the end of the row. */
  end: number;
  /** Width the cards may use once the insets are paid. */
  available: number;
  /** Where the run of cards begins, measured from the row's left edge. */
  cardsStart: number;
}

/**
 * Whether the top row has to step aside for the floating identity strip, and
 * how far.
 *
 * The strip — life, name, commander, mana, hand — floats over the mat instead
 * of reserving a band above it, because a band cost 70px of HEIGHT out of every
 * card on the seat while the row underneath had hundreds of px of WIDTH going
 * spare. The strip is paid for sideways instead.
 *
 * Two things this has to get right, both of which were wrong:
 *
 *  - It steps aside only when the cards would actually reach the strip. A row
 *    of three creatures centred on a wide mat never comes near it, and paying
 *    the inset there shoves the row off-centre and opens a dead zone.
 *  - When it does step aside, it steps aside by what the strip MEASURES, not by
 *    a fixed third of the mat. Reserving 446px of an 872px row for a strip
 *    291px wide forced eight creatures to overlap inside 426px while 220px of
 *    the same row stayed blank.
 *
 * It used to take a tapped count as well, and that was the second half of the
 * layout-shift bug: tapping one more creature could flip this decision, and the
 * whole top row jumped sideways by the width of the strip. Turning room is now
 * held at the ends of the run by `layoutRow` whatever is tapped, so the answer
 * here is a function of the board's SHAPE and never of its state.
 */
export function planIdentityInset(
  rowWidth: number,
  count: number,
  cardWidth: number,
  strip: { start: number; end: number }
): InsetPlan {
  const inner = Math.max(80, rowWidth - strip.start - strip.end);

  /* Judged against the width the row would ACTUALLY get if it were left alone,
     not against the narrowed one — otherwise the row is measured in a box it is
     not going to be laid out in and the answer is about the wrong picture. */
  const freeSpan = rowSpan(count, cardWidth, rowWidth);
  const centredStart = (rowWidth - freeSpan) / 2;
  if (
    freeSpan === 0 ||
    (centredStart >= strip.start && centredStart + freeSpan <= rowWidth - strip.end)
  ) {
    return { start: 0, end: 0, available: rowWidth, cardsStart: Math.max(0, centredStart) };
  }

  const span = rowSpan(count, cardWidth, inner);
  return {
    start: strip.start,
    end: strip.end,
    available: inner,
    cardsStart: strip.start + Math.max(0, (inner - span) / 2),
  };
}
