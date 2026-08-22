/**
 * The lobby's copy is asserted as whole strings.
 *
 * Every refusal in `entryVerdict` is the only thing a blocked player will read,
 * and the failure mode is not a crash: it is a sentence that says no and stops.
 * So the assertions check that each one names a way out, and the project's copy
 * rules are checked mechanically because a rule nobody can test is a rule that
 * drifts. No em-dashes, and none of the banned vocabulary.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  actionForTable,
  actionLabel,
  chairs,
  entryVerdict,
  isGoingStale,
  lobbyErrorMessage,
  preferredName,
  seatsLine,
  waitedFor,
  whyNotStartable,
} from './lobbyView.ts';
import { codeFromInput, normaliseCode, tableLink, tablePath } from './share.ts';
import type { OpenTable, RoomSeat } from './types.ts';

const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

/* -------------------------------------------------------------------------- */

test('a wait is said the way somebody would say it', () => {
  assert.equal(waitedFor(minutesAgo(0), NOW), 'just now');
  assert.equal(waitedFor(new Date(NOW - 45_000), NOW), 'just now');
  assert.equal(waitedFor(minutesAgo(1), NOW), '1 min');
  assert.equal(waitedFor(minutesAgo(37), NOW), '37 min');
  assert.equal(waitedFor(minutesAgo(60), NOW), '1 hour');
  assert.equal(waitedFor(minutesAgo(200), NOW), '3 hours');
  assert.equal(waitedFor(minutesAgo(60 * 24), NOW), '1 day');
  assert.equal(waitedFor(minutesAgo(60 * 24 * 3), NOW), '3 days');
});

test('a wait from nonsense does not read as an error', () => {
  assert.equal(waitedFor('not a date', NOW), 'just now');
});

test('a table is only called stale once it is nearly swept', () => {
  assert.equal(isGoingStale(minutesAgo(1), NOW), false);
  assert.equal(isGoingStale(minutesAgo(24), NOW), false);
  // The sweep is at 30 minutes, so the warning starts at 25.
  assert.equal(isGoingStale(minutesAgo(25), NOW), true);
  assert.equal(isGoingStale(minutesAgo(29), NOW), true);
});

/* -------------------------------------------------------------------------- */

test('the entry rule refuses in three different ways and never dead ends', () => {
  const out = entryVerdict({ signedIn: false, decks: [] });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, 'signed-out');
  assert.equal(out.actionHref, '/login');

  const noDecks = entryVerdict({ signedIn: true, decks: [] });
  assert.equal(noDecks.ok, false);
  if (noDecks.ok) return;
  assert.equal(noDecks.reason, 'no-decks');
  assert.equal(noDecks.actionHref, '/decks/new');

  const empty = entryVerdict({ signedIn: true, decks: [{ cardCount: 0 }, { cardCount: null }] });
  assert.equal(empty.ok, false);
  if (empty.ok) return;
  assert.equal(empty.reason, 'empty-decks');
  assert.equal(empty.actionHref, '/decks');
});

test('one deck with cards in it is enough', () => {
  assert.deepEqual(
    entryVerdict({ signedIn: true, decks: [{ cardCount: 0 }, { cardCount: 99 }] }),
    { ok: true }
  );
});

test('every refusal obeys the copy rules', () => {
  const banned = /\b(AI|assistant|smart|intelligent|powered by|neural|GPT|canonical|pipeline|primitive|surface)\b/i;
  const cases = [
    entryVerdict({ signedIn: false, decks: [] }),
    entryVerdict({ signedIn: true, decks: [] }),
    entryVerdict({ signedIn: true, decks: [{ cardCount: 0 }] }),
  ];

  for (const verdict of cases) {
    assert.equal(verdict.ok, false);
    if (verdict.ok) continue;
    for (const line of [verdict.title, verdict.body, verdict.actionLabel]) {
      assert.ok(!line.includes('—'), `em-dash in: ${line}`);
      assert.ok(!banned.test(line), `banned word in: ${line}`);
    }
    // A refusal with no way out is the thing this test exists to stop.
    assert.ok(verdict.actionLabel.length > 0);
    assert.ok(verdict.actionHref.startsWith('/'));
  }
});

/* -------------------------------------------------------------------------- */

test('a name shown to the whole lobby is never an email address', () => {
  // Two usernames on this project are raw email addresses. A lobby list and an
  // open chat are exactly the surfaces that would publish one to every account.
  assert.equal(preferredName({ username: 'player@example.com' }), 'player');
  assert.equal(preferredName({ username: null, email: 'someone@example.com' }), 'someone');
  assert.equal(preferredName({ username: 'Ali' }), 'Ali');
  // The username wins when there is one, even with an email also present.
  assert.equal(preferredName({ username: 'Bo', email: 'bo@example.com' }), 'Bo');
});

test('a name always comes back, and always fits on a seat', () => {
  assert.equal(preferredName({}), 'Player');
  assert.equal(preferredName({ username: '   ' }), 'Player');
  // 24 is the column the database cuts at, so the box must not offer more.
  assert.equal(preferredName({ username: 'x'.repeat(60) }).length, 24);
});

/* -------------------------------------------------------------------------- */

const table = (over: Partial<OpenTable> = {}): OpenTable => ({
  id: 't',
  code: 'ABC123',
  format: 'commander',
  visibility: 'public',
  maxSeats: 4,
  seatsTaken: 2,
  hostName: 'Ali',
  seated: false,
  createdAt: minutesAgo(10),
  lastActivityAt: minutesAgo(2),
  seats: [],
  ...over,
});

test('a table you are already at says come back, not join', () => {
  assert.equal(actionForTable(table({ seated: true })), 'rejoin');
  assert.equal(actionLabel('rejoin'), 'Back to your seat');
});

test('a full table cannot be joined and says so', () => {
  assert.equal(actionForTable(table({ seatsTaken: 4, maxSeats: 4 })), 'full');
  assert.equal(actionForTable(table({ seatsTaken: 3, maxSeats: 4 })), 'join');
});

test('a seat count reads as a sentence', () => {
  assert.equal(seatsLine(table({ seatsTaken: 2, maxSeats: 4 })), '2 of 4 seats');
});

/* -------------------------------------------------------------------------- */

const seat = (over: Partial<RoomSeat> = {}): RoomSeat => ({
  userId: 'u1',
  seat: 0,
  playerId: 'p1',
  name: 'Ali',
  deckId: 'd1',
  deckName: 'Atraxa',
  deckSize: 99,
  commanders: [],
  committed: true,
  ready: true,
  joinedAt: minutesAgo(5),
  lastSeenAt: minutesAgo(1),
  ...over,
});

test('empty chairs are real, so the room does not reshuffle when somebody sits', () => {
  const seats = chairs({ maxSeats: 4, seats: [seat({ seat: 0 }), seat({ seat: 2, userId: 'u3' })] });
  assert.equal(seats.length, 4);
  assert.equal(seats[0]?.userId, 'u1');
  assert.equal(seats[1], null);
  assert.equal(seats[2]?.userId, 'u3');
  assert.equal(seats[3], null);
});

test('the host is told why start is off, in the same order the database checks it', () => {
  assert.equal(
    whyNotStartable({ status: 'playing', seats: [seat(), seat({ seat: 1, userId: 'u2' })] }),
    'This game has already started.'
  );

  assert.equal(
    whyNotStartable({ status: 'lobby', seats: [seat()] }),
    'A game needs at least two seats. Share the link to fill one.'
  );

  assert.equal(
    whyNotStartable({
      status: 'lobby',
      seats: [seat(), seat({ seat: 1, userId: 'u2', name: 'Bo', deckSize: 0, committed: false })],
    }),
    'Still waiting on a deck from Bo.'
  );

  assert.equal(
    whyNotStartable({
      status: 'lobby',
      seats: [seat(), seat({ seat: 1, userId: 'u2', name: 'Bo', ready: false })],
    }),
    'Waiting for Bo to say they are ready.'
  );

  assert.equal(
    whyNotStartable({ status: 'lobby', seats: [seat(), seat({ seat: 1, userId: 'u2' })] }),
    null
  );
});

test('a seat that says it is ready without a commitment is still waiting on a deck', () => {
  // The database refuses this exact state in start_online_table. Saying it here
  // first is the difference between a rule and a surprise.
  assert.equal(
    whyNotStartable({
      status: 'lobby',
      seats: [seat(), seat({ seat: 1, userId: 'u2', name: 'Bo', committed: false, ready: true })],
    }),
    'Still waiting on a deck from Bo.'
  );
});

/* -------------------------------------------------------------------------- */

test('a database refusal is turned into something a player can act on', () => {
  assert.equal(
    lobbyErrorMessage({ message: 'you need one deck with cards in it before you can sit down' }),
    'You need one deck with cards in it before you can sit down.'
  );
  assert.equal(
    lobbyErrorMessage({ message: 'that table is full' }),
    'Somebody took the last seat. Try another table.'
  );
  assert.equal(
    lobbyErrorMessage({ message: 'no table with that code' }),
    'No table with that code. It may have been packed away.'
  );
  assert.equal(
    lobbyErrorMessage({ message: 'TypeError: Failed to fetch' }),
    'Could not reach the table. Check your connection and try again.'
  );
  assert.equal(
    lobbyErrorMessage(null),
    'That did not go through. Try it again in a moment.'
  );
});

/* -------------------------------------------------------------------------- */

test('a link carries the code, never the table id', () => {
  assert.equal(tablePath('abc123'), '/play/t/ABC123');
  assert.equal(
    tableLink('abc123', 'https://deckmatrix.com/'),
    'https://deckmatrix.com/play/t/ABC123'
  );
  assert.equal(normaliseCode('  f79zdh '), 'F79ZDH');
});

test('pasting the whole link works, because that is what people actually do', () => {
  assert.equal(codeFromInput('https://deckmatrix.com/play/t/F79ZDH'), 'F79ZDH');
  assert.equal(codeFromInput('https://deckmatrix.com/play/t/f79zdh?x=1'), 'F79ZDH');
  assert.equal(codeFromInput(' f79zdh '), 'F79ZDH');
  assert.equal(codeFromInput(''), '');
});
