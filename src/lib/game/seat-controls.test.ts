/**
 * By-hand control of a SEAT, through the path a player actually presses.
 *
 *   node --test --experimental-strip-types src/lib/game/seat-controls.test.ts
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS ABOUT: LIFE COULD NOT BE CHANGED AT THE PLAY TABLE
 * ---------------------------------------------------------------------------
 * `LIFE_CHANGE`, `SET_LIFE`, `POISON`, `PLAYER_COUNTER`, `COMMANDER_DAMAGE`,
 * `SET_MONARCH` and `SET_INITIATIVE` are all implemented, validated, reduced,
 * logged and covered by passing tests. Measured on 29 Aug 2026, two ways:
 *
 *   - grep, for each of `adjustLife`, `setLife`, `playerCounter`,
 *     `PLAYER_COUNTER_PRESETS` and `setCardCounter`, over every file under
 *     `src` outside `src/lib/game`: NOBODY IMPORTED ANY OF THEM;
 *   - and by driving a real goldfish game and reading back every button on the
 *     table (`scripts/play-hand-inventory.mjs`): eight permanents on the mat,
 *     twenty-eight by-hand controls on a card, and nothing anywhere that could
 *     change a life total.
 *
 * `reachability.test.ts` was green throughout, and the reason it was green is
 * the interesting part. `LIFE_CHANGE` HAS a producer: `useLifeGame.ts`, the
 * phone-on-the-table life counter, which is a different surface entirely. That
 * check asks whether anything outside the engine builds the action; it cannot
 * ask whether the surface you are looking at can. So an action reachable in one
 * place counted as reachable in all of them, and the play table sat there
 * unable to record three damage.
 *
 * These tests therefore start at `playerControlsFor`, the menu `SeatPanel`
 * renders, and never at a `GameAction` literal. A literal cannot tell "the
 * engine implements it" from "a player can press it", and this project's oldest
 * lesson is that only the second claim is the one being asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyAction, createGame } from './rules.ts';
import { playerControlsFor, setLife } from './manual.ts';
import type { GameAction, GameState, PlayerId } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

function game(): GameState {
  return createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'One', commanders: [{ id: 'c1', name: 'Atraxa' }] },
      { id: 'p2', name: 'Two', commanders: [{ id: 'c2', name: 'Edgar' }] },
    ],
  });
}

const apply = (state: GameState, actions: GameAction[]): GameState =>
  actions.reduce((next, action) => applyAction(next, action), state);

/** Press the control with this id, the way the panel does. */
function press(state: GameState, playerId: PlayerId, id: string): GameState {
  const control = playerControlsFor(state, playerId).find(c => c.id === id);
  assert.ok(control, `no control "${id}" is offered for ${playerId}`);
  assert.ok(control.actions.length > 0, `control "${id}" is bound to nothing`);
  return apply(state, control.actions);
}

const seat = (state: GameState, id: PlayerId) => {
  const player = state.players.find(p => p.id === id);
  assert.ok(player);
  return player;
};

/* ------------------------------------------------------------------ *
 * Life                                                               *
 * ------------------------------------------------------------------ */

test('a player can take damage and gain life without the engine doing it for them', () => {
  let state = game();
  assert.equal(seat(state, 'p1').life, 40);

  state = press(state, 'p1', 'life:-5');
  state = press(state, 'p1', 'life:-1');
  assert.equal(seat(state, 'p1').life, 34);

  state = press(state, 'p1', 'life:+5');
  assert.equal(seat(state, 'p1').life, 39);
});

test('life can be set to an exact number, which is what a big swing needs', () => {
  let state = game();
  state = apply(state, setLife('p1', 12));
  assert.equal(seat(state, 'p1').life, 12);
});

test('every seat is reachable, not only your own', () => {
  // A card of yours changes an opponent's life total far more often than it
  // changes yours, so the panel offering only your own seat would have closed
  // half the gap and looked closed.
  let state = game();
  state = press(state, 'p2', 'life:-5');
  assert.equal(seat(state, 'p2').life, 35);
  assert.equal(seat(state, 'p1').life, 40);
});

test('the life control reports the total it is about to change', () => {
  const state = game();
  const control = playerControlsFor(state, 'p1').find(c => c.id === 'life:-1');
  assert.equal(control?.count, 40);
});

/* ------------------------------------------------------------------ *
 * Poison                                                             *
 * ------------------------------------------------------------------ */

test('poison counters go on and come off', () => {
  let state = game();
  assert.equal(
    playerControlsFor(state, 'p1').some(c => c.id === 'poison:-1'),
    false,
    'there is nothing to take off a seat with no poison'
  );

  state = press(state, 'p1', 'poison:+1');
  state = press(state, 'p1', 'poison:+1');
  assert.equal(seat(state, 'p1').poison, 2);

  state = press(state, 'p1', 'poison:-1');
  assert.equal(seat(state, 'p1').poison, 1);
});

/* ------------------------------------------------------------------ *
 * Commander damage                                                   *
 * ------------------------------------------------------------------ */

test('commander damage is recorded and takes the life with it', () => {
  let state = game();
  for (let i = 0; i < 3; i++) state = press(state, 'p1', 'cmdr+:c2');

  assert.equal(seat(state, 'p1').commanderDamage.c2, 3, 'the tally');
  assert.equal(seat(state, 'p1').life, 37, 'and the life, in one press');
});

test('a misclick on commander damage can be taken back', () => {
  let state = game();
  state = press(state, 'p1', 'cmdr+:c2');
  state = press(state, 'p1', 'cmdr-:c2');
  assert.equal(seat(state, 'p1').commanderDamage.c2 ?? 0, 0);
  assert.equal(seat(state, 'p1').life, 40);
});

test("a seat's own commander is offered too, and offered last", () => {
  // A stolen commander deals commander damage to the player who owns it. Rare,
  // and leaving it out would put the player back where this module started:
  // watching something happen that the app refuses to record.
  const ids = playerControlsFor(game(), 'p1')
    .filter(c => c.group === 'commander-damage')
    .map(c => c.id);
  assert.deepEqual(ids, ['cmdr+:c2', 'cmdr+:c1']);
});

/* ------------------------------------------------------------------ *
 * Player counters                                                    *
 * ------------------------------------------------------------------ */

test('energy and experience are reachable, and the remove appears once there is one', () => {
  let state = game();
  assert.equal(
    playerControlsFor(state, 'p1').some(c => c.id === 'pcounter-:energy'),
    false
  );

  state = press(state, 'p1', 'pcounter+:energy');
  state = press(state, 'p1', 'pcounter+:energy');
  assert.equal(seat(state, 'p1').counters.energy, 2);

  state = press(state, 'p1', 'pcounter-:energy');
  assert.equal(seat(state, 'p1').counters.energy, 1);

  state = press(state, 'p1', 'pcounter+:experience');
  assert.equal(seat(state, 'p1').counters.experience, 1);
});

/* ------------------------------------------------------------------ *
 * The monarch and the initiative                                     *
 * ------------------------------------------------------------------ */

test('a player can become the monarch, and it moves rather than duplicating', () => {
  let state = game();
  assert.equal(state.monarchId, null);

  state = press(state, 'p1', 'role:monarch');
  assert.equal(state.monarchId, 'p1');

  state = press(state, 'p2', 'role:monarch');
  assert.equal(state.monarchId, 'p2', 'one seat at a time');
});

test('the crown can be put down again', () => {
  let state = game();
  state = press(state, 'p1', 'role:monarch');
  state = press(state, 'p1', 'role:monarch');
  assert.equal(state.monarchId, null);
});

test('the initiative works the same way, and had no producer at all before this', () => {
  let state = game();
  state = press(state, 'p1', 'role:initiative');
  assert.equal(state.initiativeId, 'p1');
  state = press(state, 'p2', 'role:initiative');
  assert.equal(state.initiativeId, 'p2');
});

test('the label says which way the toggle goes', () => {
  let state = game();
  const before = playerControlsFor(state, 'p1').find(c => c.id === 'role:monarch');
  assert.equal(before?.label, 'Take the crown');
  assert.equal(before?.active, false);

  state = press(state, 'p1', 'role:monarch');
  const after = playerControlsFor(state, 'p1').find(c => c.id === 'role:monarch');
  assert.equal(after?.label, 'Give up the crown');
  assert.equal(after?.active, true);
});

/* ------------------------------------------------------------------ *
 * The menu itself                                                    *
 * ------------------------------------------------------------------ */

test('a seat that is not at the table has no controls, rather than throwing', () => {
  assert.deepEqual(playerControlsFor(game(), 'nobody'), []);
});

test('every control is bound to at least one action', () => {
  for (const control of playerControlsFor(game(), 'p1')) {
    assert.ok(
      control.actions.length > 0,
      `"${control.id}" is drawn as a button and does nothing`
    );
  }
});

test('every group a player reaches for is present on a fresh seat', () => {
  const groups = new Set(playerControlsFor(game(), 'p1').map(c => c.group));
  for (const group of ['life', 'poison', 'counters', 'commander-damage', 'table-role']) {
    assert.ok(groups.has(group as never), `${group} is not offered`);
  }
});
