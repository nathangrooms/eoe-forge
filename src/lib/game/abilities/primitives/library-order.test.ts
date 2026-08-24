/**
 * GATE 3 — behaviour, for P08, P09, P20.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/library-order.test.ts
 *
 * These tests assert that scry and surveil DEFER. That is not a placeholder
 * assertion — it is the specified behaviour, and the harness report counts these
 * two primitives as passing while unlocking zero cards. A test suite that
 * asserted a scry had "happened" would be asserting that the engine chose for
 * the player, which is the failure this whole design exists to prevent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Both verbs were promoted out of `extended-dsl.ts` into the shipped `Effect`
// union on 24 Aug 2026. The types are read from there now; nothing else in this
// file changed, which is the point of the promotion order.
import type { Effect } from '../../../cards/abilities/dsl.ts';
import { libraryTop, scryToActions, surveilToActions } from './library-order.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

const scry = (count: number): Extract<Effect, { do: 'scry' }> => ({
  do: 'scry',
  who: { who: 'you' },
  count,
});
const surveil = (count: number): Extract<Effect, { do: 'surveil' }> => ({
  do: 'surveil',
  who: { who: 'you' },
  count,
});

const library = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i}`, card: 'Forest', zone: 'library' as const }));

test('P08/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Preordain', 'Scry 2');
  assertOracleContains('Serum Visions', 'Scry 2');
  assertOracleContains('Thought Erasure', 'Surveil 1');
});

/* ------------------------------------------------------------------ *
 * P20
 * ------------------------------------------------------------------ */

test('P20/A1 — the top two of a five-card library, top first', () => {
  const state = board(library(5));
  assert.deepEqual(libraryTop(state, 'p1', 2), ['l0', 'l1']);
});

test('P20/A2 — asking for more than there is returns all of it', () => {
  const state = board(library(3));
  assert.deepEqual(libraryTop(state, 'p1', 10), ['l0', 'l1', 'l2']);
});

test('P20/A3 — zero is empty', () => {
  const state = board(library(3));
  assert.deepEqual(libraryTop(state, 'p1', 0), []);
});

test('P20/A4 — the caller sorting the result does not reorder the real library', () => {
  const state = board(library(3));
  const before = [...state.players[0].zones.library];
  const top = libraryTop(state, 'p1', 3);
  top.reverse();
  top.sort();
  assert.deepEqual(state.players[0].zones.library, before);
});

/* ------------------------------------------------------------------ *
 * P08 — scry
 * ------------------------------------------------------------------ */

test('P08/A1 — Preordain over a five-card library defers, emitting no action', () => {
  const state = board([...library(5), { id: 'pre', card: 'Preordain', zone: 'hand' }]);
  const result = scryToActions(scry(2), ctxFor(state, 'pre'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /scries 2/);
});

test('P08/A2 — an empty library is nothing to look at and nothing to say', () => {
  const state = board([{ id: 'pre', card: 'Preordain', zone: 'hand' }]);
  const result = scryToActions(scry(2), ctxFor(state, 'pre'), env());
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.deferred, []);
});

test('P08/A3 — scry 1 with one card is STILL a choice: top or bottom', () => {
  const state = board([...library(1), { id: 'pre', card: 'Preordain', zone: 'hand' }]);
  const result = scryToActions(scry(1), ctxFor(state, 'pre'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
});

test('P08/A4 — a short library is named in the deferral', () => {
  const state = board([...library(1), { id: 'pre', card: 'Preordain', zone: 'hand' }]);
  const result = scryToActions(scry(3), ctxFor(state, 'pre'), env());
  assert.match(result.deferred[0], /only 1 card in library/);
});

test('P08/never-moves — no MOVE_ZONE is ever emitted by a scry', () => {
  for (const n of [1, 2, 5]) {
    const state = board([...library(5), { id: 'pre', card: 'Preordain', zone: 'hand' }]);
    const result = scryToActions(scry(n), ctxFor(state, 'pre'), env());
    assert.equal(result.actions.length, 0, `scry ${n} emitted an action`);
  }
});

/* ------------------------------------------------------------------ *
 * P09 — surveil
 * ------------------------------------------------------------------ */

test('P09/A1 — surveil says surveil, not scry', () => {
  const state = board([...library(3), { id: 'te', card: 'Thought Erasure', zone: 'hand' }]);
  const result = surveilToActions(surveil(1), ctxFor(state, 'te'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /surveils/);
  assert.equal(/scries/.test(result.deferred[0]), false);
});

test('P09/A2 — an empty library is silent', () => {
  const state = board([{ id: 'te', card: 'Thought Erasure', zone: 'hand' }]);
  const result = surveilToActions(surveil(1), ctxFor(state, 'te'), env());
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.deferred, []);
});

test('P09/A3 — surveil 2 over a one-card library names one card', () => {
  const state = board([...library(1), { id: 'te', card: 'Thought Erasure', zone: 'hand' }]);
  const result = surveilToActions(surveil(2), ctxFor(state, 'te'), env());
  assert.match(result.deferred[0], /only 1 card in library/);
});

test('P09/never-mills — no card is ever put into the graveyard speculatively', () => {
  const state = board([...library(5), { id: 'te', card: 'Thought Erasure', zone: 'hand' }]);
  const result = surveilToActions(surveil(3), ctxFor(state, 'te'), env());
  assert.equal(result.actions.length, 0);
});
