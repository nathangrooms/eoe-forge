import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { approx, approxLabel } from './precision.ts';

describe('approx', () => {
  it('rounds down to three significant figures', () => {
    assert.equal(approx(33_037), 33_000);
    assert.equal(approx(97_140), 97_100);
    assert.equal(approx(31_833), 31_800);
    assert.equal(approx(3_540), 3_540);
    assert.equal(approx(2_110), 2_110);
  });

  it('never rounds up', () => {
    /* The direction is the point. Every count on the homepage comes from a
       table the sync only adds to, so rounding down means a stale figure can
       only ever understate the catalogue. Rounding up, or to nearest, would let
       the page claim more cards than exist. */
    for (const n of [1_001, 1_999, 9_999, 12_345, 99_999, 100_500, 999_999]) {
      assert.ok(approx(n) <= n, `${n} rounded up to ${approx(n)}`);
    }
  });

  it('leaves counts below a thousand exactly as they are', () => {
    /* A set's card count is a fixed fact about a printed product. Rounding
       The Hobbit's 321 cards down to 300 would be less true, not more. */
    assert.equal(approx(321), 321);
    assert.equal(approx(999), 999);
    assert.equal(approx(1), 1);
    assert.equal(approx(0), 0);
  });
});

describe('approxLabel', () => {
  it('writes the rounded figure with a plus', () => {
    assert.equal(approxLabel(33_037), '33,000+');
    assert.equal(approxLabel(3_540), '3,540+');
  });

  it('leaves a small count without one', () => {
    assert.equal(approxLabel(321), '321');
  });

  it('returns null rather than zero for anything it does not have', () => {
    /* This is the bug the whole snapshot exists to remove. A count that timed
       out came back null, was read as `?? 0`, and the homepage told visitors
       there were ZERO cards you can search. Nothing here may produce a "0". */
    assert.equal(approxLabel(null), null);
    assert.equal(approxLabel(undefined), null);
    assert.equal(approxLabel(0), null);
    assert.equal(approxLabel(-1), null);
    assert.equal(approxLabel(Number.NaN), null);
    assert.equal(approxLabel(Number.POSITIVE_INFINITY), null);
  });
});
