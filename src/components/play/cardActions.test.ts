/**
 * The centre preview offers real plays and nothing else.
 *
 * The rule from the spec amendment: *"They must be the REAL actions available
 * for that card, in that zone, right now ... Never a fixed list padded with
 * disabled entries."* These tests are what stops that list quietly becoming a
 * menu again — every case below is a card in a place where a particular button
 * would be wrong.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../../lib/game/index.ts';
import type { GameState, PlayerId, Zone } from '../../lib/game/index.ts';
import { actionsForCard, cardNotes } from './cardActions.ts';

function table(): GameState {
  return createGame({
    id: 'g',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Surrak' },
    ],
    seed: 1,
    now: 0,
  });
}

function put(
  state: GameState,
  instanceId: string,
  fields: {
    name: string;
    typeLine: string;
    ownerId?: PlayerId;
    manaCost?: string;
    power?: string;
    toughness?: string;
    oracleText?: string;
  },
  zone: Zone
): GameState {
  return addCard(
    state,
    {
      instanceId,
      cardId: instanceId,
      ownerId: fields.ownerId ?? 'p1',
      name: fields.name,
      typeLine: fields.typeLine,
      manaCost: fields.manaCost,
      power: fields.power,
      toughness: fields.toughness,
      oracleText: fields.oracleText ?? '',
    },
    zone
  );
}

const ids = (list: Array<{ id: string }>) => list.map(entry => entry.id);

/* -------------------------------------------------------------------------- */
/* The hand                                                                   */
/* -------------------------------------------------------------------------- */

test('a land in hand offers Play land and nothing else', () => {
  const state = put(table(), 'forest', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'hand');
  const { actions, blocked } = actionsForCard(state, 'p1', state.cards.forest);

  assert.deepEqual(ids(actions), ['play-land']);
  assert.equal(blocked.length, 0);
  assert.equal(actions[0].tone, 'primary');
});

test('a land already played this turn offers no button, and says why', () => {
  let state = put(table(), 'a', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'hand');
  state = put(state, 'b', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'hand');
  state = applyAction(state, { type: 'PLAY', instanceId: 'a', to: 'battlefield', controllerId: 'p1', at: 1 });

  const { actions, blocked } = actionsForCard(state, 'p1', state.cards.b);
  assert.deepEqual(ids(actions), [], 'a refused play must not appear as a dead button');
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].reason, /already played a land/i);
});

test('an uncastable spell says the reason instead of offering a greyed-out Cast', () => {
  const state = put(
    table(),
    'bolt',
    { name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}' },
    'hand'
  );
  const { actions, blocked } = actionsForCard(state, 'p1', state.cards.bolt);

  assert.equal(actions.length, 0);
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].reason, /mana/i);
});

test('free cast makes the same spell castable', () => {
  const state = put(
    table(),
    'bolt',
    { name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}' },
    'hand'
  );
  const { actions } = actionsForCard(state, 'p1', state.cards.bolt, { freeCast: true });
  assert.deepEqual(ids(actions), ['cast']);
});

/* -------------------------------------------------------------------------- */
/* The battlefield                                                            */
/* -------------------------------------------------------------------------- */

test('a permanent you control offers Tap, and a tapped one offers Untap', () => {
  let state = put(table(), 'forest', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'battlefield');
  assert.deepEqual(ids(actionsForCard(state, 'p1', state.cards.forest).actions), ['tap']);

  state = applyAction(state, { type: 'TAP', instanceId: 'forest', at: 1 });
  assert.deepEqual(ids(actionsForCard(state, 'p1', state.cards.forest).actions), ['untap']);
});

test('Attack is only offered in the declare attackers step of your own turn', () => {
  const state = put(
    table(),
    'bear',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'battlefield'
  );
  /* `addCard` registers a permanent as though it had always been there, which
     is what a settled board looks like: not sick, able to swing. */
  assert.equal(
    ids(actionsForCard(state, 'p1', state.cards.bear).actions).some(id => id.startsWith('attack')),
    false,
    'the main phase is not a place to declare an attack'
  );

  let combat = state;
  for (let i = 0; i < 12 && combat.step !== 'declare_attackers'; i++) {
    combat = applyAction(combat, { type: 'ADVANCE_STEP', at: 1 });
  }
  assert.equal(combat.step, 'declare_attackers');
  assert.equal(combat.activePlayerId, 'p1');

  const { actions } = actionsForCard(combat, 'p1', combat.cards.bear);
  const attack = actions.find(a => a.kind === 'attack');
  assert.ok(attack, 'a creature that can swing must be offered a swing');
  assert.equal(attack.defenderPlayerId, 'p2', 'and it must say who it is swinging at');
  assert.equal(attack.label, 'Attack', 'one opponent needs no name on the button');
});

test('a creature that arrived this turn is not offered an attack', () => {
  /* Played from hand, not placed on the battlefield: the reducer is what marks
     a permanent as having just arrived, so the fixture has to go through it. */
  let state = put(
    table(),
    'bear',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'hand'
  );
  state = applyAction(state, {
    type: 'PLAY',
    instanceId: 'bear',
    to: 'battlefield',
    controllerId: 'p1',
    at: 1,
  });
  assert.equal(state.cards.bear.summoningSick, true, 'the fixture must actually be sick');

  for (let i = 0; i < 12 && state.step !== 'declare_attackers'; i++) {
    state = applyAction(state, { type: 'ADVANCE_STEP', at: 1 });
  }
  const { actions } = actionsForCard(state, 'p1', state.cards.bear);
  assert.equal(actions.some(a => a.kind === 'attack'), false);
});

test('Block names the attacker it would stand in front of', () => {
  let state = put(
    table(),
    'attacker',
    {
      name: 'Rumbling Baloth',
      typeLine: 'Creature — Beast',
      power: '4',
      toughness: '4',
      ownerId: 'p2',
    },
    'battlefield'
  );
  state = put(
    state,
    'blocker',
    { name: 'Wall of Wood', typeLine: 'Creature — Plant Wall', power: '0', toughness: '3' },
    'battlefield'
  );
  // p2's turn, at the blockers step, swinging at p1.
  state = { ...state, activePlayerId: 'p2', step: 'declare_blockers' };
  state = {
    ...state,
    combat: { attackers: [{ attackerId: 'attacker', defenderPlayerId: 'p1', blockedBy: [] }] },
  };

  const { actions } = actionsForCard(state, 'p1', state.cards.blocker);
  const block = actions.find(a => a.kind === 'block');
  assert.ok(block, 'a legal blocker must be offered the block');
  assert.equal(block.label, 'Block Rumbling Baloth');
  assert.equal(block.attackerId, 'attacker');

  // And the attacker itself, which belongs to somebody else, offers me nothing
  // to press except a look at their board.
  const theirs = actionsForCard(state, 'p1', state.cards.attacker, { canFocusSeat: true });
  assert.deepEqual(ids(theirs.actions), ['focus-seat']);
  assert.deepEqual(theirs.moves, [], 'you cannot move an opponent’s card by hand');
});

/* -------------------------------------------------------------------------- */
/* Manual moves                                                               */
/* -------------------------------------------------------------------------- */

test('the zone a card is already in is never offered as a destination', () => {
  const state = put(table(), 'forest', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'graveyard');
  const { moves } = actionsForCard(state, 'p1', state.cards.forest);
  assert.equal(moves.some(move => move.zone === 'graveyard'), false);
  assert.equal(moves.length, 4);
});

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

test('the notes say what is true about the card and no more', () => {
  let state = put(
    table(),
    'bear',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'battlefield'
  );
  assert.deepEqual(cardNotes(state, state.cards.bear), [], 'a settled permanent has nothing to say');

  state = applyAction(state, { type: 'TAP', instanceId: 'bear', at: 1 });
  state = applyAction(state, { type: 'CARD_COUNTER', instanceId: 'bear', counter: '+1/+1', delta: 2, at: 1 });

  assert.deepEqual(cardNotes(state, state.cards.bear), ['Tapped', '+2 +1/+1']);
});

test('a creature that just arrived says so', () => {
  let state = put(
    table(),
    'bear',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'hand'
  );
  state = applyAction(state, {
    type: 'PLAY',
    instanceId: 'bear',
    to: 'battlefield',
    controllerId: 'p1',
    at: 1,
  });
  assert.deepEqual(cardNotes(state, state.cards.bear), ['Summoning sick']);
});

/* -------------------------------------------------------------------------- */
/* A watched game                                                             */
/* -------------------------------------------------------------------------- */

/*
 * `/simulate` draws this same preview over a table nobody is playing. There is
 * no dispatcher behind it, so every button it could offer would be a button
 * that does nothing. These are the tests that stop one creeping back in.
 */

test('a watched preview offers no play, whatever the card could otherwise do', () => {
  let state = put(table(), 'forest', { name: 'Forest', typeLine: 'Basic Land — Forest' }, 'hand');
  state = put(state, 'tapper', { name: 'Llanowar Elves', typeLine: 'Creature — Elf Druid' }, 'battlefield');

  for (const id of ['forest', 'tapper']) {
    const result = actionsForCard(state, 'p1', state.cards[id], { readOnly: true });
    assert.deepEqual(ids(result.actions), [], `${id} offered a play in a watched game`);
    assert.deepEqual(result.moves, [], `${id} offered a zone move in a watched game`);
  }
});

test('a watched preview does not explain a refusal either, because nothing was refused', () => {
  const state = put(
    table(),
    'bolt',
    { name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}' },
    'hand'
  );
  // Playing, this says "not enough mana". Watching, there is no request to
  // refuse, and a reason with no attempt behind it is noise.
  assert.equal(actionsForCard(state, 'p1', state.cards.bolt).blocked.length, 1);
  assert.equal(actionsForCard(state, 'p1', state.cards.bolt, { readOnly: true }).blocked.length, 0);
});

test('the one control a watched preview keeps is the one that moves the camera', () => {
  const state = put(
    table(),
    'bear',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', ownerId: 'p2' },
    'battlefield'
  );
  const { actions } = actionsForCard(state, 'p1', state.cards.bear, {
    readOnly: true,
    canFocusSeat: true,
  });
  assert.deepEqual(ids(actions), ['focus-seat']);
  assert.equal(actions[0].kind, 'focus-seat');
});

test('a watched preview of your own card still offers the camera, because every seat is a bot', () => {
  const state = put(table(), 'bear', { name: 'Grizzly Bears', typeLine: 'Creature — Bear' }, 'battlefield');
  const { actions } = actionsForCard(state, 'p1', state.cards.bear, {
    readOnly: true,
    canFocusSeat: true,
  });
  assert.deepEqual(ids(actions), ['focus-seat']);
});
