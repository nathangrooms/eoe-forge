/**
 * What a seat says about combat, tested.
 *
 *   node --test --experimental-strip-types src/components/play/seatCombat.test.ts
 *
 * Owner: *"attacking and blocking doesn't seem very clear at all"*.
 *
 * The mechanics were already verified by playing — the engine stops at declare
 * blockers, `isUnderAttack` is right, the chips are on the cards. What was
 * missing was the reading. Driving a real four-seat game with four creatures
 * pointed at the viewer, the entire screen said one thing about it:
 *
 *     T1  You attacked with 4 creatures.
 *
 * one line in a 224px log in the bottom-left corner. So the numbers below are
 * the ones a defender has to have to make a decision, and the point of testing
 * them is that a WRONG number here is worse than no number: a player who is
 * told 6 is coming and takes 11 has been misled by the interface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from '../../lib/game/rules.ts';
import type { GameState, InstanceId, PlayerId } from '../../lib/game/types.ts';
import {
  combatMarkFor,
  incomingAttack,
  incomingSentence,
  outgoingAttack,
  outgoingSentence,
} from './seatCombat.ts';

interface Spec {
  id: string;
  owner: PlayerId;
  name?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

function table(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Yeva' },
      { id: 'p3', name: 'Surrak' },
    ],
  });

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name ?? spec.id,
        ownerId: spec.owner,
        controllerId: spec.owner,
        typeLine: 'Creature — Test',
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        keywords: spec.keywords ?? [],
        oracleText: '',
        counters: {},
        tapped: false,
        summoningSick: false,
      },
      'battlefield'
    );
  }

  return { ...state, status: 'playing' };
}

function at(
  state: GameState,
  attacks: Array<{ attacker: InstanceId; defender: PlayerId; blockedBy?: InstanceId[] }>
): GameState {
  return {
    ...state,
    step: 'declare_blockers',
    activePlayerId: 'p2',
    combat: {
      attackers: attacks.map(a => ({
        attackerId: a.attacker,
        defenderPlayerId: a.defender,
        blockedBy: a.blockedBy ?? [],
      })),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* What is coming                                                             */
/* -------------------------------------------------------------------------- */

test('a seat with nothing pointed at it says nothing', () => {
  const state = table([{ id: 'bears', owner: 'p2' }]);
  const quiet = incomingAttack(at(state, []), 'p1');
  assert.equal(quiet.under, false);
  assert.equal(incomingSentence(quiet), '');
});

test('the damage is the sum of what is unblocked', () => {
  const state = table([
    { id: 'bears', owner: 'p2', power: '2' },
    { id: 'baloth', owner: 'p2', power: '6' },
    { id: 'elf', owner: 'p2', power: '1' },
  ]);
  const attack = incomingAttack(
    at(state, [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p1' },
      { attacker: 'elf', defender: 'p1' },
    ]),
    'p1'
  );

  assert.equal(attack.attackers, 3);
  assert.equal(attack.unblocked, 3);
  assert.equal(attack.damage, 9);
  assert.equal(incomingSentence(attack), '3 attackers, 9 damage');
});

test('the number falls as blockers go in, which is the whole point', () => {
  const state = table([
    { id: 'bears', owner: 'p2', power: '2' },
    { id: 'baloth', owner: 'p2', power: '6' },
    { id: 'wall', owner: 'p1', toughness: '5' },
  ]);
  const attack = incomingAttack(
    at(state, [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p1', blockedBy: ['wall'] },
    ]),
    'p1'
  );

  assert.equal(attack.damage, 2, 'only the unblocked bear gets through');
  assert.equal(attack.unblocked, 1);
  assert.equal(incomingSentence(attack), '2 attackers, 2 still getting through');
});

test('every lane held reads as all blocked, not as zero attackers', () => {
  const state = table([
    { id: 'bears', owner: 'p2', power: '2' },
    { id: 'wall', owner: 'p1', toughness: '5' },
  ]);
  const attack = incomingAttack(
    at(state, [{ attacker: 'bears', defender: 'p1', blockedBy: ['wall'] }]),
    'p1'
  );
  assert.equal(attack.under, true, 'combat is still happening and the seat must say so');
  assert.equal(attack.damage, 0);
  assert.equal(incomingSentence(attack), '1 attacker, all blocked');
});

test('menace held by one creature is not held at all', () => {
  /* The quiet wrong answer this exists to prevent: one body in front of a
     menacing attacker is an illegal block, so the damage is still coming.
     `blockersRequiredFor` in the engine is what decides; this only asks. */
  const state = table([
    { id: 'menacer', owner: 'p2', power: '4', keywords: ['Menace'] },
    { id: 'wall', owner: 'p1', toughness: '5' },
  ]);
  const attack = incomingAttack(
    at(state, [{ attacker: 'menacer', defender: 'p1', blockedBy: ['wall'] }]),
    'p1'
  );
  assert.equal(attack.damage, 4, 'one blocker does not stop a menacing attacker');
  assert.equal(attack.unblocked, 1);
});

test('trample gets its excess through a blocker', () => {
  /* The other case where saying "blocked" would mislead a defender. */
  const state = table([
    { id: 'trampler', owner: 'p2', power: '7', keywords: ['Trample'] },
    { id: 'chump', owner: 'p1', toughness: '2' },
  ]);
  const attack = incomingAttack(
    at(state, [{ attacker: 'trampler', defender: 'p1', blockedBy: ['chump'] }]),
    'p1'
  );
  assert.equal(attack.damage, 5, '7 power over a 2 toughness blocker');
});

test('lethal is said out loud', () => {
  const state = table([{ id: 'big', owner: 'p2', power: '40' }]);
  const attack = incomingAttack(at(state, [{ attacker: 'big', defender: 'p1' }]), 'p1');
  assert.equal(attack.lethal, true);
});

test('an attack on somebody else is not an attack on you', () => {
  const state = table([{ id: 'bears', owner: 'p2', power: '2' }]);
  const board = at(state, [{ attacker: 'bears', defender: 'p3' }]);
  assert.equal(incomingAttack(board, 'p1').under, false);
  assert.equal(incomingAttack(board, 'p3').under, true);
  assert.deepEqual(incomingAttack(board, 'p3').fromNames, ['Yeva']);
});

/* -------------------------------------------------------------------------- */
/* What you are swinging with                                                 */
/* -------------------------------------------------------------------------- */

test('the attacking seat names who it is hitting', () => {
  const state = table([
    { id: 'bears', owner: 'p2', power: '2' },
    { id: 'baloth', owner: 'p2', power: '6' },
  ]);
  const swing = outgoingAttack(
    at(state, [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p1' },
    ]),
    'p2'
  );
  assert.equal(swing.attacking, true);
  assert.equal(swing.attackers, 2);
  assert.equal(swing.power, 8);
  assert.equal(outgoingSentence(swing), 'Attacking You with 2');
});

test('a split attack says how many seats, not a list', () => {
  const state = table([
    { id: 'bears', owner: 'p2' },
    { id: 'baloth', owner: 'p2' },
  ]);
  const swing = outgoingAttack(
    at(state, [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p3' },
    ]),
    'p2'
  );
  assert.equal(outgoingSentence(swing), 'Attacking 2 players with 2');
});

/* -------------------------------------------------------------------------- */
/* What one card says                                                         */
/* -------------------------------------------------------------------------- */

test('an attacker names the seat it is hitting, and says "you" to the defender', () => {
  const state = table([{ id: 'bears', owner: 'p2', name: 'Grizzly Bears' }]);
  const board = at(state, [{ attacker: 'bears', defender: 'p1' }]);

  assert.deepEqual(combatMarkFor(board, 'bears', 'p1')?.text, 'hits you');
  assert.deepEqual(combatMarkFor(board, 'bears', 'p3')?.text, 'hits You');
});

test('a blocked attacker says how many bodies are in front of it', () => {
  const state = table([
    { id: 'bears', owner: 'p2', name: 'Grizzly Bears' },
    { id: 'wall', owner: 'p1', name: 'Wall of Roots' },
  ]);
  const board = at(state, [{ attacker: 'bears', defender: 'p1', blockedBy: ['wall'] }]);
  assert.equal(combatMarkFor(board, 'bears', 'p1')?.text, 'held by 1');
});

test('a blocker names what it is standing in front of', () => {
  const state = table([
    { id: 'bears', owner: 'p2', name: 'Grizzly Bears' },
    { id: 'wall', owner: 'p1', name: 'Wall of Roots' },
  ]);
  const board = at(state, [{ attacker: 'bears', defender: 'p1', blockedBy: ['wall'] }]);
  const mark = combatMarkFor(board, 'wall', 'p1');
  assert.equal(mark?.role, 'blocker');
  assert.equal(mark?.text, 'blocks Grizzly Bears');
});

test('a permanent outside combat carries no mark at all', () => {
  const state = table([
    { id: 'bears', owner: 'p2' },
    { id: 'idle', owner: 'p1' },
  ]);
  const board = at(state, [{ attacker: 'bears', defender: 'p1' }]);
  assert.equal(combatMarkFor(board, 'idle', 'p1'), null);
  assert.equal(combatMarkFor(at(state, []), 'bears', 'p1'), null);
});
