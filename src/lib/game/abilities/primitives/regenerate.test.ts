/**
 * GATE 3 — behaviour, for P10.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/regenerate.test.ts
 *
 * A4 is a negative assertion about a plausible wrong implementation rather than
 * about the specified one. Granting indestructible instead of placing a shield
 * would pass every other test here and would be wrong the day after: a shield is
 * spent by one destruction, indestructible is not. It is the kind of defect that
 * ships, because for one turn the two are indistinguishable.
 *
 * The suite also records what is NOT done. Nothing consumes the shield yet, so
 * `unspent-shield` asserts the creature still dies — an honest failing behaviour
 * written down as a test rather than left for a player to discover.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyActions } from '../../rules.ts';
import type { ExtendedEffect } from './extended-dsl.ts';
import { REGENERATION_SHIELD_COUNTER, regenerateShield } from './regenerate.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

const regen = (count = 1): Extract<ExtendedEffect, { do: 'regenerate' }> => ({
  do: 'regenerate',
  what: { sel: 'target', ref: 0 },
  count,
});

test('P10/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Regeneration', 'Regenerate');
  assertOracleContains('Troll Ascetic', 'Regenerate');
});

test('P10/A1 — one shield counter on the target', () => {
  const state = board([{ id: 'troll', card: 'Troll Ascetic' }]);
  const ctx = ctxFor(state, 'src', 'p1', { targets: [{ kind: 'card', instanceId: 'troll', zone: 'battlefield' }] });
  const result = regenerateShield(regen(), ctx, env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'CARD_COUNTER');
  assert.equal((result.actions[0] as { counter: string }).counter, REGENERATION_SHIELD_COUNTER);
  assert.equal((result.actions[0] as { delta: number }).delta, 1);

  const after = applyActions(state, result.actions);
  assert.equal(after.cards.troll.counters[REGENERATION_SHIELD_COUNTER], 1);
});

test('P10/A2 — count 2 is one action of delta 2, not two of 1', () => {
  const state = board([{ id: 'troll', card: 'Troll Ascetic' }]);
  const ctx = ctxFor(state, 'src', 'p1', { targets: [{ kind: 'card', instanceId: 'troll', zone: 'battlefield' }] });
  const result = regenerateShield(regen(2), ctx, env());
  assert.equal(result.actions.length, 1);
  assert.equal((result.actions[0] as { delta: number }).delta, 2);
});

test('P10/A3 — a target no longer on the battlefield gets no shield', () => {
  const state = board([{ id: 'troll', card: 'Troll Ascetic', zone: 'graveyard' }]);
  const ctx = ctxFor(state, 'src', 'p1', { targets: [{ kind: 'card', instanceId: 'troll', zone: 'graveyard' }] });
  const result = regenerateShield(regen(), ctx, env());
  assert.deepEqual(result.actions, []);
});

test('P10/A4 — it never grants indestructible; a shield is spent and indestructible is not', () => {
  const state = board([{ id: 'troll', card: 'Troll Ascetic' }]);
  const ctx = ctxFor(state, 'src', 'p1', { targets: [{ kind: 'card', instanceId: 'troll', zone: 'battlefield' }] });
  const result = regenerateShield(regen(), ctx, env());
  assert.equal(result.actions.some(a => a.type === 'SET_KEYWORD'), false);

  const after = applyActions(state, result.actions);
  const keywords = (after.cards.troll.keywords ?? []).map(k => k.toLowerCase());
  assert.equal(keywords.includes('indestructible'), false);
});

test('P10/A2b — the counter name cannot collide with a printed counter type', () => {
  // No Magic counter contains a colon, and none ever will.
  assert.match(REGENERATION_SHIELD_COUNTER, /^dm:/);
});

test('P10/unspent-shield — KNOWN INCOMPLETE: nothing consumes the shield yet, so lethal damage still kills', () => {
  // Written down rather than left to be discovered. `sba.ts` does not read the
  // shield counter, so the creature dies with a full shield on it. The report
  // counts P10 as passing its gates and unlocking ZERO cards for exactly this
  // reason.
  const state = board([{ id: 'troll', card: 'Troll Ascetic' }]);
  const ctx = ctxFor(state, 'src', 'p1', { targets: [{ kind: 'card', instanceId: 'troll', zone: 'battlefield' }] });
  const shielded = applyActions(state, regenerateShield(regen(), ctx, env()).actions);
  assert.equal(shielded.cards.troll.counters[REGENERATION_SHIELD_COUNTER], 1);

  const killed = applyActions(shielded, [
    { type: 'DAMAGE_CARD', instanceId: 'troll', amount: 10, at: 0 },
  ]);
  assert.equal(killed.cards.troll.zone, 'graveyard', 'the shield is not yet consumed by anything');
});
