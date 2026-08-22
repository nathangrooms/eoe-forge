import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTER_FONT_MAX,
  COUNTER_FONT_MIN,
  counterBadge,
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
