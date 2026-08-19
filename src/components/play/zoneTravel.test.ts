/**
 * What the board is allowed to show moving.
 *
 * The animation principles in the spec are mostly about restraint — animate
 * what happened, never invent, never let it cost anything — and every one of
 * those is a decision this module makes. `ZoneTravelLayer.tsx` only measures and
 * draws.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../../lib/game/index.ts';
import type { GameState, Zone } from '../../lib/game/index.ts';
import { MAX_TRAVELS, travelDuration, zoneMovesBetween, zoneSnapshot } from './zoneTravel.ts';

function table(): GameState {
  return createGame({
    id: 'g',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
    seed: 1,
    now: 0,
  });
}

function put(state: GameState, id: string, owner: string, zone: Zone, name = 'Grizzly Bears') {
  return addCard(
    state,
    { instanceId: id, cardId: id, name, ownerId: owner, typeLine: 'Creature — Bear' },
    zone
  );
}

const move = (id: string, to: Zone) =>
  ({ type: 'MOVE_ZONE', instanceId: id, to, at: 1 }) as const;

test('nothing moved means nothing to draw', () => {
  const state = put(table(), 'a', 'p1', 'battlefield');
  const before = zoneSnapshot(state);
  assert.deepEqual(zoneMovesBetween(before, state, 'p1'), []);
});

test('the first state of a game draws nothing', () => {
  const state = put(table(), 'a', 'p1', 'battlefield');
  assert.deepEqual(zoneMovesBetween(null, state, 'p1'), []);
});

test('a land leaving your hand for the battlefield travels', () => {
  let state = put(table(), 'a', 'p1', 'hand', 'Forest');
  const before = zoneSnapshot(state);
  state = applyAction(state, { type: 'PLAY', instanceId: 'a', to: 'battlefield', controllerId: 'p1', at: 1 });

  const moves = zoneMovesBetween(before, state, 'p1');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'hand');
  assert.equal(moves[0].to, 'battlefield');
});

test('a creature dying travels to the graveyard rather than blinking out', () => {
  let state = put(table(), 'a', 'p1', 'battlefield');
  const before = zoneSnapshot(state);
  state = applyAction(state, move('a', 'graveyard'));

  const moves = zoneMovesBetween(before, state, 'p1');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].to, 'graveyard');
});

/* -------------------------------------------------------------------------- */
/* The refusals — a flight path is a claim about where a card was              */
/* -------------------------------------------------------------------------- */

test('a card drawn out of a library does not fly out of the deck', () => {
  let state = put(table(), 'a', 'p1', 'library');
  const before = zoneSnapshot(state);
  state = applyAction(state, move('a', 'hand'));
  assert.deepEqual(
    zoneMovesBetween(before, state, 'p1'),
    [],
    'a shuffled deck has no position to fly out of'
  );
});

test('a card put back into a library does not fly into it', () => {
  let state = put(table(), 'a', 'p1', 'battlefield');
  const before = zoneSnapshot(state);
  state = applyAction(state, move('a', 'library'));
  assert.deepEqual(zoneMovesBetween(before, state, 'p1'), []);
});

test("an opponent's hand is card backs, so nothing travels out of it", () => {
  let state = put(table(), 'a', 'p2', 'hand');
  const before = zoneSnapshot(state);
  state = applyAction(state, move('a', 'graveyard'));
  assert.deepEqual(zoneMovesBetween(before, state, 'p1'), []);

  /* And the same move IS drawn for the player it belongs to. */
  assert.equal(zoneMovesBetween(before, state, 'p2').length, 1);
});

test("an opponent's creature dying still travels, because everyone saw it", () => {
  let state = put(table(), 'a', 'p2', 'battlefield');
  const before = zoneSnapshot(state);
  state = applyAction(state, move('a', 'graveyard'));
  assert.equal(zoneMovesBetween(before, state, 'p1').length, 1);
});

/* -------------------------------------------------------------------------- */
/* The cap                                                                    */
/* -------------------------------------------------------------------------- */

test('a board wipe draws a handful of cards leaving, not forty', () => {
  let state = table();
  for (let i = 0; i < 40; i++) state = put(state, `c${i}`, 'p1', 'battlefield');
  const before = zoneSnapshot(state);
  for (let i = 0; i < 40; i++) state = applyAction(state, move(`c${i}`, 'graveyard'));

  const moves = zoneMovesBetween(before, state, 'p1');
  assert.equal(moves.length, MAX_TRAVELS);
});

test('when the batch is capped, the plays the player made come first', () => {
  let state = table();
  /* Ten of the opponent's cards shuffled about, and one land of mine played. */
  for (let i = 0; i < 10; i++) state = put(state, `t${i}`, 'p2', 'graveyard');
  state = put(state, 'mine', 'p1', 'hand', 'Forest');

  const before = zoneSnapshot(state);
  for (let i = 0; i < 10; i++) state = applyAction(state, move(`t${i}`, 'exile'));
  state = applyAction(state, {
    type: 'PLAY',
    instanceId: 'mine',
    to: 'battlefield',
    controllerId: 'p1',
    at: 1,
  });

  const moves = zoneMovesBetween(before, state, 'p1');
  assert.equal(moves.length, MAX_TRAVELS);
  assert.equal(moves[0].instanceId, 'mine', 'my own land drop is the one thing I must see move');
});

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

test('a travel is long enough to see and short enough to stay out of the way', () => {
  assert.ok(travelDuration(0) >= 0.2, 'a tween nobody can see is not feedback');
  assert.ok(travelDuration(4000) <= 0.5, 'and a slow one is in the way');
  assert.ok(
    travelDuration(1400) > travelDuration(200),
    'crossing the table should take longer than sliding into the graveyard beside you'
  );
});
