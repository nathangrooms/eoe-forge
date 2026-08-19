/**
 * Tests for the round-by-round trail the standings sheet draws.
 *
 *   node --test --experimental-strip-types src/components/tournament/scoring.test.ts
 *
 * The trail is derived, never stored, which is the whole point: it cannot
 * disagree with the W-L-D beside it because it is read out of the same matches.
 * That only holds if it reads a match from BOTH sides correctly, and getting
 * the sides the wrong way round would silently print every loss as a win for
 * whoever happened to be `player2`. That is what these check.
 *
 * `computeStandings` is exercised alongside, so a change to one that breaks
 * agreement with the other fails here rather than on a shop floor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStandings, roundTrail, type Round } from './scoring.ts';

/** `[winner-or-p1, other, gamesP1, gamesP2, done]` */
function match(
  id: string,
  p1: string,
  p2: string,
  s1: number,
  s2: number,
  done = true
): Round['matches'][number] {
  return {
    id,
    player1: p1,
    player2: p2,
    player1Score: done ? s1 : 0,
    player2Score: done ? s2 : 0,
    result: done ? (s1 > s2 ? 'p1' : s2 > s1 ? 'p2' : 'draw') : undefined,
    winner: done ? (s1 > s2 ? p1 : s2 > s1 ? p2 : undefined) : undefined,
    status: done ? 'completed' : 'pending',
  };
}

const ROUNDS: Round[] = [
  {
    number: 1,
    status: 'completed',
    matches: [match('r1a', 'Ana', 'Ben', 2, 0), match('r1b', 'Cal', 'Dee', 1, 2)],
  },
  {
    number: 2,
    status: 'completed',
    matches: [match('r2a', 'Ana', 'Dee', 1, 1), match('r2b', 'Ben', 'Cal', 2, 1)],
  },
  {
    number: 3,
    status: 'in-progress',
    matches: [match('r3a', 'Ana', 'Ben', 0, 0, false), match('r3b', 'Cal', 'BYE', 2, 0)],
  },
];

test('a win is a win from the winner\'s side', () => {
  const trail = roundTrail('Ana', ROUNDS);
  assert.equal(trail[0].outcome, 'win');
  assert.deepEqual(trail[0].games, [2, 0]);
  assert.equal(trail[0].opponent, 'Ben');
});

test('the same match is a loss from the other side, with the games swapped', () => {
  const trail = roundTrail('Ben', ROUNDS);
  assert.equal(trail[0].outcome, 'loss');
  assert.deepEqual(trail[0].games, [0, 2]);
  assert.equal(trail[0].opponent, 'Ana');
});

test('player2 winning is a win for player2, not for player1', () => {
  // The trap: reading `result === 'p1'` as "the person I am looking at won".
  assert.equal(roundTrail('Dee', ROUNDS)[0].outcome, 'win');
  assert.equal(roundTrail('Cal', ROUNDS)[0].outcome, 'loss');
});

test('a draw is a draw on both sides', () => {
  assert.equal(roundTrail('Ana', ROUNDS)[1].outcome, 'draw');
  assert.equal(roundTrail('Dee', ROUNDS)[1].outcome, 'draw');
});

test('an unreported match is pending and names no score', () => {
  const entry = roundTrail('Ana', ROUNDS)[2];
  assert.equal(entry.outcome, 'pending');
  assert.equal(entry.games, undefined);
  assert.equal(entry.opponent, 'Ben');
});

test('a bye is a bye, and has no opponent to name', () => {
  const entry = roundTrail('Cal', ROUNDS)[2];
  assert.equal(entry.outcome, 'bye');
  assert.equal(entry.opponent, null);
});

test('every player gets one entry per round, so the rounds line up in a column', () => {
  for (const player of ['Ana', 'Ben', 'Cal', 'Dee']) {
    assert.equal(roundTrail(player, ROUNDS).length, ROUNDS.length, player);
  }
});

test('a player who sat a round out still gets an entry for it', () => {
  const trail = roundTrail('Dee', ROUNDS);
  assert.equal(trail[2].outcome, 'pending');
  assert.equal(trail[2].opponent, null);
});

test('the trail agrees with the record the standings sheet prints beside it', () => {
  const standings = computeStandings(['Ana', 'Ben', 'Cal', 'Dee'], ROUNDS, []);

  for (const standing of standings) {
    const trail = roundTrail(standing.player, ROUNDS);
    const wins = trail.filter(t => t.outcome === 'win' || t.outcome === 'bye').length;
    const losses = trail.filter(t => t.outcome === 'loss').length;
    const draws = trail.filter(t => t.outcome === 'draw').length;

    assert.equal(wins, standing.wins, `${standing.player} wins`);
    assert.equal(losses, standing.losses, `${standing.player} losses`);
    assert.equal(draws, standing.draws, `${standing.player} draws`);
  }
});

test('no rounds means an empty trail rather than a thrown error', () => {
  assert.deepEqual(roundTrail('Ana', []), []);
});
