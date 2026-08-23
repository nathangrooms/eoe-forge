/**
 * "Similar" means does a similar thing, tested on the lists that were wrong.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/similar.test.ts
 *
 * Unlike `src/engine/knowledge/behaviour.test.ts`, this file can run the real
 * producer, so the rows below are ORACLE TEXT and nothing here is a
 * hand-written facet list. Every card is one that appeared on, or was wrongly
 * missing from, a card page measured on 2026-08-23 and written up in
 * `docs/design/ENGINE-PICKS.md`.
 *
 * The oracle text is Scryfall's, quoted only as the input a compiler reads.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rankBySameBehaviour, canReadBehaviour } from './similar.ts';

const SOL_RING = {
  oracle_id: 'sol-ring',
  name: 'Sol Ring',
  type_line: 'Artifact',
  mana_cost: '{1}',
  cmc: 1,
  oracle_text: '{T}: Add {C}{C}.',
  tags: ['artifact', 'fast-mana', 'mana-rock', 'ramp'],
};

const DIMIR_SIGNET = {
  oracle_id: 'dimir-signet',
  name: 'Dimir Signet',
  type_line: 'Artifact',
  mana_cost: '{2}',
  cmc: 2,
  oracle_text: '{1}, {T}: Add {U}{B}.',
  tags: ['artifact', 'mana-rock', 'ramp'],
};

const MANA_CRYPT = {
  oracle_id: 'mana-crypt',
  name: 'Mana Crypt',
  type_line: 'Artifact',
  mana_cost: '{0}',
  cmc: 0,
  oracle_text:
    'At the beginning of your upkeep, flip a coin. If you lose the flip, this artifact deals 3 damage to you.\n{T}: Add {C}{C}.',
  tags: ['artifact', 'fast-mana', 'mana-rock', 'ramp'],
};

/** No record: the compiler returns `coverage: 'manual'` and no abilities. */
const ARCANE_SIGNET = {
  oracle_id: 'arcane-signet',
  name: 'Arcane Signet',
  type_line: 'Artifact',
  mana_cost: '{2}',
  cmc: 2,
  oracle_text: "{T}: Add one mana of any color in your commander's identity.",
  tags: ['artifact', 'mana-rock', 'ramp'],
};

const COUNTERSPELL = {
  oracle_id: 'counterspell',
  name: 'Counterspell',
  type_line: 'Instant',
  mana_cost: '{U}{U}',
  cmc: 2,
  oracle_text: 'Counter target spell.',
  tags: ['counterspell', 'instant'],
};

const MANA_DRAIN = {
  oracle_id: 'mana-drain',
  name: 'Mana Drain',
  type_line: 'Instant',
  mana_cost: '{U}{U}',
  cmc: 2,
  oracle_text:
    "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.",
  tags: ['counterspell', 'instant'],
};

/**
 * Tagged `counterspell` because one ability counters a spell that targets it.
 * It was shown on the Counterspell page, ranked identically to every other row.
 */
const FROST_TITAN = {
  oracle_id: 'frost-titan',
  name: 'Frost Titan',
  type_line: 'Creature — Giant',
  mana_cost: '{4}{U}{U}',
  cmc: 6,
  oracle_text:
    "Whenever this creature becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.\nWhenever this creature enters or attacks, tap target permanent. It doesn't untap during its controller's next untap step.",
  tags: ['counterspell', 'creature', 'stax'],
};

const DECLARATION_OF_NAUGHT = {
  oracle_id: 'declaration-of-naught',
  name: 'Declaration of Naught',
  type_line: 'Enchantment',
  mana_cost: '{U}{U}',
  cmc: 2,
  oracle_text:
    'As this enchantment enters, choose a card name.\nSpells with the chosen name can\'t be cast.',
  tags: ['counterspell', 'enchantment'],
};

describe('canReadBehaviour', () => {
  it('is true when the compiler produced a record, false when it produced nothing', () => {
    assert.equal(canReadBehaviour(SOL_RING), true);
    assert.equal(canReadBehaviour(ARCANE_SIGNET), false);
  });

  it('a card the compiler cannot read still has a type line, which is not a record', () => {
    // The distinction the whole fallback rests on. Arcane Signet carries
    // `type:artifact` and nothing else, and counting that as evidence would
    // report full coverage on a page picked entirely from tags.
    assert.equal(canReadBehaviour({ name: 'x', type_line: 'Artifact', oracle_text: null }), false);
  });
});

describe('rankBySameBehaviour: Counterspell', () => {
  const pool = [FROST_TITAN, DECLARATION_OF_NAUGHT, MANA_DRAIN];

  it('drops the two cards whose only claim was the word counterspell', () => {
    const { entries } = rankBySameBehaviour(COUNTERSPELL, pool);
    assert.deepEqual(
      entries.map(e => e.card.name),
      ['Mana Drain']
    );
  });

  it('says why, in the card\'s own terms', () => {
    const { entries } = rankBySameBehaviour(COUNTERSPELL, pool);
    assert.equal(entries[0].note, 'Both counters a spell');
    assert.equal(entries[0].basis, 'partial');
  });

  it('a complete record that shares nothing is dropped, not demoted', () => {
    // Declaration of Naught has NO record, so it reaches the tag tier; the
    // rule being pinned is the other one, that two fully read cards sharing
    // nothing produce no entry at all.
    const { entries } = rankBySameBehaviour(COUNTERSPELL, [
      { ...DECLARATION_OF_NAUGHT, oracle_text: 'Destroy all creatures.', name: 'Sweeper' },
    ]);
    assert.equal(entries.length, 0);
  });
});

describe('rankBySameBehaviour: Sol Ring', () => {
  it('puts Mana Crypt above a Signet, which the facets alone do not', () => {
    // The facet comparison scores the Signet 0.878 and Mana Crypt 0.860,
    // because Mana Crypt has an upkeep trigger Sol Ring does not. Mana value
    // is what settles it, and paying more for the same behaviour is the only
    // direction that costs anything. See `COST_HALF_LIFE`.
    const { entries } = rankBySameBehaviour(SOL_RING, [DIMIR_SIGNET, MANA_CRYPT]);
    assert.deepEqual(
      entries.map(e => e.card.name),
      ['Mana Crypt', 'Dimir Signet']
    );
  });

  it('keeps a card with no record, ranks it last, and labels it', () => {
    const { entries, census } = rankBySameBehaviour(SOL_RING, [ARCANE_SIGNET, MANA_CRYPT]);
    assert.deepEqual(
      entries.map(e => e.card.name),
      ['Mana Crypt', 'Arcane Signet']
    );
    assert.equal(entries[1].basis, 'tags');
    assert.ok(entries[1].note.startsWith('No ability record'), entries[1].note);
    assert.equal(census.byRecord, 1);
    assert.equal(census.byTags, 1);
  });

  it('reports how much of the pool it could read, rather than leaving it invisible', () => {
    const { census } = rankBySameBehaviour(SOL_RING, [ARCANE_SIGNET, MANA_CRYPT, DIMIR_SIGNET]);
    assert.equal(census.pool, 3);
    assert.equal(census.withRecord, 2);
  });

  it('excludes the card being viewed, by oracle id and by name', () => {
    const byId = rankBySameBehaviour(SOL_RING, [MANA_CRYPT], {
      exclude: new Set(['id:mana-crypt']),
    });
    assert.equal(byId.entries.length, 0);
    const byName = rankBySameBehaviour(SOL_RING, [MANA_CRYPT], {
      exclude: new Set(['name:Mana Crypt']),
    });
    assert.equal(byName.entries.length, 0);
  });

  it('applies the limit AFTER scoring the whole pool, never before', () => {
    // The bug this whole group replaces: `limit 60` in SQL ranked an arbitrary
    // sixty rows very carefully. The order here must not depend on input order.
    const forward = rankBySameBehaviour(SOL_RING, [DIMIR_SIGNET, MANA_CRYPT], { limit: 1 });
    const reversed = rankBySameBehaviour(SOL_RING, [MANA_CRYPT, DIMIR_SIGNET], { limit: 1 });
    assert.equal(forward.entries[0].card.name, 'Mana Crypt');
    assert.equal(reversed.entries[0].card.name, 'Mana Crypt');
  });
});
