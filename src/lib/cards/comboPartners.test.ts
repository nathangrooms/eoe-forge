/**
 * The combo group, tested on the rows that made the old group wrong.
 *
 *   node --test --experimental-strip-types src/lib/cards/comboPartners.test.ts
 *
 * Every combo below is a real row from `meta_combos`, read out of the live
 * database on 2026-08-30, with the ids shortened. The two Sol Ring lines are
 * the ones that decide the whole ranking: Hullbreaker Horror is a straight pair
 * and Displacer Kitten is eight times less popular per Spellbook but needs a
 * third card, and a player wants the pair first.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  rankComboPartners,
  comboNote,
  comboBasis,
  MAX_COMBO_PIECES,
  type ComboRow,
  type ComboMemberRow,
} from './comboPartners.ts';

const SOL_RING = 'sol-ring';

const COMBOS: ComboRow[] = [
  { id: 'pair-hullbreaker', card_count: 2, popularity: 339926, produces: ['Infinite colorless mana', 'Infinite storm count'] },
  { id: 'pair-tidespout', card_count: 2, popularity: 36286, produces: ['Infinite colorless mana'] },
  { id: 'trio-kitten', card_count: 3, popularity: 44882, produces: ['Infinite card draw'] },
  { id: 'trio-teferi', card_count: 3, popularity: 44882, produces: ['Infinite card draw'] },
  // Five pieces. Junk Diver is in it and is not a fact about Sol Ring.
  { id: 'five-ironworks', card_count: 5, popularity: 18849, produces: ['Infinite mana'] },
];

const MEMBERS: ComboMemberRow[] = [
  { combo_id: 'pair-hullbreaker', oracle_id: SOL_RING, card_name: 'Sol Ring' },
  { combo_id: 'pair-hullbreaker', oracle_id: 'hullbreaker', card_name: 'Hullbreaker Horror' },
  { combo_id: 'pair-tidespout', oracle_id: SOL_RING, card_name: 'Sol Ring' },
  { combo_id: 'pair-tidespout', oracle_id: 'tidespout', card_name: 'Tidespout Tyrant' },
  { combo_id: 'trio-kitten', oracle_id: SOL_RING, card_name: 'Sol Ring' },
  { combo_id: 'trio-kitten', oracle_id: 'kitten', card_name: 'Displacer Kitten' },
  { combo_id: 'trio-kitten', oracle_id: 'teferi', card_name: 'Teferi, Time Raveler' },
  { combo_id: 'trio-teferi', oracle_id: SOL_RING, card_name: 'Sol Ring' },
  { combo_id: 'trio-teferi', oracle_id: 'kitten', card_name: 'Displacer Kitten' },
  { combo_id: 'five-ironworks', oracle_id: SOL_RING, card_name: 'Sol Ring' },
  { combo_id: 'five-ironworks', oracle_id: 'junk-diver', card_name: 'Junk Diver' },
];

describe('rankComboPartners', () => {
  it('puts the two card combo above the more famous three card one', () => {
    const partners = rankComboPartners(SOL_RING, COMBOS, MEMBERS);
    assert.deepEqual(
      partners.map(p => p.name),
      ['Hullbreaker Horror', 'Tidespout Tyrant', 'Displacer Kitten', 'Teferi, Time Raveler']
    );
  });

  it('drops a combo that takes more cards than a player assembles on purpose', () => {
    // Junk Diver's only link to Sol Ring is a five card Krark-Clan Ironworks
    // loop. Showing it would reproduce the complaint this group answers.
    const partners = rankComboPartners(SOL_RING, COMBOS, MEMBERS);
    assert.equal(partners.some(p => p.name === 'Junk Diver'), false);
    assert.equal(MAX_COMBO_PIECES, 3);
  });

  it('never shows the card being viewed as a partner of itself', () => {
    const partners = rankComboPartners(SOL_RING, COMBOS, MEMBERS);
    assert.equal(partners.some(p => p.oracleId === SOL_RING), false);
  });

  it('counts every combo two cards share but shows the best one', () => {
    const kitten = rankComboPartners(SOL_RING, COMBOS, MEMBERS).find(
      p => p.name === 'Displacer Kitten'
    );
    assert.ok(kitten);
    assert.equal(kitten.combos, 2);
    assert.equal(kitten.pieces, 3);
  });

  it('returns nothing rather than something for a card in no recorded combo', () => {
    // Counterspell, Cultivate, Rhystic Study and Craterhoof Behemoth are all in
    // this position live: the lookup on their oracle id matches no combo, so
    // both arrays arrive empty. An empty list is the answer, and the caller must
    // draw no group rather than widening the query until something comes back.
    assert.deepEqual(rankComboPartners('counterspell', [], []), []);
  });

  it('ignores a combo the subject is not actually in', () => {
    // Belt and braces on the query: if a combo row arrives whose member list
    // does not name the subject, its members are still not this card's
    // partners. The filter is on the subject's own id and nothing else.
    const partners = rankComboPartners('not-in-any-of-these', COMBOS, MEMBERS);
    assert.equal(partners.some(p => p.oracleId === 'not-in-any-of-these'), false);
  });

  it('does not depend on the order the rows arrive in', () => {
    const forward = rankComboPartners(SOL_RING, COMBOS, MEMBERS).map(p => p.name);
    const reversed = rankComboPartners(
      SOL_RING,
      [...COMBOS].reverse(),
      [...MEMBERS].reverse()
    ).map(p => p.name);
    assert.deepEqual(forward, reversed);
  });
});

describe('comboNote', () => {
  it("says the size and what it makes, in Spellbook's own words", () => {
    const [first] = rankComboPartners(SOL_RING, COMBOS, MEMBERS);
    assert.equal(
      comboNote(first),
      'Two-card combo: Infinite colorless mana, Infinite storm count'
    );
  });

  it('says the size alone when the combo records no result', () => {
    assert.equal(
      comboNote({ oracleId: 'x', name: 'X', pieces: 3, popularity: null, produces: [], combos: 1 }),
      'Three-card combo'
    );
  });
});

describe('comboBasis', () => {
  it('carries the denominator, because a claim without one cannot be judged', () => {
    const line = comboBasis('Sol Ring', 4, 106);
    assert.ok(line.includes('106 combos'), line);
    assert.ok(line.includes('Sol Ring'), line);
  });

  it('never says em-dash and never says engine', () => {
    const line = comboBasis('Sol Ring', 4, 106);
    assert.equal(line.includes('—'), false);
    assert.equal(/engine|\bAI\b|smart/i.test(line), false);
  });
});
