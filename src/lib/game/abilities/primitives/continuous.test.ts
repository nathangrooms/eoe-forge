/**
 * GATE 3 — behaviour, for P01, P02, P11, P12, P13, P14, P15.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/continuous.test.ts
 *
 * Test names are `P##/A#` on purpose: `scripts/primitives/gates/behaviour.mjs`
 * reads them back and fails a primitive whose spec claims an assertion that no
 * test covers. A spec cannot quietly promise more than the tests check.
 *
 * The assertions that matter most here are the negative ones. "The bear is 5/5"
 * is satisfied by almost any implementation; "the creature that arrived after
 * the spell resolved is still 2/2" is satisfied only by one that pinned the
 * affected set the way CR 613.6 requires.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStateLayers } from '../../layers.ts';
import { assertSerialisable } from '../../../cards/abilities/dsl.ts';
import { addCard } from '../../rules.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import {
  assembleContinuous,
  durationToExpiry,
  gainControlToContinuous,
  grantAbilityPart,
  ptModifyPart,
  pumpToContinuous,
  selectorToLayerSelector,
} from './continuous.ts';
import { assertOracleContains, board, ctxFor, env, realCard } from './harness.testlib.ts';

/* ------------------------------------------------------------------ *
 * The cards the specs name really exist and really say this
 * ------------------------------------------------------------------ */

test('P01/cards — the fixture cards are real catalogue rows saying what the spec claims', () => {
  assertOracleContains('Giant Growth', 'gets +3/+3');
  assertOracleContains('Titanic Growth', 'gets +4/+4');
  assertOracleContains('Glorious Anthem', 'get +1/+1');
  assert.equal(realCard('Giant Growth').type_line, 'Instant');
});

/* ------------------------------------------------------------------ *
 * P11 — ptModifyPart
 * ------------------------------------------------------------------ */

test('P11/A1 — 3 and 3 become one 7c modify-pt part', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const part = ptModifyPart(3, 3, ctxFor(state, 'bear'));
  assert.equal(part.sublayer, '7c');
  assert.equal(part.modification.kind, 'modify-pt');
  assert.equal((part.modification as { power: number }).power, 3);
  assert.equal((part.modification as { toughness: number }).toughness, 3);
});

test('P11/A2 — negatives survive', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const part = ptModifyPart(-3, -3, ctxFor(state, 'bear'));
  assert.equal((part.modification as { power: number }).power, -3);
  assert.equal((part.modification as { toughness: number }).toughness, -3);
});

test('P11/A3 — a count expression arrives as a number, not an expression', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'bear2', card: 'Grizzly Bears' },
  ]);
  const part = ptModifyPart(
    { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'creature' } } },
    0,
    ctxFor(state, 'bear')
  );
  assert.equal((part.modification as { power: number }).power, 2);
  assert.equal(typeof (part.modification as { power: unknown }).power, 'number');
});

/* ------------------------------------------------------------------ *
 * P12 — grantAbilityPart
 * ------------------------------------------------------------------ */

test('P12/A1 — one keyword becomes a 6a ability part, lower-cased', () => {
  const part = grantAbilityPart(['Trample']);
  assert.ok(part);
  assert.equal(part.sublayer, '6a');
  assert.deepEqual((part.modification as { addAbilities: string[] }).addAbilities, ['trample']);
});

test('P12/A2 — an empty list is null, not an empty part', () => {
  assert.equal(grantAbilityPart([]), null);
});

test('P12/A3 — several keywords keep their order and all lower-case', () => {
  const part = grantAbilityPart(['Flying', 'Vigilance']);
  assert.deepEqual((part!.modification as { addAbilities: string[] }).addAbilities, ['flying', 'vigilance']);
});

test('P12/A4 — undefined is null', () => {
  assert.equal(grantAbilityPart(undefined), null);
});

/* ------------------------------------------------------------------ *
 * P13 — durationToExpiry
 * ------------------------------------------------------------------ */

test('P13/A1 — end-of-turn records the ABSOLUTE turn, not a countdown', () => {
  const base = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const state = { ...base, turn: 7 };
  assert.deepEqual(durationToExpiry('end-of-turn', state, 'p1'), { kind: 'end-of-turn', turn: 7 });
});

test('P13/A2 — permanent never expires', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  assert.deepEqual(durationToExpiry('permanent', state, 'p1'), { kind: 'never' });
});

test('P13/A3 — while-source carries no turn at all', () => {
  const state = { ...board([{ id: 'bear', card: 'Grizzly Bears' }]), turn: 4 };
  const expiry = durationToExpiry('while-source-on-battlefield', state, 'p1');
  assert.deepEqual(expiry, { kind: 'while-source' });
  assert.equal('turn' in expiry, false);
});

test('P13/A4 — every expiry is plain JSON', () => {
  const state = { ...board([{ id: 'bear', card: 'Grizzly Bears' }]), turn: 3 };
  for (const duration of ['end-of-turn', 'your-next-turn', 'while-source-on-battlefield', 'permanent'] as const) {
    assertSerialisable(durationToExpiry(duration, state, 'p1'));
  }
});

/* ------------------------------------------------------------------ *
 * P15 — selectorToLayerSelector
 * ------------------------------------------------------------------ */

test('P15/A1 — a target selector pins exactly the one id', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'bear2', card: 'Grizzly Bears' },
  ]);
  const ctx = ctxFor(state, 'src', 'p1', {
    targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }],
  });
  const selector = selectorToLayerSelector({ sel: 'target', ref: 0 }, ctx);
  assert.equal(selector.kind, 'ids');
  assert.deepEqual((selector as { ids: string[] }).ids, ['bear']);
});

test('P15/A2 — nothing resolved is `none`, never `all`', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const selector = selectorToLayerSelector(
    { sel: 'all', where: { is: 'type', value: 'planeswalker' } },
    ctxFor(state, 'bear')
  );
  assert.equal(selector.kind, 'none');
});

test('P15/A3 — an all-creatures selector pins both, in seat order', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'bear2', card: 'Grizzly Bears' },
  ]);
  const selector = selectorToLayerSelector(
    { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    ctxFor(state, 'bear')
  );
  assert.deepEqual((selector as { ids: string[] }).ids, ['bear', 'bear2']);
});

test('P15/A4 — CR 613.6: a creature that arrives later is NOT in the pinned set', () => {
  const before = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const selector = selectorToLayerSelector(
    { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    ctxFor(before, 'bear')
  );
  const after = addCard(
    before,
    { instanceId: 'late', cardId: 'late', name: 'Grizzly Bears', ownerId: 'p1', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'battlefield'
  );
  assert.ok(after.cards.late, 'the later creature really is on the board');
  assert.deepEqual((selector as { ids: string[] }).ids, ['bear']);
});

/* ------------------------------------------------------------------ *
 * P14 — assembleContinuous
 * ------------------------------------------------------------------ */

test('P14/A1 — no parts is null', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  assert.equal(assembleContinuous([], { kind: 'all' }, ctxFor(state, 'bear'), env(), 'x'), null);
});

test('P14/A2 — provides is derived from the parts', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'bear');
  const effect = assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'ids', ids: ['bear'] }, ctx, env(), 'x');
  assert.deepEqual(effect!.provides, ['modify-pt']);
});

test('P14/A3 — the same env twice gives the same id', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'bear');
  const a = assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'all' }, ctx, env(), 'x');
  const b = assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'all' }, ctx, env(), 'x');
  assert.equal(a!.id, b!.id);
});

test('P14/A4 — a different ordinal gives a different id', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'bear');
  const a = assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'all' }, ctx, env({ ordinal: 0 }), 'x');
  const b = assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'all' }, ctx, env({ ordinal: 1 }), 'x');
  assert.notEqual(a!.id, b!.id);
});

test('P14/A5 — the assembled effect is plain JSON', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'bear');
  assertSerialisable(assembleContinuous([ptModifyPart(1, 1, ctx)], { kind: 'ids', ids: ['bear'] }, ctx, env(), 'x'));
});

/* ------------------------------------------------------------------ *
 * P01 — pumpToContinuous, over real cards
 * ------------------------------------------------------------------ */

const giantGrowth = (): Extract<Effect, { do: 'pump' }> => ({
  do: 'pump',
  what: { sel: 'target', ref: 0 },
  power: 3,
  toughness: 3,
  duration: 'end-of-turn',
});

test('P01/A1 — Giant Growth on a bear yields one 7c effect affecting only the bear', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'other', card: 'Grizzly Bears', owner: 'p2' },
  ]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = pumpToContinuous(giantGrowth(), ctx, env());

  assert.equal(result.continuous.length, 1);
  assert.deepEqual(result.actions, []);
  const effect = result.continuous[0];
  assert.equal(effect.parts.length, 1);
  assert.equal(effect.parts[0].sublayer, '7c');
  assert.deepEqual((effect.affects as { ids: string[] }).ids, ['bear']);
});

test('P01/A2 — fed to computeLayers, the bear really reads 5/5 and the other bear does not', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'other', card: 'Grizzly Bears', owner: 'p2' },
  ]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = pumpToContinuous(giantGrowth(), ctx, env());

  const layered = computeStateLayers(state, result.continuous);
  assert.equal(layered.objects.bear.power, 5);
  assert.equal(layered.objects.bear.toughness, 5);
  assert.equal(layered.objects.other.power, 2);
});

test('P01/A3 — a grant adds a 6a part inside the SAME effect, one id and one timestamp', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = pumpToContinuous({ ...giantGrowth(), grant: ['trample'] }, ctx, env());

  assert.equal(result.continuous.length, 1);
  const parts = result.continuous[0].parts;
  assert.deepEqual(parts.map(p => p.sublayer), ['7c', '6a']);

  const layered = computeStateLayers(state, result.continuous);
  assert.ok(layered.objects.bear.abilities.includes('trample'));
});

test('P01/A4 — nothing to pump yields no effect and exactly one deferred line', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [] });
  const result = pumpToContinuous(giantGrowth(), ctx, env());
  assert.deepEqual(result.continuous, []);
  assert.equal(result.deferred.length, 1);
});

test('P01/A5 — the same call twice is byte-identical, id included', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const a = pumpToContinuous(giantGrowth(), ctx, env());
  const b = pumpToContinuous(giantGrowth(), ctx, env());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('P01/A6 — a computed power arrives as a number in the part', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'bear2', card: 'Grizzly Bears' },
  ]);
  const ctx = ctxFor(state, 'gg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = pumpToContinuous(
    {
      ...giantGrowth(),
      power: { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } } },
    },
    ctx,
    env()
  );
  assert.equal((result.continuous[0].parts[0].modification as { power: number }).power, 2);
});

test('P01/real — Titanic Growth compiles to +4/+4 and the board agrees', () => {
  assertOracleContains('Titanic Growth', 'gets +4/+4');
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'tg', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = pumpToContinuous({ ...giantGrowth(), power: 4, toughness: 4 }, ctx, env());
  assert.equal(computeStateLayers(state, result.continuous).objects.bear.power, 6);
});

/* ------------------------------------------------------------------ *
 * P02 — gainControlToContinuous
 * ------------------------------------------------------------------ */

const actOfTreason = (): Extract<Effect, { do: 'gain-control' }> => ({
  do: 'gain-control',
  what: { sel: 'target', ref: 0 },
  who: { who: 'you' },
  duration: 'end-of-turn',
});

test('P02/cards — Act of Treason and Mind Control are real and say what the spec claims', () => {
  assertOracleContains('Act of Treason', 'Gain control of target creature');
  assertOracleContains('Mind Control', 'control enchanted creature');
});

test('P02/A1 — one 2a control effect naming the thief', () => {
  const state = board([{ id: 'victim', card: 'Grizzly Bears', owner: 'p2' }]);
  const ctx = ctxFor(state, 'aot', 'p1', { targets: [{ kind: 'card', instanceId: 'victim', zone: 'battlefield' }] });
  const result = gainControlToContinuous(actOfTreason(), ctx, env());

  assert.equal(result.continuous.length, 1);
  assert.equal(result.continuous[0].parts[0].sublayer, '2a');
  assert.equal((result.continuous[0].parts[0].modification as { controller: string }).controller, 'p1');
});

test('P02/A2 — computeLayers really reassigns the controller', () => {
  const state = board([{ id: 'victim', card: 'Grizzly Bears', owner: 'p2' }]);
  assert.equal(state.cards.victim.controllerId, 'p2');
  const ctx = ctxFor(state, 'aot', 'p1', { targets: [{ kind: 'card', instanceId: 'victim', zone: 'battlefield' }] });
  const result = gainControlToContinuous(actOfTreason(), ctx, env());
  const layered = computeStateLayers(state, result.continuous);
  assert.equal(layered.objects.victim.controller, 'p1');
});

test('P02/A3 — no resolvable controller means no effect and one deferred line', () => {
  const state = board([{ id: 'victim', card: 'Grizzly Bears', owner: 'p2' }]);
  const ctx = ctxFor(state, 'aot', 'p1', { targets: [] });
  const result = gainControlToContinuous(actOfTreason(), ctx, env());
  assert.deepEqual(result.continuous, []);
  assert.equal(result.deferred.length, 1);
});
