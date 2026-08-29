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

/* ==========================================================================
 * WHICH CORNER, AND WHY IT MOVED
 * ==========================================================================
 * The size was never the problem. Measured on a real goldfish board at
 * 1600 x 1000, nine permanents down, by `scripts/play-stat-measure.mjs` and
 * `scripts/play-mark-occlusion.mjs`:
 *
 *   card 200px wide   stat box "1/1"   26px digits in a 62.8 x 38 pill
 *
 * 26px is not small. But the same run measured how much of each box a player
 * can actually SEE, by asking the document which permanent is on top at every
 * point across it:
 *
 *   stat boxes fully visible: 1 of 6
 *   the other five: 40% visible
 *
 * Forty per cent of `1/1` from the left is `1`. The screenshot agrees exactly:
 * the row read 1, 1, 2, 2, 1 and only the LAST card in the run showed both
 * numbers. The number a player checks most often in combat was being cut in
 * half by the card next to it.
 *
 * `Battlefield.tsx` gives every permanent `zIndex: index` and a negative
 * `marginLeft` once the row is crowded, so card k+1 lies over the right edge of
 * card k. The stat badge was anchored `right: 4%` — the corner it occupies on a
 * printed Magic card, which is exactly the corner an overlapped row guarantees
 * is underneath something. The uncovered strip measured 143px of 200.
 *
 * That file already knew. The combat note carries the reasoning verbatim: *"a
 * crowded row hides the RIGHT of every card under the one after it and the only
 * strip that stays visible is the left edge."* It was applied to the label
 * saying who a creature is attacking and not to its power and toughness.
 *
 * So every mark a player reads in a hurry now hangs off the BOTTOM LEFT, in one
 * rail, in the order they are wanted: power and toughness, then damage, then
 * counters, then the marks the player put there themselves. Leftmost survives,
 * and what survives is the most important thing.
 *
 * The attachment link swapped into the vacated bottom-right corner. It is the
 * one mark on a card that is a "there is more to know" hint rather than a
 * number read in a hurry, so it is the right thing to put in the corner that
 * gets covered.
 * ========================================================================== */

/** Gap between marks in the rail. Proportional, like everything else here. */
export function markGap(cardWidth: number): number {
  return Math.max(2, Math.round(cardWidth * 0.03));
}

/**
 * How far the rail hangs below the card's bottom edge.
 *
 * A third of the badge, which is what the counter row already used and is the
 * reason counters measured 100% visible while the stat box measured 40%: the
 * part below the card is over the bare mat, where no neighbour can reach it.
 * Two thirds stays on the card so the rail still reads as belonging to it.
 */
export function markDrop(badgeHeight: number): number {
  return Math.round(badgeHeight * 0.34);
}
