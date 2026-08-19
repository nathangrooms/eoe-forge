import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveWatchedSeat, type WatchableSeat } from './watchedSeat.ts';

const seat = (id: string, name: string, hasLost = false): WatchableSeat => ({ id, name, hasLost });

const alive: WatchableSeat[] = [seat('p1', 'Yeva'), seat('p2', 'Yeva 2')];

test('a living seat the reader picked is left exactly where it is', () => {
  const choice = resolveWatchedSeat(alive, 'p2', false);
  assert.equal(choice.seatId, 'p2');
  assert.equal(choice.reason, null);
});

test('a seat that loses mid-game hands the reader to a living one, and says so', () => {
  const seats = [seat('p1', 'Yeva'), seat('p2', 'Yeva 2', true)];
  const choice = resolveWatchedSeat(seats, 'p2', false);
  assert.equal(choice.seatId, 'p1');
  assert.equal(choice.reason, 'Yeva 2 is out of the game, so the table moved to Yeva.');
});

/*
 * The bug this module exists for. Pressing a losing seat's button at the end of
 * a game used to change nothing and say nothing: the button took the click, the
 * effect put the seat straight back, and the reader was left pressing a control
 * that does not work. Watching the loser's board is the reason to stay on the
 * screen after the result.
 */
test('once the game is over, the losing seat is watchable like any other', () => {
  const seats = [seat('p1', 'Yeva'), seat('p2', 'Yeva 2', true)];
  const choice = resolveWatchedSeat(seats, 'p2', true);
  assert.equal(choice.seatId, 'p2', 'the reader chose the losing seat and the game is finished');
  assert.equal(choice.reason, null);
});

test('a seat id that is not at this table falls to the first seat without a notice', () => {
  const choice = resolveWatchedSeat(alive, 'p9', false);
  assert.equal(choice.seatId, 'p1');
  assert.equal(choice.reason, null, 'nothing the reader chose was contradicted');
});

test('no seats at all resolves to nothing rather than throwing', () => {
  assert.deepEqual(resolveWatchedSeat([], 'p1', false), { seatId: null, reason: null });
});

test('a null pick lands on the first seat', () => {
  assert.equal(resolveWatchedSeat(alive, null, false).seatId, 'p1');
});

/*
 * A whole table eliminated at once is possible: a board wipe with everyone at
 * low life, resolved by state-based actions in one pass. There is no living
 * seat to move to, so the pick stands rather than the table going blank.
 */
test('when every seat has lost, the pick stands instead of resolving to nothing', () => {
  const seats = [seat('p1', 'Yeva', true), seat('p2', 'Yeva 2', true)];
  const choice = resolveWatchedSeat(seats, 'p2', false);
  assert.equal(choice.seatId, 'p2');
  assert.equal(choice.reason, null);
});

test('the notice is a plain sentence: no jargon and no em-dash', () => {
  const seats = [seat('p1', 'Yeva'), seat('p2', 'Yeva 2', true)];
  const { reason } = resolveWatchedSeat(seats, 'p2', false);
  assert.ok(reason, 'a seat change the reader did not ask for must be explained');
  assert.equal(reason.indexOf('—'), -1, `em-dash in user-facing copy: ${reason}`);
  assert.match(reason, /\.$/, 'it is a sentence');
});
