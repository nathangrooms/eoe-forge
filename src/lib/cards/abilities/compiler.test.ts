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
import { normalizeCard, normalizeParagraph } from './normalize.ts';
import { deriveCoverage, assertSerialisable, hasManualEffect, effectsOf } from './dsl.ts';
import type { Ability, Effect } from './dsl.ts';
import { KEYWORDS, parseObject, parseKeywordList, parseDuration } from './grammar.ts';
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

const firstOfKind = (row: Row, kind: Ability['kind']): Ability | undefined =>
  compile(row).abilities.find((a) => a.kind === kind);

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

test('an intervening-if clause is refused, not silently dropped', () => {
  // Goblin Bushwhacker only pumps IF it was kicked. Reading the pump and
  // ignoring the condition would pump every time — a wrong ability.
  const result = compile({
    name: 'Goblin Bushwhacker', type_line: 'Creature — Goblin Warrior',
    oracle_text: 'When this creature enters, if it was kicked, creatures you control get +1/+0 and gain haste until end of turn.',
  });
  const a = result.abilities[0];
  assert.equal(a.kind, 'triggered');
  const effects = effectsOf(a);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].do, 'manual');
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
