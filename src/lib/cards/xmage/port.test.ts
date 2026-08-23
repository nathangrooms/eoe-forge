/**
 * The ported primitives, one test per primitive, each built from a REAL card.
 *
 * Behaviour under test is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The XMage clone is read in place and nothing from it is vendored. Forge is
 * GPL-3.0 and was not fetched, read or referenced.
 *
 * ## How to read a test here
 *
 * Every test names a card, asserts its Scryfall oracle text, and then asserts
 * what the port produces. The oracle assertion is not decoration: it pins the
 * quote in the test to the printed card, so a quote cannot drift away from the
 * behaviour it is supposed to justify. If Scryfall's wording changes, the test
 * fails and somebody has to look at whether the lowering still matches.
 *
 * Oracle text comes from `scripts/coverage/.data/catalogue.json`, which is
 * Scryfall's. It never comes from XMage: XMage's display strings carry Wizards
 * of the Coast wording that is not XMage's to license.
 *
 * The fixtures are `buildRecord`'s own output for those cards, frozen by
 * `scripts/xmage/make-fixtures.mjs`. They are not written by hand, because a
 * hand-written record records what the author believed the extraction produces
 * and a lowering tested against one can pass while failing on every real card.
 *
 * ## Where XMage and the oracle text disagree, the card wins
 *
 * Two disagreements are pinned below rather than papered over: Menace, where
 * XMage's constructor takes a flag that is not part of the card, and Wrath of
 * God, where the card says something this DSL cannot yet express.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Ability, ActivatedAbility, CardFilter, Effect, KeywordAbility, ManaAbility, ReplacementAbility, StaticAbility, TriggeredAbility } from '../abilities/dsl.ts';
import { assertSerialisable } from '../abilities/dsl.ts';
import { lowerCard } from './lower.ts';
import { abilitiesOf, invocationsInAbility } from './record.ts';
import { fixture, PORT_FIXTURES } from './port.fixtures.generated.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Lowers a fixture and asserts its oracle text, so the quote cannot drift. */
function card(cls: string, oracleText: string) {
  const f = fixture(cls);
  assert.equal(f.scryfall?.oracleText, oracleText, `${cls}: Scryfall oracle text has changed`);
  return { fixture: f, lowered: lowerCard(f.record) };
}

/** Every ability of a card that lowered, or a failure naming what blocked it. */
function abilities(cls: string, oracleText: string) {
  const { lowered } = card(cls, oracleText);
  assert.equal(
    lowered.ok,
    true,
    `${cls} did not lower: ${JSON.stringify(lowered.blocked.map((b) => b.result))}`,
  );
  return lowered.abilities.map((a) => a.ability!);
}

/** The one and only ability of a single-ability card. */
function only(cls: string, oracleText: string) {
  const list = abilities(cls, oracleText);
  assert.equal(list.length, 1, `${cls} has ${list.length} abilities, expected 1`);
  return list[0];
}

/**
 * The effects of any ability that has them.
 *
 * A keyword, static or replacement ability has no `effects` field at all, which
 * is the type system saying the same thing this port says: those abilities
 * change the game without resolving anything. The `in` check is how that is
 * asked without a cast.
 */
function effectsOf(ability: Ability): Effect[] {
  return 'effects' in ability ? ability.effects : [];
}

/* ------------------------------------------------------------------ *
 * Keywords
 * ------------------------------------------------------------------ */

test('keyword:Flying and keyword:Vigilance — Serra Angel', () => {
  // "Flying
  //  Vigilance (Attacking doesn't cause this creature to tap.)"
  const list = abilities('SerraAngel', 'Flying\nVigilance (Attacking doesn\'t cause this creature to tap.)');
  assert.deepEqual(
    list.map((a) => (a as KeywordAbility).keyword),
    ['flying', 'vigilance'],
  );
  assert.equal(list.every((a) => a.kind === 'keyword'), true);
});

test('keyword:Trample — Arborback Stomper, alongside a trigger', () => {
  // "Trample
  //  When this creature enters, you gain 5 life."
  const list = abilities('ArborbackStomper', 'Trample\nWhen this creature enters, you gain 5 life.');
  assert.equal((list[0] as KeywordAbility).keyword, 'trample');
  const trigger = list[1] as TriggeredAbility;
  assert.deepEqual(trigger.event, { on: 'enters', who: { sel: 'self' } });
  assert.deepEqual(trigger.effects, [{ do: 'gain-life', who: { who: 'you' }, amount: 5 }]);
});

test('keyword:Menace — Alley Strangler, and XMage carries a flag the card does not', () => {
  // "Menace"
  //
  // XMage's `MenaceAbility(boolean)` argument is `showAbilityHint`, a client
  // display flag, and both of its constructors build the same ability. The card
  // has no such distinction. This is the first of the two disagreements the
  // header mentions, and the rule is that the printed card wins: the flag is
  // read, discarded, and never reaches the lowered ability as a parameter.
  const ability = only('AlleyStrangler', 'Menace') as KeywordAbility;
  assert.equal(ability.keyword, 'menace');
  assert.equal(ability.parameter, undefined);
});

test('keyword:Enchant — Dead Weight, with the object named from the type', () => {
  // "Enchant creature
  //  Enchanted creature gets -2/-2."
  const list = abilities('DeadWeight', 'Enchant creature\nEnchanted creature gets -2/-2.');
  const enchant = list[0] as KeywordAbility;
  assert.equal(enchant.keyword, 'enchant');
  // "creature" comes from the target's TYPE, not from copied rules text.
  assert.equal(enchant.parameter, 'creature');
});

test('keyword:Kicker is refused, and Academy Drake says so by name', () => {
  // "Kicker {4} (You may pay an additional {4} as you cast this spell.)
  //  Flying
  //  If this creature was kicked, it enters with two +1/+1 counters on it."
  //
  // The refusal is the point. Kicker's cost is on this ability and what the
  // kicker BUYS is on a different one, and nothing in the record links them.
  // A card that lowered would resolve, enter, and never carry the counters.
  const { lowered } = card(
    'AcademyDrake',
    'Kicker {4} (You may pay an additional {4} as you cast this spell.)\nFlying\nIf this creature was kicked, it enters with two +1/+1 counters on it.',
  );
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.missing.includes('keyword:Kicker')));
});

test('keyword:Protection is refused rather than given invented wording', () => {
  // "Flying, protection from red"
  //
  // `KeywordAbility.parameter` is printed text and XMage gives protection a
  // FILTER. Turning that filter into the words "from red" would be this project
  // writing rules text, which it takes from Scryfall and not from XMage.
  const { lowered } = card('AbbeyGargoyles', 'Flying, protection from red');
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.missing.includes('keyword:Protection')));
});

/* ------------------------------------------------------------------ *
 * xmage:CreateTokenEffect
 * ------------------------------------------------------------------ */

test('xmage:CreateTokenEffect — Dragon Fodder makes two of the right token', () => {
  // "Create two 1/1 red Goblin creature tokens."
  const ability = only('DragonFodder', 'Create two 1/1 red Goblin creature tokens.');
  assert.deepEqual(effectsOf(ability), [
    {
      do: 'create-token',
      who: { who: 'you' },
      token: { name: 'Goblin', typeLine: 'Creature — Goblin', power: '1', toughness: '1', colorIdentity: ['R'] },
      count: 2,
    },
  ]);
});

test('xmage:CreateTokenEffect — Call of the Conclave, a 3/3 green Centaur', () => {
  // "Create a 3/3 green Centaur creature token."
  const ability = only('CallOfTheConclave', 'Create a 3/3 green Centaur creature token.');
  const effect = effectsOf(ability)[0] as Extract<Effect, { do: 'create-token' }>;
  assert.equal(effect.token.power, '3');
  assert.equal(effect.token.toughness, '3');
  assert.deepEqual(effect.token.colorIdentity, ['G']);
  assert.equal(effect.count, 1);
});

test('a token whose abilities the port cannot name is refused, not made blank', () => {
  // Ancestors' Aid: "Target creature gets +2/+0 and gains first strike until end
  // of turn. / Create a Treasure token."
  //
  // A Treasure token's whole point is "{T}, Sacrifice this token: Add one mana
  // of any color", and `TokenSpec` holds keywords, not activated abilities. A
  // Treasure with no sacrifice ability is a blank artifact that a deck builder
  // would still count as ramp, so the effect refuses.
  const { lowered } = card(
    'AncestorsAid',
    'Target creature gets +2/+0 and gains first strike until end of turn.\nCreate a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
  );
  assert.equal(lowered.ok, false);
  assert.ok(
    lowered.blocked.some((b) => b.result.refused.some((r) => r.prim === 'xmage:CreateTokenEffect')),
    JSON.stringify(lowered.blocked),
  );
});

/* ------------------------------------------------------------------ *
 * xmage:AttachEffect, and the aura shape end to end
 * ------------------------------------------------------------------ */

test('xmage:AttachEffect and xmage:BoostEnchantedEffect — Holy Strength', () => {
  // "Enchant creature
  //  Enchanted creature gets +1/+2."
  const list = abilities('HolyStrength', 'Enchant creature\nEnchanted creature gets +1/+2.');
  assert.equal((list[0] as KeywordAbility).keyword, 'enchant');

  const boost = list[1] as StaticAbility;
  assert.deepEqual(boost.affects, { sel: 'attached' });
  assert.deepEqual(boost.modifications, [{ layer: 'pt-modify', power: 1, toughness: 2 }]);

  // The aura's own cast: attach the source to the thing it targets.
  const spell = list[2];
  assert.deepEqual(effectsOf(spell), [
    { do: 'attach', what: { sel: 'self' }, to: { sel: 'target', ref: 0 } },
  ]);
});

/* ------------------------------------------------------------------ *
 * Pumps
 * ------------------------------------------------------------------ */

test('xmage:BoostTargetEffect — Giant Growth, with the duration XMage defaults to', () => {
  // "Target creature gets +3/+3 until end of turn."
  //
  // The two-argument constructor delegates to `Duration.EndOfTurn`. A boost with
  // no duration would be permanent, which is a different card.
  const ability = only('GiantGrowth', 'Target creature gets +3/+3 until end of turn.');
  assert.deepEqual(effectsOf(ability), [
    { do: 'pump', what: { sel: 'target', ref: 0 }, power: 3, toughness: 3, duration: 'end-of-turn' },
  ]);
  assert.deepEqual((ability as { targets?: unknown[] }).targets, [
    { ref: 0, what: 'card', min: 1, max: 1, prompt: 'creature', filter: { is: 'type', value: 'Creature' }, zone: 'battlefield' },
  ]);
});

test('xmage:BoostTargetEffect — Bull Rush, an uneven boost', () => {
  // "Target creature gets +2/+0 until end of turn."
  const ability = only('BullRush', 'Target creature gets +2/+0 until end of turn.');
  const effect = effectsOf(ability)[0] as Extract<Effect, { do: 'pump' }>;
  assert.equal(effect.power, 2);
  assert.equal(effect.toughness, 0);
});

test('xmage:BoostSourceEffect — Boa Constrictor, from an activated ability', () => {
  // "{T}: This creature gets +3/+3 until end of turn."
  const ability = only('BoaConstrictor', '{T}: This creature gets +3/+3 until end of turn.') as ActivatedAbility;
  assert.deepEqual(ability.costs, [{ pay: 'tap' }]);
  assert.deepEqual(ability.effects, [
    { do: 'pump', what: { sel: 'self' }, power: 3, toughness: 3, duration: 'end-of-turn' },
  ]);
});

test('xmage:SimpleStaticAbility via BoostControlledEffect — Gaea\'s Anthem', () => {
  // "Creatures you control get +1/+1."
  //
  // The head of the work order, 5,867 cards, and the thing that unblocked it was
  // a table from a continuous effect to a `Modification`, not a change to the
  // record.
  const ability = only('GaeasAnthem', 'Creatures you control get +1/+1.') as StaticAbility;
  assert.equal(ability.kind, 'static');
  assert.deepEqual(ability.affects, {
    sel: 'all',
    where: { is: 'type', value: 'Creature' },
    zone: 'battlefield',
    controller: { who: 'you' },
  });
  assert.deepEqual(ability.modifications, [{ layer: 'pt-modify', power: 1, toughness: 1 }]);
});

/* ------------------------------------------------------------------ *
 * Granted keywords
 * ------------------------------------------------------------------ */

test('xmage:GainAbilityTargetEffect — Jump grants flying, not power', () => {
  // "Target creature gains flying until end of turn."
  //
  // `dsl.ts` grants an ability through `pump`'s `grant` field, so a pure grant
  // is a pump of 0/0. Using the member that exists keeps the runtime's
  // exhaustive switch the size it already is.
  const ability = only('Jump', 'Target creature gains flying until end of turn.');
  assert.deepEqual(effectsOf(ability), [
    {
      do: 'pump',
      what: { sel: 'target', ref: 0 },
      power: 0,
      toughness: 0,
      grant: ['flying'],
      duration: 'end-of-turn',
    },
  ]);
});

test('xmage:GainAbilityTargetEffect — Unnatural Speed grants haste', () => {
  // "Target creature gains haste until end of turn."
  const ability = only('UnnaturalSpeed', 'Target creature gains haste until end of turn.');
  const effect = effectsOf(ability)[0] as Extract<Effect, { do: 'pump' }>;
  assert.deepEqual(effect.grant, ['haste']);
});

/* ------------------------------------------------------------------ *
 * Life
 * ------------------------------------------------------------------ */

test('xmage:GainLifeEffect — Angel\'s Mercy', () => {
  // "You gain 7 life."
  const ability = only('AngelsMercy', 'You gain 7 life.');
  assert.deepEqual(effectsOf(ability), [{ do: 'gain-life', who: { who: 'you' }, amount: 7 }]);
});

/* ------------------------------------------------------------------ *
 * Counters
 * ------------------------------------------------------------------ */

test('xmage:AddCountersTargetEffect — Battlegrowth, one +1/+1 counter', () => {
  // "Put a +1/+1 counter on target creature."
  const ability = only('Battlegrowth', 'Put a +1/+1 counter on target creature.');
  assert.deepEqual(effectsOf(ability), [
    { do: 'add-counters', what: { sel: 'target', ref: 0 }, counter: '+1/+1', count: 1 },
  ]);
});

test('xmage:AddCountersTargetEffect — Blight Rot puts FOUR counters, not one', () => {
  // "Put four -1/-1 counters on target creature."
  //
  // This is the regression test for a real bug. XMage writes the count on the
  // Counter object, `CounterType.M1M1.createInstance(4)`, and the record builder
  // was discarding a static factory's arguments. Every "put four counters" card
  // read as one, silently, with no failure anywhere. `Carried.factory` always
  // declared an `args` field; nothing was filling it.
  const ability = only('BlightRot', 'Put four -1/-1 counters on target creature.');
  assert.deepEqual(effectsOf(ability), [
    { do: 'add-counters', what: { sel: 'target', ref: 0 }, counter: '-1/-1', count: 4 },
  ]);
});

/* ------------------------------------------------------------------ *
 * Removal
 * ------------------------------------------------------------------ */

test('xmage:DestroyTargetEffect — Stone Rain, and the prompt follows the filter', () => {
  // "Destroy target land."
  //
  // XMage writes this as `new TargetPermanent(FILTER_LAND)`, so the class says
  // "permanent" and the argument says land. The filter is what the rules
  // enforce; the prompt is what the player is asked. Both must say land, or the
  // player is asked the wrong question about a legal choice.
  const ability = only('StoneRain', 'Destroy target land.');
  assert.deepEqual(effectsOf(ability), [{ do: 'destroy', what: { sel: 'target', ref: 0 } }]);
  assert.deepEqual((ability as { targets?: Array<{ prompt: string; filter: unknown }> }).targets, [
    { ref: 0, what: 'card', min: 1, max: 1, prompt: 'land', filter: { is: 'type', value: 'Land' }, zone: 'battlefield' },
  ]);
});

test('xmage:ExileTargetEffect — Unmake', () => {
  // "Exile target creature."
  const ability = only('Unmake', 'Exile target creature.');
  assert.deepEqual(effectsOf(ability), [{ do: 'exile', what: { sel: 'target', ref: 0 } }]);
});

test('xmage:DamageTargetEffect — Lightning Bolt', () => {
  // "Lightning Bolt deals 3 damage to any target."
  const ability = only('LightningBolt', 'Lightning Bolt deals 3 damage to any target.');
  assert.deepEqual(effectsOf(ability), [
    { do: 'damage', to: { sel: 'target', ref: 0 }, amount: 3 },
  ]);
});

test('xmage:DestroyAllEffect — Wrath of God, and a clause this DSL cannot yet say', () => {
  // "Destroy all creatures. They can't be regenerated."
  //
  // The second disagreement the header mentions, and it goes the other way from
  // Menace: here the CARD says something and the DSL has no member for it.
  //
  // `noRegen` is read and dropped. That is safe only because nothing in this
  // port can grant regeneration: `xmage:RegenerateSourceEffect` is refused by
  // name, 161 cards, so no permanent this engine builds has a regeneration
  // shield for the clause to matter against. The day regeneration lands, the
  // grep for `noRegen` finds the line in `lower.ts` and this test.
  const ability = only('WrathOfGod', "Destroy all creatures. They can't be regenerated.");
  assert.deepEqual(effectsOf(ability), [
    { do: 'destroy', what: { sel: 'all', where: { is: 'type', value: 'Creature' }, zone: 'battlefield' } },
  ]);
});

/* ------------------------------------------------------------------ *
 * Tapping
 * ------------------------------------------------------------------ */

test('xmage:TapTargetEffect — Relic Barrier', () => {
  // "{T}: Tap target artifact."
  const ability = only('RelicBarrier', '{T}: Tap target artifact.') as ActivatedAbility;
  assert.deepEqual(ability.costs, [{ pay: 'tap' }]);
  assert.deepEqual(ability.effects, [{ do: 'tap', what: { sel: 'target', ref: 0 } }]);
  assert.deepEqual(ability.targets?.[0].filter, { is: 'type', value: 'Artifact' } as CardFilter);
});

test('xmage:TapTargetEffect — Early Frost keeps "up to three" as a real range', () => {
  // "Tap up to three target lands."
  const ability = only('EarlyFrost', 'Tap up to three target lands.');
  const target = (ability as { targets?: Array<{ min: number; max: number }> }).targets?.[0];
  assert.equal(target?.min, 0);
  assert.equal(target?.max, 3);
});

test('an ability whose targets a Java adjuster rewrites is refused — Word of Binding', () => {
  // "Tap X target creatures."
  //
  // XMage writes this as ONE `TargetCreaturePermanent` with no counts, plus
  // `setTargetAdjuster(new XTargetsCountAdjuster())`. The record holds the
  // adjuster's class name and nothing about what it does, so before this refusal
  // existed the card lowered to a spell that taps exactly one creature. It ran,
  // it tapped something, and it was wrong: the same failure class as Cyclonic
  // Rift, found the same way, by walking a real card through the pipeline.
  const { lowered } = card('WordOfBinding', 'Tap X target creatures.');
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.missing.some((p) => p.startsWith('adjuster:'))));
});

/* ------------------------------------------------------------------ *
 * Searching
 * ------------------------------------------------------------------ */

test('xmage:SearchLibraryPutInPlayEffect — Three Visits finds one Forest', () => {
  // "Search your library for a Forest card, put it onto the battlefield, then shuffle."
  const ability = only('ThreeVisits', 'Search your library for a Forest card, put it onto the battlefield, then shuffle.');
  assert.deepEqual(effectsOf(ability), [
    {
      do: 'search-library',
      who: { who: 'you' },
      what: {
        sel: 'all',
        where: { is: 'and', of: [{ is: 'type', value: 'Land' }, { is: 'subtype', value: 'Forest' }] },
        zone: 'library',
        controller: { who: 'you' },
      },
      count: 1,
      to: 'battlefield',
      thenShuffle: true,
    },
  ]);
});

test('xmage:SearchLibraryPutInPlayEffect — Skyshroud Claim finds two, untapped', () => {
  // "Search your library for up to two Forest cards, put them onto the battlefield, then shuffle."
  //
  // The count comes from the nested target's `maxNumTargets`, and `tapped` is
  // absent because the card does not say tapped. Both halves matter: a two-land
  // ramp spell that fetched one, or fetched them tapped, is a different card.
  const ability = only(
    'SkyshroudClaim',
    'Search your library for up to two Forest cards, put them onto the battlefield, then shuffle.',
  );
  const effect = effectsOf(ability)[0] as Extract<Effect, { do: 'search-library' }>;
  assert.equal(effect.count, 2);
  assert.equal(effect.to, 'battlefield');
  assert.equal(effect.tapped, undefined);
});

/* ------------------------------------------------------------------ *
 * Equipment
 * ------------------------------------------------------------------ */

test('xmage:EquipAbility — Bonesplitter, with everything XMage puts in the class', () => {
  // "Equipped creature gets +2/+0.
  //  Equip {1}"
  //
  // CR 702.6a. The card file passes only the cost; the effect and the target
  // both come from `EquipAbility`'s own constructor, so a generic reading of the
  // record would produce an ability that costs {1} and does nothing.
  const list = abilities('Bonesplitter', 'Equipped creature gets +2/+0.\nEquip {1}');
  const boost = list[0] as StaticAbility;
  assert.deepEqual(boost.affects, { sel: 'attached' });
  assert.deepEqual(boost.modifications, [{ layer: 'pt-modify', power: 2, toughness: 0 }]);

  const equip = list[1] as ActivatedAbility;
  assert.deepEqual(equip.costs, [{ pay: 'mana', cost: '{1}' }]);
  assert.equal(equip.timing, 'sorcery');
  assert.deepEqual(equip.effects, [{ do: 'attach', what: { sel: 'self' }, to: { sel: 'target', ref: 0 } }]);
  assert.deepEqual(equip.targets?.[0].controller, { who: 'you' });
});

test('xmage:EquipAbility — Murderer\'s Axe, whose equip cost is not mana', () => {
  // "Equipped creature gets +2/+2.
  //  Equip—Discard a card."
  const list = abilities('MurderersAxe', 'Equipped creature gets +2/+2.\nEquip—Discard a card.');
  const equip = list[1] as ActivatedAbility;
  assert.deepEqual(equip.costs, [{ pay: 'discard', count: 1 }]);
});

/* ------------------------------------------------------------------ *
 * Mana
 * ------------------------------------------------------------------ */

test('xmage:GreenManaAbility — Elvish Mystic, whose cost is on the superclass', () => {
  // "{T}: Add {G}."
  //
  // The card file says `new GreenManaAbility()` and nothing else. The tap cost
  // is on XMage's `BasicManaAbility`, so the record's cost list and effect list
  // are both empty and a generic reading would call this a free ability that
  // does nothing, and report it as lowered.
  const ability = only('ElvishMystic', '{T}: Add {G}.') as ManaAbility;
  assert.equal(ability.kind, 'mana');
  assert.deepEqual(ability.costs, [{ pay: 'tap' }]);
  assert.deepEqual(ability.effects, [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}' }]);
});

test('xmage:SimpleManaAbility — Fyndhorn Elder adds two green, not one', () => {
  // "{T}: Add {G}{G}."
  //
  // `Mana` is a bag of counts per colour, so the string is a concatenation. A
  // reading that took the colour and dropped the count would halve every one of
  // these lands and rocks.
  const ability = only('FyndhornElder', '{T}: Add {G}{G}.') as ManaAbility;
  assert.deepEqual(ability.effects, [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}{G}' }]);
});

test('xmage:ColoredManaCost — Shivan Dragon activates for {R}', () => {
  // "Flying
  //  {R}: This creature gets +1/+0 until end of turn."
  //
  // `ColoredManaSymbol`'s members are the LETTERS. A first version of the cost
  // table keyed it on the colour WORDS, matched nothing, and refused every
  // single-coloured activation cost in the corpus. A real card found it.
  const list = abilities('ShivanDragon', 'Flying\n{R}: This creature gets +1/+0 until end of turn.');
  assert.equal((list[0] as KeywordAbility).keyword, 'flying');
  const pump = list[1] as ActivatedAbility;
  assert.deepEqual(pump.costs, [{ pay: 'mana', cost: '{R}' }]);
});

/* ------------------------------------------------------------------ *
 * Enters tapped
 * ------------------------------------------------------------------ */

test('xmage:EntersBattlefieldTappedAbility — Diregraf Ghoul is a replacement, not a static', () => {
  // "This creature enters tapped."
  //
  // XMage files this under static abilities and wraps
  // `EntersBattlefieldEffect(TapSourceEffect(true))`, which is a
  // self-replacement. Lowering it as an ordinary static would apply it at the
  // wrong time.
  const ability = only('DiregrafGhoul', 'This creature enters tapped.') as ReplacementAbility;
  assert.equal(ability.kind, 'replacement');
  assert.deepEqual(ability.event, { on: 'enters', who: { sel: 'self' } });
  assert.deepEqual(ability.result, { do: 'enters-tapped' });
  assert.equal(ability.selfReplacement, true);
});

/* ------------------------------------------------------------------ *
 * Planeswalkers
 * ------------------------------------------------------------------ */

test('xmage:LoyaltyAbility — Garruk Wildspeaker, and the sign of the loyalty number', () => {
  // "+1: Untap two target lands.
  //  −1: Create a 3/3 green Beast creature token.
  //  −4: Creatures you control get +3/+3 and gain trample until end of turn."
  const list = abilities(
    'GarrukWildspeaker',
    '+1: Untap two target lands.\n−1: Create a 3/3 green Beast creature token.\n−4: Creatures you control get +3/+3 and gain trample until end of turn.',
  ) as ActivatedAbility[];
  assert.equal(list.length, 3);

  // A positive number ADDS loyalty counters, a negative one REMOVES them, and
  // the sign is the whole difference between "+1: draw a card" and "-1: draw a
  // card".
  assert.deepEqual(list[0].costs, [{ pay: 'add-counters', counter: 'loyalty', count: 1, to: { sel: 'self' } }]);
  assert.deepEqual(list[1].costs, [{ pay: 'remove-counters', counter: 'loyalty', count: 1, from: { sel: 'self' } }]);
  assert.deepEqual(list[2].costs, [{ pay: 'remove-counters', counter: 'loyalty', count: 4, from: { sel: 'self' } }]);
  assert.equal(list.every((a) => a.isLoyalty === true && a.timing === 'sorcery'), true);

  assert.deepEqual(list[0].effects, [{ do: 'untap', what: { sel: 'target', ref: 0 } }]);
  assert.equal(list[0].targets?.[0].min, 2);
  assert.equal(list[0].targets?.[0].max, 2);
});

test('the "controlled" family keeps its controller — Garruk\'s -4 does not arm the table', () => {
  // "−4: Creatures you control get +3/+3 and gain trample until end of turn."
  //
  // XMage's `GainAbilityControlledEffect` gets "you control" from the CLASS and
  // takes a filter that describes only the kind of permanent. Reading the filter
  // alone granted trample to every creature on the battlefield, including the
  // ones attacking you. The boost was already correct, so the card ran and only
  // half of it was wrong.
  const list = abilities(
    'GarrukWildspeaker',
    '+1: Untap two target lands.\n−1: Create a 3/3 green Beast creature token.\n−4: Creatures you control get +3/+3 and gain trample until end of turn.',
  ) as ActivatedAbility[];
  const ultimate = list[2].effects as Array<Extract<Effect, { do: 'pump' }>>;
  assert.equal(ultimate.length, 2);
  for (const effect of ultimate) {
    assert.deepEqual(effect.what, {
      sel: 'all',
      where: { is: 'type', value: 'Creature' },
      zone: 'battlefield',
      controller: { who: 'you' },
    });
  }
  assert.deepEqual(ultimate[1].grant, ['trample']);
});

/* ------------------------------------------------------------------ *
 * A filter's OWN constructor argument
 *
 * `new FilterPermanent(SubType.FOREST, "Forest")` is a filter that selects
 * Forests. The record builder used to read only the class name and the
 * `filter.add(...)` calls, so that argument was dropped and the filter came out
 * meaning every permanent. Every card below RAN and was WRONG, which is worse
 * than refusing, and none of it showed in any count because the cards still
 * lowered. 1,829 filter constructions across the corpus carry such an argument.
 *
 * Each test asserts the NARROWING specifically, because a test that only
 * asserted "it lowers" passed throughout.
 * ------------------------------------------------------------------ */

test('a filter constructor argument narrows the target — Arbor Elf untaps a Forest, not a permanent', () => {
  const ability = only('ArborElf', '{T}: Untap target Forest.') as ActivatedAbility;
  assert.deepEqual(ability.targets?.[0].filter, { is: 'subtype', value: 'Forest' });
  assert.deepEqual(effectsOf(ability), [{ do: 'untap', what: { sel: 'target', ref: 0 } }]);
});

test('a filter constructor argument narrows a static — Blur Sliver hastes Slivers, not the board', () => {
  const ability = only(
    'BlurSliver',
    'Sliver creatures you control have haste. (They can attack and {T} as soon as they come under your control.)',
  ) as StaticAbility;
  assert.deepEqual(ability.affects, {
    sel: 'all',
    where: { is: 'and', of: [{ is: 'type', value: 'Creature' }, { is: 'subtype', value: 'Sliver' }] },
    zone: 'battlefield',
    controller: { who: 'you' },
  });
  assert.deepEqual(ability.modifications, [{ layer: 'ability', grant: ['haste'] }]);
});

test('a filter constructor argument narrows a trigger subject — Bishop of Wings does not fire on a land', () => {
  const list = abilities(
    'BishopOfWings',
    'Whenever an Angel you control enters, you gain 4 life.\nWhenever an Angel you control dies, create a 1/1 white Spirit creature token with flying.',
  ) as TriggeredAbility[];
  assert.equal(list.length, 2);
  for (const ability of list) {
    assert.deepEqual(
      (ability.event as { who: unknown }).who,
      { sel: 'all', where: { is: 'subtype', value: 'Angel' }, zone: 'battlefield', controller: { who: 'you' } },
      'the Angel narrowing has to survive on both triggers',
    );
  }
});

test('the same fix on the StaticFilters path — Battle Sliver boosts Slivers', () => {
  // `StaticFilters.FILTER_PERMANENT_SLIVERS` is
  // `new FilterCreaturePermanent(SubType.SLIVER, "Sliver creatures")`. That
  // initialiser reaches `resolveFilter` as raw parse nodes rather than as
  // extractor slots, so it is a SECOND code path and needs its own test. Nine of
  // the 198 static filters carry such an argument.
  const ability = only('BattleSliver', 'Sliver creatures you control get +2/+0.') as StaticAbility;
  const where = (ability.affects as { where: CardFilter }).where;
  assert.deepEqual(where, {
    is: 'and',
    of: [{ is: 'type', value: 'Creature' }, { is: 'subtype', value: 'Sliver' }],
  });
});

test('a dynamic token count keeps its own filter — Krenko counts Goblins, not permanents', () => {
  const ability = only(
    'KrenkoMobBoss',
    '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
  ) as ActivatedAbility;
  const [effect] = effectsOf(ability) as Array<Extract<Effect, { do: 'create-token' }>>;
  assert.equal(effect.do, 'create-token');
  assert.deepEqual(effect.count, {
    v: 'count',
    of: {
      sel: 'all',
      where: { is: 'subtype', value: 'Goblin' },
      zone: 'battlefield',
      controller: { who: 'you' },
    },
  });
});

test('a token count that cannot be read is refused, never assumed to be one — Storm Herd', () => {
  // The line that made this necessary read `amount(invocation, 'amount') ?? 1`,
  // in a file whose own argument readers forbid exactly that. Storm Herd made
  // ONE Pegasus and counted as fully lowered. 77 cards were counted on that
  // basis. `ControllerLifeCount` is expressible as `{v:'life'}` and is simply
  // not in `values.ts` yet, so the honest answer today is a refusal and the fix
  // is one table entry rather than a default.
  const { lowered } = card(
    'StormHerd',
    'Create X 1/1 white Pegasus creature tokens with flying, where X is your life total.',
  );
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.refused.some((r) => r.why.includes('amount'))));
});

test('a token count behind a card-local filter is refused too — Hare Apparent', () => {
  // "equal to the number of other creatures you control named Hare Apparent".
  // The count is a `PermanentsOnBattlefieldCount` over a filter carrying a
  // `NamePredicate`, and card names are Wizards of the Coast text the extraction
  // omits on purpose. So the filter cannot resolve, the count cannot resolve,
  // and the card refuses instead of making one Rabbit.
  const { lowered } = card(
    'HareApparent',
    'When this creature enters, create a number of 1/1 white Rabbit creature tokens equal to the number of other creatures you control named Hare Apparent.\nA deck can have any number of cards named Hare Apparent.',
  );
  assert.equal(lowered.ok, false);
});

/* ------------------------------------------------------------------ *
 * The refusals that were already load bearing, still refusing
 * ------------------------------------------------------------------ */

test('Cyclonic Rift still refuses: a static helper adds abilities the record does not hold', () => {
  // "Return target nonland permanent you don't control to its owner's hand.
  //  Overload {6}{U} (You may cast this spell for its overload cost. If you do,
  //  change "target" in its text to "each.")"
  const { lowered } = card(
    'CyclonicRift',
    'Return target nonland permanent you don\'t control to its owner\'s hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")',
  );
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.missing.some((p) => p.startsWith('helper:'))));
});

test('Rhystic Study still refuses, and names the one class that has to be written', () => {
  // "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}."
  //
  // The TRIGGER resolves. The effect is a class the card file declares itself,
  // used once, so it costs a person and buys one card. The `local:` prefix is
  // what stops it being totalled with shared work.
  const { lowered } = card(
    'RhysticStudy',
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
  );
  assert.equal(lowered.ok, false);
  assert.ok(lowered.blocked.some((b) => b.result.missing.includes('local:RhysticStudyDrawEffect')));
});

test('Dockside Extortionist still refuses, in the token COUNT and nowhere else', () => {
  // "When this creature enters, create X Treasure tokens, where X is the number
  //  of artifacts and enchantments your opponents control."
  const { lowered } = card(
    'DocksideExtortionist',
    'When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control. (Treasure tokens are artifacts with "{T}, Sacrifice this token: Add one mana of any color.")',
  );
  assert.equal(lowered.ok, false);
});

test('Battle of Wits still refuses on its intervening if, and now NAMES the condition', () => {
  // "At the beginning of your upkeep, if you have 200 or more cards in your
  //  library, you win the game."
  //
  // CR 603.4: the condition is checked twice, so the ability must not run
  // unless it holds. It still refuses, and that half has not changed.
  //
  // WHAT CHANGED, and why this assertion is stronger than the one it replaces.
  //
  // This used to assert `missing` was EMPTY, on the reasoning that an
  // intervening if had no shared primitive to write. That reasoning held only
  // while `conditions.ts` did not exist: every intervening if refused together,
  // so there was nothing to tell them apart. Now the readable ones lower and the
  // rest name the class that blocked them. This card's blocker is a `Condition`
  // its own XMage file declares, which is one card's work, and `local:` is how
  // this port spells one card's work everywhere else.
  //
  // A blocked card with an EMPTY missing set is the attribution hole
  // `docs/engine/EFFECT-CLASS-ORDER.md` had to correct in its first pass: 2,264
  // cards were blocked by nothing nameable and got swept into whichever class
  // was measured first. One fewer of those is the point of this assertion.
  const { lowered } = card(
    'BattleOfWits',
    'At the beginning of your upkeep, if you have 200 or more cards in your library, you win the game.',
  );
  assert.equal(lowered.ok, false);
  assert.deepEqual(lowered.blocked[0].result.missing, ['local:BattleOfWitsCondition']);
  assert.ok(lowered.blocked[0].result.refused.some((r) => r.why.includes('declares itself')));
});

/* ------------------------------------------------------------------ *
 * Conditions
 *
 * Four cards, one for each place a condition can land, plus one that must
 * refuse. A condition that is dropped rather than refused is the worst failure
 * this port has: the ability RUNS with its gate removed, so it changes the
 * board and nothing reports anything. Every test here checks the gate is
 * present, not merely that the card lowered.
 * ------------------------------------------------------------------ */

test('xmage:ConditionalContinuousEffect, static — Anurid Barkripper', () => {
  // "Threshold — This creature gets +2/+2 as long as there are seven or more
  //  cards in your graveyard."
  const ability = only(
    'AnuridBarkripper',
    'Threshold — This creature gets +2/+2 as long as there are seven or more cards in your graveyard.',
  ) as StaticAbility;
  assert.equal(ability.kind, 'static');
  assert.deepEqual(ability.modifications, [{ layer: 'pt-modify', power: 2, toughness: 2 }]);
  // The whole point of the test. `statics.ts` re-checks `condition` every time
  // the layers are rebuilt, so a Barkripper with an empty graveyard is simply
  // not in the anthem list rather than being in it and inert.
  assert.deepEqual(ability.condition, {
    if: 'value',
    a: { v: 'cards-in', zone: 'graveyard', of: { who: 'you' } },
    cmp: 'gte',
    b: 7,
  });
});

test('the condition survives a non-battlefield active zone — Anger', () => {
  // "Haste
  //  As long as this card is in your graveyard and you control a Mountain,
  //  creatures you control have haste."
  //
  // Two things at once, and both have been wrong before in this file. The
  // condition is the Mountain, and the GRAVEYARD half is `activeZones`, not
  // part of the condition. Folding one into the other gives an Anger that grants
  // haste from the battlefield, which is a card that runs and is wrong.
  const list = abilities(
    'Anger',
    'Haste\nAs long as this card is in your graveyard and you control a Mountain, creatures you control have haste.',
  );
  const stat = list.find((a) => a.kind === 'static') as StaticAbility;
  assert.ok(stat, 'Anger lowered without a static ability');
  assert.deepEqual(stat.activeZones, ['graveyard']);
  assert.deepEqual(stat.condition, {
    if: 'count',
    of: {
      sel: 'all',
      where: { is: 'subtype', value: 'Mountain' },
      zone: 'battlefield',
      controller: { who: 'you' },
    },
    cmp: 'gt',
    value: 0,
  });
  // `PermanentsOnTheBattlefieldCondition`'s one-argument constructor means "YOU
  // control", not "there is". Reading it the other way switches Anger on for
  // every board with a Mountain anywhere on it.
  assert.deepEqual((stat.condition as { of: { controller: unknown } }).of.controller, { who: 'you' });
});

test('xmage:ConditionalOneShotEffect, resolving — Galvanic Blast', () => {
  // "Galvanic Blast deals 2 damage to any target.
  //  Metalcraft — Galvanic Blast deals 4 damage instead if you control three or
  //  more artifacts."
  const list = abilities(
    'GalvanicBlast',
    'Galvanic Blast deals 2 damage to any target.\nMetalcraft — Galvanic Blast deals 4 damage instead if you control three or more artifacts.',
  );
  const effects = list.flatMap(effectsOf);
  const gate = effects.find((e) => e.do === 'if');
  assert.ok(gate, `no {do:'if'} in ${JSON.stringify(effects)}`);
  assert.deepEqual((gate as { condition: unknown }).condition, {
    if: 'controls',
    who: { who: 'you' },
    what: { is: 'type', value: 'Artifact' },
    cmp: 'gte',
    value: 3,
  });
});

test('an intervening if that lowers becomes ability.condition — Felidar Sovereign', () => {
  // "Vigilance … Lifelink … At the beginning of your upkeep, if you have 40 or
  //  more life, you win the game."
  //
  // `condition` and not a boolean marker, because `dslConditionHolds` in
  // `trigger-bridge.ts` gates on that field and reads nothing else. The old
  // `interveningIf: true` marker was read by no consumer in `src/lib/game`,
  // which is exactly how a dropped condition stayed invisible.
  const list = abilities(
    'FelidarSovereign',
    "Vigilance (Attacking doesn't cause this creature to tap.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)\nAt the beginning of your upkeep, if you have 40 or more life, you win the game.",
  );
  const trigger = list.find((a) => a.kind === 'triggered') as TriggeredAbility;
  assert.ok(trigger, 'Felidar Sovereign lowered without a triggered ability');
  assert.deepEqual(trigger.condition, {
    if: 'value',
    a: { v: 'life', of: { who: 'you' } },
    cmp: 'gte',
    b: 40,
  });
});

test('a condition with no entry REFUSES the card and names itself — Blink of an Eye', () => {
  // "Kicker {1}{U} … Return target nonland permanent to its owner's hand. If
  //  this spell was kicked, draw a card."
  //
  // The refusal is the test. `KickedCondition` has no entry because kicker is
  // not modelled at all, so nothing ever records that the extra cost was paid.
  // Lowering it anyway gives a Blink of an Eye that draws a card every time, for
  // free, and says nothing about it.
  const { lowered } = card(
    'BlinkOfAnEye',
    "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card.",
  );
  assert.equal(lowered.ok, false);
  assert.ok(
    lowered.blocked.some((b) => b.result.missing.includes('condition:KickedCondition')),
    `expected condition:KickedCondition in ${JSON.stringify(lowered.blocked.map((b) => b.result.missing))}`,
  );
});

test('Cultivate still refuses, and the reason is one named effect class', () => {
  // "Search your library for up to two basic land cards, reveal those cards, put
  //  one onto the battlefield tapped and the other into your hand, then shuffle."
  //
  // Worth stating plainly: `docs/engine/CARD-SEMANTICS.md` reports Cultivate as
  // resolving all four of its argument slots, and that is still true. Resolving
  // every slot and being runnable are different claims, which is the whole
  // reason coverage is reported as four numbers and not one.
  const { lowered } = card(
    'Cultivate',
    'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
  );
  assert.equal(lowered.ok, false);
  assert.ok(
    lowered.blocked.some((b) =>
      b.result.missing.includes('xmage:SearchLibraryPutOntoBattlefieldTappedRestInHandEffect'),
    ),
  );
});

/* ------------------------------------------------------------------ *
 * Whole-corpus properties of the fixtures
 * ------------------------------------------------------------------ */

test('every ability the port produces survives JSON, because the action log has to', () => {
  // A lowered ability travels to other clients inside the action log. A closure,
  // a `Map` or an `undefined` in the wrong place would replay differently on the
  // machine that received it, which is the failure mode the DSL's serialisation
  // contract exists to stop.
  for (const [cls, f] of Object.entries(PORT_FIXTURES)) {
    for (const entry of lowerCard(f.record).abilities) {
      assert.doesNotThrow(() => assertSerialisable(entry.ability), `${cls} ${entry.id}`);
    }
  }
});

test('no fixture lowers to an ability with no effects and no modifications', () => {
  // The silent success this whole port is arranged against: an ability that
  // reports `ok` and changes nothing. `verify-ability-coverage.mjs` downgraded
  // 612 cards for exactly that. `xmage:InfoEffect` is the one legitimate empty
  // result, because XMage's own `apply` is a bare `return true`.
  //
  // That allowance used to be stated in this comment and NOT implemented: no
  // fixture had an InfoEffect-only ability, so nothing exercised it and the
  // check and its own comment disagreed. Hare Apparent's second paragraph is
  // one ("a deck can have any number of cards named Hare Apparent"), so the
  // allowance is now written down as code, by name, against the source record.
  // Corpus-wide there are exactly two such abilities, on Hare Apparent and
  // Indicate, both InfoEffect and nothing else.
  for (const [cls, f] of Object.entries(PORT_FIXTURES)) {
    const source = new Map(abilitiesOf(f.record).map((a) => [a.id, a]));
    for (const entry of lowerCard(f.record).abilities) {
      const ability = entry.ability!;
      if (ability.kind === 'keyword') continue;
      if (ability.kind === 'replacement') continue;
      if (ability.kind === 'static') {
        assert.ok(ability.modifications.length > 0, `${cls} ${entry.id}`);
        continue;
      }
      if (effectsOf(ability).length > 0) continue;
      const record = source.get(entry.id);
      // `invocationsInAbility` includes the ability class itself, which is not
      // an effect, so it is excluded by name before the check.
      const effects = record
        ? invocationsInAbility(record).filter((i) => i.prim !== record.via.prim)
        : [];
      const infoOnly = effects.length > 0 && effects.every((i) => i.prim === 'xmage:InfoEffect');
      assert.ok(infoOnly, `${cls} ${entry.id} lowered to nothing and is not InfoEffect`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * The "…Source" family and the two-target effects
 *
 * These entries were absent for no reason anybody had written down: their
 * "…Target" siblings were all present, so a reader could reasonably assume the
 * source versions had been refused deliberately. They had not. Each is pinned
 * here so the pair stays a pair.
 * ------------------------------------------------------------------ */

test('xmage:UntapSourceEffect — Blistercoil Weird', () => {
  // "Whenever you cast an instant or sorcery spell, this creature gets +1/+1
  //  until end of turn. Untap it."
  //
  // `{sel:'self'}`, not `{sel:'target'}`. The card announces no target, so a
  // lowering that reached for `targetRef` would produce a ref the ability does
  // not carry, which `danglingTargetRef` refuses before the card ships.
  const ability = only(
    'BlistercoilWeird',
    'Whenever you cast an instant or sorcery spell, this creature gets +1/+1 until end of turn. Untap it.',
  );
  const effects = effectsOf(ability);
  assert.deepEqual(
    effects.find((e) => e.do === 'untap'),
    { do: 'untap', what: { sel: 'self' } },
  );
});

test('xmage:PutOnLibraryTargetEffect — Academy Ruins, and `onTop` is the whole card', () => {
  // "{T}: Add {C}.
  //  {1}{U}, {T}: Put target artifact card from your graveyard on top of your library."
  //
  // `onTop` decides between tucking a card where its owner draws it next and
  // burying it at the bottom. It is a required constructor argument in every
  // XMage overload, so this lowering treats an absent one as a hole rather than
  // defaulting it, and the assertion below is what stops a default creeping in.
  const list = abilities(
    'AcademyRuins',
    '{T}: Add {C}.\n{1}{U}, {T}: Put target artifact card from your graveyard on top of your library.',
  );
  const move = list.flatMap(effectsOf).find((e) => e.do === 'move-zone');
  assert.deepEqual(move, {
    do: 'move-zone',
    what: { sel: 'target', ref: 0 },
    to: 'library',
    position: 'top',
  });
});

test('xmage:FightTargetsEffect — Epic Confrontation deals BOTH damages', () => {
  // "Target creature you control gets +1/+2 until end of turn. It fights target
  //  creature you don't control. (Each deals damage equal to its power to the
  //  other.)"
  //
  // A fight is two damages, not one. Lowering only the first half gives a card
  // that kills the opponent's creature and never loses yours, which is a
  // strictly better card than the one printed and would never be reported.
  //
  // The power is read as `{v:'power'}` and not baked in, because the pump on
  // the same card changes it: Epic Confrontation's +1/+2 has to be on the
  // creature before the fight is measured, and a number captured at compile
  // time would fight at the printed power.
  const ability = only(
    'EpicConfrontation',
    "Target creature you control gets +1/+2 until end of turn. It fights target creature you don't control. (Each deals damage equal to its power to the other.)",
  );
  const damages = effectsOf(ability).filter((e) => e.do === 'damage');
  assert.equal(damages.length, 2, `expected two damages, got ${JSON.stringify(damages)}`);
  assert.deepEqual(damages[0], {
    do: 'damage',
    to: { sel: 'target', ref: 1 },
    amount: { v: 'power', of: { sel: 'target', ref: 0 } },
  });
  assert.deepEqual(damages[1], {
    do: 'damage',
    to: { sel: 'target', ref: 0 },
    amount: { v: 'power', of: { sel: 'target', ref: 1 } },
  });
});

test('xmage:DamageWithPowerFromOneToAnotherTargetEffect — Animist\'s Might keeps the multiplier', () => {
  // "… Target creature you control deals damage equal to TWICE its power to
  //  target creature or planeswalker you don't control."
  //
  // One damage, not two: this is the one-way fight. The multiplier is the half
  // that is invisible once wrong — the card still resolves, still kills things,
  // and does half the damage it says.
  const list = abilities(
    'AnimistsMight',
    "This spell costs {2} less to cast if it targets a legendary creature you control.\nTarget creature you control deals damage equal to twice its power to target creature or planeswalker you don't control.",
  );
  const damages = list.flatMap(effectsOf).filter((e) => e.do === 'damage');
  assert.equal(damages.length, 1);
  assert.deepEqual(damages[0], {
    do: 'damage',
    to: { sel: 'target', ref: 1 },
    amount: { v: 'mul', of: [{ v: 'power', of: { sel: 'target', ref: 0 } }, 2] },
  });
});

test('xmage:GetEnergyCountersControllerEffect — energy is a PLAYER counter', () => {
  // "Search your library for a basic land card, reveal it, put it into your
  //  hand, then shuffle. You get {E}{E} (two energy counters)."
  //
  // `{do:'player-counter'}` and not `{do:'add-counters'}`. Energy lives on the
  // player, and energy put on a permanent would be uncountable and unspendable
  // by everything that reads it.
  const ability = only(
    'AttuneWithAether',
    'Search your library for a basic land card, reveal it, put it into your hand, then shuffle. You get {E}{E} (two energy counters).',
  );
  assert.deepEqual(
    effectsOf(ability).find((e) => e.do === 'player-counter'),
    { do: 'player-counter', who: { who: 'you' }, counter: 'energy', count: 2 },
  );
});
