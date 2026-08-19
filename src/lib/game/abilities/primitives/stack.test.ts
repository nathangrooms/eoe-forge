/**
 * GATE 3 — behaviour, for P07 and P18.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/stack.test.ts
 *
 * A2 in both primitives is the one that earns the gate. CR 608.2b says an
 * illegal target is simply not affected — so a stack id that has left the stack
 * must be DROPPED. The tempting implementation returns it and lets the caller
 * fire `COUNTER_SPELL` at it, which counters whatever object now holds that id:
 * silent, and aimed at the wrong player's spell.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyActions } from '../../rules.ts';
import type { GameState } from '../../types.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import { counterTargetSpell, stackTargetsOf } from './stack.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

const counter: Extract<Effect, { do: 'counter' }> = { do: 'counter', what: { sel: 'target', ref: 0 } };

/** A board with one spell announced on the stack, and its stack id. */
function withSpellOnStack(): { state: GameState; stackId: string } {
  const base = board([
    { id: 'spell', card: 'Shock', owner: 'p2', zone: 'hand' },
    { id: 'cs', card: 'Counterspell', zone: 'hand' },
  ]);
  const state = applyActions(base, [
    { type: 'CAST_SPELL', instanceId: 'spell', controllerId: 'p2', stackId: 'sk1', at: 0 },
  ]);
  return { state, stackId: 'sk1' };
}

test('P07/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Counterspell', 'Counter target spell');
  assertOracleContains('Negate', 'Counter target noncreature spell');
});

/* ------------------------------------------------------------------ *
 * P18
 * ------------------------------------------------------------------ */

test('P18/A1 — a live stack target comes back', () => {
  const { state, stackId } = withSpellOnStack();
  assert.ok((state.stack ?? []).some(o => o.stackId === stackId), 'the spell really is on the stack');
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [{ kind: 'stack', stackId }] });
  assert.deepEqual(stackTargetsOf(ctx), [stackId]);
});

test('P18/A2 — CR 608.2b: a target that has left the stack is DROPPED', () => {
  const { state } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [{ kind: 'stack', stackId: 'gone' }] });
  assert.deepEqual(stackTargetsOf(ctx), []);
});

test('P18/A3 — card and player targets are not stack objects', () => {
  const { state } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', {
    targets: [{ kind: 'card', instanceId: 'spell' }, { kind: 'player', playerId: 'p2' }],
  });
  assert.deepEqual(stackTargetsOf(ctx), []);
});

test('P18/A4 — a state with no stack field returns empty rather than throwing', () => {
  const base = board([{ id: 'cs', card: 'Counterspell', zone: 'hand' }]);
  const noStack = { ...base, stack: undefined } as GameState;
  const ctx = ctxFor(noStack, 'cs', 'p1', { targets: [{ kind: 'stack', stackId: 'sk1' }] });
  assert.deepEqual(stackTargetsOf(ctx), []);
});

test('P18/A5 — the same stack id announced twice collapses to one', () => {
  const { state, stackId } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', {
    targets: [{ kind: 'stack', stackId }, { kind: 'stack', stackId }],
  });
  assert.deepEqual(stackTargetsOf(ctx), [stackId]);
});

/* ------------------------------------------------------------------ *
 * P07
 * ------------------------------------------------------------------ */

test('P07/A1 — a live target yields one COUNTER_SPELL naming that id', () => {
  const { state, stackId } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [{ kind: 'stack', stackId }] });
  const result = counterTargetSpell(counter, ctx, env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'COUNTER_SPELL');
  assert.equal((result.actions[0] as { stackId: string }).stackId, stackId);
  assert.deepEqual(result.deferred, []);
});

test('P07/A1b — pushed through the reducer, the spell really leaves the stack', () => {
  const { state, stackId } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [{ kind: 'stack', stackId }] });
  const after = applyActions(state, counterTargetSpell(counter, ctx, env()).actions);
  assert.equal((after.stack ?? []).some(o => o.stackId === stackId), false);
});

test('P07/A2 — a target already gone defers, and aims nothing anywhere else', () => {
  const { state } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [{ kind: 'stack', stackId: 'gone' }] });
  const result = counterTargetSpell(counter, ctx, env());

  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /already left/);
});

test('P07/A3 — no announced target defers and never guesses the top of the stack', () => {
  const { state } = withSpellOnStack();
  const ctx = ctxFor(state, 'cs', 'p1', { targets: [] });
  const result = counterTargetSpell(counter, ctx, env());

  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /no stack target/);
});
