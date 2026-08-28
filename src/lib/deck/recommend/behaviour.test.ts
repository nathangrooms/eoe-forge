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

  /*
   * THIS ASSERTION USED TO RUN THE OTHER WAY AND IT WAS WRONG.
   *
   * It read "Kaalia does NOT, because Angel, Demon and Dragon are not her
   * types", and every `cares:sub:` facet was banned. The reasoning was about the
   * TRIBE — she is a Human Cleric and must not come back as an Angel tribal
   * commander — but the assertion was written against the facet, so it also
   * banned the only three facts on the card.
   *
   * What that cost, measured end to end against the live database on
   * 2026-08-28: her build returned 28 creatures containing no Angel, no Demon
   * and no Dragon. Guttersnipe, Firebrand Archer, Electrostatic Field and
   * Purphoros, God of the Forge, off a plan with zero wants.
   *
   * The tribe half of the rule is the half that was right, and it is asserted
   * here and again in `engine/knowledge/behaviour.test.ts`. `tribeOf` reads the
   * type line, so three `cares:sub:` facets cannot make her tribal.
   */
  it('Kaalia names three types she does not have, and the record misses all three', () => {
    const f = facets(KAALIA);
    assert.ok(f.includes('sub:human') && f.includes('sub:cleric'));
    // The compiler returns her flying keyword and refuses the trigger whole, so
    // there is no filter and no selector for the record to read them off.
    assert.ok(f.includes('rec:partial'), f.join(' '));
    for (const sub of ['angel', 'demon', 'dragon']) {
      assert.ok(f.includes(`cares:sub:${sub}`), f.join(' '));
    }
    // And nothing claims she IS one of them, which is what would make a tribe.
    for (const sub of ['angel', 'demon', 'dragon']) {
      assert.ok(!f.includes(`sub:${sub}`), f.join(' '));
    }
  });

  it('a subtype the card only makes a token of is not a subtype it cares about', () => {
    // Talrand's text names Drake once, in "create a 2/2 blue Drake creature
    // token". The compiler already read that clause and said `tok:drake`, so
    // the printed read must not overrule it with a tribe-weight want for Drake
    // CARDS. This is the Talrand rule arriving from the other side.
    const f = facets(TALRAND);
    assert.ok(f.includes('tok:drake'), f.join(' '));
    assert.ok(!f.includes('cares:sub:drake'), f.join(' '));
  });

  it('a card naming itself is not a card naming a subtype', () => {
    // Oracle text spells the card's own name out, and plenty of names contain a
    // subtype word. Without stripping the name first, every copy of this card
    // in the pool would claim to be a Devils payoff.
    const devilsPlay = {
      oracle_id: 'devils-play',
      name: "Devil's Play",
      type_line: 'Sorcery',
      mana_cost: '{X}{R}',
      cmc: 1,
      oracle_text: "Devil's Play deals X damage to any target.\nFlashback {X}{R}{R}{R}",
    };
    const f = facets(devilsPlay);
    assert.ok(!f.includes('cares:sub:devil'), f.join(' '));
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

/**
 * A filter is a filter wherever it sits.
 *
 * `readAbility` walked the compiled ability by hand, and it only reached a
 * filter in the positions somebody had remembered to visit. Measured over all
 * 31,833 commander-legal rows by `scratch/filter-position-census.mjs`: 9,127
 * carry a type or subtype filter somewhere in their record and 1,430 of them
 * had at least one dropped. `readCaresFilters` sweeps the whole ability.
 *
 * Every row below is a real card and its real oracle text, and each one names
 * the position that used to be missed. They are here rather than in a table
 * because a position nobody visits is exactly the thing a hand-written list of
 * positions cannot catch.
 */
describe('a type or subtype filter is read wherever it sits', () => {
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  it('reads the object an effect acts on, when the effect is look-and-pick', () => {
    /*
     * `search-library`, `destroy`, `pump` and nine other verbs hand their
     * selector to `readSelector`, so their object filter was already read.
     * `look-and-pick` carries a bare `CardFilter` instead of a selector and was
     * the one effect whose object was dropped: 55 cards in the catalogue.
     *
     * THE REAL ORACLE ID IS LOAD-BEARING HERE and a fabricated one makes this
     * test pass for the wrong reason. Every `look-and-pick` in the catalogue
     * comes from the ported XMage record and none from the oracle-text compiler
     * (`scratch/find-lap.mjs` looks for a compiler-built one and finds zero of
     * them), so the swap in `facetsForCard` has to find this card's record, and
     * `xmageSwapFor` finds it by oracle id.
     */
    const memorial = {
      oracle_id: 'a74494ef-aa35-4830-9b4c-47bff5270efc',
      name: 'Memorial to Unity',
      type_line: 'Land',
      cmc: 0,
      // Current templating, verbatim from the catalogue. The pre-2024 spelling
      // named the card instead of saying "this land" and the compiler refuses
      // the clause, which is `normalize.ts` lesson four doing its job.
      oracle_text:
        'This land enters tapped.\n{T}: Add {G}.\n{2}{G}, {T}, Sacrifice this land: Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Then put the rest on the bottom of your library in a random order.',
    };
    assert.ok(facets(memorial).includes('cares:type:creature'), facets(memorial).join(' '));
  });

  it('reads a filter in an activation cost', () => {
    // "Sacrifice a creature:" is what a sac outlet is, and 497 cards carried a
    // filter only there. Phyrexian Tower had no `cares:` facet at all.
    const tower = {
      oracle_id: 'phyrexian-tower',
      name: 'Phyrexian Tower',
      type_line: 'Legendary Land',
      cmc: 0,
      oracle_text: '{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}.',
    };
    assert.ok(facets(tower).includes('cares:type:creature'), facets(tower).join(' '));
  });

  it('reads a filter inside a count expression', () => {
    // "for each creature you control" is the whole card. 238 cards carried a
    // filter only inside a `ValueExpr`.
    const cradle = {
      oracle_id: 'gaeas-cradle',
      name: "Gaea's Cradle",
      type_line: 'Legendary Land',
      cmc: 0,
      oracle_text: '{T}: Add {G} for each creature you control.',
    };
    assert.ok(facets(cradle).includes('cares:type:creature'), facets(cradle).join(' '));
  });

  it('reads a filter inside a static modification', () => {
    // Helm of the Gods is an enchantments-matter card whose only statement
    // about enchantments is the multiplier on a +1/+1. 204 cards were like it.
    const helm = {
      oracle_id: 'helm-of-the-gods',
      name: 'Helm of the Gods',
      type_line: 'Artifact — Equipment',
      cmc: 2,
      oracle_text:
        'Equipped creature gets +1/+1 for each enchantment you control.\nEquip {1}',
    };
    assert.ok(facets(helm).includes('cares:type:enchantment'), facets(helm).join(' '));
  });

  it('reads a filter on a trigger the hand walk did not visit', () => {
    /*
     * THE BRIEF SAID TRIGGER FILTERS WERE THE ONES BEING READ. Measured, the
     * reader visited `event.who` and `event.what` and never `event.source`, so
     * 67 cards lost a filter in the position the brief called the working one.
     */
    const grenzo = {
      oracle_id: 'grenzo-havoc-raiser',
      name: 'Grenzo, Havoc Raiser',
      type_line: 'Legendary Creature — Goblin Rogue',
      cmc: 3,
      oracle_text:
        "Whenever a creature you control deals combat damage to a player, choose one —\n• Goad target creature that player controls.\n• Exile the top card of that player's library. Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.",
    };
    assert.ok(facets(grenzo).includes('cares:type:creature'), facets(grenzo).join(' '));
  });

  it('a basic land type in a filter still cannot make a commander tribal', () => {
    /*
     * The sweep reaches the condition on a check land, so Woodland Cemetery now
     * says it cares about Swamps and Forests, which is true of the card. The
     * guard that matters is one layer up and it is not weakened by this: the
     * engine's `tribeOf` only accepts a subtype that is ALSO on the card's own
     * type line, and no legendary creature is printed as a Swamp. Measured
     * across all 3,653 legendary creatures and planeswalkers in the catalogue
     * (`scratch/cares-sweep-reach.mjs`): 132 gained a facet, 73 gained a want,
     * and 0 changed tribe.
     */
    const cemetery = {
      oracle_id: 'woodland-cemetery',
      name: 'Woodland Cemetery',
      type_line: 'Land',
      cmc: 0,
      oracle_text:
        'This land enters tapped unless you control a Swamp or a Forest.\n{T}: Add {B} or {G}.',
    };
    const f = facets(cemetery);
    assert.ok(f.includes('cares:sub:swamp'), f.join(' '));
    assert.ok(f.includes('cares:sub:forest'), f.join(' '));
    // And it is not a Swamp, so nothing here can become a tribe.
    assert.ok(!f.includes('sub:swamp'), f.join(' '));
  });

  it('adds only cares facets, and never removes one', () => {
    /*
     * The property that made this safe to land on a vocabulary five files read.
     * The sweep emits `cares:type:` and `cares:sub:` and nothing else — no
     * `kw:` from a keyword filter, no `ctr:`, no `scope:all` — so a card's
     * facet set can only grow. Verified over the whole catalogue by
     * `scratch/cares-sweep-reach.mjs`: 1,094 rows grew, 0 shrank.
     *
     * Talrand is the guard here because his rules are the ones the earlier
     * fixes were written around: he must still not care about Merfolk, and the
     * Drake he makes a token of must still be `tok:` and not `cares:sub:`.
     */
    const f = facets(TALRAND);
    assert.ok(f.includes('tok:drake'), f.join(' '));
    assert.ok(!f.includes('cares:sub:drake'), f.join(' '));
    assert.ok(!f.includes('cares:sub:merfolk'), f.join(' '));
    assert.ok(f.includes('cares:type:instant'), f.join(' '));
    assert.ok(f.includes('cares:type:sorcery'), f.join(' '));
  });
});
