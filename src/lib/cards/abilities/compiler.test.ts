/**
 * Unit tests for the ability compiler.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/compiler.test.ts
 *
 * Oracle text below is copied verbatim from our own `cards` rows, including the
 * post-2024 templating ("When this creature enters", not "When CARDNAME enters
 * the battlefield") and the short self-reference legendary cards use ("When
 * Sephiroth enters"). Testing against remembered wordings would validate a
 * compiler against a catalogue we do not have.
 *
 * Every case asserts what MUST be produced and, where it matters, what MUST NOT
 * be. The negative half is the point. A compiler's dangerous failure is not the
 * clause it misses — that one is visible, marked and resolved by hand — it is
 * the clause it reads WRONGLY, which resolves silently and corrupts a game. So
 * the refusal tests below are load-bearing: they assert that specific real
 * cards produce NO ability rather than a plausible-looking wrong one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities, compileWithTrace, assertClausesAccounted } from './compiler.ts';
import { normalizeCard, normalizeParagraph, selfNames } from './normalize.ts';
import { deriveCoverage, assertSerialisable, hasManualEffect, effectsOf, PROTECTION_FROM_CHOSEN_COLOR } from './dsl.ts';
import type { Ability, Effect } from './dsl.ts';
import { KEYWORDS, parseObject, parseKeywordList, parseGrantList, parseDuration, parseCondition } from './grammar.ts';
import { peelInterveningIf, parseAlternativeCost, parseCosts } from './clause-rules.ts';
// A test file is a leaf, so it may import from `game` even though the compiler
// may not. This is the drift check between the two keyword lists.
import {
  ENGINE_KEYWORDS,
  ADVISORY_KEYWORDS,
  ENFORCED_CARD_KEYWORDS,
  FLAGGABLE_KEYWORDS,
  keywordSupport,
} from '../../game/keywords.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Row {
  name: string;
  type_line: string;
  oracle_text?: string;
  faces?: Array<{ name?: string; type_line?: string; oracle_text?: string }>;
  layout?: string;
}

const compile = (row: Row) => compileCardAbilities({ oracle_id: row.name, ...row });

const kinds = (row: Row): string[] => compile(row).abilities.map((a) => a.kind);

/** Every effect in an ability tree, flattened, for `assert.deepEqual` on one. */
function allEffects(ability: Ability): Effect[] {
  const out: Effect[] = [];
  const walk = (effects: readonly Effect[]): void => {
    for (const e of effects) {
      out.push(e);
      if (e.do === 'if') { walk(e.then); if (e.else) walk(e.else); }
      else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') walk(e.effects);
      else if (e.do === 'choose-mode') for (const m of e.modes) walk(m.effects);
    }
  };
  walk(effectsOf(ability));
  return out;
}

const firstOfKind = <K extends Ability['kind']>(row: Row, kind: K): Extract<Ability, { kind: K }> | undefined =>
  compile(row).abilities.find((a): a is Extract<Ability, { kind: K }> => a.kind === kind);

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

test('reminder text is stripped before any rule sees the paragraph', () => {
  // Smothering Tithe's Treasure reminder would otherwise compile into a mana
  // ability the card does not have.
  const norm = normalizeParagraph(
    'Create a Treasure token. ({T}, Sacrifice this token: Add one mana of any color.)',
    [],
  );
  assert.equal(norm, 'create a treasure token.');
});

test('a card whose entire text is reminder text compiles to nothing, not to garbage', () => {
  // Taiga: its mana ability comes from its land subtypes, and its only oracle
  // text is the reminder. Compiling that reminder would be a fabricated ability.
  const result = compile({ name: 'Taiga', type_line: 'Land — Mountain Forest', oracle_text: '({T}: Add {R} or {G}.)' });
  assert.equal(result.abilities.length, 0);
  assert.equal(result.unparsed.length, 0);
  assert.equal(result.coverage, 'none');
});

test("the card's own name and its post-2024 self-reference both become the same token", () => {
  const byName = compile({
    name: 'Blasphemous Act', type_line: 'Sorcery',
    oracle_text: 'Blasphemous Act deals 13 damage to each creature.',
  });
  const byThis = compile({
    name: 'Nameless Test Card', type_line: 'Sorcery',
    oracle_text: 'This spell deals 13 damage to each creature.',
  });
  assert.equal(byName.abilities.length, 1);
  assert.deepEqual(allEffects(byName.abilities[0]), allEffects(byThis.abilities[0]));
});

test('a legendary short name is a self-reference; "Sephiroth" means this creature', () => {
  const result = compile({
    name: "Sephiroth, Planet's Heir", type_line: 'Legendary Creature — Human Avatar Soldier',
    oracle_text: 'Whenever a creature an opponent controls dies, put a +1/+1 counter on Sephiroth.',
  });
  const trigger = result.abilities[0];
  assert.equal(trigger.kind, 'triggered');
  assert.deepEqual(allEffects(trigger), [
    { do: 'add-counters', what: { sel: 'self' }, counter: '+1/+1', count: 1 },
  ]);
});

test('a short name that is also a subtype is NOT shortened', () => {
  // "Rhino, ..." must not turn the Rhino creature type into a self-reference.
  const result = compile({
    name: 'Rhino, Test Subject', type_line: 'Legendary Creature — Rhino',
    oracle_text: 'Rhino creatures you control get +1/+1.',
  });
  const s = result.abilities[0];
  assert.equal(s.kind, 'static');
  assert.deepEqual((s as { affects: unknown }).affects, {
    sel: 'all', where: { is: 'and', of: [{ is: 'subtype', value: 'rhino' }, { is: 'type', value: 'creature' }] },
    controller: { who: 'you' }, zone: 'battlefield',
  });
});

test('a legend named Firstname Lastname is addressed by its first name; "Edgar" means Edgar Markov', () => {
  // Oracle text as our `cards` row holds it: the short form, no comma in the
  // name and no "of" or "the" to cut at. The attack trigger is a shape the
  // compiler has read for a long time — Cordial Vampire compiles the same
  // "put a +1/+1 counter on each Vampire you control" — so the only thing
  // between Edgar and a record was the word "edgar" standing where "~" goes.
  const result = compile({
    name: 'Edgar Markov', type_line: 'Legendary Creature — Vampire Knight',
    oracle_text:
      'Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.',
  });
  // Two triggers now: the eminence line reads as well (its condition is a
  // marker), so the attack trigger is found by its event, not by position.
  const attack = result.abilities.find(
    (a) => a.kind === 'triggered' && (a as { event: { on: string } }).event.on === 'attacks',
  );
  assert.ok(attack, 'the attack trigger must produce a record');
  assert.deepEqual((attack as { event: unknown }).event, { on: 'attacks', who: { sel: 'self' } });
  assert.deepEqual(allEffects(attack!), [
    {
      do: 'add-counters',
      what: { sel: 'all', where: { is: 'subtype', value: 'vampire' }, controller: { who: 'you' }, zone: 'battlefield' },
      counter: '+1/+1',
      count: 1,
    },
  ]);
  // The eminence condition is still a marker, and the record must still SAY so.
  assert.equal(result.coverage, 'partial');
});

test('the first-name short form is offered only where it is a name', () => {
  const names = (card: Parameters<typeof selfNames>[0]) => selfNames(card);

  // Firstname Lastname legends: the first word is how the text addresses them.
  assert.ok(names({ name: 'Edgar Markov', type_line: 'Legendary Creature — Vampire Knight' }).includes('edgar'));
  assert.ok(names({ name: 'Zurgo Helmsmasher', type_line: 'Legendary Creature — Orc Warrior' }).includes('zurgo'));
  assert.ok(names({ name: 'Kaito Shizuki', type_line: 'Legendary Planeswalker — Kaito' }).includes('kaito'));

  // "<Owner>'s <Thing>" is a Thing. Folding "marit" would rewrite the token
  // this card creates, "Marit Lage", into "~ Lage".
  assert.ok(!names({ name: "Marit Lage's Slumber", type_line: 'Legendary Snow Enchantment' }).includes('marit'));

  // A game object is not a name: "Dungeon Delver" talks about dungeons.
  assert.ok(!names({ name: 'Dungeon Delver', type_line: 'Legendary Enchantment — Background' }).includes('dungeon'));

  // A subtype is not a name, same guard as the comma form.
  assert.ok(!names({ name: 'Sliver Hivelord', type_line: 'Legendary Creature — Sliver' }).includes('sliver'));

  // The convention is a legendary one. A non-legendary two-word card keeps its
  // first word as an ordinary word: "ember counter" must not become "~ counter".
  assert.ok(!names({ name: 'Ember Warden', type_line: 'Creature — Elemental' }).includes('ember'));
  assert.equal(
    normalizeParagraph('Whenever another creature dies, put an ember counter on Ember Warden.', names({ name: 'Ember Warden', type_line: 'Creature — Elemental' })),
    'whenever another creature dies, put an ember counter on ~.',
  );
});

test('ability words are stripped, but "Choose one —" is not', () => {
  assert.equal(normalizeParagraph('Landfall — Whenever a land you control enters, draw a card.', []),
    'whenever a land you control enters, draw a card.');
  assert.equal(normalizeParagraph('Choose one —', []), 'choose one -');
});

test('802 rows keep their text on faces; the front face still compiles', () => {
  const result = compile({
    name: 'Test Transform', type_line: '', layout: 'transform',
    faces: [
      { name: 'Test Transform', type_line: 'Creature — Human', oracle_text: 'When this creature enters, draw a card.' },
      { name: 'Test Transformed', type_line: 'Creature — Werewolf', oracle_text: 'Flying' },
    ],
  });
  assert.equal(result.abilities.length, 1);
  assert.equal(result.abilities[0].kind, 'triggered');
  // The back face is recorded, not silently merged and not silently dropped.
  assert.equal(result.unparsed.length, 1);
  assert.equal(result.unparsed[0].reason, 'multi-face');
});

/* ------------------------------------------------------------------ *
 * The high-frequency templates the build targeted
 * ------------------------------------------------------------------ */

test('ETB draw', () => {
  const a = compile({ name: 'Elvish Visionary', type_line: 'Creature — Elf Shaman', oracle_text: 'When this creature enters, draw a card.' }).abilities[0];
  assert.equal(a.kind, 'triggered');
  assert.deepEqual((a as { event: unknown }).event, { on: 'enters', who: { sel: 'self' } });
  assert.deepEqual(allEffects(a), [{ do: 'draw', who: { who: 'you' }, count: 1 }]);
});

test('ETB life gain and ETB token', () => {
  const life = compile({ name: 'Test Angel', type_line: 'Creature — Angel', oracle_text: 'When this creature enters, you gain 3 life.' }).abilities[0];
  assert.deepEqual(allEffects(life), [{ do: 'gain-life', who: { who: 'you' }, amount: 3 }]);

  const token = compile({ name: 'Test Captain', type_line: 'Creature — Human Soldier', oracle_text: 'When this creature enters, create a 1/1 white Soldier creature token.' }).abilities[0];
  assert.deepEqual(allEffects(token), [{
    do: 'create-token', who: { who: 'you' }, count: 1,
    token: { name: 'Soldier', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1', colorIdentity: ['W'] },
  }]);
});

test('ETB counter placement, targeted', () => {
  const a = compile({ name: 'Test Shaman', type_line: 'Creature — Elf', oracle_text: 'When this creature enters, put a +1/+1 counter on target creature.' }).abilities[0];
  assert.deepEqual(allEffects(a), [{ do: 'add-counters', what: { sel: 'target', ref: 0 }, counter: '+1/+1', count: 1 }]);
  assert.deepEqual((a as { targets: unknown }).targets, [{
    what: 'card', filter: { is: 'type', value: 'creature' }, min: 1, max: 1,
    prompt: 'Choose where to put counters', zone: 'battlefield', ref: 0,
  }]);
});

test('"whenever this attacks" and "whenever this dies"', () => {
  const attacks = compile({ name: 'Test Raider', type_line: 'Creature — Orc', oracle_text: 'Whenever this creature attacks, you gain 1 life.' }).abilities[0];
  assert.deepEqual((attacks as { event: unknown }).event, { on: 'attacks', who: { sel: 'self' } });

  const dies = compile({ name: 'Test Imp', type_line: 'Creature — Imp', oracle_text: 'When this creature dies, draw a card.' }).abilities[0];
  assert.deepEqual((dies as { event: unknown }).event, { on: 'dies', who: { sel: 'self' } });
});

test('"whenever a creature you control dies" targets the group, not the source', () => {
  const a = compile({ name: 'Test Aristocrat', type_line: 'Creature — Human', oracle_text: 'Whenever a creature you control dies, each opponent loses 1 life.' }).abilities[0];
  assert.deepEqual((a as { event: unknown }).event, {
    on: 'dies',
    who: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' },
  });
  assert.deepEqual(allEffects(a), [{ do: 'lose-life', who: { who: 'each-opponent' }, amount: 1 }]);
});

test('"enters or attacks" becomes two abilities, which is exactly equivalent', () => {
  const result = compile({ name: 'Grave Titan', type_line: 'Creature — Giant', oracle_text: 'Whenever this creature enters or attacks, create two 2/2 black Zombie creature tokens.' });
  assert.equal(result.abilities.length, 2);
  assert.deepEqual(result.abilities.map((a) => (a as { event: { on: string } }).event.on), ['enters', 'attacks']);
  // Both carry the same verbatim oracle clause — nothing is invented.
  assert.equal(result.abilities[0].text, result.abilities[1].text);
});

test('sacrifice cost, and the cost is not confused with the effect', () => {
  const a = compile({
    name: 'Sakura-Tribe Elder', type_line: 'Creature — Snake Shaman',
    oracle_text: 'Sacrifice this creature: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
  }).abilities[0];
  assert.equal(a.kind, 'activated');
  assert.deepEqual((a as { costs: unknown }).costs, [{ pay: 'sacrifice', what: { sel: 'self' }, count: 1 }]);
  assert.deepEqual(allEffects(a), [{
    do: 'search-library', who: { who: 'you' },
    what: { sel: 'all', where: { is: 'and', of: [{ is: 'type', value: 'land' }, { is: 'supertype', value: 'basic' }] }, zone: 'library' },
    count: 1, to: 'battlefield', thenShuffle: true, tapped: true,
  }]);
});

test('tap for mana, and a mana ability is flagged as one', () => {
  const sol = compile({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' }).abilities[0];
  assert.deepEqual((sol as { costs: unknown }).costs, [{ pay: 'tap' }]);
  assert.deepEqual(allEffects(sol), [{ do: 'add-mana', who: { who: 'you' }, mana: '{C}{C}' }]);
  assert.equal((sol as { isManaAbility?: boolean }).isManaAbility, true);
});

test('"add one mana of any color" is a choice, and choosing is still a mana ability', () => {
  const a = compile({ name: 'Birds of Paradise', type_line: 'Creature — Bird', oracle_text: '{T}: Add one mana of any color.' }).abilities[0];
  assert.equal((a as { isManaAbility?: boolean }).isManaAbility, true);
  const effects = effectsOf(a);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].do, 'choose-mode');
  assert.equal((effects[0] as { modes: unknown[] }).modes.length, 5);
});

test('anthem is a layer 7c modification, not a pump', () => {
  const a = compile({ name: 'Glorious Anthem', type_line: 'Enchantment', oracle_text: 'Creatures you control get +1/+1.' }).abilities[0];
  assert.equal(a.kind, 'static');
  assert.deepEqual((a as { modifications: unknown }).modifications, [{ layer: 'pt-modify', power: 1, toughness: 1 }]);
});

test('cost reduction', () => {
  const a = compile({ name: 'Ruby Medallion', type_line: 'Artifact', oracle_text: 'Red spells you cast cost {1} less to cast.' }).abilities[0];
  assert.equal(a.kind, 'static');
  const mod = (a as { modifications: Array<{ layer: string; delta: number; forWhom: unknown }> }).modifications[0];
  assert.equal(mod.layer, 'cost-modify');
  assert.equal(mod.delta, -1);
  assert.deepEqual(mod.forWhom, { who: 'you' });
});

test('"enters tapped" is a replacement effect, not a static one', () => {
  const a = compile({ name: 'Test Gate', type_line: 'Land — Gate', oracle_text: 'This land enters tapped.' }).abilities[0];
  assert.equal(a.kind, 'replacement');
  assert.deepEqual((a as { event: unknown }).event, { on: 'enters', who: { sel: 'self' } });
  assert.deepEqual((a as { result: unknown }).result, { do: 'enters-tapped' });
  assert.equal((a as { selfReplacement?: boolean }).selfReplacement, true);
});

test('"enters with N counters"', () => {
  const a = compile({ name: 'Test Hydra', type_line: 'Creature — Hydra', oracle_text: 'This creature enters with two +1/+1 counters on it.' }).abilities[0];
  assert.deepEqual((a as { result: unknown }).result, { do: 'enters-with-counters', counter: '+1/+1', count: 2 });
});

test('targeted damage registers "any target" as a target, not as a player', () => {
  const a = compile({ name: 'Lightning Bolt', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.' }).abilities[0];
  assert.deepEqual(allEffects(a), [{ do: 'damage', to: { sel: 'target', ref: 0 }, amount: 3 }]);
  assert.deepEqual((a as { targets: Array<{ what: string }> }).targets[0].what, 'any');
});

test('destroy target, with the filter read off the noun phrase', () => {
  const a = compile({ name: 'Doom Blade', type_line: 'Instant', oracle_text: 'Destroy target nonblack creature.' }).abilities[0];
  assert.deepEqual((a as { targets: Array<{ filter: unknown }> }).targets[0].filter, {
    is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'not', of: { is: 'color', value: 'B' } }],
  });
});

test('counter target spell targets the stack zone', () => {
  const a = compile({ name: 'Counterspell', type_line: 'Instant', oracle_text: 'Counter target spell.' }).abilities[0];
  assert.deepEqual(allEffects(a), [{ do: 'counter', what: { sel: 'target', ref: 0 } }]);
  assert.equal((a as { targets: Array<{ zone: string }> }).targets[0].zone, 'stack');
});

/* ------------------------------------------------------------------ *
 * "whenever you cast a spell that targets ..." — a relative clause on the
 * cast trigger's subject. Before this shape was read, `(.+) spell$` needed
 * the phrase to END at "spell", so Feather, Zada and all 53 heroic creatures
 * produced no cast trigger at all (97 cards in the catalogue, 0 read).
 * ------------------------------------------------------------------ */

test('a cast trigger that says what the spell targets keeps the clause as a filter on the spell', () => {
  // Feather, the Redeemed. The replacement-and-return effect stays a manual
  // marker; the TRIGGER is what a deck builder needs, and it has to carry the
  // types AND the "creature you control" so the plan wants all three.
  const a = firstOfKind({
    name: 'Feather, the Redeemed', type_line: 'Legendary Creature — Angel',
    oracle_text: 'Flying\nWhenever you cast an instant or sorcery spell that targets a creature you control, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.',
  }, 'triggered');
  assert.ok(a && a.kind === 'triggered');
  assert.deepEqual(a.event, {
    on: 'cast',
    what: {
      sel: 'all',
      where: {
        is: 'and',
        of: [
          { is: 'or', of: [{ is: 'type', value: 'instant' }, { is: 'type', value: 'sorcery' }] },
          { is: 'targets', of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' } },
        ],
      },
      zone: 'stack',
    },
    by: { who: 'you' },
  });
  assert.ok(hasManualEffect(a.effects), 'the replacement effect is still a marker, and says so');
});

test('"targets only ~" is the source, and "only" survives: a Zada copy must not fire for a spell aimed at two things', () => {
  const a = firstOfKind({
    name: 'Zada, Hedron Grinder', type_line: 'Legendary Creature — Goblin Ally',
    oracle_text: 'Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
  }, 'triggered');
  assert.ok(a && a.kind === 'triggered' && a.event.on === 'cast');
  const where = (a.event as { what: { where: { is: string; of: unknown[] } } }).what.where;
  assert.equal(where.is, 'and');
  assert.deepEqual(where.of[1], { is: 'targets', of: { sel: 'self' }, only: true });
});

test('heroic is a cast trigger aimed at the source, and a heroic creature with a readable effect is then full', () => {
  const r = compile({
    name: 'Akroan Skyguard', type_line: 'Creature — Human Soldier',
    oracle_text: 'Flying\nHeroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.',
  });
  const t = r.abilities.find((x) => x.kind === 'triggered');
  assert.ok(t && t.kind === 'triggered');
  assert.deepEqual(t.event, {
    on: 'cast',
    what: { sel: 'all', where: { is: 'targets', of: { sel: 'self' } }, zone: 'stack' },
    by: { who: 'you' },
  });
  assert.equal(r.coverage, 'full');
});

test('"a single" and "one or more" are count words with no bearing on WHICH object, and are peeled', () => {
  // Precursor Golem: "a player casts", "only a single Golem".
  const golem = firstOfKind({
    name: 'Precursor Golem', type_line: 'Artifact Creature — Golem',
    oracle_text: 'Whenever a player casts an instant or sorcery spell that targets only a single Golem, that player copies that spell for each other Golem that spell could target. Each copy targets a different one of those Golems.',
  }, 'triggered');
  assert.ok(golem && golem.kind === 'triggered' && golem.event.on === 'cast');
  const event = golem.event as { by: unknown; what: { where: { of: unknown[] } } };
  assert.deepEqual(event.by, { who: 'each-player' });
  assert.deepEqual(event.what.where.of[1], {
    is: 'targets', of: { sel: 'all', where: { is: 'subtype', value: 'golem' }, zone: 'battlefield' }, only: true,
  });

  // Storm, Windrider: "one or more creatures", any controller.
  const storm = compile({
    name: 'Storm, Windrider', type_line: 'Legendary Creature — Human Mutant',
    oracle_text: 'Whenever you cast a spell that targets one or more creatures, those creatures gain flying until end of turn.',
  }).abilities.find((x) => x.kind === 'triggered');
  assert.ok(storm && storm.kind === 'triggered');
  assert.deepEqual((storm.event as { what: { where: unknown } }).what.where, {
    is: 'targets', of: { sel: 'all', where: { is: 'type', value: 'creature' }, zone: 'battlefield' },
  });
});

test('a targeting clause that names a player, or a word the grammar does not read, refuses the whole trigger', () => {
  // A player is not a card filter; "other than Ivy" is a name; "a single
  // player" is a player. Reading any of these as "a creature" would fire the
  // trigger for the wrong spells, which is worse than not reading it.
  const rows: Row[] = [
    { name: 'Reparations', type_line: 'Enchantment', oracle_text: 'Whenever an opponent casts a spell that targets you or a creature you control, you may draw a card.' },
    { name: 'Ivy, Gleeful Spellthief', type_line: 'Legendary Creature — Faerie Rogue', oracle_text: 'Flying\nWhenever a player casts a spell that targets only a single creature other than Ivy, you may copy that spell. The copy targets Ivy. (A copy of an Aura spell becomes a token.)' },
    { name: 'Ricochet', type_line: 'Enchantment', oracle_text: 'Whenever a player casts a spell that targets a single player, each player rolls a six-sided die. Change the target of that spell to the player with the lowest result. Reroll to break ties, if necessary.' },
  ];
  for (const row of rows) {
    const r = compile(row);
    assert.ok(!r.abilities.some((x) => x.kind === 'triggered' && x.event.on === 'cast'), row.name);
    assert.ok(r.unparsed.length > 0, `${row.name} is reported unread, not silently dropped`);
  }
});

test('search your library', () => {
  const a = compile({ name: 'Rampant Growth', type_line: 'Sorcery', oracle_text: 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.' }).abilities[0];
  const e = allEffects(a)[0] as { do: string; to: string; tapped?: boolean; thenShuffle: boolean };
  assert.equal(e.do, 'search-library');
  assert.equal(e.to, 'battlefield');
  assert.equal(e.tapped, true);
  assert.equal(e.thenShuffle, true);
});

test('"you may" wraps the inner effect rather than dropping the optionality', () => {
  const result = compile({
    name: 'Solemn Simulacrum', type_line: 'Artifact Creature — Golem',
    oracle_text: 'When this creature dies, you may draw a card.',
  });
  const effects = effectsOf(result.abilities[0]);
  assert.equal(effects[0].do, 'may');
  assert.deepEqual((effects[0] as { effects: unknown }).effects, [{ do: 'draw', who: { who: 'you' }, count: 1 }]);
});

/* ------------------------------------------------------------------ *
 * "X, then you may Y" — Chulane's shape
 * ------------------------------------------------------------------ */

test('"draw a card, then you may put a land card from your hand onto the battlefield" splits into a draw and an optional land drop', () => {
  // Chulane, Teller of Tales. The compound used to land whole in `manual`.
  const result = compile({
    name: 'Chulane, Teller of Tales', type_line: 'Legendary Creature — Human Druid',
    oracle_text: 'Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.\n{3}, {T}: Return target creature you control to its owner\'s hand.',
  });
  assert.equal(result.coverage, 'full');
  const trigger = result.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger);
  const effects = effectsOf(trigger);
  assert.deepEqual(effects[0], { do: 'draw', who: { who: 'you' }, count: 1 });
  assert.equal(effects[1].do, 'may');
  assert.deepEqual((effects[1] as { effects: unknown }).effects, [{
    do: 'return-from', zone: 'hand', who: { who: 'you' },
    what: { sel: 'all', where: { is: 'type', value: 'land' }, controller: { who: 'you' }, zone: 'hand' },
    count: 1, to: 'battlefield',
  }]);
});

test('the same land drop reads on its own, tapped or not, and the tapped word is kept', () => {
  // Sakura-Tribe Scout and Arboreal Grazer: both had NO record at all.
  const scout = compile({
    name: 'Sakura-Tribe Scout', type_line: 'Creature — Snake Shaman Scout',
    oracle_text: '{T}: You may put a land card from your hand onto the battlefield.',
  });
  assert.equal(scout.coverage, 'full');
  const inner = (effectsOf(scout.abilities[0])[0] as { effects: Array<{ do: string; tapped?: boolean }> }).effects;
  assert.equal(inner[0].do, 'return-from');
  assert.equal(inner[0].tapped, undefined);

  const grazer = compile({
    name: 'Arboreal Grazer', type_line: 'Creature — Beast',
    oracle_text: 'Reach\nWhen this creature enters, you may put a land card from your hand onto the battlefield tapped.',
  });
  assert.equal(grazer.coverage, 'full');
  const trigger = grazer.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger);
  const tapped = (effectsOf(trigger)[0] as { effects: Array<{ do: string; tapped?: boolean }> }).effects;
  assert.equal(tapped[0].do, 'return-from');
  assert.equal(tapped[0].tapped, true);
});

test('a sentence-initial "Then" is the same compound written across a full stop', () => {
  // Insidious Fungus's second mode; Nick Fury, Spymaster.
  const result = compile({
    name: 'Test Fungus', type_line: 'Creature — Fungus',
    oracle_text: 'When this creature enters, draw a card. Then you may put a land card from your hand onto the battlefield tapped.',
  });
  assert.equal(result.coverage, 'full');
  const effects = effectsOf(result.abilities[0]);
  assert.equal(effects[0].do, 'draw');
  assert.equal(effects[1].do, 'may');
});

test('a creature from the hand reads too, and "any number" / "up to" / "attacking" are refused', () => {
  const piper = compile({
    name: 'Elvish Piper', type_line: 'Creature — Elf Shaman',
    oracle_text: '{G}, {T}: You may put a creature card from your hand onto the battlefield.',
  });
  assert.equal(piper.coverage, 'full');
  const inner = (effectsOf(piper.abilities[0])[0] as { effects: Array<Record<string, unknown>> }).effects;
  assert.equal(inner[0].do, 'return-from');
  assert.equal(inner[0].zone, 'hand');
  assert.equal(inner[0].to, 'battlefield');

  // The refusals use invented names so the XMage table cannot answer for the
  // card: Ghalta, Stampede Tyrant has a lowering there and it would hide what
  // the RULE does with the sentence.

  // Ghalta's wording: "any number" is the player's number. A fixed 1 would be
  // the wrong ability, so the clause must stay a manual marker.
  const anyNumber = compile({
    name: 'Test Tyrant', type_line: 'Legendary Creature — Elder Dinosaur',
    oracle_text: 'When this creature enters, put any number of creature cards from your hand onto the battlefield.',
  });
  const anyTrigger = anyNumber.abilities.find((a) => a.kind === 'triggered');
  assert.ok(anyTrigger, JSON.stringify(anyNumber));
  assert.ok(hasManualEffect(effectsOf(anyTrigger)), JSON.stringify(anyTrigger));

  // Tooth and Nail's entwined half: "up to two" likewise.
  const tooth = compile({
    name: 'Test Tooth', type_line: 'Sorcery',
    oracle_text: 'Put up to two creature cards from your hand onto the battlefield.',
  });
  // A spell whose only sentence is refused produces no ability at all, which
  // is the stronger form of the same refusal.
  assert.equal(tooth.abilities.length, 0, JSON.stringify(tooth));
  assert.equal(tooth.coverage, 'manual');

  // Kaalia's wording: the runtime cannot put a creature onto the battlefield
  // attacking, and recording the move without the attack is her whole card
  // done wrong.
  const attacking = compile({
    name: 'Test Vast', type_line: 'Legendary Creature — Human Cleric',
    oracle_text: 'Flying\nWhenever this creature attacks an opponent, you may put an Angel, Demon, or Dragon creature card from your hand onto the battlefield tapped and attacking that opponent.',
  });
  // The paragraph stays unread (today the trigger itself is refused too), and
  // the assertion that matters is that no `return-from` was invented for it.
  const attackingEffects = attacking.abilities.flatMap((a) => allEffects(a));
  assert.ok(!attackingEffects.some((e) => e.do === 'return-from'), JSON.stringify(attacking));
  assert.notEqual(attacking.coverage, 'full');
});

test('loyalty abilities parse the U+2212 minus and are sorcery-speed', () => {
  const result = compile({
    name: 'Ajani, Caller of the Pride', type_line: 'Legendary Planeswalker — Ajani',
    oracle_text: '+1: Put a +1/+1 counter on up to one target creature.\n−3: Target creature gains flying and double strike until end of turn.',
  });
  assert.equal(result.abilities.length, 2);
  assert.deepEqual((result.abilities[0] as { costs: unknown }).costs, [{ pay: 'add-counters', counter: 'loyalty', count: 1, to: { sel: 'self' } }]);
  assert.deepEqual((result.abilities[1] as { costs: unknown }).costs, [{ pay: 'remove-counters', counter: 'loyalty', count: 3, from: { sel: 'self' } }]);
  assert.equal((result.abilities[0] as { timing?: string }).timing, 'sorcery');
  // "up to one target" keeps its cardinality.
  assert.equal((result.abilities[0] as { targets: Array<{ min: number }> }).targets[0].min, 0);
});

test('modal spells become one choose-mode, spanning the bullet paragraphs', () => {
  const result = compile({
    name: 'Test Charm', type_line: 'Instant',
    oracle_text: 'Choose one —\n• Destroy target artifact.\n• Target creature gets +2/+2 until end of turn.',
  });
  assert.equal(result.abilities.length, 1);
  const effects = effectsOf(result.abilities[0]);
  assert.equal(effects[0].do, 'choose-mode');
  assert.deepEqual((effects[0] as { min: number; max: number }).min, 1);
  assert.equal((effects[0] as { modes: unknown[] }).modes.length, 2);
  assert.equal(result.unparsed.length, 0);
});

/* ------------------------------------------------------------------ *
 * REFUSALS — the half that matters most
 * ------------------------------------------------------------------ */

test('an intervening-if clause the grammar cannot read is a marker, not silently dropped', () => {
  // Goblin Bushwhacker only pumps IF it was kicked. Reading the pump and
  // ignoring the condition would pump every time — a wrong ability.
  //
  // The pump IS on the record now, and that is safe for one reason only: the
  // condition is a `{do:'manual'}` marker in front of it, so `coverage` is
  // `partial`, and `abilityEngineOwns` refuses any card that is not `full`.
  // `trigger.dsl` is set by `ownedTriggersOf` and nowhere else, so nothing in
  // the runtime ever reaches the pump; the old detector quotes the clause and
  // asks for it by hand. The deck builder, which pays no condition, sees the
  // pump. Delete the marker and this card pumps every time.
  const result = compile({
    name: 'Goblin Bushwhacker', type_line: 'Creature — Goblin Warrior',
    oracle_text: 'When this creature enters, if it was kicked, creatures you control get +1/+0 and gain haste until end of turn.',
  });
  const a = result.abilities[0];
  assert.equal(a.kind, 'triggered');
  const effects = effectsOf(a);
  assert.equal(effects[0].do, 'manual');
  assert.equal((effects[0] as { text: string }).text, 'if it was kicked');
  assert.equal(effects[1]?.do, 'pump');
  // The condition was not read, so there is no condition and no flag claiming
  // one — a flag with nothing behind it is what `lowered.test.ts` forbids.
  assert.equal((a as { condition?: unknown }).condition, undefined);
  assert.equal((a as { interveningIf?: boolean }).interveningIf, undefined);
  assert.equal(result.coverage, 'partial');
});

test('a duration the DSL cannot express is refused rather than rounded to end of turn', () => {
  assert.equal(parseDuration('until end of combat'), null);
  assert.equal(parseDuration('until your next end step'), null);
  assert.equal(parseDuration('until end of turn'), 'end-of-turn');
});

test('a granted ability in quotes is never read as a keyword grant', () => {
  const result = compile({
    name: 'Test Lord', type_line: 'Enchantment',
    oracle_text: 'Creatures you control have "Whenever this creature deals combat damage to a player, draw a card."',
  });
  assert.equal(result.abilities.length, 0);
  assert.equal(result.unparsed[0].reason, 'granted-ability');
});

test('a keyword list containing a non-keyword refuses the whole list', () => {
  assert.deepEqual(parseKeywordList('flying, vigilance'), ['flying', 'vigilance']);
  assert.equal(parseKeywordList('flying, then draw a card'), null);
  assert.equal(parseKeywordList('flying, ferocity'), null);
});

test('an unreadable cost atom refuses the whole activated ability', () => {
  // Paying an unread cost too cheaply cannot be made safe by a marker, unlike
  // an unread effect. So the ability does not exist at all.
  const result = compile({
    name: 'Test Engine', type_line: 'Artifact',
    oracle_text: '{2}, Exile a creature card from among cards exiled with this artifact: Draw a card.',
  });
  assert.equal(result.abilities.length, 0);
  assert.ok(result.unparsed.length >= 1);
});

test('an unknown noun phrase is refused, never defaulted to "any"', () => {
  assert.equal(parseObject('gizmo'), null);
  assert.equal(parseObject('creature with a +1/+1 counter on it'), null);
  assert.equal(parseObject('permanent target opponent controls'), null);
  assert.ok(parseObject('artifact creature you control'));
});

test('"a creature you control" is a choice, and is refused rather than read as "all"', () => {
  // The exact failure this file's header warns about: a clause read WRONGLY.
  // `Selector` has no way to say "one of these, chosen on resolution" — the
  // only untargeted option is `{sel:'all'}`, which means every match. So
  // Whitemane Lion, which returns ONE creature you control, must not compile
  // into an effect that returns all of them. Once the trigger runtime resolves
  // compiled abilities for real, that difference is a board wipe.
  const lion = compile({
    name: 'Whitemane Lion', type_line: 'Creature — Cat',
    oracle_text: "Flash\nWhen this creature enters, return a creature you control to its owner's hand.",
  });
  const lionEffects = effectsOf(lion.abilities.find((a) => a.kind === 'triggered')!);
  assert.equal(lionEffects.length, 1);
  assert.equal(lionEffects[0].do, 'manual', 'the choice is handed to the player, not guessed');
  assert.notEqual(lion.coverage, 'full', 'so nothing downstream may claim it understands the card');

  // Guildless Commons is the same shape on lands, and the wrong reading sends
  // the land that just entered straight back to hand.
  const commons = compile({
    name: 'Guildless Commons', type_line: 'Land',
    oracle_text: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {C}{C}.",
  });
  assert.ok(
    hasManualEffect(effectsOf(commons.abilities.find((a) => a.kind === 'triggered')!)),
    'returning "a land you control" is likewise a choice'
  );

  // The positive half, so the refusal is narrow and not a blanket one: "each"
  // and plurals really do mean every match, and a named target still targets.
  const oath = compile({
    name: 'Oath of Ajani', type_line: 'Legendary Enchantment',
    oracle_text: 'When Oath of Ajani enters, put a +1/+1 counter on each creature you control.',
  });
  const oathEffects = effectsOf(oath.abilities[0]);
  assert.equal(oathEffects[0].do, 'add-counters');
  assert.deepEqual((oathEffects[0] as { what: unknown }).what, {
    sel: 'all',
    where: { is: 'type', value: 'creature' },
    controller: { who: 'you' },
    zone: 'battlefield',
  });

  const shock = compile({
    name: 'Test Bounce', type_line: 'Instant',
    oracle_text: "Return target creature to its owner's hand.",
  });
  assert.equal(effectsOf(shock.abilities[0])[0].do, 'move-zone', 'a targeted bounce still compiles');
});

test('a connective split is taken only when BOTH halves compile', () => {
  const ok = compile({ name: 'Test Rite', type_line: 'Instant', oracle_text: 'You gain 2 life and draw a card.' }).abilities[0];
  assert.deepEqual(allEffects(ok), [
    { do: 'gain-life', who: { who: 'you' }, amount: 2 },
    { do: 'draw', who: { who: 'you' }, count: 1 },
  ]);

  // The right half is unreadable, so the whole sentence goes to manual rather
  // than resolving its readable left half and quietly forgetting the rest.
  const half = compile({
    name: 'Test Rite Two', type_line: 'Instant',
    oracle_text: 'You gain 2 life and put a shield counter on each creature that attacked this turn.',
  });
  const effects = half.abilities.length ? effectsOf(half.abilities[0]) : [];
  assert.ok(effects.every((e) => e.do !== 'gain-life') || effects.some((e) => e.do === 'manual'));
});

test('vote, pile and "name a card" clauses land in hidden-choice, not in an ability', () => {
  const result = compile({
    name: 'Test Dilemma', type_line: 'Enchantment',
    oracle_text: "Council's dilemma — When this enchantment enters, starting with you, each player votes for time or tide.",
  });
  const a = result.abilities[0];
  assert.ok(hasManualEffect(effectsOf(a)));
});

/* ------------------------------------------------------------------ *
 * Invariants
 * ------------------------------------------------------------------ */

test('coverage is derived and cannot be spelled "full" while text was dropped', () => {
  assert.equal(deriveCoverage([], []), 'none');
  assert.equal(deriveCoverage([], [{ text: 'x', reason: 'unrecognised', span: [0, 1] }]), 'manual');

  const clean: Ability = { kind: 'spell', id: 'a0', text: 'x', confidence: 'exact', effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }] };
  assert.equal(deriveCoverage([clean], []), 'full');
  assert.equal(deriveCoverage([clean], [{ text: 'x', reason: 'unrecognised', span: [0, 1] }]), 'partial');

  const marked: Ability = { kind: 'spell', id: 'a0', text: 'x', confidence: 'exact', effects: [{ do: 'manual', text: 'x' }] };
  assert.equal(deriveCoverage([marked], []), 'partial');
});

test('every clause is accounted for: consumed spans plus gaps cover the text', () => {
  const rows: Row[] = [
    { name: 'Wrath of God', type_line: 'Sorcery', oracle_text: "Destroy all creatures. They can't be regenerated." },
    { name: 'Solemn Simulacrum', type_line: 'Artifact Creature — Golem', oracle_text: 'When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.' },
    { name: 'Test Charm', type_line: 'Instant', oracle_text: 'Choose one —\n• Destroy target artifact.\n• Draw a card.' },
    { name: 'Test Weird', type_line: 'Enchantment', oracle_text: 'Players can\'t gain life.\nSomething entirely unparseable happens here.' },
  ];
  for (const row of rows) assertClausesAccounted(compileWithTrace({ oracle_id: row.name, ...row }));
});

test('a partly-read ability keeps its unread clause INSIDE itself and stays runnable', () => {
  const result = compile({ name: 'Wrath of God', type_line: 'Sorcery', oracle_text: "Destroy all creatures. They can't be regenerated." });
  const effects = effectsOf(result.abilities[0]);
  assert.equal(effects[0].do, 'destroy');
  assert.equal(effects[1].do, 'manual');
  // Verbatim, so the note the runtime prints quotes the card and not a paraphrase.
  assert.match((effects[1] as { text: string }).text, /regenerated/);
  assert.equal(result.coverage, 'partial');
});

test('the whole record is pure JSON and survives structuredClone', () => {
  const result = compile({
    name: 'Ajani, Caller of the Pride', type_line: 'Legendary Planeswalker — Ajani',
    oracle_text: '+1: Put a +1/+1 counter on up to one target creature.\n−8: Create three 2/2 white Cat creature tokens.',
  });
  assertSerialisable(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), structuredClone(result));
});

test('the compiler is deterministic: the same row twice gives byte-identical output', () => {
  const row: Row = { name: 'Grave Titan', type_line: 'Creature — Giant', oracle_text: 'Deathtouch\nWhenever this creature enters or attacks, create two 2/2 black Zombie creature tokens.' };
  assert.equal(JSON.stringify(compile(row)), JSON.stringify(compile(row)));
});

test('oracleHash changes when the oracle text changes, and only then', () => {
  const a = normalizeCard({ name: 'X', oracle_text: 'Draw a card.' });
  const b = normalizeCard({ name: 'X', oracle_text: 'Draw a card.' });
  const c = normalizeCard({ name: 'X', oracle_text: 'Draw two cards.' });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('ability ids are stable and unique within a card', () => {
  const result = compile({
    name: 'Serra Angel', type_line: 'Creature — Angel',
    oracle_text: 'Flying\nVigilance\nWhen this creature enters, draw a card.',
  });
  assert.deepEqual(result.abilities.map((a) => a.id), ['a0', 'a1', 'a2']);
});

test('keyword vocabularies have not drifted from game/keywords.ts', () => {
  const known = new Set(KEYWORDS);
  const missing = [
    ...ENGINE_KEYWORDS,
    ...ADVISORY_KEYWORDS,
    ...ENFORCED_CARD_KEYWORDS,
  ].filter((k) => !known.has(k));
  assert.deepEqual(missing, [], `compiler does not recognise: ${missing.join(', ')}`);
});

test('a keyword is called enforced only where a live reader enforces it', () => {
  /*
   * `keywordSupport` decides whether a keyword ability is a rule or a badge,
   * and the coverage probe turns that answer into a card's whole verdict: ANY
   * dead ability makes the card SILENT. Two keywords were on the wrong side of
   * it, and both were burying real rules text sitting on the line underneath.
   *
   *   enchant  attach.ts::illegalHostReason, sba.ts::illegalAuraReason (704.5m),
   *            and moves.ts all refuse on it.
   *   flash    respond.ts::castTiming branches on isInstantSpeed, which is an
   *            instant OR anything with flash.
   *
   * This test is here so neither can be quietly demoted again, and so nothing
   * else is quietly PROMOTED: every one of the other 46 was grepped for a live
   * reader in src/lib/game and src/components/play, and none has one.
   */
  assert.equal(keywordSupport('enchant'), 'engine', 'attach.ts and sba.ts enforce it');
  assert.equal(keywordSupport('flash'), 'engine', 'respond.ts::castTiming enforces it');
  assert.equal(keywordSupport('Enchant'), 'engine', 'and it is case insensitive');

  for (const advisory of ADVISORY_KEYWORDS) {
    assert.equal(
      keywordSupport(advisory),
      'advisory',
      `${advisory} has no live reader and must not be claimed as enforced`
    );
  }

  // "protection from everything" is on the advisory list ON PURPOSE, and the
  // explicit listing beats the `startsWith('protection')` fallback below it.
  // `hasProtectionFrom` answers a named quality; "everything" is not one, so
  // claiming it as enforced would be the exact silent no-op this test exists
  // to prevent.
  assert.equal(keywordSupport('protection from red'), 'engine');
  assert.equal(keywordSupport('protection from everything'), 'advisory');

  assert.equal(keywordSupport('cycling'), 'advisory', 'compiled as a keyword line, nothing runs it');
  assert.equal(keywordSupport('nonsense'), 'advisory', 'an unknown keyword is never silently supported');
});

test('flash stays flaggable and enchant does not', () => {
  // Flagging flash by hand is meaningful: `hasKeyword` is what `isInstantSpeed`
  // reads. Flagging "enchant" onto a bear is not, so it is enforced without
  // being offered.
  assert.ok(FLAGGABLE_KEYWORDS.includes('flash'));
  assert.ok(!FLAGGABLE_KEYWORDS.includes('enchant'));
});

test('every rule regex compiles and stays lowercase-only', () => {
  // The rules match against lowercased text, so an uppercase literal is dead
  // weight that can never fire — the same guard `tagger.ts` runs on its table.
  const problems: string[] = [];
  for (const kw of KEYWORDS) if (/[A-Z]/.test(kw)) problems.push(`keyword "${kw}"`);
  assert.deepEqual(problems, []);
});

test('kind classification: keyword line, trigger, activated, static, replacement, spell', () => {
  assert.deepEqual(kinds({ name: 'K', type_line: 'Creature — Bird', oracle_text: 'Flying' }), ['keyword']);
  assert.deepEqual(kinds({ name: 'K', type_line: 'Creature — Bird', oracle_text: 'When this creature enters, draw a card.' }), ['triggered']);
  assert.deepEqual(kinds({ name: 'K', type_line: 'Artifact', oracle_text: '{T}: Add {C}.' }), ['activated']);
  assert.deepEqual(kinds({ name: 'K', type_line: 'Enchantment', oracle_text: 'Creatures you control get +1/+1.' }), ['static']);
  assert.deepEqual(kinds({ name: 'K', type_line: 'Land', oracle_text: 'This land enters tapped.' }), ['replacement']);
  assert.deepEqual(kinds({ name: 'K', type_line: 'Instant', oracle_text: 'Draw a card.' }), ['spell']);
  // A bare paragraph on a PERMANENT is not a spell ability; a static ability we
  // failed to read is far likelier, so it is reported as a gap instead.
  assert.deepEqual(kinds({ name: 'K', type_line: 'Enchantment', oracle_text: 'Draw a card.' }), []);
});

test('firstOfKind sanity: an Equipment reads its host, not itself', () => {
  const a = firstOfKind({ name: 'Test Blade', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature gets +2/+2.' }, 'static');
  assert.deepEqual((a as { affects: unknown }).affects, { sel: 'attached' });
});

test('activation restrictions become fields, not manual notes', () => {
  // A note does not stop a player activating at instant speed; `timing` does.
  const sorcery = compile({
    name: 'Test Font', type_line: 'Artifact',
    oracle_text: '{2}, {T}: Draw a card. Activate only as a sorcery.',
  }).abilities[0];
  assert.equal((sorcery as { timing?: string }).timing, 'sorcery');
  assert.deepEqual(effectsOf(sorcery), [{ do: 'draw', who: { who: 'you' }, count: 1 }]);

  const once = compile({
    name: 'Test Relic', type_line: 'Artifact',
    oracle_text: '{1}: You gain 1 life. Activate only once each turn.',
  }).abilities[0];
  assert.deepEqual((once as { limit?: unknown }).limit, { per: 'turn', count: 1 });
});

/* ------------------------------------------------------------------ *
 * CR 603.4 — the intervening "if"
 *
 * "[Ability word] — [trigger], if [condition], [effect]". The ability word is
 * a label and was already stripped; the condition clause was not, so the whole
 * body became one manual marker and the trigger fired knowing nothing about
 * what it does. Two outcomes, and the tests pin both edges: a condition the
 * grammar reads rides on the ability and is checked by the runtime, and one it
 * cannot read becomes a MARKER — never a silent flag — so coverage stays
 * `partial` and the play bridge never runs the effect unchecked.
 * ------------------------------------------------------------------ */

test('Edgar Markov: the eminence trigger compiles, the unread condition is a marker, not a flag', () => {
  // Verbatim from `cards_unique`, 2 Sep 2026. "Edgar" folds to `~` through the
  // first-name short form a Firstname Lastname legend is offered, and the
  // condition - where the card is - is still one the grammar cannot express.
  const edgar = compileWithTrace({
    oracle_id: 'edgar-markov',
    name: 'Edgar Markov',
    type_line: 'Legendary Creature — Vampire Knight',
    oracle_text:
      'Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.',
  });
  assertClausesAccounted(edgar);
  const trigger = edgar.result.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger, 'the eminence line produces a triggered ability');
  assert.equal(trigger.kind, 'triggered');

  // "another Vampire spell": cast by you, a Vampire, and NOT the source.
  assert.deepEqual(trigger.event, {
    on: 'cast',
    what: { sel: 'all', where: { is: 'and', of: [{ is: 'subtype', value: 'vampire' }, { is: 'other' }] }, zone: 'stack' },
    by: { who: 'you' },
  });

  // The condition is a marker the runtime can act on, first in the list.
  const [marker, ...rest] = trigger.effects;
  assert.equal(marker.do, 'manual');
  assert.equal((marker as { text: string }).text, 'if ~ is in the command zone or on the battlefield');
  assert.match((marker as { hint?: string }).hint ?? '', /^intervening-if:/);
  // And the effect underneath compiled as it would without the clause.
  const token = rest.find((e) => e.do === 'create-token');
  assert.ok(token, JSON.stringify(rest));
  assert.match((token as { token: { typeLine: string } }).token.typeLine, /Vampire/);

  // Never a flag without a condition: that is the shape `lowered.test.ts`
  // pins for the XMage port, and the compiler holds the same bar.
  assert.equal((trigger as { condition?: unknown }).condition, undefined);
  assert.equal((trigger as { interveningIf?: boolean }).interveningIf, undefined);
  assert.ok(hasManualEffect(trigger.effects));
  assert.equal(edgar.result.coverage, 'partial');
  assert.equal(edgar.ruleHits[0], 'trigger:cast+if-manual');
});

test('a readable intervening "if" rides on the ability and the card can be full', () => {
  // Two metalcraft cards, verbatim, one paying life and one pumping itself.
  // "Metalcraft —" is the label; "you control three or more artifacts" is a
  // condition the grammar reads; the effect is exact. Nothing is left over.
  const vampires = compileWithTrace({
    oracle_id: 'bleak-coven-vampires',
    name: 'Bleak Coven Vampires',
    type_line: 'Creature — Vampire Warrior',
    oracle_text: 'Metalcraft — When this creature enters, if you control three or more artifacts, target player loses 4 life and you gain 4 life.',
  });
  assertClausesAccounted(vampires);
  assert.equal(vampires.result.coverage, 'full');
  const a = vampires.result.abilities[0];
  assert.equal(a.kind, 'triggered');
  assert.deepEqual((a as { condition?: unknown }).condition, {
    if: 'controls', who: { who: 'you' }, what: { is: 'type', value: 'artifact' }, cmp: 'gte', value: 3,
  });
  assert.equal((a as { interveningIf?: boolean }).interveningIf, true);
  assert.deepEqual(a.effects, [
    { do: 'lose-life', who: { who: 'target-player', ref: 0 }, amount: 4 },
    { do: 'gain-life', who: { who: 'you' }, amount: 4 },
  ]);
  assert.equal(vampires.ruleHits[0], 'trigger:enters+if');

  const berserkers = compile({
    name: 'Blade-Tribe Berserkers',
    type_line: 'Creature — Human Berserker',
    oracle_text: 'Metalcraft — When this creature enters, if you control three or more artifacts, this creature gets +3/+3 and gains haste until end of turn.',
  });
  assert.equal(berserkers.coverage, 'full');
  assert.equal((berserkers.abilities[0] as { interveningIf?: boolean }).interveningIf, true);
  assert.deepEqual(berserkers.abilities[0].kind === 'triggered' ? berserkers.abilities[0].effects : [], [
    { do: 'pump', what: { sel: 'self' }, power: 3, toughness: 3, grant: ['haste'], duration: 'end-of-turn' },
  ]);
});

test('the peel splits at the first comma and never eats "if you do"', () => {
  const split = peelInterveningIf('if you control a creature, draw a card, then discard a card');
  assert.ok(split);
  assert.equal(split.text, 'if you control a creature');
  assert.equal(split.rest, 'draw a card, then discard a card');
  assert.ok(split.condition, 'a condition the grammar reads comes back parsed');

  const unread = peelInterveningIf('if it was kicked, draw a card');
  assert.ok(unread);
  assert.equal(unread.condition, null);
  assert.equal(unread.text, 'if it was kicked');
  assert.equal(unread.rest, 'draw a card');

  // A body with no clause is untouched, and the "you may … if you do" shape
  // belongs to `compileEffectBody`, not here.
  assert.equal(peelInterveningIf('draw a card'), null);
  assert.equal(peelInterveningIf('if you do, draw a card'), null);
});

test('Field of the Dead: the Zombie is read under a condition the grammar cannot express', () => {
  // Before the peel this trigger's whole body was one manual marker, so the
  // facet layer saw `trig:enters` and never `eff:create-token`. The condition
  // ("with different names") is still beyond the grammar, so the card stays
  // `partial` and the bridge stays off it; the effect is now on the record.
  const field = compile({
    name: 'Field of the Dead',
    type_line: 'Land',
    oracle_text:
      'This land enters tapped.\n{T}: Add {C}.\nWhenever this land or another land you control enters, if you control seven or more lands with different names, create a 2/2 black Zombie creature token.',
  });
  assert.equal(field.coverage, 'partial');
  const trigger = field.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger && trigger.kind === 'triggered');
  assert.equal(trigger.effects[0].do, 'manual');
  assert.equal((trigger.effects[0] as { text: string }).text, 'if you control seven or more lands with different names');
  assert.equal(trigger.effects[1].do, 'create-token');
  assert.equal((trigger as { condition?: unknown }).condition, undefined);
});

test('a plural "controls" condition is read only where a summed count IS the sentence', () => {
  // `{if:'controls'}` sums the battlefield of every player `who` resolves to.
  // "An opponent controls an artifact" survives that; "an opponent controls
  // three or more creatures" does not — three opponents holding one each is
  // not what the card says — and Defense of the Heart would search two
  // creatures onto the battlefield at the wrong time.
  assert.deepEqual(parseCondition('an opponent controls an artifact'), {
    if: 'controls', who: { who: 'each-opponent' }, what: { is: 'type', value: 'artifact' }, cmp: 'gte', value: 1,
  });
  assert.deepEqual(parseCondition('your opponents control no creatures'), {
    if: 'controls', who: { who: 'each-opponent' }, what: { is: 'type', value: 'creature' }, cmp: 'eq', value: 0,
  });
  assert.equal(parseCondition('an opponent controls three or more creatures'), null);
  assert.equal(parseCondition('each opponent controls a creature'), null);
  // "You" is one player, so every bound is exact.
  assert.deepEqual(parseCondition('you control three or more artifacts'), {
    if: 'controls', who: { who: 'you' }, what: { is: 'type', value: 'artifact' }, cmp: 'gte', value: 3,
  });

  const defense = compile({
    name: 'Defense of the Heart',
    type_line: 'Enchantment',
    oracle_text:
      'At the beginning of your upkeep, if an opponent controls three or more creatures, sacrifice this enchantment, search your library for up to two creature cards, put those cards onto the battlefield, then shuffle.',
  });
  const a = defense.abilities[0];
  assert.equal(a.kind, 'triggered');
  assert.equal((a as { condition?: unknown }).condition, undefined);
  assert.equal(a.kind === 'triggered' ? a.effects[0].do : '', 'manual');
  assert.equal(defense.coverage, 'partial');
});

/* ------------------------------------------------------------------ *
 * The dig: look at the top N, take what the card names, the rest to the
 * bottom. Three sentences, one `look-and-pick`.
 * ------------------------------------------------------------------ */

test('dig: Kinnan reads as one look-and-pick across three sentences, with non-Human as a NEGATED subtype', () => {
  /*
   * Kinnan, Bonder Prodigy, rank 1,360, produced NO ability record at all:
   * "look at the top" was classified as a named manual and the two sentences
   * after it were orphans. The three sentences are one ability, and the DSL
   * member for them already existed with nothing producing it.
   *
   * The filter is the part that must not be approximated. "A non-Human
   * creature card" read as "a creature card" would let the runtime offer a
   * Human, which is a wrong ability rather than a missing one.
   */
  const kinnan = compile({
    name: 'Kinnan, Bonder Prodigy',
    type_line: 'Legendary Creature — Human Druid',
    oracle_text:
      'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n' +
      '{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.',
  });
  const dig = kinnan.abilities.find((a) => a.kind === 'activated');
  assert.ok(dig, JSON.stringify(kinnan.abilities));
  assert.equal(dig.confidence, 'exact');
  assert.deepEqual(effectsOf(dig), [{
    do: 'look-and-pick',
    who: { who: 'you' },
    look: 5,
    pick: 1,
    upTo: true, // "you may put": the player may take none
    pickedTo: { zone: 'battlefield' },
    restTo: { zone: 'library', position: 'bottom', order: 'random' },
    what: {
      is: 'and',
      of: [{ is: 'type', value: 'creature' }, { is: 'not', of: { is: 'subtype', value: 'human' } }],
    },
  }]);
  // Both paragraphs read: the tap-for-mana trigger takes the first, this rule
  // the second, and the record says the whole card was consumed.
  assert.equal(kinnan.coverage, 'full');
});

test('dig: the grammar reads non-<Subtype> as a negation and refuses a word that is not a subtype', () => {
  const ref = parseObject('a non-human creature card');
  assert.ok(ref);
  assert.equal(ref.isCard, true);
  assert.deepEqual(ref.filter, {
    is: 'and',
    of: [{ is: 'type', value: 'creature' }, { is: 'not', of: { is: 'subtype', value: 'human' } }],
  });
  // A hyphenated word that is not a subtype still refuses the whole phrase.
  assert.equal(parseObject('a non-gizmo creature card'), null);
  // The un-hyphenated type negation is unchanged.
  assert.ok(
    JSON.stringify(parseObject('a nonland permanent')?.filter).includes('{"is":"not","of":{"is":"type","value":"land"}}'),
    JSON.stringify(parseObject('a nonland permanent')),
  );
});

test('dig: Collected Company carries the count, the "up to", and a literal mana value bound', () => {
  const coco = compile({
    name: 'Collected Company',
    type_line: 'Instant',
    oracle_text:
      'Look at the top six cards of your library. Put up to two creature cards with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in any order.',
  });
  assert.equal(coco.coverage, 'full');
  assert.deepEqual(effectsOf(coco.abilities[0]), [{
    do: 'look-and-pick',
    who: { who: 'you' },
    look: 6,
    pick: 2,
    upTo: true,
    pickedTo: { zone: 'battlefield' },
    restTo: { zone: 'library', position: 'bottom', order: 'any' },
    what: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'mana-value', cmp: 'lte', value: 3 }] },
  }]);
  // "with mana value X or less" is the X the spell was cast for - Green Sun's
  // Zenith, Chord of Calling, Finale of Devastation - and reads as `{v:'x'}`.
  // Birthing Ritual defines its X in the next sentence and is the one card
  // this reads wrong; the three above are played far more.
  assert.deepEqual(parseObject('a creature card with mana value x or less')?.filter, {
    is: 'and',
    of: [{ is: 'type', value: 'creature' }, { is: 'mana-value', cmp: 'lte', value: { v: 'x' } }],
  });
});

test('dig: the two-sentence "and the rest" spelling, a bare count, and both rest destinations', () => {
  const impulse = compile({
    name: 'Impulse', type_line: 'Instant',
    oracle_text: 'Look at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.',
  });
  assert.deepEqual(effectsOf(impulse.abilities[0]), [{
    do: 'look-and-pick', who: { who: 'you' }, look: 4, pick: 1, upTo: false,
    pickedTo: { zone: 'hand' }, restTo: { zone: 'library', position: 'bottom', order: 'any' },
  }]);

  const alchemy = compile({
    name: 'Forbidden Alchemy', type_line: 'Instant',
    oracle_text: 'Look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard.',
  });
  assert.deepEqual(effectsOf(alchemy.abilities[0]), [{
    do: 'look-and-pick', who: { who: 'you' }, look: 4, pick: 1, upTo: false,
    pickedTo: { zone: 'hand' }, restTo: { zone: 'graveyard' },
  }]);

  // "reveal ... and put it" is information-only and marks the ability approximate.
  const memorial = compile({
    name: 'Memorial to Unity', type_line: 'Land',
    oracle_text: '{2}{G}, {T}, Sacrifice this land: Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Then put the rest on the bottom of your library in a random order.',
  });
  const dig = memorial.abilities.find((a) => a.kind === 'activated');
  assert.ok(dig);
  assert.equal(dig.confidence, 'approximate');
  assert.deepEqual(effectsOf(dig), [{
    do: 'look-and-pick', who: { who: 'you' }, look: 5, pick: 1, upTo: true,
    pickedTo: { zone: 'hand' }, restTo: { zone: 'library', position: 'bottom', order: 'random' },
    what: { is: 'type', value: 'creature' },
  }]);
});

test('dig: a branch in the middle is refused rather than read as an unconditional take', () => {
  // Planar Genesis: "If you don't, put a card from among them into your hand."
  // A rule that read the first take and dropped the branch would put a land
  // onto the battlefield and never offer the card to hand.
  const genesis = compile({
    name: 'Planar Genesis', type_line: 'Instant',
    oracle_text:
      "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library in a random order.",
  });
  assert.ok(!JSON.stringify(genesis.abilities).includes('look-and-pick'), JSON.stringify(genesis.abilities));
  assert.notEqual(genesis.coverage, 'full');
});

/* ------------------------------------------------------------------ *
 * Tapping a permanent for mana
 *
 * Kinnan, Bonder Prodigy (rank ~1,360) produced no record at all, and so did
 * Mana Reflection, Mana Flare and Zendikar Resurgent, because "tap ... for
 * mana" is its own event and not `tapped`, which fires when a creature attacks.
 * Oracle text below is verbatim from `cards_unique`.
 * ------------------------------------------------------------------ */

test('Kinnan: tapping a nonland permanent for mana adds one mana of the type it made', () => {
  const kinnan = compile({
    name: 'Kinnan, Bonder Prodigy', type_line: 'Legendary Creature — Human Druid',
    oracle_text:
      'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n' +
      '{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.',
  });
  const trigger = kinnan.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger && trigger.kind === 'triggered', 'no triggered ability');
  assert.deepEqual(trigger.event, {
    on: 'tapped-for-mana',
    who: { sel: 'all', where: { is: 'and', of: [{ is: 'any' }, { is: 'not', of: { is: 'type', value: 'land' } }] }, zone: 'battlefield' },
    by: { who: 'you' },
  });
  // Six-way hybrid, colourless included: Kinnan over Sol Ring adds {C}.
  assert.deepEqual(trigger.effects, [
    { do: 'add-mana', who: { who: 'you' }, mana: '{W/U/B/R/G/C}', among: 'tapped-permanent' },
  ]);
  assert.equal(trigger.confidence, 'exact');
});

test('the same shape on lands, on a Swamp, and passively on an enchanted land', () => {
  const zendikar = firstOfKind({
    name: 'Zendikar Resurgent', type_line: 'Enchantment',
    oracle_text: 'Whenever you tap a land for mana, add one mana of any type that land produced. (The types of mana are white, blue, black, red, green, and colorless.)',
  }, 'triggered');
  assert.deepEqual(zendikar.event, {
    on: 'tapped-for-mana', who: { sel: 'all', where: { is: 'type', value: 'land' }, zone: 'battlefield' }, by: { who: 'you' },
  });

  // "Add an additional {B}": the trigger IS the addition, so it is plain mana.
  const ghast = firstOfKind({
    name: 'Crypt Ghast', type_line: 'Creature — Spirit',
    oracle_text: 'Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhenever you tap a Swamp for mana, add an additional {B}.',
  }, 'triggered');
  assert.deepEqual(ghast.event, {
    on: 'tapped-for-mana', who: { sel: 'all', where: { is: 'subtype', value: 'swamp' }, zone: 'battlefield' }, by: { who: 'you' },
  });
  assert.deepEqual(ghast.effects, [{ do: 'add-mana', who: { who: 'you' }, mana: '{B}' }]);

  // Passive wording: nobody is named on the event, and "its controller" is the
  // controller of the land that was tapped, which is the trigger subject.
  const growth = firstOfKind({
    name: 'Wild Growth', type_line: 'Enchantment — Aura',
    oracle_text: 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.',
  }, 'triggered');
  assert.deepEqual(growth.event, { on: 'tapped-for-mana', who: { sel: 'attached' } });
  assert.deepEqual(growth.effects, [
    { do: 'add-mana', who: { who: 'controller-of', of: { sel: 'trigger-subject' } }, mana: '{G}' },
  ]);
});

test('"a player taps ... that player adds" pays the tapper, not the controller', () => {
  // Mana Flare is symmetrical. Reading "that player" as `{who:'you'}` would
  // turn a group-hug card into a one-sided doubler.
  const flare = firstOfKind({
    name: 'Mana Flare', type_line: 'Enchantment',
    oracle_text: 'Whenever a player taps a land for mana, that player adds one mana of any type that land produced.',
  }, 'triggered');
  assert.deepEqual((flare.event as { by?: unknown }).by, { who: 'each-player' });
  assert.deepEqual(flare.effects, [
    { do: 'add-mana', who: { who: 'trigger-player' }, mana: '{W/U/B/R/G/C}', among: 'tapped-permanent' },
  ]);

  // Vorinclex's second line: the opponent's tap is the event, and the body is
  // NOT read, so it stays a visible marker rather than becoming mana for you.
  const vorinclex = compile({
    name: 'Vorinclex, Voice of Hunger', type_line: 'Legendary Creature — Phyrexian Praetor',
    oracle_text:
      'Trample\nWhenever you tap a land for mana, add one mana of any type that land produced.\n' +
      "Whenever an opponent taps a land for mana, that land doesn't untap during its controller's next untap step.",
  });
  const triggers = vorinclex.abilities.filter((a) => a.kind === 'triggered');
  assert.equal(triggers.length, 2);
  assert.deepEqual((triggers[0].event as { by?: unknown }).by, { who: 'you' });
  assert.deepEqual((triggers[1].event as { by?: unknown }).by, { who: 'each-opponent' });
  assert.ok(hasManualEffect(effectsOf(triggers[1])), 'the untap denial was invented');
  assert.ok(!effectsOf(triggers[1]).some((e) => e.do === 'add-mana'), 'an opponent\'s tap paid you');
});

test('mana doublers are replacements that multiply, not triggers that add', () => {
  const reflection = compile({
    name: 'Mana Reflection', type_line: 'Enchantment',
    oracle_text: 'If you tap a permanent for mana, it produces twice as much of that mana instead.',
  });
  assert.equal(reflection.coverage, 'full');
  assert.deepEqual(reflection.abilities.map((a) => a.kind), ['replacement']);
  const r = reflection.abilities[0];
  assert.ok(r.kind === 'replacement');
  assert.deepEqual(r.event, {
    on: 'tapped-for-mana', who: { sel: 'all', where: { is: 'any' }, zone: 'battlefield' }, by: { who: 'you' },
  });
  assert.deepEqual(r.result, { do: 'multiply', factor: 2 });

  const nyxbloom = firstOfKind({
    name: 'Nyxbloom Ancient', type_line: 'Enchantment Creature — Elemental',
    oracle_text: 'Trample\nIf you tap a permanent for mana, it produces three times as much of that mana instead.',
  }, 'replacement');
  assert.deepEqual(nyxbloom.result, { do: 'multiply', factor: 3 });
});

test('a colour the card remembered is not any colour', () => {
  // Utopia Sprawl: "of the chosen color" is a colour chosen as it entered.
  // Reading it as "any color" would let a Forest make blue. The trigger is
  // read; the body stays a marker.
  const sprawl = firstOfKind({
    name: 'Utopia Sprawl', type_line: 'Enchantment — Aura',
    oracle_text: 'Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.',
  }, 'triggered');
  assert.deepEqual(sprawl.event, { on: 'tapped-for-mana', who: { sel: 'attached' } });
  assert.ok(hasManualEffect(effectsOf(sprawl)));
  assert.ok(!effectsOf(sprawl).some((e) => e.do === 'add-mana' || e.do === 'choose-mode'));

  // Gauntlet of Power: "tapped for mana OF THE CHOSEN COLOR" is not the event
  // this rule reads, so the whole line is refused rather than misread.
  const gauntlet = compile({
    name: 'Gauntlet of Power', type_line: 'Artifact',
    oracle_text: 'As this artifact enters, choose a color.\nCreatures of the chosen color get +1/+1.\nWhenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color.',
  });
  assert.ok(!gauntlet.abilities.some((a) => a.kind === 'triggered'));
});

/* ------------------------------------------------------------------ *
 * Own-bounce: "return a creature you control to its owner's hand"
 * ------------------------------------------------------------------ */

test('an untargeted own-bounce is still refused, and the marker now says what it refused', () => {
  // Whitemane Lion's choice of creature is the player's, and the test above
  // pins that the compiler will not make it. What changed is the marker: it
  // carries a NAME, so the facet layer can tell Shrieking Drake from an unread
  // paragraph. Oracle text is verbatim from `cards_unique`.
  const lion = compile({
    name: 'Whitemane Lion', type_line: 'Creature — Cat',
    oracle_text: "Flash\nWhen this creature enters, return a creature you control to its owner's hand.",
  });
  const lionEffects = effectsOf(lion.abilities.find((a) => a.kind === 'triggered')!);
  assert.equal(lionEffects[0].do, 'manual');
  assert.match(String((lionEffects[0] as { hint?: string }).hint), /^bounce-own:/);
  assert.equal(lion.coverage, 'partial', 'named or not, a marker is not full coverage');

  // Kor Skyfisher bounces "a permanent", Fleetfoot Panther "a green or white
  // creature" (a colour `parseObject` does not read), Roaring Primadox on
  // upkeep. All three are the shape and all three are named.
  for (const row of [
    { name: 'Kor Skyfisher', type_line: 'Creature — Kor Soldier',
      oracle_text: "Flying\nWhen this creature enters, return a permanent you control to its owner's hand." },
    { name: 'Fleetfoot Panther', type_line: 'Creature — Cat',
      oracle_text: "Flash\nWhen this creature enters, return a green or white creature you control to its owner's hand." },
    { name: 'Roaring Primadox', type_line: 'Creature — Beast',
      oracle_text: "At the beginning of your upkeep, return a creature you control to its owner's hand." },
  ]) {
    const c = compile(row);
    const e = effectsOf(c.abilities.find((a) => a.kind === 'triggered')!);
    assert.equal(e[0].do, 'manual', row.name);
    assert.match(String((e[0] as { hint?: string }).hint), /^bounce-own:/, row.name);
  }

  // Cloudstone Curio is the archetype's engine and its clause carries a tail
  // no rule reads. Allowed by name, as a marker, never as an effect.
  const curio = compile({
    name: 'Cloudstone Curio', type_line: 'Artifact',
    oracle_text: "Whenever a nonartifact permanent you control enters, you may return another permanent you control that shares a permanent type with it to its owner's hand.",
  });
  const curioEffects = effectsOf(curio.abilities[0]);
  assert.equal(curioEffects[0].do, 'manual');
  assert.match(String((curioEffects[0] as { hint?: string }).hint), /^bounce-own:/);
  assert.equal(curio.coverage, 'partial');
});

test('a karoo bouncing a land is NOT own-bounce, and keeps the plain marker', () => {
  // Simic Growth Chamber is rank 308 and thirty-six cards share its clause. A
  // Chulane deck does not want any of them for that clause, so the marker stays
  // unnamed and the facet layer reads nothing from it.
  const karoo = compile({
    name: 'Simic Growth Chamber', type_line: 'Land',
    oracle_text: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{U}.",
  });
  const e = effectsOf(karoo.abilities.find((a) => a.kind === 'triggered')!);
  assert.equal(e[0].do, 'manual');
  assert.equal((e[0] as { hint?: string }).hint, undefined, 'a land bounce is not the shape');

  // And a phrase whose middle names a second controller must not slip through
  // on the "you control" substring. Not a real card; the refusal is the point.
  const trap = compile({
    name: 'Test Trap', type_line: 'Instant',
    oracle_text: "Return a creature an opponent controls or you control to its owner's hand.",
  });
  const trapEffects = trap.abilities.length ? effectsOf(trap.abilities[0]) : [];
  assert.ok(
    trapEffects.every((x) => x.do !== 'manual' || !/^bounce-own/.test(String((x as { hint?: string }).hint ?? ''))),
    'a second controller in the phrase is refused',
  );
});

test('a targeted own-bounce carries "you control" on the TargetSpec, and a bounce cost reads its object', () => {
  // Chulane, Teller of Tales. The `bounce` rule compiles the targeted form, and
  // the controller is where every other targeted phrase puts it: on the spec.
  // That is what lets the facet layer say whose creature comes back.
  const chulane = compile({
    name: 'Chulane, Teller of Tales', type_line: 'Legendary Creature — Human Druid',
    oracle_text: "Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.\n{3}, {T}: Return target creature you control to its owner's hand.",
  });
  const act = chulane.abilities.find((a) => a.kind === 'activated')!;
  const [bounce] = effectsOf(act);
  assert.equal(bounce.do, 'move-zone');
  assert.equal((bounce as { to: string }).to, 'hand');
  assert.deepEqual((bounce as { what: unknown }).what, { sel: 'target', ref: 0 });
  const spec = (act as { targets?: Array<{ controller?: { who: string } }> }).targets?.[0];
  assert.deepEqual(spec?.controller, { who: 'you' });

  // Wirewood Symbiote pays by bouncing an Elf of yours. The cost reads its
  // object the way "sacrifice a creature" does, and only when the phrase says
  // the permanent is yours.
  const symbiote = compile({
    name: 'Wirewood Symbiote', type_line: 'Creature — Insect',
    oracle_text: "Return an Elf you control to its owner's hand: Untap target creature. Activate only once each turn.",
  });
  const sAct = symbiote.abilities.find((a) => a.kind === 'activated')!;
  const costs = (sAct as { costs: Array<Record<string, unknown>> }).costs;
  assert.deepEqual(costs, [{
    pay: 'return-to-hand',
    what: { sel: 'all', where: { is: 'subtype', value: 'elf' }, controller: { who: 'you' }, zone: 'battlefield' },
    count: 1,
  }]);
  assert.equal(symbiote.coverage, 'full');

  // "Return a creature to its owner's hand:" without "you control" names no
  // owner and is refused rather than assumed to be yours.
  const vague = compile({
    name: 'Test Vague', type_line: 'Artifact',
    oracle_text: "Return a creature to its owner's hand: Draw a card.",
  });
  assert.equal(vague.abilities.filter((a) => a.kind === 'activated').length, 0);
});

/* ------------------------------------------------------------------ *
 * Protection from a colour chosen on resolution
 *
 * Twenty-nine cards say "gains protection from the color of your choice
 * until end of turn" and every one read as nothing. The danger in reading
 * them is the obvious fix: the colour is NOT in the text, so a record that
 * names one is a wrong ability. These cases assert the shape that carries
 * the choice instead — a `choose` in front of the pump, and a grant entry
 * that says "the chosen colour" rather than a colour.
 * ------------------------------------------------------------------ */

test('protection from the color of your choice is a colour CHOICE and then a grant, never a colour', () => {
  // Gods Willing, verbatim.
  const result = compile({
    name: 'Gods Willing', type_line: 'Instant',
    oracle_text: "Target creature you control gains protection from the color of your choice until end of turn. (It can't be blocked, targeted, dealt damage, enchanted, or equipped by anything of that color.)\nScry 1.",
  });
  assert.equal(result.coverage, 'full');
  const effects = effectsOf(result.abilities[0]);
  assert.deepEqual(effects, [
    { do: 'choose', who: { who: 'you' }, what: 'color' },
    { do: 'pump', what: { sel: 'target', ref: 0 }, power: 0, toughness: 0, grant: [PROTECTION_FROM_CHOSEN_COLOR], duration: 'end-of-turn' },
  ]);
  assert.ok(!hasManualEffect(effects), 'the choice is a DSL member, not a marker');
  // The whole point: no colour anywhere in the record, because none is printed.
  assert.ok(!/from (white|blue|black|red|green)/.test(JSON.stringify(result.abilities)));
  assert.deepEqual(effectsOf(result.abilities[1]), [{ do: 'scry', who: { who: 'you' }, count: 1 }]);
  assertSerialisable(result);
});

test('Mother of Runes: the whole card is that line, and it is an activated ability now', () => {
  const result = compile({
    name: 'Mother of Runes', type_line: 'Creature — Human Cleric',
    oracle_text: '{T}: Target creature you control gains protection from the color of your choice until end of turn.',
  });
  assert.equal(result.coverage, 'full');
  const a = result.abilities[0] as Extract<Ability, { kind: 'activated' }>;
  assert.equal(a.kind, 'activated');
  assert.deepEqual(a.costs, [{ pay: 'tap' }]);
  assert.equal(a.effects[0].do, 'choose');
  assert.equal(a.effects[1].do, 'pump');
  assert.deepEqual(a.targets?.[0]?.controller, { who: 'you' });
});

test('"the chosen color" grants without a second choice: the earlier sentence already chose', () => {
  // Brave the Elements, verbatim.
  const result = compile({
    name: 'Brave the Elements', type_line: 'Instant',
    oracle_text: 'Choose a color. White creatures you control gain protection from the chosen color until end of turn.',
  });
  assert.equal(result.coverage, 'full');
  const effects = effectsOf(result.abilities[0]);
  assert.equal(effects.filter((e) => e.do === 'choose').length, 1);
  const pump = effects[1] as Extract<Effect, { do: 'pump' }>;
  assert.equal(pump.do, 'pump');
  assert.deepEqual(pump.grant, [PROTECTION_FROM_CHOSEN_COLOR]);
  // Every white creature you control, not one of them.
  assert.equal(pump.what.sel, 'all');
});

test('"protection from artifacts or from the color of your choice" is a decision between two modes', () => {
  // Giver of Runes, verbatim. CR 608.2c: the "or" is chosen on resolution.
  const result = compile({
    name: 'Giver of Runes', type_line: 'Creature — Kor Cleric',
    oracle_text: '{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn.',
  });
  assert.equal(result.coverage, 'full');
  const a = result.abilities[0] as Extract<Ability, { kind: 'activated' }>;
  const mode = a.effects[0] as Extract<Effect, { do: 'choose-mode' }>;
  assert.equal(mode.do, 'choose-mode');
  assert.equal(mode.min, 1);
  assert.equal(mode.max, 1);
  assert.equal(mode.modes.length, 2);
  assert.deepEqual(mode.modes[0].effects, [
    { do: 'pump', what: { sel: 'target', ref: 0 }, power: 0, toughness: 0, grant: ['protection from colorless'], duration: 'end-of-turn' },
  ]);
  assert.deepEqual(mode.modes[1].effects, [
    { do: 'choose', who: { who: 'you' }, what: 'color' },
    { do: 'pump', what: { sel: 'target', ref: 0 }, power: 0, toughness: 0, grant: [PROTECTION_FROM_CHOSEN_COLOR], duration: 'end-of-turn' },
  ]);
  // One target announced by the card, shared by both modes — not one per mode.
  assert.equal(a.targets?.length, 1);
  assert.ok(!hasManualEffect(a.effects));
});

test('a printed colour is granted in the words the card prints', () => {
  // Crimson Acolyte, verbatim. The keyword line and the grant read the same quality.
  const result = compile({
    name: 'Crimson Acolyte', type_line: 'Creature — Human Cleric',
    oracle_text: 'Protection from red\n{W}: Target creature gains protection from red until end of turn.',
  });
  assert.equal(result.coverage, 'full');
  assert.deepEqual(result.abilities[0], {
    kind: 'keyword', id: 'a0', text: 'Protection from red', confidence: 'exact', keyword: 'protection', parameter: 'from red',
  });
  const pump = effectsOf(result.abilities[1])[0] as Extract<Effect, { do: 'pump' }>;
  assert.deepEqual(pump.grant, ['protection from red']);
});

test('a PLAYER gaining protection is not a pump, and stays a marker', () => {
  // Seht's Tiger, verbatim. "You gain protection" has no object to pump; a
  // rule that bound "you" to the source would shield the wrong thing.
  const result = compile({
    name: "Seht's Tiger", type_line: 'Creature — Cat',
    oracle_text: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, you gain protection from the color of your choice until end of turn. (You can't be targeted, dealt damage, or enchanted by anything of the chosen color.)",
  });
  assert.equal(result.coverage, 'partial');
  const trigger = result.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger);
  const effects = effectsOf(trigger);
  assert.ok(hasManualEffect(effects));
  assert.ok(!effects.some((e) => e.do === 'pump' || e.do === 'choose'));
});

test('parseGrantList admits protection narrowly and refuses what the runtime cannot classify', () => {
  assert.deepEqual(parseGrantList('hexproof and indestructible'), { grant: ['hexproof', 'indestructible'], choosesColor: false });
  assert.deepEqual(parseGrantList('flying and protection from red'), { grant: ['flying', 'protection from red'], choosesColor: false });
  assert.deepEqual(parseGrantList('protection from the color of your choice'), { grant: [PROTECTION_FROM_CHOSEN_COLOR], choosesColor: true });
  assert.deepEqual(parseGrantList('protection from the chosen color'), { grant: [PROTECTION_FROM_CHOSEN_COLOR], choosesColor: false });
  // Real qualities on real cards, each a different runtime question, none guessed.
  assert.equal(parseGrantList('protection from artifacts'), null);            // Tel-Jilad Defiance
  assert.equal(parseGrantList('protection from each color'), null);           // Eldritch Immunity
  assert.equal(parseGrantList('protection from black and from red'), null);   // Crown of Awe
  assert.equal(parseGrantList('protection from each of your opponents'), null); // Cliffside Rescuer
  assert.equal(parseGrantList('protection from the color of its controllers choice'), null); // Wishmonger
  assert.equal(parseGrantList('protection from red and haste that attacks'), null);
});

/* ------------------------------------------------------------------ *
 * The wheel. Oracle text verbatim from `cards_unique`, 3 Sep 2026.
 * ------------------------------------------------------------------ */

test('Wheel of Fortune: each player discards their hand, then draws seven', () => {
  // Rank 569. Produced no record at all while `discard-hand` refused.
  const card = compile({
    name: 'Wheel of Fortune', type_line: 'Sorcery',
    oracle_text: 'Each player discards their hand, then draws seven cards.',
  });
  assert.equal(card.coverage, 'full');
  assert.deepEqual(effectsOf(card.abilities[0]), [
    { do: 'discard', who: { who: 'each-player' }, count: 'hand' },
    { do: 'draw', who: { who: 'each-player' }, count: 7 },
  ]);
});

test('Magus of the Wheel: the same wheel behind an activation cost', () => {
  // Was "ambiguous" as a whole line, because the body could not be read.
  const ability = firstOfKind({
    name: 'Magus of the Wheel', type_line: 'Creature — Human Wizard',
    oracle_text: '{1}{R}, {T}, Sacrifice this creature: Each player discards their hand, then draws seven cards.',
  }, 'activated');
  assert.ok(ability);
  assert.deepEqual(effectsOf(ability), [
    { do: 'discard', who: { who: 'each-player' }, count: 'hand' },
    { do: 'draw', who: { who: 'each-player' }, count: 7 },
  ]);
});

test('Dragon Mage: a wheel as the body of a trigger', () => {
  const card = compile({
    name: 'Dragon Mage', type_line: 'Creature — Dragon Wizard',
    oracle_text: 'Flying\nWhenever this creature deals combat damage to a player, each player discards their hand, then draws seven cards.',
  });
  assert.equal(card.coverage, 'full');
  const trigger = card.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger);
  assert.deepEqual(effectsOf(trigger), [
    { do: 'discard', who: { who: 'each-player' }, count: 'hand' },
    { do: 'draw', who: { who: 'each-player' }, count: 7 },
  ]);
});

test('Mindslicer: "discards their hand" alone, with no draw, is just the discard', () => {
  const card = compile({
    name: 'Mindslicer', type_line: 'Creature — Horror',
    oracle_text: 'When this creature dies, each player discards their hand.',
  });
  assert.equal(card.coverage, 'full');
  assert.deepEqual(effectsOf(card.abilities[0]), [
    { do: 'discard', who: { who: 'each-player' }, count: 'hand' },
  ]);
});

test('Windfall: the discard half is read and the draw half is MARKED, never guessed', () => {
  // Rank 157. "The greatest number of cards a player discarded this way" is a
  // maximum over players of a number from the moment before, and the value
  // vocabulary cannot say it. The refusal must be a marker, not a number: a
  // `{v:'cards-in'}` evaluated after the discard would draw zero.
  const card = compile({
    name: 'Windfall', type_line: 'Sorcery',
    oracle_text: 'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.',
  });
  assert.equal(card.coverage, 'partial');
  assert.equal(card.unparsed.length, 0, 'the sentence was read, not dropped');
  const effects = effectsOf(card.abilities[0]);
  assert.deepEqual(effects[0], { do: 'discard', who: { who: 'each-player' }, count: 'hand' });
  assert.equal(effects[1].do, 'manual');
  assert.match((effects[1] as { hint?: string }).hint ?? '', /^draw-that-many:/);
  assert.ok(!effects.some((e) => e.do === 'draw'), 'no draw effect with an invented count');
});

test('Dark Deal: "discards all the cards in their hand, then draws that many cards minus one"', () => {
  const card = compile({
    name: 'Dark Deal', type_line: 'Sorcery',
    oracle_text: 'Each player discards all the cards in their hand, then draws that many cards minus one.',
  });
  assert.equal(card.coverage, 'partial');
  const effects = effectsOf(card.abilities[0]);
  assert.deepEqual(effects[0], { do: 'discard', who: { who: 'each-player' }, count: 'hand' });
  assert.equal(effects[1].do, 'manual');
  assert.ok(!effects.some((e) => e.do === 'draw'));
});

test('Tolarian Winds: your own hand, with the subject carried into "draw that many"', () => {
  const card = compile({
    name: 'Tolarian Winds', type_line: 'Instant',
    oracle_text: 'Discard all the cards in your hand, then draw that many cards.',
  });
  const effects = effectsOf(card.abilities[0]);
  assert.deepEqual(effects[0], { do: 'discard', who: { who: 'you' }, count: 'hand' });
  assert.equal(effects[1].do, 'manual');
});

test('a whole hand cannot be multiplied: "for each" over a hand discard is refused', () => {
  // Not a printed card. The guard in `scaleEffect` is what is under test: a
  // literal has no number to scale, and scaling it would need an invented one.
  const card = compile({
    name: 'Test Wheel', type_line: 'Sorcery',
    oracle_text: 'Each player discards their hand for each creature you control.',
  });
  assert.equal(card.abilities.length, 0);
  assert.equal(card.unparsed.length, 1);
});

test("Lion's Eye Diamond: 'discard your hand' as a COST is untouched by the effect rule", () => {
  // The effect rule reads bodies. A cost is parsed elsewhere and still refuses,
  // so this card stays exactly where it was rather than gaining a wrong record.
  const card = compile({
    name: "Lion's Eye Diamond", type_line: 'Artifact',
    oracle_text: 'Discard your hand, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant.',
  });
  assert.equal(card.abilities.length, 0);
});

/* ------------------------------------------------------------------ *
 * Impulse draw: two sentences, one effect
 *
 * Oracle text verbatim from `cards_unique`, fetched 3 Sep 2026. The refusal
 * half of this block is the load-bearing half: every card there says "exile
 * the top" and "you may", and every one of them would be a WRONG ability if
 * the rule read it.
 * ------------------------------------------------------------------ */

/** Compile, prove no text was dropped, and hand back every impulse effect in the tree. */
function impulseEffects(row: Row): Effect[] {
  const trace = compileWithTrace({ oracle_id: row.name, ...row });
  assertClausesAccounted(trace);
  assertSerialisable(trace.result);
  return trace.result.abilities.flatMap(allEffects).filter((e) => e.do === 'impulse');
}

test('impulse: window first, Light Up the Stage reads as one effect and is fully covered', () => {
  const row: Row = {
    name: 'Light Up the Stage', type_line: 'Sorcery',
    oracle_text: 'Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nExile the top two cards of your library. Until the end of your next turn, you may play those cards.',
  };
  assert.deepEqual(impulseEffects(row), [
    { do: 'impulse', who: { who: 'you' }, count: 2, until: 'end-of-your-next-turn', permission: 'play' },
  ]);
  assert.equal(compile(row).coverage, 'full');
  // And NOT a plain exile: that verb is the removal role.
  assert.equal(compile(row).abilities.flatMap(allEffects).some((e) => e.do === 'exile'), false);
});

test('impulse: window last, Act on Impulse with its reminder text is "until end of turn"', () => {
  const row: Row = {
    name: 'Act on Impulse', type_line: 'Sorcery',
    oracle_text: 'Exile the top three cards of your library. Until end of turn, you may play those cards. (If you cast a spell this way, you still pay its costs. You can play a land this way only if you have an available land play remaining.)',
  };
  assert.deepEqual(impulseEffects(row), [
    { do: 'impulse', who: { who: 'you' }, count: 3, until: 'end-of-turn', permission: 'play' },
  ]);
  assert.equal(compile(row).coverage, 'full');
});

test('impulse: "you may play that card this turn" is the same window as "until end of turn"', () => {
  const laelia: Row = {
    name: 'Laelia, the Blade Reforged', type_line: 'Legendary Creature — Spirit Warrior',
    oracle_text: 'Haste\nWhenever Laelia attacks, exile the top card of your library. You may play that card this turn.\nWhenever one or more cards are put into exile from your library and/or your graveyard, put a +1/+1 counter on Laelia.',
  };
  const attack = firstOfKind(laelia, 'triggered');
  assert.ok(attack, 'the attack trigger compiles');
  assert.deepEqual(effectsOf(attack!), [
    { do: 'impulse', who: { who: 'you' }, count: 1, until: 'end-of-turn', permission: 'play' },
  ]);
});

test('impulse: inside a step trigger, Prosper, Tome-Bound, whose deck this rule exists for', () => {
  const prosper: Row = {
    name: 'Prosper, Tome-Bound', type_line: 'Legendary Creature — Tiefling Warlock',
    oracle_text: 'Deathtouch\nMystic Arcanum — At the beginning of your end step, exile the top card of your library. Until the end of your next turn, you may play that card.\nPact Boon — Whenever you play a card from exile, create a Treasure token.',
  };
  assert.deepEqual(impulseEffects(prosper), [
    { do: 'impulse', who: { who: 'you' }, count: 1, until: 'end-of-your-next-turn', permission: 'play' },
  ]);
});

test('impulse: an X count stays X, Commune with Lava', () => {
  const row: Row = {
    name: 'Commune with Lava', type_line: 'Instant',
    oracle_text: 'Exile the top X cards of your library. Until the end of your next turn, you may play those cards.',
  };
  assert.deepEqual(impulseEffects(row), [
    { do: 'impulse', who: { who: 'you' }, count: { v: 'x' }, until: 'end-of-your-next-turn', permission: 'play' },
  ]);
});

test("impulse: after a connective, from that player's library, and CAST not play: Ragavan", () => {
  // "create a Treasure token and exile the top card of that player's library.
  // Until end of turn, you may cast that card." The pair reaches the rule
  // through the " and " split, the library is the damaged player's, and the
  // word is cast: a land on top of that library stays in exile.
  const ragavan: Row = {
    name: 'Ragavan, Nimble Pilferer', type_line: 'Legendary Creature — Monkey Pirate',
    oracle_text: "Whenever Ragavan deals combat damage to a player, create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card.\nDash {1}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)",
  };
  const trigger = firstOfKind(ragavan, 'triggered');
  assert.ok(trigger);
  const effects = effectsOf(trigger!);
  assert.equal(effects[0].do, 'create-token', 'the Treasure survives the split');
  assert.deepEqual(effects[1], {
    do: 'impulse', who: { who: 'trigger-player' }, count: 1, until: 'end-of-turn', permission: 'cast',
  });
  assert.equal(hasManualEffect(effects), false);
});

test('impulse: an activated ability with a discard in the cost, Faldorn', () => {
  const faldorn: Row = {
    name: 'Faldorn, Dread Wolf Herald', type_line: 'Legendary Creature — Human Druid',
    oracle_text: 'Whenever you cast a spell from exile or a land you control enters from exile, create a 2/2 green Wolf creature token.\n{1}, {T}, Discard a card: Exile the top card of your library. You may play it this turn.',
  };
  const activated = firstOfKind(faldorn, 'activated');
  assert.ok(activated, 'the activated ability compiles now that its body reads');
  assert.deepEqual(effectsOf(activated!), [
    { do: 'impulse', who: { who: 'you' }, count: 1, until: 'end-of-turn', permission: 'play' },
  ]);
});

test('impulse: the extra sentences stay manual, so Bonehoard Dracosaur is partial and says why', () => {
  const row: Row = {
    name: 'Bonehoard Dracosaur', type_line: 'Creature — Dinosaur Dragon',
    oracle_text: 'Flying, first strike\nAt the beginning of your upkeep, exile the top two cards of your library. You may play them this turn. If you exiled a land card this way, create a 3/1 red Dinosaur creature token. If you exiled a nonland card this way, create a Treasure token.',
  };
  assert.equal(impulseEffects(row).length, 1);
  assert.equal(compile(row).coverage, 'partial');
});

test('impulse REFUSALS: every one of these says "exile the top" and "you may" and none may compile', () => {
  const refused: Array<[Row, string]> = [
    [{
      name: 'Chandra, Torch of Defiance', type_line: 'Legendary Planeswalker — Chandra',
      oracle_text: "+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"",
    }, 'no window at all: the card is cast during resolution, not from exile later'],
    [{
      name: "Mind's Desire", type_line: 'Sorcery',
      oracle_text: 'Shuffle your library. Then exile the top card of your library. Until end of turn, you may play that card without paying its mana cost.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)',
    }, 'without paying its mana cost is a different permission'],
    [{
      name: 'Haste Magic', type_line: 'Instant',
      oracle_text: 'Target creature gets +3/+1 and gains haste until end of turn. Exile the top card of your library. You may play it until your next end step.',
    }, '"until your next end step" is the declared duration gap'],
    [{
      name: 'Stolen Strategy', type_line: 'Enchantment',
      oracle_text: "At the beginning of your upkeep, exile the top card of each opponent's library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells.",
    }, 'mana as though any colour is a rider the DSL cannot say'],
    [{
      name: 'Mystic Forge', type_line: 'Artifact',
      oracle_text: 'You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library.',
    }, 'an exile with no permission is a real card and is not this one'],
    [{
      name: 'Tectonic Giant', type_line: 'Creature — Elemental Giant',
      oracle_text: 'Whenever this creature attacks or becomes the target of a spell an opponent controls, choose one —\n• This creature deals 3 damage to each opponent.\n• Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card.',
    }, '"choose one of them" is a pick the member cannot carry'],
  ];
  for (const [row, why] of refused) {
    assert.deepEqual(impulseEffects(row), [], `${row.name}: ${why}`);
  }
});

test('impulse: "that player" is refused once a target has been announced', () => {
  // Invented text, on purpose: no real card does this, and the test pins the
  // gate rather than a card. After "target player", "that player" is the
  // target, and binding it to the trigger would read the card wrong.
  const row: Row = {
    name: 'Test Thief', type_line: 'Sorcery',
    oracle_text: "Target player loses 2 life. Exile the top card of that player's library. Until end of turn, you may cast that card.",
  };
  assert.deepEqual(impulseEffects(row), []);
});

test('impulse survives structuredClone, Reckless Impulse', () => {
  const row: Row = {
    name: 'Reckless Impulse', type_line: 'Sorcery',
    oracle_text: 'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
  };
  const record = compile(row);
  assert.deepEqual(structuredClone(record), record);
  assert.equal(record.coverage, 'full');
});

/* ------------------------------------------------------------------ *
 * Alternative costs (CR 118.9) and "cast … without paying its mana cost"
 *
 * Oracle text verbatim from `cards_unique`, 3 Sep 2026. The free-spell cycle
 * read as `alt-cast` on its first paragraph and a plain counterspell on its
 * second, so the record could not tell Fierce Guardianship from Negate; and
 * `eff:cast-free` had been in the engine's vocabulary since the facet layer
 * was written without the compiler ever producing it.
 * ------------------------------------------------------------------ */

const COMMANDER_GATE = { if: 'controls', who: { who: 'you' }, what: { is: 'commander' }, cmp: 'gte', value: 1 };

test('the free-spell cycle: the alternative cost is a COST on the spell, and the spell keeps its effect', () => {
  const trace = compileWithTrace({
    oracle_id: 'fg', name: 'Fierce Guardianship', type_line: 'Instant',
    oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.',
  });
  const { result } = trace;
  assert.equal(result.abilities.length, 1);
  const spell = result.abilities[0] as Ability & { alternativeCosts?: unknown };
  assert.equal(spell.kind, 'spell');
  // Nothing is paid instead — `costs: []` is the statement, not an omission.
  assert.deepEqual(spell.alternativeCosts, [{
    costs: [],
    condition: COMMANDER_GATE,
    text: 'If you control a commander, you may cast this spell without paying its mana cost.',
  }]);
  // The counterspell is still a counterspell, and the option that nothing can
  // offer at announcement is a marker in front of it, not a claim of `full`.
  const effects = effectsOf(spell);
  assert.equal(effects[0].do, 'manual');
  assert.match((effects[0] as { hint?: string }).hint ?? '', /^alternative cost:/);
  assert.deepEqual(effects[1], { do: 'counter', what: { sel: 'target', ref: 0 } });
  assert.equal(result.unparsed.length, 0);
  assert.equal(result.coverage, 'partial');
  assert.ok(trace.ruleHits.includes('alternative-cost'), trace.ruleHits.join(','));
  assertClausesAccounted(trace);
  assertSerialisable(result);
});

test('the rest of the cycle attaches the same way, whatever the spell under it does', () => {
  const rollick = compile({
    name: 'Deadly Rollick', type_line: 'Instant',
    oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.',
  });
  assert.deepEqual((rollick.abilities[0] as { alternativeCosts?: unknown }).alternativeCosts, [
    { costs: [], condition: COMMANDER_GATE, text: 'If you control a commander, you may cast this spell without paying its mana cost.' },
  ]);
  assert.deepEqual(effectsOf(rollick.abilities[0])[1], { do: 'exile', what: { sel: 'target', ref: 0 } });
  assert.equal(rollick.unparsed.length, 0);

  const maneuver = compile({
    name: 'Flawless Maneuver', type_line: 'Instant',
    oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nCreatures you control gain indestructible until end of turn.',
  });
  assert.equal((maneuver.abilities[0] as { alternativeCosts?: unknown[] }).alternativeCosts?.length, 1);
  assert.equal(effectsOf(maneuver.abilities[0])[1].do, 'pump');
  assert.equal(maneuver.unparsed.length, 0);
});

test('an alternative cost with real costs reads them as costs, gate on either end', () => {
  // Force of Will: two costs joined by "and", no gate.
  const fow = compile({
    name: 'Force of Will', type_line: 'Instant',
    oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
  });
  assert.deepEqual((fow.abilities[0] as { alternativeCosts?: unknown }).alternativeCosts, [{
    costs: [
      { pay: 'life', amount: 1 },
      { pay: 'exile', from: 'hand', what: { sel: 'all', where: { is: 'and', of: [{ is: 'any' }, { is: 'color', value: 'U' }] }, zone: 'hand' }, count: 1 },
    ],
    text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.",
  }]);
  assert.deepEqual(effectsOf(fow.abilities[0])[1], { do: 'counter', what: { sel: 'target', ref: 0 } });
  assert.equal(fow.unparsed.length, 0);

  // Force of Negation: the gate is a negated turn check, printed first.
  const fon = compile({
    name: 'Force of Negation', type_line: 'Instant',
    oracle_text: "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
  });
  const fonAlt = (fon.abilities[0] as { alternativeCosts?: Array<{ condition?: unknown; costs: unknown[] }> }).alternativeCosts;
  assert.deepEqual(fonAlt?.[0].condition, { if: 'not', of: { if: 'your-turn' } });
  assert.equal(fonAlt?.[0].costs.length, 1);

  // Snuff Out: a land-type gate and a life payment.
  const snuff = compile({
    name: 'Snuff Out', type_line: 'Instant',
    oracle_text: "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated.",
  });
  const snuffAlt = (snuff.abilities[0] as { alternativeCosts?: Array<{ condition?: unknown; costs: unknown[] }> }).alternativeCosts;
  assert.deepEqual(snuffAlt?.[0].costs, [{ pay: 'life', amount: 4 }]);
  assert.deepEqual(snuffAlt?.[0].condition, { if: 'controls', who: { who: 'you' }, what: { is: 'subtype', value: 'swamp' }, cmp: 'gte', value: 1 });

  // Flare of Denial: a sacrifice. Baleful Mastery: bare mana, "pay" and all.
  const flare = compile({
    name: 'Flare of Denial', type_line: 'Instant',
    oracle_text: "You may sacrifice a nontoken blue creature rather than pay this spell's mana cost.\nCounter target spell.",
  });
  assert.equal((flare.abilities[0] as { alternativeCosts?: Array<{ costs: Array<{ pay: string }> }> }).alternativeCosts?.[0].costs[0].pay, 'sacrifice');
  const baleful = compile({
    name: 'Baleful Mastery', type_line: 'Instant',
    oracle_text: "You may pay {1}{B} rather than pay this spell's mana cost.\nIf the {1}{B} cost was paid, an opponent draws a card.\nExile target creature or planeswalker.",
  });
  assert.deepEqual((baleful.abilities[0] as { alternativeCosts?: Array<{ costs: unknown[] }> }).alternativeCosts?.[0].costs, [{ pay: 'mana', cost: '{1}{B}' }]);
  // The consequence of having paid it is history the DSL cannot read; it stays a gap.
  assert.equal(baleful.unparsed.length, 1);
  assert.match(baleful.unparsed[0].text, /^If the \{1\}\{B\} cost was paid/);
});

test('an alternative cost whose gate cannot be read is refused WHOLE, never recorded ungated', () => {
  // Blasphemous Edict: "on the battlefield" is not a zone `parseObject` reads.
  // Mindbreak Trap: history. Either recorded without its gate would say the
  // spell is cheap when it is not.
  assert.equal(parseAlternativeCost('you may pay {b} rather than pay ~s mana cost if there are thirteen or more creatures on the battlefield.'), null);
  assert.equal(parseAlternativeCost('if an opponent cast three or more spells this turn, you may pay {0} rather than pay ~s mana cost.'), null);
  const edict = compile({
    name: 'Blasphemous Edict', type_line: 'Sorcery',
    oracle_text: "You may pay {B} rather than pay this spell's mana cost if there are thirteen or more creatures on the battlefield.\nEach player sacrifices thirteen creatures of their choice.",
  });
  assert.equal(edict.abilities.length, 0);
  assert.equal(edict.unparsed.length, 2);
});

test("an alternative cost for OTHER spells is a permission, not this spell's cost, and is not read", () => {
  assert.equal(parseAlternativeCost('you may pay {0} rather than pay the mana cost for zombie creature spells you cast.'), null);
  assert.equal(parseAlternativeCost('you may pay {0} rather than pay the equip cost of the first equip ability you activate each turn.'), null);
  // Jeska's Will gates a MODE on the commander, not the cost.
  assert.equal(parseAlternativeCost('choose one. if you control a commander as you cast ~, you may choose both instead.'), null);
});

test('an alternative cost with no spell ability to be the cost OF is reported unread, not attached elsewhere', () => {
  // A creature has no spell ability, and the DSL has no card-level record.
  const trace = compileWithTrace({
    oracle_id: 'bringer', name: 'Bringer of the Black Dawn', type_line: 'Creature — Bringer',
    oracle_text: "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost.\nTrample\nAt the beginning of your upkeep, you may pay 2 life. If you do, search your library for a card, then shuffle and put that card on top.",
  });
  assert.deepEqual(trace.result.abilities.map(a => a.kind), ['keyword', 'triggered']);
  for (const a of trace.result.abilities) assert.equal((a as { alternativeCosts?: unknown }).alternativeCosts, undefined);
  assert.ok(trace.result.unparsed.some(u => u.text.startsWith('You may pay {W}{U}{B}{R}{G}')));
  assertClausesAccounted(trace);

  // Deflecting Swat: the effect under the cost is one no rule reads, so the
  // card produces NO record — a cost with nothing to attach to is a gap, and
  // both paragraphs are accounted for as gaps.
  const swat = compileWithTrace({
    oracle_id: 'swat', name: 'Deflecting Swat', type_line: 'Instant',
    oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.',
  });
  assert.equal(swat.result.abilities.length, 0);
  assert.equal(swat.result.unparsed.length, 2);
  assert.equal(swat.result.coverage, 'manual');
  assertClausesAccounted(swat);
});

test('the two new gates parse, and only as the fixed sentences they are', () => {
  assert.deepEqual(parseCondition('you control a commander'), COMMANDER_GATE);
  assert.deepEqual(parseCondition('its not your turn'), { if: 'not', of: { if: 'your-turn' } });
  // "commander" is still not a noun `parseObject` knows; the gate is one
  // sentence, not a pseudo-type that would parse "target commander".
  assert.equal(parseObject('a commander'), null);
  assert.equal(parseCondition('you control two or more commanders'), null);
});

test('"exile … from your hand" is an activation cost the runtime can pay, and "exile this card from your hand" is not', () => {
  assert.deepEqual(parseCosts('exile a card from your hand'), [
    { pay: 'exile', from: 'hand', what: { sel: 'all', where: { is: 'any' }, zone: 'hand' }, count: 1 },
  ]);
  // Simian Spirit Guide. `{sel:'self'}` from the hand would let the
  // battlefield copy of the card exile ITSELF for {R}; the compiler has no
  // active-zone story for a hand ability, so it is refused whole.
  assert.equal(parseCosts('exile ~ from your hand'), null);
  const guide = compile({ name: 'Simian Spirit Guide', type_line: 'Creature — Ape Spirit', oracle_text: 'Exile this card from your hand: Add {R}.' });
  assert.equal(guide.abilities.length, 0);
});

test('"cast … without paying its mana cost" as an EFFECT is a named marker, and the real effects beside it still run', () => {
  // Electrodominance: the damage is real, the free cast is the player's.
  const electro = compile({
    name: 'Electrodominance', type_line: 'Instant',
    oracle_text: 'Electrodominance deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost.',
  });
  const effects = effectsOf(electro.abilities[0]);
  assert.equal(effects[0].do, 'damage');
  assert.equal(effects[1].do, 'manual');
  assert.match((effects[1] as { hint?: string }).hint ?? '', /^cast-free:/);
  assert.equal(electro.coverage, 'partial');

  // Etali: the marker sits in a trigger, with a prefix the sentence carries.
  const etali = compile({
    name: 'Etali, Primal Storm', type_line: 'Legendary Creature — Elder Dinosaur',
    oracle_text: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.",
  });
  assert.equal(etali.abilities[0].kind, 'triggered');
  assert.ok(effectsOf(etali.abilities[0]).some(e => e.do === 'manual' && /^cast-free:/.test((e as { hint?: string }).hint ?? '')));

  // Mizzix's Mastery: "copy it, and you may cast the copy".
  const mizzix = compile({
    name: "Mizzix's Mastery", type_line: 'Sorcery',
    oracle_text: "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost. Exile Mizzix's Mastery.\nOverload {5}{R}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
  });
  assert.ok(effectsOf(mizzix.abilities[0]).some(e => e.do === 'manual' && /^cast-free:/.test((e as { hint?: string }).hint ?? '')));

  // And NEVER for the spell's own alternative cost, which is a cost and lives
  // on the ability: Fierce Guardianship's marker is the alternative-cost one.
  const fg = compile({
    name: 'Fierce Guardianship', type_line: 'Instant',
    oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.',
  });
  assert.ok(!effectsOf(fg.abilities[0]).some(e => e.do === 'manual' && /^cast-free:/.test((e as { hint?: string }).hint ?? '')));
});

test('a paragraph that is ONLY a free cast still produces no ability: a marker alone is not a record', () => {
  // Rishkar's Expertise. Its first paragraph is unread for its own reason, and
  // the second is a player action with no real effect beside it, so
  // `anyAutomated` refuses it — the honest answer, not a gap in this rule.
  const rishkar = compileWithTrace({
    oracle_id: 'rishkar', name: "Rishkar's Expertise", type_line: 'Sorcery',
    oracle_text: 'Draw cards equal to the greatest power among creatures you control.\nYou may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
  });
  assert.equal(rishkar.result.abilities.length, 0);
  assert.equal(rishkar.result.unparsed.length, 2);
  assertClausesAccounted(rishkar);
});
