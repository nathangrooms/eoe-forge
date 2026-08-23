/**
 * The producer, tested on the commanders it was getting wrong.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/behaviour.test.ts
 *
 * This file can run the real producer, so the rows below are ORACLE TEXT and
 * nothing here is a hand-written facet list. The text is Scryfall's, quoted
 * only as the input a compiler reads.
 *
 * `readOwnTypeInRules` exists because `scratch/refute-eight.mjs` built decks for
 * eight commanders the earlier tuning never saw, and three of them — Edgar
 * Markov, Lathril and Yuriko — came back with `tribe: null` and a deck of cheap
 * colourless artifacts that was LESS on theme than drawing at random from their
 * own colour pool. The compiler refuses the clause that makes a tribal
 * commander tribal, so the record could not answer "does this card's ability
 * name its own creature type" and the printed text is asked instead.
 *
 * The cases that matter are the NEGATIVE ones, so most of this file is them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { facetsForCard } from './behaviour.ts';

const EDGAR = {
  oracle_id: 'edgar',
  name: 'Edgar Markov',
  type_line: 'Legendary Creature — Vampire Knight',
  mana_cost: '{3}{R}{W}{B}',
  cmc: 6,
  oracle_text:
    'Eminence — Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar Markov attacks, put a +1/+1 counter on each Vampire you control.',
};

const TALRAND = {
  oracle_id: 'talrand',
  name: 'Talrand, Sky Summoner',
  type_line: 'Legendary Creature — Merfolk Wizard',
  mana_cost: '{2}{U}',
  cmc: 3,
  oracle_text:
    'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.',
};

const KAALIA = {
  oracle_id: 'kaalia',
  name: 'Kaalia of the Vast',
  type_line: 'Legendary Creature — Human Cleric',
  mana_cost: '{1}{R}{W}{B}',
  cmc: 4,
  oracle_text:
    'Flying\nWhenever Kaalia of the Vast attacks a player, you may put an Angel, Demon, or Dragon creature card from your hand onto the battlefield tapped and attacking that player.',
};

const YURIKO = {
  oracle_id: 'yuriko',
  name: "Yuriko, the Tiger's Shadow",
  type_line: 'Legendary Creature — Human Ninja',
  mana_cost: '{1}{U}{B}',
  cmc: 3,
  oracle_text:
    'Commander ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand or the command zone tapped and attacking.)\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card’s mana value.',
};

const LATHRIL = {
  oracle_id: 'lathril',
  name: 'Lathril, Blade of the Elves',
  type_line: 'Legendary Creature — Elf Noble',
  mana_cost: '{2}{B}{G}',
  cmc: 4,
  oracle_text:
    'Menace (This creature can’t be blocked except by two or more creatures.)\nWhenever Lathril, Blade of the Elves deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses ten life and you gain ten life.',
};

const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

describe('does this card name its own creature type', () => {
  it('Edgar Markov does, even though the compiler cannot read the clause', () => {
    const f = facets(EDGAR);
    assert.ok(f.includes('sub:vampire'), f.join(' '));
    assert.ok(f.includes('cares:sub:vampire'), f.join(' '));
    // The whole reason this is needed: the record is incomplete and says so.
    assert.ok(f.includes('rec:partial'), f.join(' '));
  });

  it('Lathril does, from "Tap ten untapped Elves", including the irregular plural', () => {
    const f = facets(LATHRIL);
    assert.ok(f.includes('cares:sub:elf'), f.join(' '));
  });

  it('Yuriko does, and "Commander ninjutsu" is not what did it', () => {
    assert.ok(facets(YURIKO).includes('cares:sub:ninja'));
    // Substring matching would have found "Ninja" inside "ninjutsu" and given
    // every ninjutsu creature a tribe it does not have.
    const ninjutsuOnly = {
      ...YURIKO,
      oracle_id: 'ninjutsu-only',
      oracle_text: 'Ninjutsu {1}{U}\nWhenever this creature deals combat damage to a player, draw a card.',
    };
    assert.ok(!facets(ninjutsuOnly).includes('cares:sub:ninja'), facets(ninjutsuOnly).join(' '));
  });

  it('Talrand does NOT, which is the rule this must not break', () => {
    const f = facets(TALRAND);
    assert.ok(f.includes('sub:merfolk'));
    assert.ok(!f.includes('cares:sub:merfolk'), f.join(' '));
    assert.ok(!f.includes('cares:sub:wizard'), f.join(' '));
    // It names a Drake, and a Drake is not one of its own types, so the tribe
    // rule in the engine still comes back null.
    assert.ok(f.includes('tok:drake'));
  });

  it('Kaalia does NOT, because Angel, Demon and Dragon are not her types', () => {
    const f = facets(KAALIA);
    assert.ok(f.includes('sub:human') && f.includes('sub:cleric'));
    for (const facet of f) assert.ok(!facet.startsWith('cares:sub:'), facet);
  });

  it('reminder text does not count as the card naming a tribe', () => {
    // "(This card is every creature type.)" is an explanation of changeling,
    // not a Shapeshifter deck's payoff.
    const changeling = {
      oracle_id: 'changeling',
      name: 'Test Changeling',
      type_line: 'Creature — Shapeshifter',
      mana_cost: '{1}',
      cmc: 1,
      oracle_text: 'Changeling (This card is every creature type.)\nThis creature can’t be blocked.',
    };
    const f = facets(changeling);
    assert.ok(f.includes('sub:shapeshifter'));
    assert.ok(!f.includes('cares:sub:shapeshifter'), f.join(' '));
  });

  it('a card with no rules text is not given a tribe out of nowhere', () => {
    const vanilla = {
      oracle_id: 'vanilla',
      name: 'Grizzly Bears',
      type_line: 'Creature — Bear',
      mana_cost: '{1}{G}',
      cmc: 2,
      oracle_text: null,
    };
    const f = facets(vanilla);
    assert.ok(f.includes('sub:bear'));
    assert.ok(!f.includes('cares:sub:bear'), f.join(' '));
  });

  it('a lord names its own type and is credited for it', () => {
    const lord = {
      oracle_id: 'lord',
      name: 'Test Goblin Lord',
      type_line: 'Creature — Goblin',
      mana_cost: '{2}{R}',
      cmc: 3,
      oracle_text: 'Other Goblins you control get +1/+1 and have haste.',
    };
    assert.ok(facets(lord).includes('cares:sub:goblin'));
  });
});
