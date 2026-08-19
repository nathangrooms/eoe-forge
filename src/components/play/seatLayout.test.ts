/**
 * The seat mat's arithmetic, tested.
 *
 * Every number here was checked against a rendered DOM measurement from
 * `.playtest-harness/audit.mjs` at 1680x1050, 1280x720 and 1024x600 before it
 * was written down. They are not invented targets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_RATIO, MIN_BOARD_CARD, fitRowCardWidth } from './boardMetrics.ts';
import {
  EMPTY_ROW_HEIGHT,
  MAX_ROW_GAP,
  ROW_FLOOR,
  fitRowCard,
  layoutRow,
  planIdentityInset,
  rowAsk,
  rowGap,
  rowSpan,
  shareBandHeight,
  tapLean,
} from './seatLayout.ts';

/* -------------------------------------------------------------------------- */
/* How the two rows share the height                                          */
/* -------------------------------------------------------------------------- */

test('an empty row keeps a label strip and hands the rest to the row with cards', () => {
  const askC = rowAsk(1, 1111, 200);
  const askL = rowAsk(0, 1571, 200);
  assert.equal(askL, EMPTY_ROW_HEIGHT);

  const { creatureHeight, landHeight } = shareBandHeight(352, 1, 0, askC, askL);
  assert.equal(landHeight, 352 - creatureHeight);
  assert.ok(
    creatureHeight > 300,
    `one creature over an empty mana row should get nearly all the band, got ${creatureHeight}`
  );
});

test('a busy row is not starved by a sparse one when the band is short', () => {
  /* The regression this branch exists for: nine creatures ask for LESS height
     than five lands, because nine are already overlapping. Sharing purely by
     ask collapsed the creatures to 39px while the lands sat at 80. */
  const askC = rowAsk(9, 412, 200);
  const askL = rowAsk(5, 872, 200);
  assert.ok(askC < askL, 'the crowded row must ask for less — that is the trap');

  const { creatureHeight, landHeight } = shareBandHeight(179, 9, 5, askC, askL);
  assert.ok(
    Math.abs(creatureHeight - landHeight) <= 2,
    `both rows should land together, got ${creatureHeight} vs ${landHeight}`
  );
  const card = fitRowCard(9, creatureHeight, 412, 200);
  assert.equal(card, 60, 'measured off the rendered DOM at 1024x600');
});

test('the floors are squeezed together when the window is too short for either', () => {
  const band = ROW_FLOOR; // half of what two floored rows need
  const { creatureHeight, landHeight } = shareBandHeight(band, 3, 3, 200, 200);
  assert.equal(creatureHeight + landHeight, band);
  assert.ok(Math.abs(creatureHeight - landHeight) <= 1, 'neither row is picked as the winner');
});

test('a row is never given a card taller than the row itself', () => {
  for (const height of [24, 60, 92, 174, 400]) {
    const card = fitRowCard(4, height, 1571, 200);
    assert.ok(
      card / CARD_RATIO <= height,
      `card ${card} is ${Math.round(card / CARD_RATIO)}px tall in a ${height}px row`
    );
  }
});

test('the card floor is honoured whenever the row is tall enough to hold it', () => {
  const tallEnough = Math.round(MIN_BOARD_CARD / CARD_RATIO) + 6;
  assert.ok(fitRowCard(12, tallEnough, 300, 200) >= MIN_BOARD_CARD);
});

/* -------------------------------------------------------------------------- */
/* How wide a row actually paints                                             */
/* -------------------------------------------------------------------------- */

test('a row keeps turning room at its ENDS, not per tapped card', () => {
  /* The layout-shift bug, stated as arithmetic. A row's footprint has to be a
     function of how many cards are on it and how wide they are, and of nothing
     else — otherwise turning one card moves all the others. */
  assert.ok(tapLean(121) > 20, 'a 121px card leans about 24px each side when turned');

  const layout = layoutRow(4, 121, 1571);
  assert.equal(layout.edge, tapLean(121), 'the run holds a lean of clear mat at each end');
  assert.equal(layout.overlap, 0);
  assert.ok(layout.gap >= tapLean(121) * 2, 'a sparse row leaves room for every card to turn');
});

test('the row footprint is identical whatever is tapped — there is no tapped input', () => {
  /* `rowSpan` and `layoutRow` take no tapped argument at all, which is the
     strongest form this guarantee can take: the shift is not merely fixed, it
     is unrepresentable. This test exists so a future signature change that adds
     one back has to delete a test that says why. */
  assert.equal(rowSpan.length, 3, 'rowSpan must take (count, cardWidth, available) and no more');
  assert.equal(layoutRow.length, 3, 'layoutRow must take (count, cardWidth, available)');
});

test('a sparse row spreads across the width instead of clumping in the middle', () => {
  /* The measurement from the last review: at 1024px the row reached x=935 and
     the cards stopped at x=737, leaving blank mat at both ends. Owner:
     *"playmats dont use 100% of the page which I thought they would"*. */
  const available = 935;
  const before = 3 * 200 + 2 * rowGap(200); // what the old tight-gap row spanned
  const layout = layoutRow(3, 200, available);

  assert.ok(before < 700, );
  assert.ok(
    layout.span >= available * 0.94,
      );
  assert.ok(layout.start <= 30, );
});

test('the measured board case: four creatures now use most of the mat row', () => {
  /* Straight off a run of `scripts/play-preview-shots.mjs` at 1680x1050: the
     viewer's creature row is 1460px wide and its cards are height-bound at
     121px. The tight-gap row used 52% of it and left the rest blank. */
  const layout = layoutRow(4, 121, 1460);
  const tight = 4 * 121 + 3 * rowGap(121);

  assert.ok(
    tight / 1460 < 0.36,
    `the tight row used ${Math.round((tight / 1460) * 100)}% of the mat`
  );
  assert.ok(
    layout.span / 1460 > 0.6,
    `the spread row should use most of it, used ${Math.round((layout.span / 1460) * 100)}%`
  );
  assert.equal(layout.gap, MAX_ROW_GAP(121), 'and it should be spreading at the cap');
});

test('spreading is bounded: cards never drift more than a card and a quarter apart', () => {
  const layout = layoutRow(2, 120, 4000);
  assert.equal(layout.gap, MAX_ROW_GAP(120), 'two cards on a huge mat do not go to the corners');
  assert.ok(layout.start > 0, 'and what cannot be spread is centred');
});

test('one card is centred and asks for no gap', () => {
  const layout = layoutRow(1, 200, 900);
  assert.equal(layout.gap, 0);
  assert.equal(layout.span, 200 + layout.edge * 2);
  assert.ok(layout.start > 300);
});

test('a crowded row overlaps instead of spreading, exactly as PermanentRow draws it', () => {
  /* 8 creatures at 60px in the 426px the old inset left them: the DOM measured
     360px of used width. Unchanged by any of this. */
  const layout = layoutRow(8, 60, 426);
  assert.equal(layout.span, 360, 'measured off the rendered DOM at 1024x600');
  assert.ok(layout.overlap > 0, 'a crowded row overlaps');
  assert.equal(layout.gap, 0, 'and has no gap left to spread');
  assert.equal(layout.edge, 0, 'nor any room to turn in');
});

/* -------------------------------------------------------------------------- */
/* Stepping aside for the floating identity strip                             */
/* -------------------------------------------------------------------------- */

const STRIP = { start: 300, end: 160 };

test('a sparse row keeps the whole width and stays centred', () => {
  const plan = planIdentityInset(1571, 3, 121, STRIP);
  assert.equal(plan.start, 0);
  assert.equal(plan.end, 0);
  assert.equal(plan.available, 1571);
});

test('an empty row is never inset', () => {
  const plan = planIdentityInset(1571, 0, 0, STRIP);
  assert.equal(plan.start, 0);
  assert.equal(plan.available, 1571);
});

test('a spread row that reaches the strip steps aside, tapped or not', () => {
  /* The old version of this test asserted that a row of six TAPPED creatures
     inset while the same six untapped did not — which is precisely the layout
     shift the owner reported, written down as intended behaviour. The rule that
     replaces it: the decision is about how far the run reaches, and the run
     reaches the same distance either way. */
  const plan = planIdentityInset(1571, 6, 121, STRIP);
  const reach = rowSpan(6, 121, 1571);
  const clears = (1571 - reach) / 2 >= STRIP.start;

  if (clears) {
    assert.equal(plan.start, 0, 'a row that never comes near the strip is not shoved off-centre');
  } else {
    assert.equal(plan.start, STRIP.start, 'a row that would reach the strip steps aside');
    assert.ok(plan.cardsStart >= STRIP.start, 'and never begins underneath it');
  }
});

test('an inset row reports the width it will really be laid out in', () => {
  const plan = planIdentityInset(872, 8, 60, { start: 249, end: 121 });
  assert.equal(plan.available, 872 - 249 - 121);
  assert.ok(plan.cardsStart >= 249, 'cards begin after the strip, never under it');
});

test('measuring the strip instead of guessing a third of the mat removes the overlap', () => {
  /* The 1024x600 far seat, 8 creatures at 60px in an 872px row. */
  const guessed = planIdentityInset(872, 8, 60, { start: 291, end: 155 });
  const measured = planIdentityInset(872, 8, 60, { start: 249, end: 121 });

  const natural = 8 * 60 + 7 * Math.round(60 * 0.08);
  const guessedSpan = rowSpan(8, 60, guessed.available);
  const measuredSpan = rowSpan(8, 60, measured.available);

  assert.equal(guessedSpan, 360, 'the DOM measured 360px of used width — heavy overlap');
  assert.ok(guessedSpan < natural, 'the guessed inset forced the cards under each other');
  assert.ok(
    measuredSpan > guessedSpan,
    `measuring the strip gives the cards back room: ${guessedSpan} -> ${measuredSpan}`
  );
  assert.equal(guessed.available, 426);
  assert.equal(measured.available, 502, 'the row gets 76px back that nothing was standing in');
});

test('the label gutter is real, so the label is never printed over card art', () => {
  const plan = planIdentityInset(872, 8, 60, { start: 249, end: 121 });
  const gutter = plan.cardsStart - plan.start;
  assert.ok(gutter >= 0, 'the first card never starts before the inset it was given');
});

/* -------------------------------------------------------------------------- */
/* The size rule the owner reported broken                                    */
/* -------------------------------------------------------------------------- */

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
