/**
 * The cards a Commander player actually plays, and whether the compiler can
 * read them.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/most-played.test.ts
 *
 * WHY A TEST FILE ORGANISED BY PLAY RATE
 * --------------------------------------
 * Coverage over the whole catalogue is the wrong denominator for every consumer
 * that matters. The deck generator draws from the most played few thousand
 * cards, and `scripts/compiler-gap-probe.ts` measured that slice on 30 Aug 2026:
 *
 *   top 100     26.3% produced NO ability record at all
 *   101-500     12.0%
 *   501-2000    20.4%
 *
 * A card with no record cannot be keyed to a commander, cannot be ranked on what
 * it does, and in play mode resolves to nothing. Twenty six percent of the
 * hundred most played cards in the format is not a long tail.
 *
 * Every card below is one that probe named, with its rank, so a rule that
 * regresses fails against a card somebody is holding rather than against a
 * fixture. The oracle text is verbatim from `cards_unique`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';

const card = (name: string, typeLine: string, text: string) =>
  compileCardAbilities({ name, type_line: typeLine, oracle_text: text } as never);

const effectsOf = (name: string, typeLine: string, text: string) => {
  const compiled = card(name, typeLine, text);
  assert.ok((compiled.abilities?.length ?? 0) > 0, `${name} produced no ability record at all`);
  return compiled.abilities.flatMap(a => (a as { effects?: unknown[] }).effects ?? []);
};

describe('one mana of any colour, from a source the card names', () => {
  /*
   * Ranks 2, 3, 9 and 17 in Commander. All four produced nothing before
   * `add-mana-any-color-among`, because the rule beside it anchors on the end
   * of the phrase and every one of these sentences carries a qualifier after
   * the word "color".
   */
  const CARDS = [
    ['Command Tower', 2, 'Land', "{T}: Add one mana of any color in your commander's color identity.", 'commander-identity'],
    ['Arcane Signet', 3, 'Artifact', "{T}: Add one mana of any color in your commander's color identity.", 'commander-identity'],
    ['Exotic Orchard', 9, 'Land', '{T}: Add one mana of any color that a land an opponent controls could produce.', 'opponent-lands'],
    ['Fellwar Stone', 17, 'Artifact', '{T}: Add one mana of any color that a land an opponent controls could produce.', 'opponent-lands'],
    ['Reflecting Pool', 173, 'Land', '{T}: Add one mana of any type that a land you control could produce.', 'your-lands'],
    ['Mox Amber', 205, 'Legendary Artifact', '{T}: Add one mana of any color among legendary creatures and planeswalkers you control.', 'your-legendary-permanents'],
  ] as const;

  for (const [name, rank, typeLine, text, among] of CARDS) {
    it(`${name} (rank ${rank}) adds mana, and says where the colour comes from`, () => {
      const effects = effectsOf(name, typeLine, text);
      assert.equal(effects.length, 1, `${name} should be one effect`);
      const e = effects[0] as { do: string; among?: string; mana?: string };
      assert.equal(e.do, 'add-mana');
      assert.equal(e.among, among);
      /* The colour is a CHOICE, so the mana string is the five-way hybrid and
         P05 defers it. A concrete colour here would be the engine picking one
         on the player's behalf. */
      assert.equal(e.mana, '{W/U/B/R/G}');
    });
  }

  it('is a mana ability, which is what lets a player tap it for mana', () => {
    const compiled = card('Arcane Signet', 'Artifact', "{T}: Add one mana of any color in your commander's color identity.");
    assert.equal((compiled.abilities[0] as { isManaAbility?: boolean }).isManaAbility, true);
  });

  /* The other half. An unqualified "any color" must still take the enumerated
     five-mode path it always did, and a plain symbol must be untouched. */
  it('does not disturb the cards that were already read', () => {
    const sol = effectsOf('Sol Ring', 'Artifact', '{T}: Add {C}{C}.');
    assert.deepEqual(sol, [{ do: 'add-mana', who: { who: 'you' }, mana: '{C}{C}' }]);

    const any = effectsOf('Chromatic Lantern', 'Artifact', '{T}: Add one mana of any color.');
    assert.equal((any[0] as { do: string }).do, 'choose-mode', 'unqualified "any color" lost its five modes');
  });
});

describe('scry and surveil, which had a DSL member and no rule', () => {
  it('Scry 2 compiles to a scry', () => {
    assert.deepEqual(effectsOf('Preordain-ish', 'Sorcery', 'Scry 2.'), [
      { do: 'scry', who: { who: 'you' }, count: 2 },
    ]);
  });

  it('Surveil 1 compiles to a surveil', () => {
    assert.deepEqual(effectsOf('Thought Scour-ish', 'Instant', 'Surveil 1.'), [
      { do: 'surveil', who: { who: 'you' }, count: 1 },
    ]);
  });

  it('Preordain (rank 219) reads both halves', () => {
    const effects = effectsOf('Preordain', 'Sorcery', 'Scry 2, then draw a card.');
    assert.deepEqual(effects, [
      { do: 'scry', who: { who: 'you' }, count: 2 },
      { do: 'draw', who: { who: 'you' }, count: 1 },
    ]);
  });
});

describe('the second half of a sentence inherits the subject of the first', () => {
  it('Night\'s Whisper (rank 182) makes YOU lose the life', () => {
    assert.deepEqual(effectsOf("Night's Whisper", 'Sorcery', 'You draw two cards and lose 2 life.'), [
      { do: 'draw', who: { who: 'you' }, count: 2 },
      { do: 'lose-life', who: { who: 'you' }, amount: 2 },
    ]);
  });

  /*
   * The card that decides the design. Defaulting the subjectless half to "you"
   * would compile this to the TARGET player drawing and the CASTER losing the
   * life, which is a wrong ability rather than a missing one, and this folder
   * treats those as worse.
   */
  it('Sign in Blood (rank 232) makes the TARGET lose the life, not you', () => {
    const compiled = card('Sign in Blood', 'Sorcery', 'Target player draws two cards and loses 2 life.');
    const ability = compiled.abilities[0] as {
      effects: Array<{ do: string; who?: { who: string; ref?: number } }>;
      targets?: unknown[];
    };
    assert.equal(ability.effects[1].do, 'lose-life');
    assert.equal(ability.effects[1].who?.who, 'target-player');
    /* And ONE target, not two. The subject is carried as a resolved selector
       rather than re-read from the words, so nothing announces a second one. */
    assert.equal(ability.targets?.length, 1, 'the caster would be asked to choose a target twice');
    assert.equal(ability.effects[0].who?.ref, ability.effects[1].who?.ref);
  });

  it('an explicit subject in the second half still wins', () => {
    const effects = effectsOf('Mixed', 'Sorcery', 'Target opponent discards a card and you draw a card.');
    assert.equal((effects[1] as { who: { who: string } }).who.who, 'you');
  });

  it('a first half with no subject carries nothing', () => {
    const effects = effectsOf('Plain', 'Sorcery', 'Destroy target creature and draw a card.');
    assert.equal((effects[1] as { who: { who: string } }).who.who, 'you');
  });
});

describe('searching for "up to" a number', () => {
  it('says the count is the choosing player\'s rather than refusing the card', () => {
    const effects = effectsOf(
      'Disciples of Gix',
      'Creature — Phyrexian Human',
      'When this creature enters, search your library for up to three artifact cards, put them into your graveyard, then shuffle.'
    );
    const search = effects.find(e => (e as { do: string }).do === 'search-library') as { upTo?: boolean };
    assert.ok(search, 'the clause is unread again');
    assert.equal(search.upTo, true);
  });

  it('a fixed count is not marked as a choice', () => {
    const effects = effectsOf(
      'Rampant Growth',
      'Sorcery',
      'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'
    );
    const search = effects.find(e => (e as { do: string }).do === 'search-library') as { upTo?: boolean };
    assert.equal(search.upTo, undefined);
  });
});
