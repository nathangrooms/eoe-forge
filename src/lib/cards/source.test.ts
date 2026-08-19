/**
 * The regression this file exists to catch.
 *
 *   node --test --experimental-strip-types src/lib/cards/source.test.ts
 *
 * On 2026-08-19 the sync switched from Scryfall's `unique=cards` to
 * `unique=prints`, taking `public.cards` from 34,088 rows (one printing of
 * everything) to every printing of everything. That is required: collection
 * value, the scanner and marketplace listings are all about a SPECIFIC
 * printing, and none of them can work against a table holding one.
 *
 * The danger it creates is the opposite one, and it is worse than the problem
 * being fixed. Sol Ring has dozens of printings. A commander picker that offers
 * the same legend eight times, or a suggestion list that spends every slot on
 * reprints of one card, would make the product unusable in exchange for data
 * nobody could see.
 *
 * So these tests assert the two things that must never regress:
 *
 *   1. a commander search for a card with many printings returns it ONCE
 *   2. a suggestion list never contains two rows with the same oracle_id
 *
 * Both are asserted against the real ranker in `src/engine/advise/`, not a
 * reimplementation, so deleting its dedupe step turns these red.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_RELATION,
  cardRelation,
  usdPrice,
  comparePrintings,
  dedupeByOracleId,
  assertUniqueByOracleId,
  type PrintingLike,
} from './source.ts';

import { rankCandidates, dedupeByOracle } from '../../engine/advise/rank.ts';
import { deriveDeckProfile } from '../../engine/advise/profile.ts';
import type { CandidateCard } from '../../engine/core/types.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SOL_RING_ORACLE = '3b2b0e39-6d0b-4b0e-bc79-a35c8dae95c2';

/** Eight printings of one card, priced all over the place, in scrambled order. */
function solRingPrintings(): PrintingLike[] {
  return [
    { id: 'p-ltc-284', oracle_id: SOL_RING_ORACLE, prices: { usd: '2.31' } },
    { id: 'p-c21-263', oracle_id: SOL_RING_ORACLE, prices: { usd: '1.14' } },
    { id: 'p-30a-263', oracle_id: SOL_RING_ORACLE, prices: { usd: '84.00' } },
    { id: 'p-cmr-472', oracle_id: SOL_RING_ORACLE, prices: {} },
    { id: 'p-mps-30', oracle_id: SOL_RING_ORACLE, prices: { usd: '112.50' } },
    { id: 'p-c19-234', oracle_id: SOL_RING_ORACLE, prices: { usd: '1.14' } },
    { id: 'p-brc-208', oracle_id: SOL_RING_ORACLE, prices: { usd: null } },
    { id: 'p-lcc-320', oracle_id: SOL_RING_ORACLE, prices: { usd: '1.99' } },
  ];
}

/** A candidate the ranker will accept: colourless, commander legal, tagged. */
function candidate(over: Partial<CandidateCard> & Pick<CandidateCard, 'id' | 'oracleId'>): CandidateCard {
  return {
    name: 'Sol Ring',
    typeLine: 'Artifact',
    cmc: 1,
    colorIdentity: [],
    tags: ['ramp'],
    manaCost: '{1}',
    usd: 1.14,
    legalities: { commander: 'legal' },
    ...over,
  } as CandidateCard;
}

/* ------------------------------------------------------------------ *
 * The rule
 * ------------------------------------------------------------------ */

describe('which printing represents a card', () => {
  it('names a different relation for each mode', () => {
    assert.equal(cardRelation('unique'), 'cards_unique');
    assert.equal(cardRelation('printings'), 'cards');
    assert.notEqual(CARD_RELATION.unique, CARD_RELATION.printings);
  });

  it('reads a usd price only when it is a plain decimal', () => {
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: { usd: '1.14' } }), 1.14);
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: { usd: '0' } }), 0);
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: {} }), null);
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: { usd: null } }), null);
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: null }), null);
    // Anything that is not a number must be "no price", never NaN. NaN
    // compares false against everything and would sort unpredictably.
    assert.equal(usdPrice({ id: 'a', oracle_id: 'o', prices: { usd: 'n/a' } }), null);
  });

  it('keeps the cheapest printing', () => {
    const chosen = dedupeByOracleId(solRingPrintings());
    assert.equal(chosen.length, 1);
    // 1.14 twice: the tie breaks on the lower id, c19 before c21.
    assert.equal(chosen[0].id, 'p-c19-234');
  });

  it('prefers any priced printing over an unpriced one', () => {
    const priced = { id: 'zzz', oracle_id: 'o', prices: { usd: '99.99' } };
    const unpriced = { id: 'aaa', oracle_id: 'o', prices: {} };
    assert.ok(comparePrintings(priced, unpriced) < 0);
    assert.ok(comparePrintings(unpriced, priced) > 0);
    assert.equal(dedupeByOracleId([unpriced, priced])[0].id, 'zzz');
  });

  it('breaks ties on the lowest id when nothing is priced', () => {
    const rows = [
      { id: 'ccc', oracle_id: 'o', prices: {} },
      { id: 'aaa', oracle_id: 'o', prices: {} },
      { id: 'bbb', oracle_id: 'o', prices: {} },
    ];
    assert.equal(dedupeByOracleId(rows)[0].id, 'aaa');
  });

  it('is deterministic: input order cannot change the answer', () => {
    const rows = solRingPrintings();
    const forwards = dedupeByOracleId(rows);
    const backwards = dedupeByOracleId([...rows].reverse());
    // Every rotation of the list, not just one, because a rule that depends on
    // row order fails intermittently rather than every time.
    for (let i = 0; i < rows.length; i++) {
      const rotated = [...rows.slice(i), ...rows.slice(0, i)];
      assert.deepEqual(dedupeByOracleId(rotated), forwards);
    }
    assert.deepEqual(backwards, forwards);
  });

  it('matches the deck optimiser, which is the convention being followed', () => {
    // The engine's own dedupe, on the same eight printings. If these two ever
    // disagree, a suggestion costs one price on the card page and another in
    // the optimiser and neither is wrong on its own terms, which is the exact
    // "so many systems bolted together they never linked" failure.
    const mine = dedupeByOracleId(solRingPrintings());
    const theirs = dedupeByOracle(
      solRingPrintings().map(p =>
        candidate({ id: p.id, oracleId: p.oracle_id, usd: usdPrice(p) })
      )
    );
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0].id, mine[0].id);
  });
});

/* ------------------------------------------------------------------ *
 * 1. A commander search returns a card once
 * ------------------------------------------------------------------ */

describe('commander search', () => {
  /**
   * A commander picker filtered from a printings pool. This mirrors what a
   * search does: take rows for the typed name, keep the legendary creatures
   * that are commander legal, show them. Before dedupe, one legend with eight
   * printings fills eight slots.
   */
  const KRENKO = 'krenko-oracle-id';

  const printings: PrintingLike[] = [
    { id: 'k-2xm-131', oracle_id: KRENKO, prices: { usd: '9.10' } },
    { id: 'k-c13-032', oracle_id: KRENKO, prices: { usd: '11.87' } },
    { id: 'k-cmm-192', oracle_id: KRENKO, prices: { usd: '6.44' } },
    { id: 'k-plist-88', oracle_id: KRENKO, prices: { usd: '7.20' } },
    { id: 'k-sld-1522', oracle_id: KRENKO, prices: {} },
    { id: 'k-clb-901', oracle_id: KRENKO, prices: { usd: '8.05' } },
    { id: 'k-30a-131', oracle_id: KRENKO, prices: { usd: '25.00' } },
    { id: 'k-ima-134', oracle_id: KRENKO, prices: { usd: '6.99' } },
    { id: 'other-legend', oracle_id: 'edgar-oracle-id', prices: { usd: '4.50' } },
  ];

  it('returns a card with many printings exactly once', () => {
    const results = dedupeByOracleId(printings);
    const krenko = results.filter(r => r.oracle_id === KRENKO);
    assert.equal(krenko.length, 1, 'Krenko must appear once, not once per printing');
    assert.equal(results.length, 2, 'two distinct commanders, nine printings');
    assertUniqueByOracleId(results, 'commander search');
  });

  it('picks the cheapest printing to represent the commander', () => {
    const [krenko] = dedupeByOracleId(printings).filter(r => r.oracle_id === KRENKO);
    assert.equal(krenko.id, 'k-cmm-192'); // 6.44, the cheapest
  });

  it('would have shown the same commander eight times without dedupe', () => {
    // The failure being guarded against, stated as a fact rather than trusted.
    const undeduped = printings.filter(p => p.oracle_id === KRENKO);
    assert.equal(undeduped.length, 8);
    assert.throws(
      () => assertUniqueByOracleId(undeduped, 'commander search'),
      /two printings of one card/
    );
  });
});

/* ------------------------------------------------------------------ *
 * 2. A suggestion list never repeats a card
 * ------------------------------------------------------------------ */

describe('suggestion list', () => {
  /**
   * Run the REAL ranker over a pool that looks like the new `cards` table:
   * a handful of cards, several of them present many times over.
   */
  function pool(): CandidateCard[] {
    const rows: CandidateCard[] = [];

    // Sol Ring, eight printings.
    for (const p of solRingPrintings()) {
      rows.push(candidate({ id: p.id, oracleId: p.oracle_id, usd: usdPrice(p) }));
    }

    // Arcane Signet, four printings.
    for (const [i, usd] of [0.98, 1.25, 3.4, 12.0].entries()) {
      rows.push(
        candidate({
          id: `signet-${i}`,
          oracleId: 'arcane-signet-oracle',
          name: 'Arcane Signet',
          cmc: 2,
          usd,
        })
      );
    }

    // Two singletons so the list has something else to hold.
    rows.push(
      candidate({ id: 'mana-crypt-1', oracleId: 'mana-crypt-oracle', name: 'Mana Crypt', cmc: 0, usd: 92 })
    );
    rows.push(
      candidate({
        id: 'rhystic-1',
        oracleId: 'rhystic-oracle',
        name: 'Rhystic Study',
        cmc: 3,
        tags: ['draw'],
        colorIdentity: ['U'],
        manaCost: '{2}{U}',
        usd: 38,
      })
    );

    return rows;
  }

  const profile = deriveDeckProfile({
    format: 'commander',
    colorIdentity: ['U'],
    cards: [],
  });

  it('never contains two rows with the same oracle_id', () => {
    const suggestions = rankCandidates(pool(), profile);
    assert.ok(suggestions.length > 0, 'the fixture must actually produce suggestions');
    assertUniqueByOracleId(
      suggestions.map(s => ({ id: s.card.id, oracle_id: s.card.oracleId })),
      'suggestion list'
    );
  });

  it('offers four distinct cards from fourteen printings', () => {
    const suggestions = rankCandidates(pool(), profile);
    assert.equal(pool().length, 14);
    assert.equal(new Set(suggestions.map(s => s.card.oracleId)).size, suggestions.length);
    assert.ok(suggestions.length <= 4, `got ${suggestions.length} suggestions from 4 distinct cards`);
  });

  it('does not waste a truncated list on reprints of one card', () => {
    // The visible symptom of the bug: ask for three suggestions and get three
    // Sol Rings. `limit` is applied after dedupe, so this cannot happen.
    const suggestions = rankCandidates(pool(), profile, { limit: 3 });
    const names = suggestions.map(s => s.card.name);
    assert.equal(new Set(names).size, names.length, `repeated card in ${JSON.stringify(names)}`);
  });

  it('keeps the cheapest printing of each suggested card', () => {
    const suggestions = rankCandidates(pool(), profile);
    const solRing = suggestions.find(s => s.card.oracleId === SOL_RING_ORACLE);
    assert.ok(solRing, 'Sol Ring should be suggested');
    assert.equal(solRing.card.id, 'p-c19-234');
    assert.equal(solRing.card.usd, 1.14);
  });
});

/* ------------------------------------------------------------------ *
 * The guard itself
 * ------------------------------------------------------------------ */

describe('assertUniqueByOracleId', () => {
  it('passes a clean list', () => {
    assert.doesNotThrow(() =>
      assertUniqueByOracleId(
        [
          { id: 'a', oracle_id: '1' },
          { id: 'b', oracle_id: '2' },
        ],
        'test'
      )
    );
  });

  it('names both offending printings and says what to do', () => {
    assert.throws(
      () =>
        assertUniqueByOracleId(
          [
            { id: 'first', oracle_id: 'same' },
            { id: 'second', oracle_id: 'same' },
          ],
          'deck builder pool'
        ),
      (err: Error) => {
        assert.match(err.message, /deck builder pool/);
        assert.match(err.message, /first/);
        assert.match(err.message, /second/);
        assert.match(err.message, /cards_unique/);
        return true;
      }
    );
  });
});
