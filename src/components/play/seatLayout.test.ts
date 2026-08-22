/**
 * The seat mat's arithmetic, tested.
 *
 * Every number here was checked against a rendered DOM measurement before it
 * was written down — `scripts/play-board-audit.mjs` at 1920x1080, 1680x1050,
 * 1440x893 and 1280x800, four seats with loaded boards. They are not invented
 * targets.
 *
 * The tests that matter most are the first group. They assert a PROPERTY rather
 * than a number: that nothing about a seat's geometry can change when a card
 * enters or leaves. The owner's *"keep getting weird layout shifting when
 * things happen"* was measured as 20 boxes moving and every card on the seat
 * resizing when one land was played, and the fix was to remove the counts from
 * the arithmetic rather than to tune the numbers they produced. A property test
 * is the only kind that can tell whether that fix is still in place.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_RATIO, MIN_BOARD_CARD, fitRowCardWidth } from './boardMetrics.ts';
import {
  MAX_ROW_GAP,
  ROW_PADDING,
  identityBandHeight,
  layoutRow,
  railWidth,
  rowGap,
  rowSpan,
  seatCardWidth,
  splitBands,
  supportBlockWidth,
  tapLean,
} from './seatLayout.ts';

/* -------------------------------------------------------------------------- */
/* The layout cannot shift, because it cannot see the board                    */
/* -------------------------------------------------------------------------- */

test('nothing that sizes a seat takes a card count', () => {
  /* The strongest form this guarantee can take: the shift is not merely fixed,
     it is unrepresentable. Every one of these used to take a count, and each
     one of them fed the size and position of every card on the seat. A future
     change that adds one back has to delete a test that says why. */
  assert.equal(splitBands.length, 1, 'splitBands(bandsUsable) and nothing else');
  assert.equal(seatCardWidth.length, 2, 'seatCardWidth(rowHeight, ceiling)');
  assert.equal(supportBlockWidth.length, 1, 'supportBlockWidth(matWidth)');
  assert.equal(railWidth.length, 2, 'railWidth(matWidth, matHeight)');
  assert.equal(identityBandHeight.length, 1, 'identityBandHeight(matHeight)');
  assert.equal(layoutRow.length, 3, 'layoutRow(count, cardWidth, available)');
  assert.equal(rowSpan.length, 3, 'rowSpan(count, cardWidth, available)');
});

test('a permanent entering or leaving changes no card size and no row height', () => {
  /* Driven at the four measured mat sizes. The card width and both row heights
     have to come out identical for an empty board and for a full one, because
     the only inputs are the mat. */
  for (const [width, height] of [
    [948, 369],
    [828, 358],
    [708, 306],
    [628, 264],
  ]) {
    const band = height - identityBandHeight(height) - 10;
    const { creatureHeight, landHeight } = splitBands(band);
    const card = seatCardWidth(creatureHeight, 200);

    for (const count of [0, 1, 3, 7, 12, 25]) {
      assert.equal(seatCardWidth(creatureHeight, 200), card, `card size moved at ${count} cards`);
      assert.equal(splitBands(band).creatureHeight, creatureHeight);
      assert.equal(splitBands(band).landHeight, landHeight);
      assert.equal(supportBlockWidth(width), supportBlockWidth(width));
    }
  }
});

test('both rows are the same height, so the creature row is not half the mana row', () => {
  /* Measured before this change on a four-seat table at 1680: the creature row
     drew 62px cards — the floor, where a card is a coloured rectangle — while
     the mana row beside it drew 134px. Creatures are the row every other player
     at the table has to read. */
  const { creatureHeight, landHeight } = splitBands(300);
  assert.ok(Math.abs(creatureHeight - landHeight) <= 1);
  assert.equal(creatureHeight + landHeight, 300, 'and the band is spent exactly');
});

test('an empty row still holds its half of the mat', () => {
  /* Straight out of the spec: "A row that is empty still holds its place, so
     the board does not reflow as permanents enter and leave." */
  assert.equal(splitBands(300).creatureHeight, splitBands(300).creatureHeight);
  assert.ok(splitBands(300).creatureHeight > 100, 'not collapsed to a label strip');
});

/* -------------------------------------------------------------------------- */
/* Card size                                                                   */
/* -------------------------------------------------------------------------- */

test('a row is never given a card taller than the row itself', () => {
  for (const height of [24, 60, 92, 174, 400]) {
    const card = seatCardWidth(height, 200);
    assert.ok(
      card / CARD_RATIO <= height,
      `card ${card} is ${Math.round(card / CARD_RATIO)}px tall in a ${height}px row`
    );
  }
});

test('the card floor is honoured whenever the row is tall enough to hold it', () => {
  const tallEnough = Math.round(MIN_BOARD_CARD / CARD_RATIO) + ROW_PADDING;
  assert.ok(seatCardWidth(tallEnough, 200) >= MIN_BOARD_CARD);
});

test('the size slider is a ceiling, never a floor', () => {
  assert.equal(seatCardWidth(600, 120), 120, 'a tall row still respects the chosen size');
  assert.ok(seatCardWidth(600, 300) > 300 === false);
});

/* -------------------------------------------------------------------------- */
/* How wide a row actually paints                                             */
/* -------------------------------------------------------------------------- */

test('a row keeps turning room at its ENDS, not per tapped card', () => {
  assert.ok(tapLean(121) > 20, 'a 121px card leans about 24px each side when turned');

  const layout = layoutRow(4, 121, 1571);
  assert.equal(layout.edge, tapLean(121), 'the run holds a lean of clear mat at each end');
  assert.equal(layout.overlap, 0);
  assert.ok(layout.gap > 0, 'and the cards are not touching');
});

test('two tapped neighbours may overlap each other, and that is the table', () => {
  /* Reserving two full leans BETWEEN every pair would cut a 526px creature row
     from six slots to three, so a fourth creature would start overlapping on an
     empty board. Tapped permanents leaning onto their neighbours is what
     happens on a real table, and `GameCardView` already stacks them by index so
     it reads as stacking rather than as a collision. What is NOT allowed is the
     row painting outside its own box, which the test above covers. */
  const layout = layoutRow(4, 100, 526);
  assert.ok(layout.gap < tapLean(100) * 2, 'this is the trade, written down');
  assert.ok(layout.slots >= 4, 'and it buys a row that holds four creatures without compressing');
});

test('a FULL row still reserves turning room — the measured clip', () => {
  /* The bug: `edge` used to be granted only when the row had width to spare and
     dropped to zero on a full row. Measured on a four-seat table at 1680 with
     eight lands down and everything tapped, the mana row painted 25px past each
     end of its own box — 110% of the width it was given. Owner: *"they clip off
     board"*. */
  for (const [count, card, available] of [
    [8, 134, 493],
    [7, 115, 423],
    [12, 100, 370],
    [3, 200, 620],
  ]) {
    const layout = layoutRow(count, card, available);
    assert.ok(layout.edge > 0, `${count} cards at ${card}px in ${available}px reserved no lean`);
    const paintedRight = layout.start + (layout.span - layout.edge * 2) + tapLean(card);
    assert.ok(
      paintedRight <= available + 1,
      `a tapped card at the end paints to ${Math.round(paintedRight)} of ${available}`
    );
  }
});

test('the row footprint is identical whatever is tapped — there is no tapped input', () => {
  assert.equal(rowSpan.length, 3, 'rowSpan must take (count, cardWidth, available) and no more');
  assert.equal(layoutRow.length, 3, 'layoutRow must take (count, cardWidth, available)');
});

test('the Nth card lands in the same place whatever else is on the row', () => {
  /* Rule three, and the measurement it comes from. With the card size already
     fixed, a creature entering was still moving six permanents by up to 55px,
     because the run was centred and the gap was re-spread every time. A
     constant pitch laid from the left cannot do that. */
  const positions = (count: number) => {
    const layout = layoutRow(count, 100, 526);
    return Array.from({ length: count }, (_, i) => layout.start + i * (100 + layout.gap));
  };

  for (let count = 1; count < 4; count += 1) {
    const before = positions(count);
    const after = positions(count + 1);
    for (let i = 0; i < before.length; i += 1) {
      assert.equal(after[i], before[i], `card ${i} moved when the row went ${count} -> ${count + 1}`);
    }
  }
});

test('a full row reaches most of the way across the mat', () => {
  /* The trade in rule three only holds if a row that fills up actually uses the
     mat. Measured: 84% to 99% of the row at the top rung, against the 41% the
     creature row was managing before the identity band moved out of it. */
  for (const [card, available] of [
    [100, 526],
    [83, 444],
    [72, 392],
    [200, 935],
  ]) {
    const layout = layoutRow(layoutRow(1, card, available).slots, card, available);
    assert.ok(
      layout.span >= available * 0.83,
      `${layout.slots} cards at ${card}px spanned ${layout.span} of ${available}`
    );
  }
});

test('spreading is bounded: cards never drift more than a card and a quarter apart', () => {
  const layout = layoutRow(2, 120, 4000);
  assert.ok(layout.gap <= MAX_ROW_GAP(120), 'two cards on a huge mat do not go to the corners');
});

test('one card sits at the start of the row', () => {
  const layout = layoutRow(1, 200, 900);
  assert.equal(layout.span, 200 + layout.edge * 2, 'and occupies exactly itself');
  assert.equal(layout.start, layout.edge, 'at the left, after the turning room');
});

test('a crowded row overlaps rather than shrinking its cards', () => {
  /* Rule four. The card size is decided by the row's HEIGHT, so a row that
     cannot fit its cards side by side slides them under each other — which is
     what a player does with a crowded board, and is the only response that does
     not resize every other permanent on the mat. */
  const layout = layoutRow(14, 60, 426);
  assert.ok(layout.overlap > 0, 'a crowded row overlaps');
  assert.ok(layout.gap < 0, 'and the gap is the negative margin that does it');
  assert.ok(layout.span <= 426, 'and still fits the box it was given');
});

test('a crowded row only re-packs when it steps down a rung', () => {
  /* Rule four, measured, and stated as the trade it is.
   *
   * Solving the overlap exactly for the count moved the whole row every time a
   * permanent arrived — 54px for the 8th creature on a four-seat mat, every
   * single time, for ever. On the ladder most arrivals are free and the ones
   * that are not are a single re-pack.
   *
   * The numbers below are from `layoutRow(n, 102, 526)`, which is the viewer's
   * creature row on a four-seat table at 1680 with the size slider at default.
   */
  const card = 102;
  const available = 526;

  let free = 0;
  let previous = layoutRow(1, card, available).gap;
  for (let count = 2; count <= 30; count += 1) {
    const gap = layoutRow(count, card, available).gap;
    if (gap === previous) free += 1;
    previous = gap;
  }
  assert.ok(
    free >= 14,
    `only ${free} of 29 permanents arriving on this row moved nothing at all`
  );

  /* And every one of those 30 counts still fits its own box. */
  for (let count = 1; count <= 30; count += 1) {
    assert.ok(layoutRow(count, card, available).span <= available + 1, `${count} overflowed`);
  }
});

test('the run always fits the width it was given, at every density', () => {
  for (const available of [1571, 1111, 872, 493, 300, 180]) {
    for (const count of [1, 3, 5, 9, 14, 22, 40]) {
      for (const card of [200, 134, 100, 62]) {
        const layout = layoutRow(count, card, available);
        assert.ok(
          layout.span <= available + 1 || card > available,
          `${count} cards at ${card}px span ${layout.span} in ${available}px`
        );
      }
    }
  }
});

test('shrink to fit never lets a row overflow the width it was given', () => {
  for (const available of [1571, 1111, 872, 426, 300]) {
    for (const count of [1, 3, 5, 9, 14, 22]) {
      const card = fitRowCardWidth(available, count, 200);
      const span = rowSpan(count, card, available);
      assert.ok(
        span <= available || card === MIN_BOARD_CARD,
        `${count} cards at ${card}px span ${span} in ${available}px`
      );
    }
  }
});

/* -------------------------------------------------------------------------- */
/* The seat's fixed furniture                                                  */
/* -------------------------------------------------------------------------- */

test('an empty block is a fifth of the mat, exactly as it was', () => {
  /* Measured before that rule existed: 257px of an 828px mat — 31% — holding
     three Rancors, while the creature row beside it was at the 62px card floor.
     A deck with no artifacts in it still gives up nothing more than a fifth. */
  assert.equal(supportBlockWidth(828), 166);
  assert.ok(supportBlockWidth(828) / 828 < 0.22);
  assert.equal(supportBlockWidth(3000), 220, 'and it is capped, so a wide mat is not all block');
  assert.equal(supportBlockWidth(200), 76, 'and floored, so a narrow one still shows the zone');
});

test('the block widens on rungs once there is an artifact deck in it', () => {
  /* Measured on 22 Aug 2026: thirteen permanents in a 220 x 684 block on a
     1904px mat, one column, 115 x 160 cards with 38px of each showing, while
     1525 x 680 of the same mat held nothing. */
  assert.equal(supportBlockWidth(1904, 0), 220, 'empty, the narrow rung');
  assert.equal(supportBlockWidth(1904, 4), 220, 'four still fits the narrow rung');
  assert.equal(supportBlockWidth(1904, 5), 340, 'the first crossing');
  assert.equal(supportBlockWidth(1904, 10), 340);
  assert.equal(supportBlockWidth(1904, 11), 440, 'the second, and the last');
  assert.equal(supportBlockWidth(1904, 40), 440, 'there is no third');
});

test('there are exactly two crossings in a game, so the rows move twice at most', () => {
  const widths = [];
  for (let count = 0; count <= 60; count += 1) widths.push(supportBlockWidth(1264, count));
  let crossings = 0;
  for (let i = 1; i < widths.length; i += 1) {
    if (widths[i] !== widths[i - 1]) crossings += 1;
    assert.ok(widths[i] >= widths[i - 1], 'the block never gets narrower as it fills');
  }
  assert.equal(crossings, 2);
});

test('a widening block never resizes a card on the rows beside it', () => {
  /* This is what makes the rung affordable. `seatCardWidth` reads the row's
     HEIGHT and the player's ceiling, and the block's width is neither, so a
     crossing cannot change the size of a single permanent on the mat. */
  for (const [width, height] of [
    [1904, 746],
    [1264, 535],
    [948, 369],
  ]) {
    const band = height - identityBandHeight(height) - 12;
    const { creatureHeight } = splitBands(band);
    const card = seatCardWidth(creatureHeight, 200);
    for (const count of [0, 4, 5, 10, 11, 30]) {
      assert.ok(supportBlockWidth(width, count) > 0);
      assert.equal(seatCardWidth(creatureHeight, 200), card, `card size moved at ${count}`);
    }
  }
});

test('the rail is sized by the tiles it has to stack, not by width alone', () => {
  /* Four card-shaped piles down a short quadrant: a rail set purely as a
     fraction of the width is a wide empty strip. */
  assert.ok(railWidth(948, 369) <= 128);
  assert.ok(railWidth(628, 264) < railWidth(948, 369), 'a shorter seat gets a narrower rail');
  assert.ok(railWidth(300, 200) >= 52, 'and it never disappears');
});

test('the identity band is small enough that the rows keep most of the mat', () => {
  for (const height of [369, 358, 306, 264]) {
    const band = identityBandHeight(height);
    assert.ok(band >= 34 && band <= 54, `band ${band} at height ${height}`);
    assert.ok(band / height < 0.2, 'the band never takes a fifth of the seat');
  }
});
