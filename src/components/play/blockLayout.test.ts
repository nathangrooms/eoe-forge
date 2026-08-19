/**
 * The support block's arithmetic, tested.
 *
 * The first group asserts a PROPERTY rather than a number, and it is the whole
 * reason this file exists: **a permanent arriving in the block must not resize
 * anything already in it.** That rule was already enforced for the seat's two
 * rows by `seatLayout.test.ts`, and the block escaped it only because its
 * arithmetic sat in `Battlefield.tsx`, which `node --test` cannot import.
 *
 * Measured before the fix, four-seat table at 1680, Rancors arriving one at a
 * time on the viewer's mat: 102px, 100px, 66px, 64px. The third arrival shrank
 * every card in the block by a third and moved one of them 49px. Those are DOM
 * measurements from `scripts/play-stress-audit.mjs`, not invented numbers.
 *
 * The block sizes used below are the ones a real seat hands it, also measured:
 * a 1680 four-seat mat is 828 x 358, which gives `supportBlockWidth` 166px and
 * a block height around 300px.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_LABEL,
  BLOCK_PADDING,
  blockCardWidth,
  blockColumns,
  blockFitsColumn,
  blockGap,
  blockInner,
  blockLayout,
  blockStep,
} from './blockLayout.ts';
import { CARD_RATIO, MIN_BOARD_CARD } from './boardMetrics.ts';
import { tapLean } from './seatLayout.ts';

/* -------------------------------------------------------------------------- */
/* The property: geometry is a function of the BOX                            */
/* -------------------------------------------------------------------------- */

test('the block card size takes a box and a ceiling, and no count', () => {
  /* An arity guard, exactly as `seatLayout.test.ts` keeps for the row
     functions. `fitBlockCardWidth(width, height, count, preferred)` is the
     signature this replaced; a change that puts the count back has to delete
     this test, and this comment is why it should not. */
  assert.equal(blockCardWidth.length, 3, 'blockCardWidth(width, height, ceiling)');
  assert.equal(blockStep.length, 3, 'blockStep(rows, cardWidth, height)');
});

/**
 * The block boxes a real seat hands `ZoneBlock`, measured off the rendered DOM
 * rather than picked: `supportBlockWidth(matWidth)` against the mat sizes
 * `scripts/play-stress-audit.mjs` recorded — 1920 two-seat, 1920 quads, 1680
 * quads and 1280 quads.
 */
const REAL_BLOCKS: ReadonlyArray<readonly [number, number, number]> = [
  /* width, height, the row card size that seat draws (the block's ceiling) */
  [220, 309, 105], // 1920, two seats
  [190, 309, 105], // 1920, quads
  [166, 300, 102], // 1680, quads
  [126, 218, 72], //  1280, quads
];

test('adding a permanent never changes the size of the cards already there', () => {
  for (const [width, height, ceiling] of REAL_BLOCKS) {
    const sizes = [];
    for (let count = 1; count <= 10; count++) {
      sizes.push(blockLayout(count, width, height, ceiling).cardWidth);
    }
    assert.deepEqual(
      [...new Set(sizes)],
      [sizes[0]],
      `block ${width}x${height} resized its cards between 1 and 10 permanents: ${sizes.join(',')}`
    );
  }
});

test('the smallest real block holds a dozen permanents before any size moves', () => {
  /* The 1280 four-seat quadrant, which is the tightest box a seat ever hands
     the block. Written down as a number so a change that makes the block give
     up sooner has to change this line and say why. */
  const [width, height, ceiling] = REAL_BLOCKS[REAL_BLOCKS.length - 1];
  const base = blockCardWidth(width, height, ceiling);
  let stable = 0;
  for (let count = 1; blockLayout(count, width, height, ceiling).cardWidth === base; count++) {
    stable = count;
    if (count > 200) break;
  }
  assert.ok(stable >= 12, `it only held ${stable} permanents at ${base}px before shrinking`);
});

test('the size the block draws is the size an empty block draws', () => {
  const empty = blockCardWidth(166, 300, 102);
  for (let count = 1; count <= 18; count++) {
    assert.equal(
      blockLayout(count, 166, 300, 102).cardWidth,
      empty,
      `${count} permanents changed the card size`
    );
  }
});

test('a four-seat block draws the size the old search reached at four cards', () => {
  /* Measured, not chosen: `scripts/play-stress-audit.mjs` recorded the old
     count-driven search settling on 64px once four Rancors were down on a
     1680 four-seat mat. That is now the size it draws at one card as well. */
  assert.equal(blockCardWidth(166, 300, 102), 64);
  assert.equal(blockLayout(1, 166, 300, 102).cardWidth, 64);
  assert.equal(blockLayout(4, 166, 300, 102).cardWidth, 64);
});

test('a wider block spends the room on a bigger card, still without a count', () => {
  const narrow = blockCardWidth(166, 300, 105);
  const wide = blockCardWidth(220, 300, 105);
  assert.ok(wide > narrow, `a 220px block drew ${wide}px against a 166px block's ${narrow}px`);
  for (let count = 1; count <= 12; count++) {
    assert.equal(blockLayout(count, 220, 300, 105).cardWidth, wide, `resized at ${count}`);
  }
});

/* -------------------------------------------------------------------------- */
/* The ladder: most arrivals move nothing                                     */
/* -------------------------------------------------------------------------- */

test('most arrivals do not change the vertical pitch either', () => {
  const width = 166;
  const height = 300;
  let unchanged = 0;
  let previous = blockLayout(1, width, height, 102);
  for (let count = 2; count <= 12; count++) {
    const next = blockLayout(count, width, height, 102);
    if (next.step === previous.step && next.columns === previous.columns) unchanged++;
    previous = next;
  }
  /* Two columns and three clear rows, so the first six arrivals cost nothing at
     all and the ladder holds several counts per rung after that. */
  assert.ok(unchanged >= 7, `only ${unchanged} of 11 arrivals left the pitch alone`);
});

test('the pitch only ever comes down as the block fills', () => {
  /* Counts that fit on one row report no pitch at all rather than the widest
     one, so the walk starts at the first count that has two rows to space. */
  let previous = Infinity;
  for (let count = 2; count <= 20; count++) {
    const plan = blockLayout(count, 166, 300, 102);
    if (plan.rows < 2) continue;
    assert.ok(plan.step <= previous, `pitch went back up at ${count} permanents`);
    previous = plan.step;
  }
});

test('a block holding one row has no pitch at all', () => {
  assert.equal(blockStep(1, 102, 300), 0);
  assert.equal(blockStep(0, 102, 300), 0);
});

/* -------------------------------------------------------------------------- */
/* Staying inside the box                                                     */
/* -------------------------------------------------------------------------- */

test('the block never paints past its own height', () => {
  const boxes = [...REAL_BLOCKS.map(b => [b[0], b[1]] as const), [120, 240] as const, [96, 180] as const];
  for (const [width, height] of boxes) {
    for (let count = 1; count <= 60; count++) {
      const plan = blockLayout(count, width, height, 102);
      assert.ok(
        plan.height <= height + 1,
        `${count} permanents in ${width}x${height} needed ${plan.height.toFixed(0)}px`
      );
    }
  }
});

test('a card and its turning room always fit the block width', () => {
  for (const width of [96, 120, 166, 190, 220]) {
    const w = blockCardWidth(width, 300, 102);
    assert.ok(
      blockFitsColumn(width, w),
      `a ${w}px card does not fit a ${width}px block once turning room is reserved`
    );
  }
});

test('a tapped card in the block stays inside the block', () => {
  /* A tapped permanent paints a card HEIGHT wide while its layout box stays a
     card wide. The reserve is a `tapLean` at each end plus the block's padding,
     so the check is against the block's OUTER width — measured on a four-seat
     table at 1680 before it existed, the block painted 14px past its own box at
     each end and 10px into the quadrant beside it. */
  for (const width of [120, 166, 190, 220]) {
    const w = blockCardWidth(width, 300, 102);
    const columns = blockColumns(width, w);
    const gap = blockGap(w);
    const run = columns * w + (columns - 1) * gap;
    const painted = run + tapLean(w) * 2 + BLOCK_PADDING;
    assert.ok(
      painted <= width + 1,
      `${columns} tapped columns of ${w}px paint ${painted.toFixed(0)}px inside a ${width}px block`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* The one job the count still has                                            */
/* -------------------------------------------------------------------------- */

test('a box too small to hold four clear cards still never spills', () => {
  /* Smaller than any block a real mat hands out, and the place the size
     fallback actually fires. It is allowed to come down; it is not allowed to
     paint onto the seat below. */
  for (let count = 1; count <= 40; count++) {
    const plan = blockLayout(count, 96, 180, 102);
    assert.ok(plan.height <= 181, `${count} permanents in 96x180 needed ${plan.height.toFixed(0)}px`);
  }
});

test('a genuinely overfull block stays inside its box', () => {
  /* Fifty-odd permanents in one seat's block before the size moves at all,
     which is why this is a fallback and not the rule. */
  const stuffed = blockLayout(400, 166, 300, 102);
  assert.ok(stuffed.height <= 301, `overfull block painted ${stuffed.height.toFixed(0)}px`);
  assert.ok(stuffed.step >= 1, 'two rows landed on the same pixel');
});

test('the size only comes down once the ladder has genuinely run out', () => {
  const base = blockCardWidth(166, 300, 102);
  for (let count = 1; count <= 40; count++) {
    assert.equal(blockLayout(count, 166, 300, 102).cardWidth, base, `shrank at ${count}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Boxes that are too small to be honest about                                */
/* -------------------------------------------------------------------------- */

test('an empty block reports a size and no rows', () => {
  const plan = blockLayout(0, 166, 300, 102);
  assert.equal(plan.rows, 0);
  assert.equal(plan.step, 0);
  assert.equal(plan.height, BLOCK_LABEL);
  assert.ok(plan.cardWidth > 0);
});

test('a block too short for a readable card draws what it has, not what it wants', () => {
  const w = blockCardWidth(166, 70, 102);
  assert.ok(w > 0, 'a short block refused to draw anything');
  assert.ok(w < MIN_BOARD_CARD, `a 70px block claimed room for a ${w}px card`);
  assert.ok(
    BLOCK_LABEL + w / CARD_RATIO <= 71,
    `a ${w}px card is taller than the 70px block holding it`
  );
});

test('a block too narrow for a readable card still fits the card it draws', () => {
  const w = blockCardWidth(50, 300, 102);
  assert.ok(w > 0);
  assert.ok(blockFitsColumn(50, w) || w <= 50, `a ${w}px card hangs out of a 50px block`);
});

/* -------------------------------------------------------------------------- */
/* Columns                                                                    */
/* -------------------------------------------------------------------------- */

test('columns are counted inside the turning room, not across the whole box', () => {
  /* The eight pixels that once turned a two-column block into a single column
     of four cards stacked on each other. */
  for (const width of [120, 166, 190, 220, 300]) {
    const w = blockCardWidth(width, 300, 102);
    const columns = blockColumns(width, w);
    const gap = blockGap(w);
    assert.ok(columns >= 1);
    assert.ok(
      columns * w + (columns - 1) * gap <= blockInner(width, w) + 1,
      `${columns} columns of ${w}px do not fit ${blockInner(width, w)}px`
    );
  }
});
