/**
 * The opening-hand figures, checked against arithmetic done a different way.
 *
 * `opening.ts` had no test of any kind, which is worth saying plainly: it is
 * the module that replaced a Monte Carlo whose advertised sample size was wrong
 * by a factor of sixty, and the thing that replaced it was never checked. Three
 * of its numbers are printed on the deck page and, since the playtest tab
 * stopped sampling them, on `/simulate` as well.
 *
 * The references below are computed with a plain BigInt `choose` written here,
 * independently of `hypergeometricAtLeast`'s tail-sum. Two different routes to
 * the same figure is the only kind of check worth having on arithmetic: an
 * assertion that re-runs the function under test proves nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPENING_HAND,
  KEEPABLE_LAND_RANGE,
  keepableSevenPct,
  openingLandDistribution,
} from './opening.ts';

/* -------------------------------------------------------------------------- */
/* An independent reference                                                   */
/* -------------------------------------------------------------------------- */

function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let out = 1n;
  for (let i = 0; i < k; i++) {
    out = (out * BigInt(n - i)) / BigInt(i + 1);
  }
  return out;
}

/** P(exactly `k` lands in the opening seven), the textbook way. */
function exactlyK(library: number, lands: number, k: number): number {
  const num = choose(lands, k) * choose(library - lands, OPENING_HAND - k);
  const den = choose(library, OPENING_HAND);
  const SCALE = 10n ** 20n;
  return Number((num * SCALE) / den) / 1e20;
}

const CLOSE = 1e-12;

/* -------------------------------------------------------------------------- */
/* The distribution                                                           */
/* -------------------------------------------------------------------------- */

test('every bar of the land distribution matches the textbook hypergeometric', () => {
  const shares = openingLandDistribution(99, 38);
  assert.ok(shares, 'a 99-card library with 38 lands is measurable');
  assert.equal(shares.length, OPENING_HAND + 1, 'zero through seven lands');

  for (let k = 0; k <= OPENING_HAND; k++) {
    assert.ok(
      Math.abs(shares[k] - exactlyK(99, 38, k)) < CLOSE,
      `${k} lands: ${shares[k]} vs ${exactlyK(99, 38, k)}`
    );
  }
});

test('the distribution sums to one', () => {
  for (const [library, lands] of [
    [99, 38],
    [60, 24],
    [99, 45],
    [7, 3],
  ] as const) {
    const shares = openingLandDistribution(library, lands)!;
    const total = shares.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${library}/${lands} summed to ${total}`);
  }
});

test('a library of nothing but lands opens on seven lands, always', () => {
  const shares = openingLandDistribution(40, 40)!;
  assert.ok(Math.abs(shares[7] - 1) < CLOSE);
  assert.ok(shares.slice(0, 7).every(share => share < CLOSE));
});

test('a library with no lands opens on none, always', () => {
  const shares = openingLandDistribution(99, 0)!;
  assert.ok(Math.abs(shares[0] - 1) < CLOSE);
  assert.ok(shares.slice(1).every(share => share < CLOSE));
});

test('a list too short to draw seven is not measured rather than guessed', () => {
  assert.equal(openingLandDistribution(6, 3), null);
  assert.equal(keepableSevenPct(6, 3), null);
  // Nothing fabricated: an impossible land count has no answer, not a zero.
  assert.equal(openingLandDistribution(99, 120), null);
  assert.equal(openingLandDistribution(99, -1), null);
});

/* -------------------------------------------------------------------------- */
/* The roll-up the deck page prints                                           */
/* -------------------------------------------------------------------------- */

test('keepable sevens is exactly the two-to-five slice of the distribution', () => {
  /* This is the property that makes the histogram and the headline figure two
     views of one measurement rather than two measurements. `/simulate` draws
     the bars and the deck page prints the roll-up; if they can disagree, the
     product has two answers to one question again. */
  for (const [library, lands] of [
    [99, 38],
    [99, 33],
    [60, 24],
    [99, 50],
  ] as const) {
    const shares = openingLandDistribution(library, lands)!;
    const slice = shares
      .slice(KEEPABLE_LAND_RANGE.min, KEEPABLE_LAND_RANGE.max + 1)
      .reduce((a, b) => a + b, 0);
    const rollup = keepableSevenPct(library, lands)! / 100;
    assert.ok(Math.abs(slice - rollup) < 1e-9, `${library}/${lands}: ${slice} vs ${rollup}`);
  }
});

test('keepable sevens for a 99-card list with 38 lands, against the textbook sum', () => {
  let reference = 0;
  for (let k = KEEPABLE_LAND_RANGE.min; k <= KEEPABLE_LAND_RANGE.max; k++) {
    reference += exactlyK(99, 38, k);
  }
  const pct = keepableSevenPct(99, 38)!;
  assert.ok(Math.abs(pct - reference * 100) < 1e-9, `${pct}% vs ${reference * 100}%`);

  /* A sanity band a Commander player would recognise: a 38-land list keeps a
     large majority of its openers. A figure outside this is a bug, not a deck. */
  assert.ok(pct > 80 && pct < 95, `38 lands in 99 should keep most sevens, got ${pct}%`);
});

test('a landless list keeps nothing and an all-land list keeps nothing either', () => {
  assert.ok(Math.abs(keepableSevenPct(99, 0)!) < CLOSE);
  assert.ok(Math.abs(keepableSevenPct(40, 40)!) < CLOSE, 'seven lands is a flood, not a keep');
});
