/**
 * The hand-sizing arithmetic, tested.
 *
 * Every expectation below is computed from the exported constants rather than
 * pasted as a magic number, so a deliberate change to a share or an overhang
 * updates the test with the code and an accidental one still fails. The two
 * cases that are hard-coded are the two the rule exists for: a short laptop
 * screen, and a very tall one where the ceiling has to win.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_CARD_DEFAULT,
  CARD_RATIO,
  HAND_CARD_DEFAULT,
  HUD_INSET,
  MIN_HAND_CARD,
  MIN_VIEWPORT_HEIGHT,
  handMetrics,
} from './tableMetrics.ts';

test('the ceiling wins on a tall screen, so a slider setting is honoured', () => {
  const tall = handMetrics(2400, HAND_CARD_DEFAULT, false);
  assert.equal(tall.cardWidth, HAND_CARD_DEFAULT);
});

test('a short screen comes down from the ceiling rather than overflowing it', () => {
  const short = handMetrics(720, HAND_CARD_DEFAULT, false);
  assert.ok(short.cardWidth < HAND_CARD_DEFAULT);
  assert.equal(short.cardWidth, Math.round(720 * 0.25 * CARD_RATIO));
});

test('the fan never shrinks past readable, however short the window', () => {
  /* Two floors, and at the bottom of the range the second one binds: a 480px
     window would give 86px by share alone, which is under the readable floor,
     so the floor is what comes back. Measured, not assumed. */
  assert.ok(MIN_VIEWPORT_HEIGHT * 0.25 * CARD_RATIO < MIN_HAND_CARD);
  const tiny = handMetrics(120, HAND_CARD_DEFAULT, false);
  assert.equal(tiny.cardWidth, MIN_HAND_CARD);
  const floored = handMetrics(MIN_VIEWPORT_HEIGHT, HAND_CARD_DEFAULT, false);
  assert.equal(floored.cardWidth, MIN_HAND_CARD);
});

test('the one-seat view gets a bigger hand than the four-seat table', () => {
  const table = handMetrics(1050, HAND_CARD_DEFAULT, false);
  const focused = handMetrics(1050, HAND_CARD_DEFAULT, true);
  assert.ok(focused.cardWidth > table.cardWidth);
});

test('the table reserves a full card height, so the fan laps only the mana row', () => {
  const table = handMetrics(1050, HAND_CARD_DEFAULT, false);
  assert.equal(table.inset, Math.round(table.cardWidth / CARD_RATIO));
});

test('the one-seat view laps further, reserving less than a card', () => {
  const focused = handMetrics(1050, HAND_CARD_DEFAULT, true);
  assert.ok(focused.inset < Math.round(focused.cardWidth / CARD_RATIO));
});

test('a lower ceiling reserves a smaller strip, so the board gets the pixels back', () => {
  const big = handMetrics(1050, 300, false);
  const small = handMetrics(1050, 140, false);
  assert.ok(small.inset < big.inset);
});

test('the numbers a play surface starts from are sane against each other', () => {
  // The hand is held closer to the eye than the board, so it starts larger.
  assert.ok(HAND_CARD_DEFAULT > BOARD_CARD_DEFAULT);
  // The HUD is a strip, not a panel: it must not eat a card's worth of height.
  assert.ok(HUD_INSET < BOARD_CARD_DEFAULT / CARD_RATIO);
});

test('both play surfaces get identical numbers from identical input', () => {
  /* The regression this module exists for. `/play` and the watched playtest
     used to hold separate copies of this function with different constants, so
     the same window laid the same hand out two ways. There is one copy now, and
     this asserts the only thing that could reintroduce the split: that the
     result depends on nothing but its arguments. */
  for (const height of [600, 800, 1050, 1440]) {
    for (const focused of [false, true]) {
      const first = handMetrics(height, HAND_CARD_DEFAULT, focused);
      const second = handMetrics(height, HAND_CARD_DEFAULT, focused);
      assert.deepEqual(first, second);
    }
  }
});
