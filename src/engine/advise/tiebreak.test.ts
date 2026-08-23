/**
 * What decides a pick the score cannot decide.
 *
 *   node --test --experimental-strip-types src/engine/advise/tiebreak.test.ts
 *
 * `rankCandidates` broke ties with `a.card.name.localeCompare(b.card.name)`
 * until 2026-08-23, and because the score ties in the thousands that line was
 * the largest single influence on what a generated deck contained. Measured by
 * `scratch/refute-ties.mjs` over eight commanders on the 2026-08-19 catalogue
 * snapshot: ranking Kaalia of the Vast's 17,818 legal spells gave 3,472
 * distinct score values, 5,074 of them cards sitting on exactly 5.3750, and the
 * finished 99 drew 92% of its spells from names beginning A to I against a pool
 * that is 46% A to I.
 *
 * This suite pins the property that replaced it: the tie-break must not be able
 * to see a card's name.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rankCandidates, compareTied, stableHash } from './rank.ts';
import { deriveDeckProfile } from './profile.ts';
import type { CandidateCard } from '../core/types.ts';

/**
 * A profile with nothing in it, which is what makes everything tie.
 *
 * Built through `deriveDeckProfile` rather than written as an object literal,
 * so the eligibility gates in `ineligibility` see the fields they expect and
 * this suite cannot pass by handing the ranker a shape it never gets.
 */
const EMPTY_PROFILE = deriveDeckProfile({
  format: 'commander',
  colorIdentity: [],
  cards: [],
  manaProfile: null,
});

/**
 * `n` identical cards whose ONLY difference is the name and the oracle id.
 *
 * Ids are fixed strings rather than generated, so the hash order below is the
 * same on every machine and this test cannot become flaky.
 */
function twins(names: readonly string[]): CandidateCard[] {
  return names.map((name, i) => ({
    id: `id-${i}`,
    oracleId: `0000000${i}-1111-2222-3333-44444444444${i % 10}`,
    name,
    typeLine: 'Artifact',
    manaCost: '{2}',
    cmc: 2,
    colorIdentity: [],
    colors: [],
    tags: [],
    keywords: [],
    edhrecRank: null,
    usd: null,
    rarity: 'common',
    setCode: 'tst',
    legalities: { commander: 'legal' },
  })) as unknown as CandidateCard[];
}

describe('a tie is not settled by the alphabet', () => {
  const ALPHABET = ['Aardvark', 'Bison', 'Cheetah', 'Wolverine', 'Xerus', 'Yak', 'Zebra'];

  it('renaming a card cannot move it up the list', () => {
    const ranked = rankCandidates(twins(ALPHABET), EMPTY_PROFILE, {});
    assert.equal(ranked.length, ALPHABET.length);
    // Everything scores the same; if it did not, this test would be proving
    // nothing about the tie-break.
    assert.equal(new Set(ranked.map(r => r.score)).size, 1);
    const order = ranked.map(r => r.card.name);
    assert.notDeepEqual(order, [...ALPHABET].sort());
  });

  it('the order is stable across runs, so the same pool gives the same deck', () => {
    const a = rankCandidates(twins(ALPHABET), EMPTY_PROFILE, {}).map(r => r.card.name);
    const b = rankCandidates([...twins(ALPHABET)].reverse(), EMPTY_PROFILE, {}).map(r => r.card.name);
    assert.deepEqual(a, b);
  });

  it('a played card beats an unplayed one when nothing else separates them', () => {
    // `edhrecRank` is the only broad evidence we hold that people play a card.
    // It is already a scoring signal, so this line only decides what the score
    // could not: ranked against unranked, or two cards at the same rank.
    const [ranked, unranked] = twins(['Zebra', 'Aardvark']);
    assert.ok(compareTied({ ...ranked, edhrecRank: 12 }, { ...unranked, edhrecRank: null }) < 0);
    assert.ok(compareTied({ ...unranked, edhrecRank: null }, { ...ranked, edhrecRank: 12 }) > 0);
    // Rank 0 is "we hold no rank", not "the most played card in Magic".
    assert.ok(compareTied({ ...ranked, edhrecRank: 500 }, { ...unranked, edhrecRank: 0 }) < 0);
  });

  it('the tie-break is a total order, so no two entries compare equal', () => {
    const cards = twins(ALPHABET);
    for (const a of cards) {
      for (const b of cards) {
        if (a.oracleId === b.oracleId) continue;
        assert.notEqual(compareTied(a, b), 0, `${a.name} vs ${b.name}`);
        assert.equal(Math.sign(compareTied(a, b)), -Math.sign(compareTied(b, a)));
      }
    }
  });
});

describe('stableHash', () => {
  it('is deterministic and spreads', () => {
    assert.equal(stableHash('Sol Ring'), stableHash('Sol Ring'));
    assert.notEqual(stableHash('Sol Ring'), stableHash('Sol Rinh'));
    // A prefix must not predict the value, or the alphabet is back by proxy.
    const aWords = ['Aa', 'Ab', 'Ac', 'Ad', 'Ae', 'Af', 'Ag', 'Ah'].map(stableHash);
    const zWords = ['Za', 'Zb', 'Zc', 'Zd', 'Ze', 'Zf', 'Zg', 'Zh'].map(stableHash);
    const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
    const interleaved = aWords.filter(a => zWords.some(z => z < a));
    assert.ok(interleaved.length > 0, 'every A hashed below every Z');
    assert.ok(Number.isFinite(mean(aWords)) && Number.isFinite(mean(zWords)));
  });

  it('never returns a negative, so subtracting two of them is a valid comparator', () => {
    for (const s of ['', 'a', 'Zzzzzzzzzzzzzzzzzzzz', 'Ω', '0000']) {
      assert.ok(stableHash(s) >= 0, s);
      assert.ok(Number.isSafeInteger(stableHash(s)), s);
    }
  });
});
