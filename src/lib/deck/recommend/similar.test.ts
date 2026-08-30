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

/**
 * Real text, and the card that showed the shape guard was needed.
 *
 * The reader refuses "creatures you control get +X/+X", which is the whole
 * card, so Craterhoof's record carries a trigger, a keyword and a subtype and
 * no effect verb at all. Before 2026-08-30 that was enough to fill fourteen
 * tiles under a heading reading "does the same thing".
 */
const CRATERHOOF = {
  oracle_id: 'craterhoof',
  name: 'Craterhoof Behemoth',
  type_line: 'Creature — Beast',
  mana_cost: '{5}{G}{G}{G}',
  cmc: 8,
  oracle_text:
    'Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.',
  tags: ['creature', 'mass-pump', 'finisher'],
};

/**
 * A Beast, and nothing else in common with Craterhoof.
 *
 * It carried both of Craterhoof's role tags on the live page, so it is given
 * them here: the point of the fixture is that the RECORD tier must refuse it
 * even though the tag tier will not.
 */
const THUNDERFOOT_BALOTH = {
  oracle_id: 'thunderfoot-baloth',
  name: 'Thunderfoot Baloth',
  type_line: 'Creature — Beast',
  mana_cost: '{4}{G}{G}',
  cmc: 6,
  oracle_text: 'Trample\nSoulbond',
  tags: ['creature', 'mass-pump', 'finisher'],
};

/** The same Beast with no role tags at all, so nothing can speak for it. */
const PLAIN_BALOTH = { ...THUNDERFOOT_BALOTH, oracle_id: 'plain-baloth', name: 'Plain Baloth', tags: ['creature'] };

/** Shares both of Craterhoof's role tags, and is a card a player would name. */
const VITALIZING_WIND = {
  oracle_id: 'vitalizing-wind',
  name: 'Vitalizing Wind',
  type_line: 'Sorcery',
  mana_cost: '{8}{G}',
  cmc: 9,
  oracle_text: 'Creatures you control get +4/+4 until end of turn.',
  tags: ['sorcery', 'mass-pump', 'finisher'],
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

  it('refuses a record that names a shape and nothing that happens', () => {
    /*
     * A record saying "flying Pirate that enters" cannot produce a sentence
     * about what a card does, and 31.4% of the catalogue is in that position.
     * Every one of them used to get a list, and every list said "also a
     * Pirate".
     */
    assert.equal(canReadBehaviour(THUNDERFOOT_BALOTH), false);
    // Craterhoof's record is just as thin on verbs but does carry a trigger, so
    // it may still speak. What it is allowed to SAY is the next test.
    assert.equal(canReadBehaviour(CRATERHOOF), true);
  });
});

describe('rankBySameBehaviour: sharing a shape is not doing the same thing', () => {
  it('will not call a Beast a match for a Beast', () => {
    /*
     * Both are Beasts, both are creatures, and on the live page that was enough
     * for Thunderfoot Baloth to be the second card on Craterhoof Behemoth's
     * list with the note "Also shares the beast type". It may still appear on
     * its tags, and the note has to say that is what happened, because the
     * difference between "we read these two cards" and "they carry the same
     * word" is the whole complaint this answers.
     */
    const { entries, census } = rankBySameBehaviour(CRATERHOOF, [THUNDERFOOT_BALOTH]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].basis, 'tags');
    assert.equal(entries[0].shared.length, 0);
    assert.ok(entries[0].note.startsWith('Record is incomplete'), entries[0].note);
    assert.equal(census.byRecord, 0);
  });

  it('says nothing at all when the shape is the only thing there is', () => {
    const { entries } = rankBySameBehaviour(CRATERHOOF, [PLAIN_BALOTH]);
    assert.deepEqual(entries, []);
  });

  it('ranks the card that shares both role tags above the one that shares a shape', () => {
    // With the record silent the tag tier is all that is left, and two tags
    // together name a card where one names a job 732 cards do.
    const { entries } = rankBySameBehaviour(CRATERHOOF, [PLAIN_BALOTH, VITALIZING_WIND]);
    assert.deepEqual(
      entries.map(e => e.card.name),
      ['Vitalizing Wind']
    );
    assert.ok(entries[0].note.includes('mass-pump'), entries[0].note);
  });
});

describe('rankBySameBehaviour: Counterspell', () => {
  const pool = [FROST_TITAN, DECLARATION_OF_NAUGHT, MANA_DRAIN];

  it('drops the two cards whose only claim was the word counterspell', () => {
    /*
     * Under `sharedTagScore` all three tied at 6.32 and the order was market
     * price, which put Frost Titan and Declaration of Naught on the page ahead
     * of every real counterspell.
     *
     * They were then KEPT and demoted, on the reasoning that "a labelled entry
     * is more use than a silently missing one". On 2026-08-30 that was
     * reversed, and the card that proved it is Thassa's Oracle: its only signal
     * tag is `finisher`, one of 732 cards carrying it, and its whole list came
     * back as Merfolk lords. Both of these share exactly one tag with
     * Counterspell, so both are now gone. See `MIN_SHARED_TAGS`.
     */
    const { entries } = rankBySameBehaviour(COUNTERSPELL, pool);
    assert.deepEqual(
      entries.map(e => e.card.name),
      ['Mana Drain']
    );
    assert.equal(entries[0].basis, 'partial');
  });

  it("says why, in the card's own terms", () => {
    const { entries } = rankBySameBehaviour(COUNTERSPELL, pool);
    assert.equal(entries[0].note, 'Also counters a spell');
  });

  it('a complete record that shares nothing is dropped, not demoted', () => {
    // Both cards read end to end, nothing in common. That is an answer and the
    // tags do not get to argue with it, which is `cardServesRole`'s rule
    // applied to a pair instead of to a role.
    const sweeper = {
      oracle_id: 'sweeper',
      name: 'Sweeper',
      type_line: 'Sorcery',
      mana_cost: '{2}{U}{U}',
      cmc: 4,
      oracle_text: 'Destroy all creatures.',
      tags: ['counterspell', 'sorcery'],
    };
    const { entries } = rankBySameBehaviour(COUNTERSPELL, [sweeper]);
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
