/**
 * Aiming a triggered ability (CR 603.3d), and the CR 608.2b recheck both halves
 * of the seam now share.
 *
 *   node --test --experimental-strip-types src/lib/game/announce.test.ts
 *
 * `triggers.test.ts` covers the drain and the reducer. This file covers the
 * three claims that are about the SEAM rather than about triggers:
 *
 *   1. the target legality rule is ONE rule, and a spell and a trigger get the
 *      same answer from it. Two copies is how the CR 400.7 flicker check ends
 *      up on one path and not the other;
 *   2. `answerTriggerTargets` runs the ask-and-answer loop for an injected
 *      policy, so the bot and the mat cannot drift into different ideas of what
 *      a legal target is;
 *   3. the bot answers rather than declining, because a trigger has already
 *      triggered and `drainTriggers` halts until somebody speaks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from './rules.ts';
import { nextBotMove } from './bot.ts';
import { pendingTriggersOf } from './triggers.ts';
import {
  answerTriggerTargets,
  blankIllegalTargets,
  everyTargetIsGone,
  targetStillLegal,
  triggerAwaitingTargets,
  triggerNeedsATarget,
  triggerTargetSpecs,
} from './announce.ts';
import { targetIsLegal } from './stack.ts';
import type { GameState, StackObject, StackTarget } from './types.ts';

function board(): GameState {
  const state = createGame({
    id: 'g',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Them' },
    ],
    seed: 4,
    now: 0,
  });
  return { ...state, status: 'playing', step: 'precombat_main' };
}

function creature(
  state: GameState,
  instanceId: string,
  name: string,
  ownerId: 'p1' | 'p2',
  toughness = '6',
  oracleText = ''
): GameState {
  return addCard(
    state,
    {
      instanceId,
      cardId: instanceId,
      name,
      ownerId,
      typeLine: 'Creature — Test',
      oracleText,
      power: '2',
      toughness,
      summoningSick: false,
    },
    'battlefield'
  );
}

const FTK = 'When this creature enters, it deals 4 damage to target creature.';

/** A board with two of their creatures, and a Kavu in hand about to enter. */
function kavuTable(): GameState {
  let state = board();
  state = creature(state, 'bear', 'Grizzly Bears', 'p2');
  state = creature(state, 'wall', 'Stone Wall', 'p2');
  return addCard(
    state,
    {
      instanceId: 'ftk',
      cardId: 'ftk',
      name: 'Flametongue Kavu',
      ownerId: 'p1',
      typeLine: 'Creature — Kavu',
      oracleText: FTK,
      power: '4',
      toughness: '2',
    },
    'hand'
  );
}

const play = (state: GameState) =>
  applyActions(state, [{ type: 'PLAY', instanceId: 'ftk', to: 'battlefield' }]);

/* ------------------------------------------------------------------ *
 * What a trigger announces
 * ------------------------------------------------------------------ */

test('a ref no effect reads is not a target', () => {
  const state = play(kavuTable());
  const trigger = pendingTriggersOf(state)[0];
  assert.ok(trigger);
  assert.equal(triggerNeedsATarget(trigger), true);
  // One spec, and it is the one `{sel:'target', ref:0}` actually indexes.
  assert.equal(triggerTargetSpecs(trigger).length, 1);
  assert.equal(triggerTargetSpecs(trigger)[0].ref, 0);
});

test('a trigger with no compiled ability announces nothing', () => {
  // `PendingTrigger.dsl` is present exactly when the ability engine owns the
  // card. Without it there is no compiled spec list to read, and inventing one
  // would be asking a player to aim a card this engine does not run.
  assert.deepEqual(triggerTargetSpecs(undefined), []);
  assert.deepEqual(triggerTargetSpecs(null), []);
  assert.equal(triggerNeedsATarget(undefined), false);
});

/* ------------------------------------------------------------------ *
 * ONE copy of CR 608.2b
 * ------------------------------------------------------------------ */

test('a spell and a trigger get the same answer about the same target', () => {
  const state = play(kavuTable());
  const live: StackTarget = {
    kind: 'card',
    instanceId: 'bear',
    zone: 'battlefield',
    zoneChangeCounter: state.cards.bear?.zoneChangeCounter ?? 0,
  };
  const flickered: StackTarget = { ...live, zoneChangeCounter: 99 };

  const asASpell: StackObject = {
    stackId: 's1',
    kind: 'spell',
    name: 'Some Spell',
    controllerId: 'p1',
    cardInstanceId: 'ftk',
    targets: [live],
    effects: [],
    turn: 1,
  };

  // `stack.ts` is now a two-line adapter onto `targetStillLegal`, so these two
  // cannot disagree. The test exists because they used to be two functions.
  assert.equal(targetIsLegal(state, asASpell, live), true);
  assert.equal(targetStillLegal(state, live, { controllerId: 'p1', sourceInstanceId: 'ftk' }), true);

  assert.equal(targetIsLegal(state, { ...asASpell, targets: [flickered] }, flickered), false);
  assert.equal(
    targetStillLegal(state, flickered, { controllerId: 'p1', sourceInstanceId: 'ftk' }),
    false,
    'CR 400.7 — flickered out and back is a different object'
  );
});

test('an object announced with no targets never fizzles', () => {
  const state = play(kavuTable());
  const by = { controllerId: 'p1' as const, sourceInstanceId: 'ftk' };
  assert.equal(everyTargetIsGone(state, [], by), false);
  assert.equal(everyTargetIsGone(state, undefined, by), false);
});

test('an illegal target is blanked IN PLACE, never filtered out', () => {
  const state = play(kavuTable());
  const by = { controllerId: 'p1' as const, sourceInstanceId: 'ftk' };
  const gone: StackTarget = { kind: 'card', instanceId: 'bear', zone: 'graveyard' };
  const live: StackTarget = {
    kind: 'card',
    instanceId: 'wall',
    zone: 'battlefield',
    zoneChangeCounter: state.cards.wall?.zoneChangeCounter ?? 0,
  };

  const blanked = blankIllegalTargets(state, [gone, live], by);
  assert.equal(blanked.length, 2, 'positions are the contract; a gap must stay a gap');
  assert.equal(blanked[0].instanceId, undefined, 'the dead one resolves to nobody');
  assert.equal(blanked[1].instanceId, 'wall', 'and the live one is still at ref 1');
});

/* ------------------------------------------------------------------ *
 * The injected-policy loop
 * ------------------------------------------------------------------ */

test('answerTriggerTargets runs the loop for a caller with a policy', () => {
  const state = play(kavuTable());
  const action = answerTriggerTargets(state, ask => {
    assert.equal(ask.playerId, 'p1');
    return { kind: 'card', instanceId: 'wall', zone: 'battlefield', zoneChangeCounter: 0 };
  });
  assert.ok(action);
  assert.equal(action.type, 'ANNOUNCE_TRIGGER_TARGETS');

  const after = applyActions(state, [action]);
  assert.equal(after.cards.wall?.damage, 4);
  assert.equal(after.cards.bear?.damage, 0);
});

test('a decider that declines leaves the trigger waiting rather than guessing', () => {
  const state = play(kavuTable());
  assert.equal(answerTriggerTargets(state, () => null), null);
  assert.equal(pendingTriggersOf(state).length, 1, 'still on the queue, still asking');
});

test('nothing waiting means nothing to answer', () => {
  const state = board();
  assert.equal(triggerAwaitingTargets(state), null);
  assert.equal(answerTriggerTargets(state, () => null), null);
});

/* ------------------------------------------------------------------ *
 * The bot answers. It does not get to decline.
 * ------------------------------------------------------------------ */

test('the bot aims a harmful trigger across the table', () => {
  // Their Stone Wall is a 2/6 and their Bears a 2/6, so "biggest" is decided by
  // `bestHostOf`'s tiebreak; what matters is that it is one of THEIRS.
  const state = play(kavuTable());
  const move = nextBotMove(state, 'p1');
  assert.ok(move, 'the game is halted, so the bot must have a move');
  assert.equal(move.actions[0].type, 'ANNOUNCE_TRIGGER_TARGETS');

  const after = applyActions(state, move.actions);
  assert.equal(pendingTriggersOf(after).length, 0);
  const theirDamage = (after.cards.bear?.damage ?? 0) + (after.cards.wall?.damage ?? 0);
  assert.equal(theirDamage, 4, 'four damage landed on one of their creatures');
  assert.equal(after.cards.ftk?.damage, 0, 'and not on its own');
});

test('the bot answers even when only its own board is legal, because a trigger has already triggered', () => {
  /*
   * The whole board is the bot's, so "point removal across the table" has
   * nowhere to go. A SPELL in this position is simply not cast. A trigger has
   * no such option — CR 603.3d says choose a legal target — and declining would
   * hang the table, because `drainTriggers` is stopped until somebody speaks.
   */
  let state = board();
  state = creature(state, 'mine1', 'My Ox', 'p1');
  state = creature(state, 'mine2', 'My Elk', 'p1');
  state = addCard(
    state,
    {
      instanceId: 'ftk',
      cardId: 'ftk',
      name: 'Flametongue Kavu',
      ownerId: 'p1',
      typeLine: 'Creature — Kavu',
      oracleText: FTK,
      power: '4',
      toughness: '2',
    },
    'hand'
  );
  state = play(state);

  const move = nextBotMove(state, 'p1');
  assert.ok(move, 'declining here would hang the game');
  const after = applyActions(state, move.actions);
  assert.equal(pendingTriggersOf(after).length, 0, 'the queue drained');
});
