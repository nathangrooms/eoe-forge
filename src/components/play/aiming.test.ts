/**
 * The targeting channel, tested.
 *
 * Two things are worth a test here and they are the two that can go wrong
 * silently.
 *
 * THE GUARD. A published question carries the table and the seat it belongs to,
 * and `aimFor` is the only thing standing between "the seat being asked" and
 * "any board on screen". If it ever stops checking, `/simulate`'s watched game
 * and an opponent's quadrant start answering questions nobody at that screen
 * was asked, and nothing about the picture would say so.
 *
 * THE SPLIT. A legal target is either a card drawn on a mat, which the player
 * presses directly, or it is inside a pile, which is drawn as one tile and has
 * no card on screen to press. Get that wrong in one direction and a legal
 * target becomes unreachable; get it wrong in the other and `AimLayer` grows a
 * chip for a card that is already sitting on the board, which is the row of
 * names coming back one entry at a time.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from '../../lib/game/index.ts';
import type { GameState, Zone } from '../../lib/game/index.ts';
import {
  aimFor,
  aimSignature,
  boardTargets,
  offBoardTargets,
  publishAim,
  withdrawAim,
  aimSnapshot,
  type AimRequest,
} from './aiming.ts';

function table(): GameState {
  return createGame({
    id: 'g1',
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

function put(
  state: GameState,
  instanceId: string,
  name: string,
  ownerId: string,
  zone: Zone
): GameState {
  return addCard(
    state,
    { instanceId, cardId: instanceId, name, ownerId, typeLine: 'Creature' },
    zone
  );
}

function question(over: Partial<AimRequest> = {}): AimRequest {
  return {
    tableId: 'g1',
    seatId: 'p1',
    signature: 'sig',
    prompt: 'Choose target creature',
    sourceName: 'Flametongue Kavu',
    instanceIds: [],
    playerIds: [],
    answerCard: () => {},
    answerPlayer: () => {},
    cancel: () => {},
    cancelLabel: 'Cancel',
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* The guard                                                                  */
/* -------------------------------------------------------------------------- */

test('a question reaches the table and the seat it was asked of', () => {
  assert.equal(aimFor(question(), 'g1', 'p1')?.sourceName, 'Flametongue Kavu');
});

test('another table cannot answer it', () => {
  assert.equal(aimFor(question(), 'g2', 'p1'), null);
});

test('another seat cannot answer it', () => {
  assert.equal(aimFor(question(), 'g1', 'p2'), null);
});

test('a board with no table id gets nothing, rather than everything', () => {
  assert.equal(aimFor(question(), undefined, 'p1'), null);
  assert.equal(aimFor(question(), 'g1', undefined), null);
  assert.equal(aimFor(null, 'g1', 'p1'), null);
});

/* -------------------------------------------------------------------------- */
/* The slot                                                                   */
/* -------------------------------------------------------------------------- */

test('one question at a time, and withdrawing it clears the slot', () => {
  const first = question();
  publishAim(first);
  assert.equal(aimSnapshot(), first);
  withdrawAim(first);
  assert.equal(aimSnapshot(), null);
});

test('a stale asker cannot clear the question that replaced it', () => {
  /* The remount case. The outgoing asker's cleanup runs AFTER the incoming one
     has published, and "clear whatever is there" would leave the board inert
     with a live question still waiting on it. */
  const outgoing = question({ signature: 'a' });
  const incoming = question({ signature: 'b' });
  publishAim(outgoing);
  publishAim(incoming);
  withdrawAim(outgoing);
  assert.equal(aimSnapshot(), incoming);
  withdrawAim(incoming);
});

/* -------------------------------------------------------------------------- */
/* Board or chip                                                              */
/* -------------------------------------------------------------------------- */

test('a permanent is pressed on the board; a card in a pile is not', () => {
  let state = table();
  state = put(state, 'c1', 'Grizzly Bears', 'p1', 'battlefield');
  state = put(state, 'c2', 'Stone Wall', 'p2', 'battlefield');
  state = put(state, 'c3', 'Heap Doll', 'p1', 'graveyard');
  state = put(state, 'c4', 'Hope of Ghirapur', 'p1', 'hand');

  const ids = ['c1', 'c2', 'c3', 'c4'];
  const onBoard = boardTargets(state, ids);
  const strays = offBoardTargets(state, ids);

  assert.equal(onBoard.size, 2);
  assert.deepEqual(
    [...onBoard].map(id => state.cards[id].name).sort(),
    ['Grizzly Bears', 'Stone Wall']
  );
  assert.deepEqual(strays.map(id => state.cards[id].name).sort(), ['Heap Doll', 'Hope of Ghirapur']);

  /* Every legal target is reachable exactly once: the two halves partition the
     list. A target in neither half is a target a player cannot press at all. */
  assert.equal(onBoard.size + strays.length, ids.length);
});

test('an id the table has never heard of is neither, and does not throw', () => {
  const state = table();
  assert.equal(boardTargets(state, ['nope']).size, 0);
  assert.deepEqual(offBoardTargets(state, ['nope']), ['nope']);
});

test('the chips keep the order the engine gave them', () => {
  let state = table();
  state = put(state, 'a', 'A', 'p1', 'graveyard');
  state = put(state, 'b', 'B', 'p1', 'graveyard');
  assert.deepEqual(offBoardTargets(state, ['b', 'a']), ['b', 'a']);
});

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

test('the same question signs the same, so it is not republished every render', () => {
  const parts = {
    source: 'c1',
    kind: 'target',
    ref: 0,
    prompt: 'Choose target creature',
    instanceIds: ['a', 'b'],
    playerIds: ['p2'],
  };
  assert.equal(aimSignature(parts), aimSignature({ ...parts }));
});

test('a board that has changed under a half answered spell signs differently', () => {
  const parts = {
    source: 'c1',
    kind: 'target',
    ref: 0,
    prompt: 'Choose target creature',
    instanceIds: ['a', 'b'],
    playerIds: [],
  };
  // A candidate died while the question was open.
  assert.notEqual(aimSignature(parts), aimSignature({ ...parts, instanceIds: ['a'] }));
  // The second target of the same spell is a different question.
  assert.notEqual(aimSignature(parts), aimSignature({ ...parts, ref: 1 }));
  // A different card asking the same sentence is a different question.
  assert.notEqual(aimSignature(parts), aimSignature({ ...parts, source: 'c2' }));
});
