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
import { cardRole } from '../../../engine/advise/roles.ts';

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

/*
 * "X, then you may Y" — Chulane's shape.
 *
 * The compound landed whole in `manual`, so Chulane, Teller of Tales carried
 * `eff:move-zone` from his bounce ability and nothing about the trigger he is
 * built around. The second half compiles to `return-from` with `zone: 'hand'`,
 * and the point of these cases is that the facet layer does NOT read that as
 * `eff:return-from`, which is the `draw` role and means recursion.
 */
describe('a card put from the hand onto the battlefield', () => {
  const CHULANE = {
    oracle_id: 'chulane',
    name: 'Chulane, Teller of Tales',
    type_line: 'Legendary Creature — Human Druid',
    mana_cost: '{2}{G}{W}{U}',
    cmc: 5,
    oracle_text:
      'Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.\n{3}, {T}: Return target creature you control to its owner\'s hand.',
  };

  it('Chulane is a cast trigger that draws and drops a land', () => {
    const f = facets(CHULANE);
    for (const want of ['trig:cast', 'cares:type:creature', 'eff:draw', 'cares:type:land', 'cares:zone:hand', 'eff:extra-land-drop', 'rec:full']) {
      assert.ok(f.includes(want), `${want} missing from ${f.join(' ')}`);
    }
    assert.ok(!f.includes('eff:return-from'), `a land from the hand is not recursion: ${f.join(' ')}`);
    assert.ok(!f.includes('eff:put-onto-battlefield'), `a land is an extra land drop, not a cheat: ${f.join(' ')}`);
  });

  it('Sakura-Tribe Scout is an extra land drop and not card advantage', () => {
    const f = facets({
      oracle_id: 'scout',
      name: 'Sakura-Tribe Scout',
      type_line: 'Creature — Snake Shaman Scout',
      mana_cost: '{G}',
      cmc: 1,
      oracle_text: '{T}: You may put a land card from your hand onto the battlefield.',
    });
    assert.ok(f.includes('eff:extra-land-drop'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
    assert.ok(!f.includes('eff:return-from'), f.join(' '));
  });

  it('Elvish Piper cheats a creature in, which is its own word', () => {
    const f = facets({
      oracle_id: 'piper',
      name: 'Elvish Piper',
      type_line: 'Creature — Elf Shaman',
      mana_cost: '{3}{G}',
      cmc: 4,
      oracle_text: '{G}, {T}: You may put a creature card from your hand onto the battlefield.',
    });
    assert.ok(f.includes('eff:put-onto-battlefield'), f.join(' '));
    assert.ok(f.includes('cares:type:creature'), f.join(' '));
    assert.ok(f.includes('cares:zone:hand'), f.join(' '));
    assert.ok(!f.includes('eff:extra-land-drop'), f.join(' '));
    assert.ok(!f.includes('eff:return-from'), f.join(' '));
  });

  it('"a creature or land card" is both', () => {
    const f = facets({
      oracle_id: 'court',
      name: 'Court Mode',
      type_line: 'Enchantment',
      mana_cost: '{3}{G}',
      cmc: 4,
      oracle_text: 'At the beginning of your upkeep, you may put a creature or land card from your hand onto the battlefield.',
    });
    assert.ok(f.includes('eff:extra-land-drop'), f.join(' '));
    assert.ok(f.includes('eff:put-onto-battlefield'), f.join(' '));
  });

  it('recursion out of the graveyard is untouched', () => {
    const f = facets({
      oracle_id: 'regrowth',
      name: 'Regrowth',
      type_line: 'Sorcery',
      mana_cost: '{1}{G}',
      cmc: 2,
      oracle_text: 'Return target card from your graveyard to your hand.',
    });
    assert.ok(f.includes('eff:return-from'), f.join(' '));
    assert.ok(f.includes('cares:zone:graveyard'), f.join(' '));
    assert.ok(!f.includes('eff:put-onto-battlefield'), f.join(' '));
  });
});

describe('does this card name its own creature type', () => {
  it('Edgar Markov does, even though the compiler cannot read the clause', () => {
    const f = facets(EDGAR);
    assert.ok(f.includes('sub:vampire'), f.join(' '));
    assert.ok(f.includes('cares:sub:vampire'), f.join(' '));
    // The whole reason this is needed: the record is incomplete and says so.
    assert.ok(f.includes('rec:partial'), f.join(' '));
  });

  it('Edgar Markov: the eminence trigger is read under its intervening "if"', () => {
    // "Eminence — Whenever you cast another Vampire spell, if ~ is in the
    // command zone or on the battlefield, create a 1/1 black Vampire creature
    // token." The label is stripped, the condition comes off the body as a
    // marker, and the trigger underneath compiles as it would without either.
    // Every facet here is a true fact about the card for a deck; the marker is
    // what keeps `rec:partial`, because the condition is still not something
    // the engine can check.
    const f = facets(EDGAR);
    for (const want of ['trig:cast', 'cares:sub:vampire', 'eff:create-token', 'tok:vampire']) {
      assert.ok(f.includes(want), `${want} missing from ${f.join(' ')}`);
    }
    assert.ok(f.includes('rec:partial'), f.join(' '));
    assert.ok(!f.includes('rec:full'), f.join(' '));
  });

  it('Edgar Markov, as the catalogue prints him, reads his attack trigger', () => {
    // The `cards` row says "Whenever Edgar attacks", the short form, and the
    // name has no comma to cut a short form at. Until `selfNames` offered the
    // first word of a Firstname Lastname legend, "edgar" stood where "~" goes
    // and the whole clause was refused — a clause the compiler reads on Cordial
    // Vampire word for word. The facets that clause carries are what key a
    // Vampire deck to him, and they were absent.
    const f = facets({
      ...EDGAR,
      oracle_id: 'edgar-short-form',
      oracle_text:
        'Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.',
    });
    for (const want of ['trig:attacks', 'ctr:+1/+1', 'eff:add-counters', 'cares:sub:vampire', 'scope:all']) {
      assert.ok(f.includes(want), `${want} missing from: ${f.join(' ')}`);
    }
    // Eminence is still unread, and the record must still say so.
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

const FEATHER = {
  oracle_id: 'feather',
  name: 'Feather, the Redeemed',
  type_line: 'Legendary Creature — Angel',
  mana_cost: '{R}{W}{W}',
  cmc: 3,
  oracle_text:
    'Flying\nWhenever you cast an instant or sorcery spell that targets a creature you control, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.',
};

const ZADA = {
  oracle_id: 'zada',
  name: 'Zada, Hedron Grinder',
  type_line: 'Legendary Creature — Goblin Ally',
  mana_cost: '{3}{R}',
  cmc: 4,
  oracle_text:
    'Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
};

describe('a cast trigger that says what the spell targets', () => {
  /*
   * Before the compiler read this shape, Feather's record was her flying
   * keyword and nothing else: the clause "that targets a creature you control"
   * made the whole trigger refuse, and `rec:partial` with no `trig:cast` is a
   * commander the plan rules cannot key a single card off. The relative
   * clause is a filter on the spell now, so the sweep that reads every filter
   * finds "creature you control" inside it the way it finds any other.
   */
  it('Feather wants instants, sorceries AND creatures, off the trigger alone', () => {
    const f = facets(FEATHER);
    assert.ok(f.includes('trig:cast'), f.join(' '));
    assert.ok(f.includes('cares:type:instant'), f.join(' '));
    assert.ok(f.includes('cares:type:sorcery'), f.join(' '));
    assert.ok(f.includes('cares:type:creature'), f.join(' '));
    // The replacement-and-return is still a marker, and the record says so.
    assert.ok(f.includes('rec:partial'), f.join(' '));
  });

  it('Zada (targets only ~) wants instants and sorceries, and the "only ~" adds no creature want', () => {
    const f = facets(ZADA);
    assert.ok(f.includes('trig:cast'), f.join(' '));
    assert.ok(f.includes('cares:type:instant'), f.join(' '));
    assert.ok(f.includes('cares:type:sorcery'), f.join(' '));
    assert.ok(!f.includes('cares:type:creature'), f.join(' '));
  });
});

describe('a dig is read, and a negated filter is the complement', () => {
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  const KINNAN = {
    oracle_id: 'kinnan-bonder-prodigy',
    name: 'Kinnan, Bonder Prodigy',
    type_line: 'Legendary Creature — Human Druid',
    mana_cost: '{G}{U}',
    cmc: 2,
    oracle_text:
      'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n' +
      '{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.',
  };

  it('Kinnan: a dig onto the battlefield reads the library and the creature filter', () => {
    /*
     * The first compiler-built `look-and-pick` in the catalogue. Before the
     * `dig` rule Kinnan carried no `eff:` facet at all: the tap trigger is
     * still unread and the dig was a named manual. `cares:zone:library` is
     * what the "plays cards straight off the top of your library" plan rules
     * ask for, and this member carries no selector, so the zone is said by
     * the effect reader itself.
     */
    const f = facets(KINNAN);
    assert.ok(f.includes('eff:look-and-pick'), f.join(' '));
    assert.ok(f.includes('cares:zone:library'), f.join(' '));
    assert.ok(f.includes('cares:type:creature'), f.join(' '));
  });

  it('Kinnan: "non-Human" does not make a Human care about Humans', () => {
    /*
     * Two readers used to say `cares:sub:human` here. The word scan, because
     * he is a Human and the word appears in his text; and the filter sweep,
     * because it walked into the `not`. Either one was enough for `tribeOf`
     * to call him a Human tribal commander, so his deck wanted the one
     * creature type his ability refuses to put onto the battlefield.
     */
    const f = facets(KINNAN);
    assert.ok(!f.includes('cares:sub:human'), f.join(' '));
    assert.ok(f.includes('sub:human'), f.join(' ')); // he IS a Human; that is not in question
  });

  it('a negated type filter names what the card is not about', () => {
    // Cyclonic Rift bounces NONLAND permanents. Measured over the 3,000 most
    // played cards, 92 lose a facet of this shape and none gains one.
    const rift = {
      oracle_id: 'cyclonic-rift',
      name: 'Cyclonic Rift',
      type_line: 'Instant',
      mana_cost: '{1}{U}',
      cmc: 2,
      oracle_text:
        "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of \"target\" with \"each.\")",
    };
    const f = facets(rift);
    assert.ok(f.includes('eff:move-zone'), f.join(' '));
    assert.ok(!f.includes('cares:type:land'), f.join(' '));
  });
});

describe('a permission to play or cast out of the graveyard', () => {
  /*
   * `eff:play-from-graveyard` was declared, wired into `ramp`, and produced by
   * nothing; CLAUDE.md lists it as the fifth instance of that shape. These are
   * the cards the `may-play-from` static now reads, and the split between the
   * two verbs is the point: a land permission is ramp and a spell permission is
   * a second hand, and one word for both would have filed Karador as ramp.
   */
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  const MULDROTHA = {
    oracle_id: 'muldrotha',
    name: 'Muldrotha, the Gravetide',
    type_line: 'Legendary Creature — Elemental Avatar',
    mana_cost: '{3}{B}{G}{U}',
    cmc: 6,
    oracle_text:
      'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent types, choose one as you play it.)',
  };

  const CRUCIBLE = {
    oracle_id: 'crucible',
    name: 'Crucible of Worlds',
    type_line: 'Artifact',
    mana_cost: '{3}',
    cmc: 3,
    oracle_text: 'You may play lands from your graveyard.',
  };

  const KARADOR = {
    oracle_id: 'karador',
    name: 'Karador, Ghost Chieftain',
    type_line: 'Legendary Creature — Centaur Spirit',
    mana_cost: '{5}{W}{B}{G}',
    cmc: 8,
    oracle_text:
      'This spell costs {1} less to cast for each creature card in your graveyard.\nOnce during each of your turns, you may cast a creature spell from your graveyard.',
  };

  const GRAVECRAWLER = {
    oracle_id: 'gravecrawler',
    name: 'Gravecrawler',
    type_line: 'Creature — Zombie',
    mana_cost: '{B}',
    cmc: 1,
    oracle_text: "This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie.",
  };

  it('Muldrotha is read whole, and plays lands AND casts spells out of the graveyard', () => {
    const f = facets(MULDROTHA);
    assert.ok(f.includes('eff:play-from-graveyard'), f.join(' '));
    assert.ok(f.includes('eff:cast-from-graveyard'), f.join(' '));
    assert.ok(f.includes('cares:zone:graveyard'), f.join(' '));
    // The whole card, not a fallback: this is what lets the facet rules plan
    // for her instead of the English reader.
    assert.ok(f.includes('rec:full'), f.join(' '));
  });

  it('Crucible of Worlds plays lands and casts nothing', () => {
    const f = facets(CRUCIBLE);
    assert.ok(f.includes('eff:play-from-graveyard'), f.join(' '));
    assert.ok(!f.includes('eff:cast-from-graveyard'), f.join(' '));
    assert.ok(f.includes('cares:zone:graveyard'), f.join(' '));
  });

  it('Karador casts creatures and plays no lands', () => {
    const f = facets(KARADOR);
    assert.ok(f.includes('eff:cast-from-graveyard'), f.join(' '));
    assert.ok(!f.includes('eff:play-from-graveyard'), f.join(' '));
    assert.ok(f.includes('cares:zone:graveyard'), f.join(' '));
    assert.ok(f.includes('cares:type:creature'), f.join(' '));
  });

  it('Gravecrawler casting ITSELF is an alternative cost, not a graveyard engine', () => {
    const f = facets(GRAVECRAWLER);
    assert.ok(!f.includes('eff:cast-from-graveyard'), f.join(' '));
    assert.ok(!f.includes('eff:play-from-graveyard'), f.join(' '));
  });
});

describe('tapping a permanent for mana', () => {
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  const KINNAN = {
    oracle_id: 'kinnan',
    name: 'Kinnan, Bonder Prodigy',
    type_line: 'Legendary Creature — Human Druid',
    mana_cost: '{G}{U}',
    cmc: 2,
    oracle_text:
      'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n' +
      '{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.',
  };

  it('Kinnan is a mana commander: the trigger and the mana it adds are both read', () => {
    /*
     * Before the `tapped-for-mana` event existed his record was empty and the
     * plan said he "tells us nothing but its stats", so the deck armed him with
     * Equipment. The trigger is the whole card.
     */
    const f = facets(KINNAN);
    assert.ok(f.includes('trig:tapped-for-mana'), f.join(' '));
    assert.ok(f.includes('eff:add-mana'), f.join(' '));
    assert.ok(f.includes('mana:1'), f.join(' '));
  });

  it('"nonland" is not about lands and "non-Human" is not a Human who counts Humans', () => {
    /*
     * Both were true of Kinnan the moment he had a record: `cares:type:land`
     * from the `not` filter in "nonland permanent", and `cares:sub:human` from
     * the word scan reading "non-Human", which made him a Human tribal
     * commander at weight 1.0 with a plan that said he "triggers on land
     * spells". A negation names what the card does NOT touch.
     */
    const f = facets(KINNAN);
    assert.ok(!f.includes('cares:type:land'), f.join(' '));
    assert.ok(!f.includes('cares:sub:human'), f.join(' '));

    const negate = facets({
      oracle_id: 'negate', name: 'Negate', type_line: 'Instant', mana_cost: '{1}{U}', cmc: 2,
      oracle_text: 'Counter target noncreature spell.',
    });
    assert.ok(negate.includes('eff:counter'), negate.join(' '));
    assert.ok(!negate.includes('cares:type:creature'), negate.join(' '));

    // And the affirmative form still names its tribe: Krenko counts Goblins.
    const krenko = facets({
      oracle_id: 'krenko', name: 'Krenko, Mob Boss', type_line: 'Legendary Creature — Goblin Warrior',
      mana_cost: '{2}{R}{R}', cmc: 4,
      oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    });
    assert.ok(krenko.includes('cares:sub:goblin'), krenko.join(' '));
  });

  it('a mana doubler is ramp, and the auras that add a mana are ramp with the trigger', () => {
    const reflection = facets({
      oracle_id: 'reflection', name: 'Mana Reflection', type_line: 'Enchantment', mana_cost: '{4}{G}{G}', cmc: 6,
      oracle_text: 'If you tap a permanent for mana, it produces twice as much of that mana instead.',
    });
    assert.ok(reflection.includes('eff:add-mana'), reflection.join(' '));
    // A replacement is not a trigger, and "twice as much" is not a number.
    assert.ok(!reflection.includes('trig:tapped-for-mana'), reflection.join(' '));
    assert.ok(!reflection.some(x => x.startsWith('mana:')), reflection.join(' '));

    const growth = facets({
      oracle_id: 'growth', name: 'Wild Growth', type_line: 'Enchantment — Aura', mana_cost: '{G}', cmc: 1,
      oracle_text: 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.',
    });
    assert.ok(growth.includes('trig:tapped-for-mana'), growth.join(' '));
    assert.ok(growth.includes('eff:add-mana'), growth.join(' '));
    assert.ok(growth.includes('mana:1'), growth.join(' '));
  });
});

describe('a revealed draw: "reveal the top card of your library and put that card into your hand"', () => {
  /*
   * Yuriko is the payoff of a whole archetype and until this shape was read
   * her trigger produced `trig:deals-damage` and `cares:sub:ninja` and nothing
   * about what the trigger DOES: both sentences were manual markers. The draw
   * is card advantage, the life loss is the wincon, and the top of the library
   * is what the deck is built to arrange.
   */
  it('Yuriko draws, drains each opponent, and cares what is on top of her library', () => {
    const f = facets(YURIKO);
    for (const want of ['trig:deals-damage', 'cares:sub:ninja', 'eff:draw', 'eff:lose-life', 'cares:zone:library']) {
      assert.ok(f.includes(want), `${want} missing from: ${f.join(' ')}`);
    }
    // Aimed at you, not at the table: a revealed draw is not group hug.
    assert.ok(!f.includes('eff:draw-each'), f.join(' '));
  });

  it('Dark Confidant reads the same way, and a plain draw does not care about the library', () => {
    const bob = facets({
      oracle_id: 'dark-confidant',
      name: 'Dark Confidant',
      type_line: 'Creature — Human Wizard',
      mana_cost: '{1}{B}',
      cmc: 2,
      oracle_text:
        'At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.',
    });
    for (const want of ['eff:draw', 'eff:lose-life', 'cares:zone:library', 'rec:full']) {
      assert.ok(bob.includes(want), `${want} missing from: ${bob.join(' ')}`);
    }
    const arena = facets({
      oracle_id: 'phyrexian-arena',
      name: 'Phyrexian Arena',
      type_line: 'Enchantment',
      mana_cost: '{1}{B}{B}',
      cmc: 3,
      oracle_text: 'At the beginning of your upkeep, you draw a card and you lose 1 life.',
    });
    assert.ok(arena.includes('eff:draw'), arena.join(' '));
    assert.ok(!arena.includes('cares:zone:library'), arena.join(' '));
  });
});

describe('a pump sized by a creature\'s power wants big creatures', () => {
  /*
   * `cares:power` was declared in the vocabulary for "power 4 or greater"
   * filters and nothing emitted it. Xenagos is the card that made the gap
   * visible: for weeks he read as `trig:step` and nothing else, and once the
   * compiler could read "gets +X/+X, where X is that creature's power" the
   * facet layer still had no word for what the pump is worth more WITH.
   */
  it('Xenagos doubles what he points at, so he cares about power', () => {
    const f = facets({
      oracle_id: 'xenagos',
      name: 'Xenagos, God of Revels',
      type_line: 'Legendary Enchantment Creature — God',
      mana_cost: '{3}{R}{G}',
      cmc: 5,
      oracle_text:
        "Indestructible\nAs long as your devotion to red and green is less than seven, Xenagos isn't a creature.\nAt the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power.",
    });
    assert.ok(f.includes('eff:pump'), f.join(' '));
    assert.ok(f.includes('grants:haste'), f.join(' '));
    assert.ok(f.includes('cares:power'), f.join(' '));
  });

  it('a flat +3/+3 does not care how big the creature was', () => {
    const f = facets({
      oracle_id: 'giant-growth',
      name: 'Giant Growth',
      type_line: 'Instant',
      mana_cost: '{G}',
      cmc: 1,
      oracle_text: 'Target creature gets +3/+3 until end of turn.',
    });
    assert.ok(f.includes('eff:pump'), f.join(' '));
    assert.ok(!f.includes('cares:power'), f.join(' '));
  });
});

describe('bouncing your own permanent is not bouncing theirs', () => {
  /*
   * Chulane's activated ability and Cyclonic Rift both compile to `move-zone`
   * to hand. Until the verb split, both carried `eff:move-zone`, so a plan
   * asking for creatures that come back to be cast again could only ask for
   * the facet every blue removal-shaped bounce also carries. Oracle text is
   * verbatim from `cards_unique`.
   */
  const CHULANE = {
    oracle_id: 'chulane',
    name: 'Chulane, Teller of Tales',
    type_line: 'Legendary Creature — Human Druid',
    mana_cost: '{2}{G}{W}{U}',
    cmc: 5,
    oracle_text:
      "Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.\n{3}, {T}: Return target creature you control to its owner's hand.",
  };

  it('Chulane bounces his own creature', () => {
    const f = facets(CHULANE);
    assert.ok(f.includes('eff:bounce-own'), f.join(' '));
    assert.ok(!f.includes('eff:move-zone'), f.join(' '));
  });

  it("Cyclonic Rift and Unsummon bounce somebody else's", () => {
    const rift = facets({
      oracle_id: 'rift', name: 'Cyclonic Rift', type_line: 'Instant', mana_cost: '{1}{U}', cmc: 2,
      oracle_text:
        "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
    });
    assert.ok(rift.includes('eff:move-zone'), rift.join(' '));
    assert.ok(!rift.includes('eff:bounce-own'), rift.join(' '));

    // Unsummon names no controller at all. Unknown stays unknown: it is not
    // yours and it is not theirs, and the plain verb is the honest one.
    const unsummon = facets({
      oracle_id: 'unsummon', name: 'Unsummon', type_line: 'Instant', mana_cost: '{U}', cmc: 1,
      oracle_text: "Return target creature to its owner's hand.",
    });
    assert.ok(unsummon.includes('eff:move-zone'), unsummon.join(' '));
    assert.ok(!unsummon.includes('eff:bounce-own'), unsummon.join(' '));
  });

  it('the named marker on Whitemane Lion reads as the same facet', () => {
    // The compiler refuses to pick which creature; the marker is named so the
    // facet layer still knows what the card is for.
    const lion = facets({
      oracle_id: 'lion', name: 'Whitemane Lion', type_line: 'Creature — Cat', mana_cost: '{1}{W}', cmc: 2,
      oracle_text: "Flash\nWhen this creature enters, return a creature you control to its owner's hand.",
    });
    assert.ok(lion.includes('eff:bounce-own'), lion.join(' '));
    assert.ok(lion.includes('rec:partial'), lion.join(' '));
  });

  it('a card returning itself to hand is bouncing its own side', () => {
    const batterskull = facets({
      oracle_id: 'batterskull', name: 'Batterskull', type_line: 'Artifact — Equipment', mana_cost: '{5}', cmc: 5,
      oracle_text:
        "Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +4/+4 and has vigilance and lifelink.\n{3}: Return this Equipment to its owner's hand.\nEquip {5}",
    });
    assert.ok(batterskull.includes('eff:bounce-own'), batterskull.join(' '));
    assert.ok(!batterskull.includes('eff:move-zone'), batterskull.join(' '));
  });

  it('a karoo bouncing a land carries neither', () => {
    const karoo = facets({
      oracle_id: 'karoo', name: 'Simic Growth Chamber', type_line: 'Land', cmc: 0,
      oracle_text: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{U}.",
    });
    assert.ok(!karoo.includes('eff:bounce-own'), karoo.join(' '));
    assert.ok(!karoo.includes('eff:move-zone'), karoo.join(' '));
  });

  it('a bounce paid as a cost is read as a cost, with what it bounces', () => {
    const symbiote = facets({
      oracle_id: 'symbiote', name: 'Wirewood Symbiote', type_line: 'Creature — Insect', mana_cost: '{G}', cmc: 1,
      oracle_text: "Return an Elf you control to its owner's hand: Untap target creature. Activate only once each turn.",
    });
    assert.ok(symbiote.includes('cost:return-to-hand'), symbiote.join(' '));
    assert.ok(symbiote.includes('cares:sub:elf'), symbiote.join(' '));
  });
});

describe('a grant of protection is grants:protection, whichever colour the table picks', () => {
  /*
   * The `protection` role asks for `grants:protection` by name, and a keyword
   * LINE reading "Protection from red" has always been `kw:protection` with
   * the parameter left off. A grant of the same thing has to fold the same
   * way, or Gods Willing — whose grant is a colour nobody has chosen yet —
   * would carry `grants:protection from the chosen color` and serve no role.
   */
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  it('Gods Willing grants protection and chooses a colour, and no facet carries the colour', () => {
    const f = facets({
      oracle_id: 'gods-willing',
      name: 'Gods Willing',
      type_line: 'Instant',
      mana_cost: '{W}',
      cmc: 1,
      oracle_text:
        "Target creature you control gains protection from the color of your choice until end of turn. (It can't be blocked, targeted, dealt damage, enchanted, or equipped by anything of that color.)\nScry 1.",
    });
    assert.ok(f.includes('grants:protection'), f.join(' '));
    assert.ok(f.includes('kw:protection'), f.join(' '));
    assert.ok(f.includes('eff:choose'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
    assert.ok(!f.some((x) => x.startsWith('grants:protection ')), f.join(' '));
  });

  it('a printed colour folds the same way', () => {
    const f = facets({
      oracle_id: 'crimson-acolyte',
      name: 'Crimson Acolyte',
      type_line: 'Creature — Human Cleric',
      mana_cost: '{1}{W}',
      cmc: 2,
      oracle_text: 'Protection from red\n{W}: Target creature gains protection from red until end of turn.',
    });
    assert.ok(f.includes('grants:protection'), f.join(' '));
    assert.ok(!f.some((x) => x.startsWith('grants:protection ')), f.join(' '));
  });
});

describe("the wheel, read by the compiler and said in the Tagger's word", () => {
  const WHEEL_OF_FORTUNE = {
    oracle_id: 'wheel-of-fortune',
    name: 'Wheel of Fortune',
    type_line: 'Sorcery',
    mana_cost: '{2}{R}',
    cmc: 3,
    oracle_text: 'Each player discards their hand, then draws seven cards.',
  };

  it('Wheel of Fortune carries eff:wheel, scope:all and cares:zone:hand from its own record', () => {
    // `tag_facet_map.wheel-symmetrical` supplies exactly these words for the
    // same card. The compiler reading it must not lose any of them.
    const f = facets(WHEEL_OF_FORTUNE);
    assert.ok(f.includes('eff:wheel'), f.join(' '));
    assert.ok(f.includes('scope:all'), f.join(' '));
    assert.ok(f.includes('cares:zone:hand'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
    // The aim rules are untouched: the discard reaches opponents, the draw is
    // everybody's.
    assert.ok(f.includes('eff:discard'), f.join(' '));
    assert.ok(f.includes('eff:draw-each'), f.join(' '));
  });

  it('Mindslicer empties every hand and refills none, so it is not a wheel', () => {
    const f = facets({
      oracle_id: 'mindslicer',
      name: 'Mindslicer',
      type_line: 'Creature — Horror',
      mana_cost: '{2}{B}{B}',
      cmc: 4,
      oracle_text: 'When this creature dies, each player discards their hand.',
    });
    assert.ok(f.includes('cares:zone:hand'), f.join(' '));
    assert.ok(!f.includes('eff:wheel'), f.join(' '));
    assert.ok(!f.includes('scope:all'), f.join(' '));
  });

  it('Tolarian Winds is one-sided, so it is a refill and not a wheel', () => {
    // The Tagger agrees: `wheel-one-sided` carries no `eff:wheel`.
    const f = facets({
      oracle_id: 'tolarian-winds',
      name: 'Tolarian Winds',
      type_line: 'Instant',
      mana_cost: '{1}{U}',
      cmc: 2,
      oracle_text: 'Discard all the cards in your hand, then draw that many cards.',
    });
    assert.ok(f.includes('eff:discard-self'), f.join(' '));
    assert.ok(f.includes('cares:zone:hand'), f.join(' '));
    assert.ok(!f.includes('eff:wheel'), f.join(' '));
  });

  it('Burning Inquiry draws and discards a NUMBER, which is looting for the table, not a wheel', () => {
    const f = facets({
      oracle_id: 'burning-inquiry',
      name: 'Burning Inquiry',
      type_line: 'Sorcery',
      mana_cost: '{R}',
      cmc: 1,
      oracle_text: 'Each player draws three cards, then discards three cards at random.',
    });
    assert.ok(f.includes('eff:draw-each'), f.join(' '));
    assert.ok(!f.includes('eff:wheel'), f.join(' '));
    assert.ok(!f.includes('cares:zone:hand'), f.join(' '));
  });

  it('Windfall: the draw is a marker, so the record claims the discard and nothing it did not read', () => {
    // The Tagger's gated `wheel-symmetrical` still supplies `eff:wheel` for
    // this card in `cards_pool`; the compiler must not claim a draw it could
    // not count.
    const f = facets({
      oracle_id: 'windfall',
      name: 'Windfall',
      type_line: 'Sorcery',
      mana_cost: '{2}{U}',
      cmc: 3,
      oracle_text: 'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.',
    });
    assert.ok(f.includes('cares:zone:hand'), f.join(' '));
    assert.ok(!f.includes('eff:draw-each'), f.join(' '));
    assert.ok(!f.includes('eff:wheel'), f.join(' '));
  });
});

/**
 * Impulse draw is red's card draw, and for two sentences' worth of reason it
 * carried no facet at all. Oracle text verbatim from `cards_unique`.
 */
describe('impulse draw is its own verb and never removal', () => {
  const facets = (row: Parameters<typeof facetsForCard>[0]) => facetsForCard(row).facets;

  it('Light Up the Stage reads as impulse plus the exile zone, and not as exile', () => {
    const f = facets({
      oracle_id: 'light-up-the-stage',
      name: 'Light Up the Stage',
      type_line: 'Sorcery',
      cmc: 3,
      oracle_text:
        'Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nExile the top two cards of your library. Until the end of your next turn, you may play those cards.',
    });
    assert.ok(f.includes('eff:impulse'), f.join(' '));
    assert.ok(f.includes('cares:zone:exile'), f.join(' '));
    // `eff:exile` is the removal role. A draw spell must not take a removal slot.
    assert.ok(!f.includes('eff:exile'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
  });

  it('Prosper carries the facet his plan keys on, off his own end step', () => {
    const f = facets({
      oracle_id: 'prosper',
      name: 'Prosper, Tome-Bound',
      type_line: 'Legendary Creature — Tiefling Warlock',
      cmc: 4,
      oracle_text:
        'Deathtouch\nMystic Arcanum — At the beginning of your end step, exile the top card of your library. Until the end of your next turn, you may play that card.\nPact Boon — Whenever you play a card from exile, create a Treasure token.',
    });
    assert.ok(f.includes('eff:impulse'), f.join(' '));
    assert.ok(f.includes('cares:zone:exile'), f.join(' '));
  });

  it('Mystic Forge exiles the top card and gives nothing back, so it is not impulse', () => {
    const f = facets({
      oracle_id: 'mystic-forge',
      name: 'Mystic Forge',
      type_line: 'Artifact',
      cmc: 4,
      oracle_text:
        'You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library.',
    });
    assert.ok(!f.includes('eff:impulse'), f.join(' '));
  });
});

/*
 * Free spells, two shapes. Oracle text verbatim from `cards_unique`, 3 Sep 2026.
 *
 * The free-spell cycle carries its condition as an ALTERNATIVE COST on the
 * spell, so the card that cares about your commander says so and the
 * counterspell stays a counterspell. "Cast X without paying its mana cost" as
 * an effect is the `cast-free` marker, read by id like proliferate.
 */
describe('free spells', () => {
  it('the free-spell cycle cares about your commander and keeps its real effect', () => {
    const f = facets({
      oracle_id: 'fg', name: 'Fierce Guardianship', type_line: 'Instant', mana_cost: '{2}{U}', cmc: 3,
      oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.',
    });
    assert.ok(f.includes('cares:commander'), f.join(' '));
    assert.ok(f.includes('eff:counter'), f.join(' '));
    // Casting itself for nothing is not cheating ANOTHER spell in.
    assert.ok(!f.includes('eff:cast-free'), f.join(' '));

    const g = facets({
      oracle_id: 'dr', name: 'Deadly Rollick', type_line: 'Instant', mana_cost: '{3}{B}', cmc: 4,
      oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.',
    });
    assert.ok(g.includes('cares:commander'), g.join(' '));
    assert.ok(g.includes('eff:exile'), g.join(' '));
  });

  it('an alternative cost with no commander gate does not invent one', () => {
    const f = facets({
      oracle_id: 'fow', name: 'Force of Will', type_line: 'Instant', mana_cost: '{3}{U}{U}', cmc: 5,
      oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
    });
    assert.ok(f.includes('eff:counter'), f.join(' '));
    assert.ok(!f.includes('cares:commander'), f.join(' '));
    assert.ok(!f.includes('eff:cast-free'), f.join(' '));
  });

  it('casting another spell for free is eff:cast-free, beside whatever else the card does', () => {
    const electro = facets({
      oracle_id: 'ed', name: 'Electrodominance', type_line: 'Instant', mana_cost: '{X}{R}{R}', cmc: 2,
      oracle_text: 'Electrodominance deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost.',
    });
    assert.ok(electro.includes('eff:cast-free'), electro.join(' '));
    assert.ok(electro.includes('eff:damage'), electro.join(' '));

    const etali = facets({
      oracle_id: 'etali', name: 'Etali, Primal Storm', type_line: 'Legendary Creature — Elder Dinosaur', mana_cost: '{4}{R}{R}', cmc: 6,
      oracle_text: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.",
    });
    assert.ok(etali.includes('eff:cast-free'), etali.join(' '));
    assert.ok(etali.includes('trig:attacks'), etali.join(' '));

    const mizzix = facets({
      oracle_id: 'mm', name: "Mizzix's Mastery", type_line: 'Sorcery', mana_cost: '{3}{R}', cmc: 4,
      oracle_text: "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost. Exile Mizzix's Mastery.\nOverload {5}{R}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
    });
    assert.ok(mizzix.includes('eff:cast-free'), mizzix.join(' '));
  });
});

describe('a tax is still the verb it taxes', () => {
  /*
   * "Counter target spell unless its controller pays {3}" sat on the
   * named-manual list for a year, so Mana Leak, Force Spike, Spell Pierce and
   * the other sixty cards in that census cluster had no record and served no
   * role. The compiler reads them now, and the facet layer's job is to keep
   * reading the counter THROUGH the tax: `unless-pays` is a control-flow
   * member, and its inner effects are read exactly as if printed bare.
   */
  const MANA_LEAK = {
    oracle_id: 'mana-leak',
    name: 'Mana Leak',
    type_line: 'Instant',
    mana_cost: '{1}{U}',
    cmc: 2,
    oracle_text: 'Counter target spell unless its controller pays {3}.',
  };
  const ESPER_SENTINEL = {
    oracle_id: 'esper-sentinel',
    name: 'Esper Sentinel',
    type_line: 'Artifact Creature — Human Soldier',
    mana_cost: '{W}',
    cmc: 1,
    oracle_text:
      "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
  };

  it('Mana Leak is a counterspell with a price on it, and files as interaction', () => {
    const f = facets(MANA_LEAK);
    assert.ok(f.includes('eff:counter'), f.join(' '));
    assert.ok(f.includes('eff:unless-pays'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
    assert.ok(cardRole({ facets: f, typeLine: MANA_LEAK.type_line, tags: [] }, 'interaction'));
  });

  it('Esper Sentinel draws on a cast trigger, and the tax does not hide the draw', () => {
    const f = facets(ESPER_SENTINEL);
    assert.ok(f.includes('trig:cast'), f.join(' '));
    assert.ok(f.includes('eff:draw'), f.join(' '));
    assert.ok(f.includes('eff:unless-pays'), f.join(' '));
    assert.ok(f.includes('rec:full'), f.join(' '));
    assert.ok(cardRole({ facets: f, typeLine: ESPER_SENTINEL.type_line, tags: [] }, 'draw'));
  });
});
