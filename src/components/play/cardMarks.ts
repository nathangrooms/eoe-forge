/**
 * The small marks drawn on a card: how big they are, and why.
 *
 * ---------------------------------------------------------------------------
 * THE COUNTER BADGE WAS THE ONLY MARK ON A CARD THAT DID NOT SCALE
 * ---------------------------------------------------------------------------
 * Measured on 22 Aug 2026, driving a real game at two window sizes with three
 * +1/+1 counters on a permanent:
 *
 *   viewport      card on the mat      counter badge      badge text
 *   1280 x 800    72 x 100             22.4 x 16.0 px     9 px
 *   1920 x 1080   105 x 146            22.4 x 16.0 px     9 px
 *
 * The card grew 46%. The tap chip grew 25%. The summoning sickness mark grew
 * 25%. The counter badge did not move, because `GameCardView` wrote it as
 * `text-[9px] ... leading-4`, a constant with no width term in it, while the
 * two marks either side of it are computed from `renderedWidth` and carry
 * comments saying why they have to be.
 *
 * So it was 16.0% of a card's height at 1280 and 11.0% at 1920, with digits
 * about 6.5px tall — smaller than the printed power and toughness on the art
 * underneath. And the SAME 22.4 x 16 was drawn on the 28 x 39 command zone
 * thumbnail, where it covered 80% of the card's width. One constant, too small
 * where it matters and too big where it does not.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * The same proportional rule the tap chip uses, with a floor and a ceiling for
 * the same two reasons the tap chip has them: a rail thumbnail must not be
 * swallowed by its own badge, and a full-size card must not carry a badge that
 * has stopped being a mark and become a label.
 *
 * The badge is also given a minimum width equal to its height, so a single
 * digit draws as a round chip rather than a sliver, and so the width has a
 * floor that can be stated rather than only being whatever the text came out
 * as.
 *
 * Pure, so `node --test` reads it and `cardMarks.test.ts` pins the numbers.
 */

export interface CounterBadge {
  /** Font size of the digits, px. */
  font: number;
  /** Height of the pill, px. Also its minimum width. */
  height: number;
  /** Padding on each side of the digits, px. */
  padX: number;
}

/** Never below this, so a 28px rail thumbnail keeps a legible mark. */
export const COUNTER_FONT_MIN = 8;
/** Never above this, so a 200px card carries a mark and not a caption. */
export const COUNTER_FONT_MAX = 20;
/** The share of a card's width the digits take. */
export const COUNTER_FONT_SHARE = 0.16;

/**
 * How big the counter and damage badges are on a card of `cardWidth`.
 *
 * At the two sizes the report measured this gives 12px digits in a 18px pill on
 * the 72px card and 17px digits in a 26px pill on the 105px card, against 9px
 * digits in a 16px pill at both before.
 */
export function counterBadge(cardWidth: number): CounterBadge {
  const raw = Math.round(Math.max(1, cardWidth) * COUNTER_FONT_SHARE);
  const font = Math.min(COUNTER_FONT_MAX, Math.max(COUNTER_FONT_MIN, raw));
  return {
    font,
    height: Math.round(font * 1.5),
    padX: Math.max(2, Math.round(font * 0.42)),
  };
}
