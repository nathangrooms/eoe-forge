/**
 * `popularityCoverage`, the check that would have caught the whole thing.
 *
 *   node --test --experimental-strip-types src/engine/build/pool-popularity.test.ts
 *
 * It lives beside the generator's tests because the generator is the caller
 * that leans on the popularity prior hardest: against a profile seeded with a
 * commander and no deck, every other signal has less to say.
 *
 * WHAT IT IS FOR. `edhrec_rank` is the only evidence in this schema about which
 * cards people actually play, and `rank.ts` leans on it hardest for the
 * generator, which starts from a commander and no deck. On 2026-08-25 that
 * column was present in `cards_unique` for 13,183 of 13,758 rows whose name
 * begins A-H and for 0 of the 19,254 beginning J-Z, because the view had not
 * been rebuilt since 2026-08-20. Nothing in the product noticed, and three
 * passes of engine work went into symptoms of it. Coverage alone would not have
 * caught it either: 40% coverage is unremarkable. What gives it away is that
 * the missing rows are missing for a reason the ranker can see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { popularityCoverage } from './rank.ts';
import type { BuildCard } from '../build/generate.ts';

function pool(spec: readonly (readonly [string, number | null])[]): BuildCard[] {
  return spec.map(
    ([name, edhrecRank], i) =>
      ({
        id: `id-${i}`,
        oracleId: `oracle-${i}`,
        name,
        typeLine: 'Artifact',
        cmc: 2,
        colorIdentity: [],
        tags: [],
        manaCost: null,
        usd: null,
        legalities: { commander: 'legal' },
        edhrecRank,
        oracleText: null,
        facets: null,
      }) as unknown as BuildCard
  );
}

test('a whole prior is not reported as skewed', () => {
  const result = popularityCoverage(
    pool([
      ['Arcane Signet', 3],
      ['Command Tower', 2],
      ['Sol Ring', 1],
      ['Swords to Plowshares', 11],
    ])
  );
  assert.equal(result.ranked, 4);
  assert.equal(result.earlyShare, 1);
  assert.equal(result.lateShare, 1);
  assert.equal(result.skewedByName, false);
});

test('an absent prior is not reported as skewed either, because it separates nobody', () => {
  const result = popularityCoverage(
    pool([
      ['Arcane Signet', null],
      ['Sol Ring', null],
    ])
  );
  assert.equal(result.ranked, 0);
  assert.equal(result.skewedByName, false);
});

test('missing evenly across the alphabet is not skew', () => {
  // Half of each half, which is what a prior that is simply incomplete looks
  // like. It must not raise the alarm: the alarm is about correlation, not
  // about coverage.
  const result = popularityCoverage(
    pool([
      ['Arcane Signet', 3],
      ['Blood Artist', null],
      ['Sol Ring', 1],
      ['Village Rites', null],
    ])
  );
  assert.equal(result.earlyShare, 0.5);
  assert.equal(result.lateShare, 0.5);
  assert.equal(result.skewedByName, false);
});

test('the live shape on 2026-08-25 is reported as skewed', () => {
  const result = popularityCoverage(
    pool([
      ['Arcane Signet', 3],
      ['Command Tower', 2],
      ['Cultivate', 20],
      ['Idol of Oblivion', 3400],
      ['Sol Ring', null],
      ['Skullclamp', null],
      ['Swords to Plowshares', null],
      ['Rhystic Study', null],
    ])
  );
  assert.equal(result.ranked, 4);
  assert.equal(result.earlyShare, 1);
  assert.equal(result.lateShare, 0);
  assert.equal(result.skewedByName, true);
});

test('the split is on the first letter and nothing else', () => {
  // 'I' counts as early, 'J' as late. That is where the live catalogue's own
  // cliff sits, and the boundary is stated here so a change to it fails a test
  // rather than quietly moving the alarm.
  const early = popularityCoverage(pool([['Idol of Oblivion', 5], ['Jeska’s Will', null]]));
  assert.equal(early.earlyShare, 1);
  assert.equal(early.lateShare, 0);
  assert.equal(early.skewedByName, true);
});

test('one-sided pools cannot be compared and are not accused', () => {
  const onlyEarly = popularityCoverage(pool([['Arcane Signet', 3], ['Ash Barrens', null]]));
  assert.equal(onlyEarly.skewedByName, false);
  const onlyLate = popularityCoverage(pool([['Sol Ring', 1], ['Skullclamp', null]]));
  assert.equal(onlyLate.skewedByName, false);
});
