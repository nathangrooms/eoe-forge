/**
 * GATE 3 — behaviour, for P03 and P19.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/damage.test.ts
 *
 * A3 is the assertion that matters and it is worth naming what it is for. The
 * primitive is deliberately WEAKER than the code it replaces: it emits a
 * `DAMAGE_CARD` and no `MOVE_ZONE`, so on its own the creature does not die. A
 * reviewer could reasonably read that as a regression. A3 pushes the action
 * through the real reducer and asserts the creature ends up in the graveyard
 * anyway, because `checkStateBasedActions` applies CR 704.5g — which is where
 * that decision belongs and where it already lived.
 *
 * A4 and the two-shocks test are the ones the replaced code failed outright.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyAction, applyActions } from '../../rules.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import { damageToPermanent, sourceHasDeathtouch } from './damage.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

const shockAt = (ref = 0): Extract<Effect, { do: 'damage' }> => ({
  do: 'damage',
  to: { sel: 'target', ref },
  amount: 2,
});

test('P03/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Shock', 'deals 2 damage');
  assertOracleContains('Lightning Bolt', 'deals 3 damage');
  assertOracleContains('Pyroclasm', 'deals 2 damage to each creature');
  assertOracleContains('Vampire Nighthawk', 'deathtouch');
});

test('P03/A1 — Shock at a 3/3 emits one DAMAGE_CARD and no MOVE_ZONE', () => {
  const state = board([{ id: 'big', card: 'Colossal Dreadmaw' }]);
  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'big', zone: 'battlefield' }] });
  const result = damageToPermanent(shockAt(), ctx, env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'DAMAGE_CARD');
  assert.equal((result.actions[0] as { amount: number }).amount, 2);
  assert.equal(result.actions.some(a => a.type === 'MOVE_ZONE'), false);
  assert.deepEqual(result.deferred, []);
});

test('P03/A2 — Shock at a 2/2 STILL emits only a DAMAGE_CARD; the kill is not this effect’s job', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = damageToPermanent(shockAt(), ctx, env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'DAMAGE_CARD');
  assert.equal(result.actions.some(a => a.type === 'MOVE_ZONE'), false);
});

test('P03/A3 — put that action through the reducer and CR 704.5g does kill it', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = damageToPermanent(shockAt(), ctx, env());

  const after = applyActions(state, result.actions);
  assert.equal(after.cards.bear.zone, 'graveyard');
});

test('P03/A3b — two separate 2-damage effects at a 4/4 accumulate and kill it', () => {
  // The replaced implementation could never do this: it decided lethality per
  // effect, so neither shock was lethal and nothing was ever marked.
  const state = board([{ id: 'big', card: 'Colossal Dreadmaw' }]);
  assert.equal(state.cards.big.toughness, '6');

  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'big', zone: 'battlefield' }] });
  const first = applyActions(state, damageToPermanent({ ...shockAt(), amount: 3 }, ctx, env()).actions);
  assert.equal(first.cards.big.zone, 'battlefield');
  assert.equal(first.cards.big.damage, 3);

  const ctx2 = ctxFor(first, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'big', zone: 'battlefield' }] });
  const second = applyActions(first, damageToPermanent({ ...shockAt(), amount: 3 }, ctx2, env({ ordinal: 1 })).actions);
  assert.equal(second.cards.big.zone, 'graveyard');
});

test('P03/A4 — a deathtouch source flags the action, and one point kills a big creature', () => {
  const state = board([
    { id: 'hawk', card: 'Vampire Nighthawk' },
    { id: 'big', card: 'Colossal Dreadmaw', owner: 'p2' },
  ]);
  const ctx = ctxFor(state, 'hawk', 'p1', { targets: [{ kind: 'card', instanceId: 'big', zone: 'battlefield' }] });
  const result = damageToPermanent({ ...shockAt(), amount: 1 }, ctx, env());

  assert.equal((result.actions[0] as { deathtouch?: boolean }).deathtouch, true);
  const after = applyActions(state, result.actions);
  assert.equal(after.cards.big.zone, 'graveyard');
});

test('P03/A5 — damage to an indestructible creature is still marked; 704.5g decides, not us', () => {
  const state = board([{ id: 'ind', card: 'Grizzly Bears', keywords: ['Indestructible'] }]);
  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'ind', zone: 'battlefield' }] });
  const result = damageToPermanent(shockAt(), ctx, env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'DAMAGE_CARD');
  const after = applyActions(state, result.actions);
  assert.equal(after.cards.ind.zone, 'battlefield');
});

test('P03/A6 — zero damage emits nothing at all', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const ctx = ctxFor(state, 'shock', 'p1', { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield' }] });
  const result = damageToPermanent({ ...shockAt(), amount: 0 }, ctx, env());
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.deferred, []);
});

test('P03/real — Pyroclasm hits every creature, one action each', () => {
  const state = board([
    { id: 'bear', card: 'Grizzly Bears' },
    { id: 'bear2', card: 'Grizzly Bears', owner: 'p2' },
  ]);
  const ctx = ctxFor(state, 'pyro', 'p1');
  const result = damageToPermanent(
    { do: 'damage', to: { sel: 'all', where: { is: 'type', value: 'creature' } }, amount: 2 },
    ctx,
    env()
  );
  assert.equal(result.actions.length, 2);
  const after = applyActions(state, result.actions);
  assert.equal(after.cards.bear.zone, 'graveyard');
  assert.equal(after.cards.bear2.zone, 'graveyard');
});

/* ------------------------------------------------------------------ *
 * P19
 * ------------------------------------------------------------------ */

test('P19/A1 — a printed deathtoucher reads true', () => {
  const state = board([{ id: 'hawk', card: 'Vampire Nighthawk' }]);
  assert.equal(sourceHasDeathtouch(ctxFor(state, 'hawk')), true);
});

test('P19/A2 — a vanilla creature reads false', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  assert.equal(sourceHasDeathtouch(ctxFor(state, 'bear')), false);
});

test('P19/A3 — deathtouch granted through the LAYERED view is seen', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const printed = ctxFor(state, 'bear');
  assert.equal(sourceHasDeathtouch(printed), false);

  const granted = ctxFor(state, 'bear', 'p1', {
    view: {
      bear: {
        power: 2,
        toughness: 2,
        types: ['creature'],
        subtypes: ['bear'],
        supertypes: [],
        colors: ['g'],
        keywords: ['deathtouch'],
        controllerId: 'p1',
        manaValue: 2,
      },
    },
  });
  assert.equal(sourceHasDeathtouch(granted), true);
});

test('P19/A4 — a source that has left the battlefield reads false', () => {
  const state = board([{ id: 'hawk', card: 'Vampire Nighthawk' }]);
  const gone = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'hawk', to: 'graveyard', at: 0 });
  assert.equal(sourceHasDeathtouch(ctxFor(gone, 'missing')), false);
});
