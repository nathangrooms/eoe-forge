import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIRST_PAGE,
  blocksFor,
  clampPage,
  offsetFor,
  pageCountFor,
  pageWindow,
  parsePageParam,
  rangeFor,
  rangeLabel,
} from './pagination.ts';

/* ------------------------------------------------------------------ *
 * The rule this file exists for: a page count is never invented.
 * ------------------------------------------------------------------ */

test('no total means no page count', () => {
  assert.equal(pageCountFor(null, 24), null);
  assert.equal(pageCountFor(undefined, 24), null);
  assert.equal(pageCountFor(Number.NaN, 24), null);
  assert.equal(pageCountFor(-1, 24), null);
});

test('a real total gives a real page count', () => {
  assert.equal(pageCountFor(0, 24), 1);
  assert.equal(pageCountFor(1, 24), 1);
  assert.equal(pageCountFor(24, 24), 1);
  assert.equal(pageCountFor(25, 24), 2);
  // Scryfall's own count for `f:commander -t:land`, measured 2026-08-19.
  assert.equal(pageCountFor(30636, 24), 1277);
  assert.equal(pageCountFor(30636, 96), 320);
});

test('a page size of zero cannot produce a page count', () => {
  assert.equal(pageCountFor(100, 0), null);
  assert.equal(pageCountFor(100, -5), null);
});

/* ------------------------------------------------------------------ *
 * Clamping and parsing: junk in the URL must not break the screen.
 * ------------------------------------------------------------------ */

test('page numbers are clamped into range', () => {
  assert.equal(clampPage(0, 10), FIRST_PAGE);
  assert.equal(clampPage(-3, 10), FIRST_PAGE);
  assert.equal(clampPage(5, 10), 5);
  assert.equal(clampPage(99, 10), 10);
  // With no known page count there is no ceiling to clamp to.
  assert.equal(clampPage(99, null), 99);
});

test('a nonsense page param reads as page one', () => {
  assert.equal(parsePageParam(null), 1);
  assert.equal(parsePageParam(''), 1);
  assert.equal(parsePageParam('nope'), 1);
  assert.equal(parsePageParam('0'), 1);
  assert.equal(parsePageParam('-4'), 1);
  assert.equal(parsePageParam('3'), 3);
  assert.equal(parsePageParam('3.9'), 3);
});

/* ------------------------------------------------------------------ *
 * Ranges. An off-by-one here shows the same card on two pages.
 * ------------------------------------------------------------------ */

test('offsets and ranges line up end to end with no gap and no overlap', () => {
  assert.equal(offsetFor(1, 24), 0);
  assert.equal(offsetFor(2, 24), 24);
  assert.deepEqual(rangeFor(1, 24), { from: 0, to: 23 });
  assert.deepEqual(rangeFor(2, 24), { from: 24, to: 47 });

  for (let page = 1; page < 40; page++) {
    const a = rangeFor(page, 24);
    const b = rangeFor(page + 1, 24);
    assert.equal(b.from, a.to + 1, `page ${page} and ${page + 1} must be adjacent`);
    assert.equal(a.to - a.from + 1, 24);
  }
});

test('the range label reports what is actually on screen', () => {
  assert.deepEqual(rangeLabel(1, 24, 24), { from: 1, to: 24 });
  assert.deepEqual(rangeLabel(3, 24, 24), { from: 49, to: 72 });
  // A short final page says so rather than claiming a full one.
  assert.deepEqual(rangeLabel(3, 24, 7), { from: 49, to: 55 });
  assert.equal(rangeLabel(3, 24, 0), null);
});

/* ------------------------------------------------------------------ *
 * The number strip.
 * ------------------------------------------------------------------ */

test('every page is shown while they all fit', () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
});

test('first, last and the neighbours are always present', () => {
  assert.deepEqual(pageWindow(50, 100), [1, 'gap', 49, 50, 51, 'gap', 100]);
  assert.deepEqual(pageWindow(1, 100), [1, 2, 'gap', 100]);
  assert.deepEqual(pageWindow(100, 100), [1, 'gap', 99, 100]);
});

test('a gap that would hide one page shows the page instead', () => {
  // Without the rule this would be [1, 'gap', 3, 4, 5, 'gap', 7]; an ellipsis
  // is the same width as the digit it is hiding.
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageWindow(4, 8), [1, 2, 3, 4, 5, 'gap', 8]);
});

test('the current page is always in the window, even when out of range', () => {
  const window = pageWindow(500, 10);
  assert.ok(window.includes(10));
  assert.ok(!window.includes(500));
});

test('a page count below one draws nothing', () => {
  assert.deepEqual(pageWindow(1, 0), []);
  assert.deepEqual(pageWindow(1, Number.NaN), []);
});

/* ------------------------------------------------------------------ *
 * Upstream blocks.
 *
 * Scryfall serves 175 rows at a time and answers a page past the end with
 * 422, so the block list has to stop where the results do. Every total below
 * was read off the live API on 2026-08-19.
 * ------------------------------------------------------------------ */

const SCRY = 175;

test('a page inside one block asks for one block', () => {
  assert.deepEqual(blocksFor(0, 24, 30636, SCRY), [1]);
  assert.deepEqual(blocksFor(48, 24, 30636, SCRY), [1]);
  assert.deepEqual(blocksFor(192, 24, 30636, SCRY), [2]);
});

test('a page straddling a boundary asks for both blocks', () => {
  assert.deepEqual(blocksFor(96, 96, 30636, SCRY), [1, 2]);
  assert.deepEqual(blocksFor(168, 24, 30636, SCRY), [1, 2]);
});

test('the list never runs past the last block that exists', () => {
  // t:sliver matched 116 cards. Page 2 of 96 wants rows 96-191, which straddles
  // into block 2 -- and Scryfall has no block 2 here. Asking for it returned
  // 422 and put an error where the last 20 cards should have been.
  assert.deepEqual(blocksFor(96, 96, 116, SCRY), [1]);
  // t:wall t:creature matched 159; page 4 of 48 is rows 144-191.
  assert.deepEqual(blocksFor(144, 48, 159, SCRY), [1]);
  // The same shape one block further along.
  assert.deepEqual(blocksFor(336, 48, 350, SCRY), [2]);
});

test('a page wholly past the end asks for nothing at all', () => {
  assert.deepEqual(blocksFor(2400, 24, 116, SCRY), []);
});

test('with no total the arithmetic still answers, because it has to', () => {
  // The first request of a query has no count yet. One block too far is
  // possible here and is why 422 is read as an empty block rather than thrown.
  assert.deepEqual(blocksFor(96, 96, null, SCRY), [1, 2]);
  assert.deepEqual(blocksFor(0, 24, undefined, SCRY), [1]);
});

test('a total of zero still leaves block one to ask about', () => {
  assert.deepEqual(blocksFor(0, 24, 0, SCRY), [1]);
});

test('nonsense sizes draw nothing rather than throwing', () => {
  assert.deepEqual(blocksFor(0, 0, 100, SCRY), []);
  assert.deepEqual(blocksFor(0, 24, 100, 0), []);
  assert.deepEqual(blocksFor(Number.NaN, 24, 100, SCRY), [1]);
});
