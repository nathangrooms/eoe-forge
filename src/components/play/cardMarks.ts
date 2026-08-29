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

/**
 * How big the power and toughness badge is on a card of `cardWidth`.
 *
 * Owner: *"when I give it more power or toughness or change them, its not
 * clear on the board or that screen"*, and separately that the stats *"should
 * be large for their power, toughness"*.
 *
 * They were not unclear. They were ABSENT. `GameCardView` computed the live
 * stat line with `statLineIn` and drew it in exactly two places: the
 * typographic fallback face, which only appears when a card has no art, and a
 * 9px chip that appears only while the creature is attacking or blocking. A
 * creature sitting on your battlefield with real art showed no power or
 * toughness anywhere, so giving it a counter changed a number nobody could
 * see.
 *
 * Bigger than a counter on purpose, and this is the whole reasoning: a counter
 * says what CHANGED, and power and toughness say what the card IS. In combat
 * the second question is asked far more often, and it is asked in a hurry. So
 * the share is 0.20 against the counter's 0.16, which at the two sizes
 * `cardMarks.test.ts` pins gives 14px digits on the 72px card and 21px on the
 * 105px card, against 12px and 17px for a counter.
 *
 * The maximum is deliberately higher than the counter maximum too. A counter
 * on a 200px card would become a caption; a power box on a 200px card is the
 * size it is on the printed card in your hand, which is the thing this is
 * imitating.
 */
export const STAT_FONT_MIN = 9;
export const STAT_FONT_MAX = 26;
export const STAT_FONT_SHARE = 0.2;

export function statBadge(cardWidth: number): CounterBadge {
  const raw = Math.round(Math.max(1, cardWidth) * STAT_FONT_SHARE);
  const font = Math.min(STAT_FONT_MAX, Math.max(STAT_FONT_MIN, raw));
  return {
    font,
    height: Math.round(font * 1.45),
    padX: Math.max(3, Math.round(font * 0.38)),
  };
}
