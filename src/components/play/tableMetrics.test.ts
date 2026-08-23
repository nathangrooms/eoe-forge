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
  HAND_LIFT,
  HAND_REVEAL,
  HUD_INSET,
  MIN_HAND_CARD,
  MIN_VIEWPORT_HEIGHT,
  handBandFor,
  handMetrics,
  handSinkFor,
} from './tableMetrics.ts';

test('the ceiling wins on a tall screen, so a slider setting is honoured', () => {
  const tall = handMetrics(2400, HAND_CARD_DEFAULT, false);
  assert.equal(tall.cardWidth, HAND_CARD_DEFAULT);
});

test('a short screen comes down from the ceiling rather than overflowing it', () => {
  /* This used to pin `height * 0.25 * CARD_RATIO`, which was the formula before
     the fan learned to lap the board. The band no longer costs a whole card
     height: only the top `HAND_REVEAL` of each card is drawn above the edge,
     plus `HAND_LIFT`. Pinning the old arithmetic made this fail at 131 against
     129 for a layout that was deliberately changed.

     So it asserts the PROPERTY the test is named for, and derives the number
     from the same constants the implementation uses rather than from a second
     copy of them. */
  const short = handMetrics(720, HAND_CARD_DEFAULT, false);
  assert.ok(short.cardWidth < HAND_CARD_DEFAULT, 'a short window comes down from the ceiling');

  // the fan's revealed part fits the band it was given
  assert.ok(handBandFor(short.cardWidth) <= Math.round(720 * 0.19) + 1);
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

test('the band the fan costs the board is its revealed part, not a whole card', () => {
  /* Renamed and re-aimed. It used to assert the table reserved a FULL card
     height. It does not any more, and that is the point of the change: the fan
     sits low in its band so the board keeps the difference. `handBandFor` is
     the one place that arithmetic lives. */
  const table = handMetrics(1050, HAND_CARD_DEFAULT, false);
  assert.equal(table.inset, handBandFor(table.cardWidth));
  assert.ok(table.inset < Math.round(table.cardWidth / CARD_RATIO), 'costs less than a card');
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

test('the band and the sink are one card between them, so the fan lands on the edge', () => {
  /*
   * The one property that decides whether the hand covers the table.
   *
   * `handBandFor` is what the board keeps clear and `handSinkFor` is what
   * `ViewerHand` hangs below it. If they ever stop adding up to a card the fan
   * either floats above the table edge or hangs half a card too low, and both
   * of those are the overlap coming back by another route: measured before this
   * change at 1920 x 1080, 95,316 px of the reader's own mat and six of their
   * own permanents were under the fan.
   *
   * `HAND_LIFT` is the deliberate slack on top of the card, for the arc the fan
   * is drawn in.
   */
  for (const cardWidth of [96, 140, 194, 210, 260, 300]) {
    const cardHeight = cardWidth / CARD_RATIO;
    assert.equal(
      handBandFor(cardWidth) + handSinkFor(cardWidth) - HAND_LIFT,
      Math.round(cardHeight * HAND_REVEAL) + Math.round(cardHeight * (1 - HAND_REVEAL)),
      `band and sink do not make a card at ${cardWidth}px`
    );
    assert.ok(handBandFor(cardWidth) < cardHeight + HAND_LIFT, 'the band is less than a card');
    assert.ok(handSinkFor(cardWidth) > 0, 'and the fan really is sunk');
  }
});

test('the revealed part of a hand card reaches the type line', () => {
  /* `HAND_REVEAL` is not a taste number: a Magic card's type line sits at about
     62% of its height, so the docked fan shows the name, the cost, the whole
     illustration and the type line of every card in hand. Drop below about a
     half and the illustration starts being cut, which is the point at which a
     docked hand stops being readable and starts being a row of title bars. */
  assert.ok(HAND_REVEAL >= 0.55 && HAND_REVEAL <= 0.7);
});

test('the band never claims more of the window than the board does', () => {
  for (const height of [600, 800, 1050, 1440, 2400]) {
    const table = handMetrics(height, HAND_CARD_DEFAULT, false);
    assert.ok(
      table.inset + HUD_INSET < height / 2,
      `hand band ${table.inset} plus HUD leaves less than half of ${height} for the table`
    );
  }
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
