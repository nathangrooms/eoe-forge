/**
 * Tests for the card record shape.
 *
 * These are not "does the type compile" tests. Each one pins a decision the
 * design argues for in `docs/engine/CARD-SEMANTICS.md`, so that if somebody
 * later loosens one of them the test says which argument they are reversing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertSerialisable } from '../abilities/dsl.ts';
import {
  type AbilityRecord,
  type CardRecord,
  type Invocation,
  arg,
  effectRootsOf,
  slotsInRecord,
} from './record.ts';
import { assignRoles, classifyFilter, facetsOf, resolveScale, rolesOf, symmetryOf } from './roles.ts';
import { lowerAbility, lowerCard } from './lower.ts';
import { comparisonClasses, compareCards, parseCost } from './compare.ts';
import { coverageOf, reportCoverage } from './coverage.ts';

/* ------------------------------------------------------------------ *
 * Fixtures, built the way the extraction builds them
 * ------------------------------------------------------------------ */

function spell(name: string, mana: string, types: string[], effects: Invocation[], targets: Invocation[] = []): CardRecord {
  const ability: AbilityRecord = {
    id: 'f0a0',
    kind: 'spell',
    via: { prim: 'xmage:SpellAbility', role: 'spell-ability', args: [] },
    effects,
    costs: [],
    targets,
  };
  return {
    oracleId: `oracle-${name}`,
    name,
    layout: 'normal',
    commanderLegal: true,
    faces: [
      { index: 0, kind: 'main', name, mana, types, subtypes: [], supertypes: [], abilities: [ability] },
    ],
    provenance: {
      xmageClass: name.replace(/\s/g, ''),
      xmagePath: 'Mage.Sets/src/mage/cards/x/X.java',
      xmageCommit: 'test',
      builtBy: 'record.test.ts',
      builtAt: '2026-08-22T00:00:00.000Z',
      join: 'exact',
    },
  };
}

const destroyAll = (filter: unknown, controller?: unknown): Invocation => ({
  prim: 'xmage:DestroyAllEffect',
  role: 'one-shot-effect',
  paramMatch: 'unique',
  args: [
    {
      name: 'filter',
      of: 'FilterPermanent',
      value: { k: 'objects', filter: filter as never, ...(controller ? { controller: controller as never } : {}) },
    },
    { name: 'noRegen', of: 'boolean', value: { k: 'bool', b: true } },
  ],
});

const wrath = spell('Wrath of God', '{2}{W}{W}', ['Sorcery'], [destroyAll({ is: 'type', value: 'Creature' })]);
const armageddon = spell('Armageddon', '{3}{W}', ['Sorcery'], [
  {
    prim: 'xmage:DestroyAllEffect',
    role: 'one-shot-effect',
    paramMatch: 'unique',
    args: [{ name: 'filter', of: 'FilterPermanent', value: { k: 'objects', filter: { is: 'type', value: 'Land' } } }],
  },
]);

/* ------------------------------------------------------------------ *
 * The unlock: the same primitive, different arguments, different meaning
 * ------------------------------------------------------------------ */

test('the same primitive with different arguments earns different roles', () => {
  assert.deepEqual(
    rolesOf(wrath).map((r) => r.role),
    ['board-wipe'],
  );
  assert.deepEqual(
    rolesOf(armageddon).map((r) => r.role).sort(),
    ['land-destruction', 'stax'],
  );
});

test('two cards using one primitive on different objects are not comparable', () => {
  // The old import-based extraction gave both of these the signature
  // `[DestroyAllEffect]`. Refusing the comparison is the whole point.
  assert.equal(compareCards(wrath, armageddon).cls, null);
});

test('two cards that really are the same card compare on every axis', () => {
  const damnation = spell('Damnation', '{2}{B}{B}', ['Sorcery'], [destroyAll({ is: 'type', value: 'Creature' })]);
  const result = compareCards(wrath, damnation);
  assert.equal(result.cls?.key, 'board-wipe:creature');
  assert.ok(result.axes.every((a) => a.verdict === 'tie'), JSON.stringify(result.axes));
});

/* ------------------------------------------------------------------ *
 * The three-state slot
 * ------------------------------------------------------------------ */

test('a hole is localised to its slot, not to the card', () => {
  const dockside = spell('Dockside Extortionist', '{1}{R}', ['Creature'], [
    {
      prim: 'xmage:CreateTokenEffect',
      role: 'one-shot-effect',
      paramMatch: 'names-agree',
      args: [
        { name: 'token', of: 'Token', value: { k: 'invoke', invocation: { prim: 'xmage:TreasureToken', role: 'token', args: [] } } },
        { name: 'amount', of: 'int', hole: { reason: 'card-local-class', declared: 'DynamicValue', localName: 'DocksideExtortionistValue' } },
      ],
    },
  ]);
  const coverage = coverageOf(dockside);
  assert.equal(coverage.playable, false, 'a hole in the count must block play');
  assert.equal(coverage.aggregatable, false, 'an unknown magnitude is not an aggregatable magnitude');
  assert.equal(coverage.aggregatablePartly, true, 'the role survives the hole');
  assert.equal(coverage.searchable, true, 'the effect and the token are still indexable');
  assert.deepEqual(coverage.slots, { total: 2, value: 1, carried: 0, hole: 1 });
  assert.ok(facetsOf(dockside).some((f) => f.key === 'unknown' && f.value === 'token-maker'));
});

test('an unknown magnitude is never substituted with a number', () => {
  const scale = resolveScale(
    {
      prim: 'xmage:CreateTokenEffect',
      role: 'one-shot-effect',
      args: [{ name: 'amount', hole: { reason: 'card-local-class', localName: 'XValue' } }],
    },
    { from: 'arg', name: 'amount' },
  );
  assert.equal(scale.s, 'unknown');
});

/* ------------------------------------------------------------------ *
 * Guards against the two ways coverage was overstated before
 * ------------------------------------------------------------------ */

test('a card is not playable because one of its abilities lowers', () => {
  const half = spell('Half Done', '{1}{U}', ['Instant'], [
    { prim: 'xmage:CounterTargetEffect', role: 'one-shot-effect', args: [] },
  ]);
  half.faces[0].abilities.push({
    id: 'f0a1',
    kind: 'triggered',
    via: { prim: 'xmage:EntersBattlefieldTriggeredAbility', role: 'triggered-ability', args: [] },
    effects: [{ prim: 'xmage:SomethingUnwritten', role: 'one-shot-effect', args: [] }],
    costs: [],
    targets: [],
  });
  half.faces[0].abilities[0].targets.push({ prim: 'xmage:TargetSpell', role: 'target', args: [] });

  assert.equal(lowerAbility(half.faces[0].abilities[0], half).ok, true);
  assert.equal(coverageOf(half).playable, false);
});

test('an ability that lowers to nothing is blocked, not silently fine', () => {
  const staticOnly = spell('Static Only', '{2}', ['Enchantment'], []);
  staticOnly.faces[0].abilities[0] = {
    id: 'f0a0',
    kind: 'static',
    via: { prim: 'xmage:SimpleStaticAbility', role: 'static-ability', args: [] },
    effects: [],
    costs: [],
    targets: [],
  };
  const result = lowerCard(staticOnly);
  assert.equal(result.ok, false);
});

test('a card with no abilities is vacuous, and vacuous is not playable', () => {
  const vanilla = spell('Grizzly Bears', '{1}{G}', ['Creature'], []);
  vanilla.faces[0].abilities = [];
  const coverage = coverageOf(vanilla);
  assert.equal(coverage.vacuous, true);
  assert.equal(coverage.playable, false);
});

test('every coverage report carries its denominator', () => {
  const report = reportCoverage([wrath, armageddon], 'two test cards');
  assert.equal(report.denominator, 2);
  assert.equal(report.denominatorMeaning, 'two test cards');
});

/* ------------------------------------------------------------------ *
 * Precision guards
 * ------------------------------------------------------------------ */

test('a rule that reads a named argument is skipped when the overload was ambiguous', () => {
  const ambiguous: Invocation = {
    prim: 'xmage:DestroyAllEffect',
    role: 'one-shot-effect',
    paramMatch: 'ambiguous-arity',
    args: [{ name: 'filter', value: { k: 'objects', filter: { is: 'type', value: 'Creature' } } }],
  };
  assert.deepEqual(assignRoles(ambiguous), []);
});

test('agreeing parameter names are trusted even when the overload is not', () => {
  const agreed: Invocation = {
    prim: 'xmage:DestroyAllEffect',
    role: 'one-shot-effect',
    paramMatch: 'names-agree',
    args: [{ name: 'filter', value: { k: 'objects', filter: { is: 'type', value: 'Creature' } } }],
  };
  assert.deepEqual(assignRoles(agreed).map((r) => r.role), ['board-wipe']);
});

test('symmetry is unknown rather than assumed when the object set did not resolve', () => {
  assert.equal(symmetryOf(undefined), 'unknown');
  assert.equal(symmetryOf({ k: 'objects', filter: { is: 'any' } }), 'symmetric');
  assert.equal(
    symmetryOf({ k: 'objects', filter: { is: 'any' }, controller: { who: 'each-opponent' } }),
    'one-sided',
  );
});

test('the filter classifier answers empty rather than guessing', () => {
  assert.deepEqual(classifyFilter({ is: 'type', value: 'Creature' }), ['creature']);
  assert.deepEqual(classifyFilter({ is: 'not', of: { is: 'type', value: 'Land' } }), ['nonland-permanent']);
  assert.deepEqual(classifyFilter({ is: 'has-counter', counter: 'oil' }), []);
});

/* ------------------------------------------------------------------ *
 * Cost, and modes
 * ------------------------------------------------------------------ */

test('mana value and pips are separate questions', () => {
  const wrathCost = parseCost('{2}{W}{W}');
  const alt = parseCost('{3}{W}');
  assert.equal(wrathCost.manaValue, 4);
  assert.equal(alt.manaValue, 4);
  assert.equal(Object.values(wrathCost.pips).reduce((a, b) => a + b, 0), 2);
  assert.equal(Object.values(alt.pips).reduce((a, b) => a + b, 0), 1);
});

test('an X cost is not reported as a mana value', () => {
  const x = parseCost('{X}{B}{B}{B}');
  assert.equal(x.hasX, true);
  assert.equal(x.manaValue, 3);
});

test('a modal ability counts mode zero once', () => {
  const modal = spell('Modal', '{1}{U}{U}{U}', ['Instant'], [
    { prim: 'xmage:CounterTargetEffect', role: 'one-shot-effect', args: [] },
  ]);
  const ability = modal.faces[0].abilities[0];
  ability.targets = [{ prim: 'xmage:TargetSpell', role: 'target', args: [] }];
  ability.modes = [
    { index: 0, effects: ability.effects, targets: ability.targets },
    {
      index: 1,
      effects: [{ prim: 'xmage:DrawCardSourceControllerEffect', role: 'one-shot-effect', paramMatch: 'unique', args: [{ name: 'amount', value: { k: 'int', n: 1 } }] }],
      targets: [],
    },
  ];
  ability.modeLimits = { min: 2, max: 2 };

  assert.equal(effectRootsOf(ability).length, 2);
  const roles = rolesOf(modal).map((r) => r.role).sort();
  assert.deepEqual(roles, ['card-draw', 'counterspell']);
  assert.deepEqual(comparisonClasses(modal).map((c) => c.key).sort(), ['card-draw:any', 'counterspell:any']);
});

/* ------------------------------------------------------------------ *
 * The serialisation contract
 * ------------------------------------------------------------------ */

test('a record is pure JSON', () => {
  assertSerialisable(wrath);
  assertSerialisable(armageddon);
});

test('a child shared with an argument is counted once', () => {
  // The extraction states one construction twice: as an argument, and in the
  // ability's own effect list. The builder shares a single object between them,
  // and identity is what stops the census counting it twice.
  const gainLife: Invocation = {
    prim: 'xmage:GainLifeEffect',
    role: 'one-shot-effect',
    args: [{ name: 'life', value: { k: 'int', n: 1 } }],
  };
  const shared = spell('Shared', '{1}', ['Instant'], [
    {
      prim: 'xmage:DoIfCostPaid',
      role: 'one-shot-effect',
      args: [{ name: 'effectOnPaid', value: { k: 'invoke', invocation: gainLife } }],
      children: { effects: [gainLife] },
    },
  ]);
  assert.equal(slotsInRecord(shared).length, 2);

  // And a child that is genuinely a different node is counted separately,
  // because a child added by a method call rather than a constructor argument
  // is a real second effect and dropping it would lose the card's behaviour.
  const distinct = spell('Distinct', '{1}', ['Instant'], [
    {
      prim: 'xmage:DoIfCostPaid',
      role: 'one-shot-effect',
      args: [{ name: 'effectOnPaid', value: { k: 'invoke', invocation: gainLife } }],
      children: {
        effects: [
          { prim: 'xmage:GainLifeEffect', role: 'one-shot-effect', args: [{ name: 'life', value: { k: 'int', n: 2 } }] },
        ],
      },
    },
  ]);
  assert.equal(slotsInRecord(distinct).length, 3);
});

test('a named argument reads back by name, not by position', () => {
  const inv = wrath.faces[0].abilities[0].effects[0];
  assert.equal(arg(inv, 'noRegen')?.value?.k, 'bool');
  assert.equal(arg(inv, 'nosuch'), undefined);
});
