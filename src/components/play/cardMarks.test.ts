import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTER_FONT_MAX,
  COUNTER_FONT_MIN,
  STAT_FONT_MAX,
  counterBadge,
  markDrop,
  markGap,
  statBadge,
} from './cardMarks.ts';

/*
 * The measured before, from playing a real game on 22 Aug 2026:
 *
 *   card 72 x 100  ->  badge 22.4 x 16.0 px, text 9px
 *   card 105 x 146 ->  badge 22.4 x 16.0 px, text 9px
 *   card 28 x 39   ->  badge 22.4 x 16.0 px, text 9px  (80% of the card's width)
 *
 * One constant at every card size. These tests are the rule that replaced it.
 */

test('the badge follows the card, which is the whole point of this file', () => {
  const small = counterBadge(72);
  const large = counterBadge(105);
  assert.ok(large.font > small.font, 'a bigger card carries bigger digits');
  assert.ok(large.height > small.height);
});

test('the two sizes the report measured', () => {
  assert.deepEqual(counterBadge(72), { font: 12, height: 18, padX: 5 });
  assert.deepEqual(counterBadge(105), { font: 17, height: 26, padX: 7 });
});

test('a rail thumbnail is not swallowed by its own badge', () => {
  const thumb = counterBadge(28);
  assert.equal(thumb.font, COUNTER_FONT_MIN);
  /* Was 22.4px wide on a 28px card. The floor is now the badge's height, and
     that is 12, which is 43% of the card rather than 80%. */
  assert.equal(thumb.height, 12);
  assert.ok(thumb.height / 28 < 0.5);
});

test('a full size card carries a mark, not a caption', () => {
  assert.equal(counterBadge(200).font, COUNTER_FONT_MAX);
  assert.equal(counterBadge(600).font, COUNTER_FONT_MAX);
});

test('it never returns something a browser cannot draw', () => {
  for (const width of [0, -5, 1, 3, 1000]) {
    const badge = counterBadge(width);
    assert.ok(badge.font >= COUNTER_FONT_MIN);
    assert.ok(badge.height > badge.font);
    assert.ok(badge.padX >= 2);
  }
});

test('it grows without jumping, so no card size is a cliff', () => {
  let last = counterBadge(20).height;
  for (let width = 21; width <= 260; width += 1) {
    const next = counterBadge(width).height;
    assert.ok(next >= last, `height went backwards at ${width}`);
    assert.ok(next - last <= 2, `height jumped ${next - last}px at ${width}`);
    last = next;
  }
});

/* -------------------------------------------------------------------------- *
 * THE RAIL                                                                   *
 *
 * Measured on a real goldfish board at 1600 x 1000, nine permanents down, by
 * `scripts/play-stat-measure.mjs`: a 200px card drew its stat box at 26px
 * digits in a 62.8 x 38 pill. That was never too small.
 * `scripts/play-mark-occlusion.mjs` then measured how much of it a player could
 * SEE, and the answer was one box of six fully visible and five at 40%, which
 * is exactly enough of `1/1` to show the power and hide the toughness.
 *
 * These pin the geometry that moved the rail to the edge that survives.
 * -------------------------------------------------------------------------- */

test('power and toughness is bigger than a counter at every card size', () => {
  for (const width of [28, 58, 86, 130, 186, 200, 262]) {
    const stat = statBadge(width);
    const counter = counterBadge(width);
    assert.ok(
      stat.font >= counter.font,
      `a counter out-shouted the stat line on a ${width}px card`
    );
  }
});

test('the size the real board measured', () => {
  // The 200px card the occlusion run photographed: 26px digits, 38px tall.
  const stat = statBadge(200);
  assert.equal(stat.font, STAT_FONT_MAX);
  assert.equal(stat.height, 38);
});

test('the rail hangs below the card, which is where nothing can cover it', () => {
  // The part below the card's bottom edge is over the bare mat, and a
  // neighbour's box ends at the same bottom, so it cannot reach.
  for (const width of [58, 86, 130, 200]) {
    const badge = counterBadge(width);
    const drop = markDrop(badge.height);
    assert.ok(drop > 0, 'the rail sits entirely on the card');
    assert.ok(drop < badge.height / 2, 'the rail fell off the card');
  }
});

test('the gap between marks follows the card too', () => {
  assert.ok(markGap(200) > markGap(58));
  assert.ok(markGap(1) >= 2, 'a gap a browser cannot draw');
});

test('a rail of four marks still fits the strip a crowded row leaves', () => {
  /* The measured crowded row: a 200px card with 143px uncovered. Power and
     toughness, damage and one counter have to fit inside that, because those
     are the three a player reads in combat. The fourth is a mark they wrote
     themselves and already know about, and it is the one allowed to run under
     the neighbour. */
  const width = 200;
  const uncovered = 143;
  const stat = statBadge(width);
  const badge = counterBadge(width);
  const gap = markGap(width);
  const inset = Math.round(width * 0.03);
  const three = inset + stat.height + gap + badge.height + gap + badge.height;
  assert.ok(three <= uncovered, `the first three marks needed ${three}px of ${uncovered}`);
});
