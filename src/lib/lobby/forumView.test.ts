/**
 * The copy is asserted as whole sentences on purpose.
 *
 * These strings are what a person actually reads at the moment something has
 * gone wrong, and "shows an error" is not the same claim as "tells them what to
 * do next". CLAUDE.md's copy rules are checked here too: no jargon, and no
 * em-dashes anywhere in what is shown.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_BLURB,
  TABLE_TALK_BLURB,
  emptyBoardLine,
  lastWordLine,
  postingVerdict,
  replyLine,
  whyNotStartTopic,
} from './forumView.ts';

/* -------------------------------------------------------------------------- */
/* Who may post                                                               */
/* -------------------------------------------------------------------------- */

test('a signed-out reader is told what an account would let them do', () => {
  const verdict = postingVerdict({ signedIn: false });
  assert.equal(verdict.canPost, false);
  assert.equal(
    verdict.reason,
    'Sign in to join in. Anybody can read this, an account is only needed to post.'
  );
});

test('having no deck does not stop somebody asking for a game', () => {
  // The deck rule is about sitting down at a table, not about talking. This is
  // the assertion that stops it being copied across by accident.
  assert.deepEqual(postingVerdict({ signedIn: true }), { canPost: true, reason: null });
});

test('a blocked account is told, rather than left wondering why nothing sends', () => {
  const verdict = postingVerdict({ signedIn: true, blocked: true });
  assert.equal(verdict.canPost, false);
  assert.match(verdict.reason ?? '', /cannot post in the discussion/);
});

test('a closed conversation still reads, and says what to do instead', () => {
  const verdict = postingVerdict({ signedIn: true, locked: true });
  assert.equal(verdict.canPost, false);
  assert.equal(verdict.reason, 'This one is closed. Start a new topic instead.');
});

test("somebody at a table's page who has not sat down is told to sit down", () => {
  const verdict = postingVerdict({ signedIn: true, atTable: true, seated: false });
  assert.equal(verdict.canPost, false);
  assert.equal(verdict.reason, 'Take a seat and you can talk to the others at this table.');
});

test('somebody who has taken a seat can talk', () => {
  assert.equal(postingVerdict({ signedIn: true, atTable: true, seated: true }).canPost, true);
});

test('being blocked outranks being seated', () => {
  const verdict = postingVerdict({ signedIn: true, atTable: true, seated: true, blocked: true });
  assert.equal(verdict.canPost, false);
});

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test('the opening post is not counted as a reply to itself', () => {
  assert.equal(replyLine({ postCount: 1 }), 'No replies yet');
  assert.equal(replyLine({ postCount: 2 }), '1 reply');
  assert.equal(replyLine({ postCount: 9 }), '8 replies');
});

test('a count that has drifted below zero still reads as a sentence', () => {
  assert.equal(replyLine({ postCount: 0 }), 'No replies yet');
});

test('a topic nobody has answered says who asked and when', () => {
  const now = Date.parse('2026-08-22T12:00:00Z');
  const line = lastWordLine(
    {
      postCount: 1,
      lastPostName: null,
      lastPostAt: '2026-08-22T11:30:00Z',
      authorName: 'grumbo',
      createdAt: '2026-08-22T11:30:00Z',
    },
    now
  );
  assert.equal(line, 'grumbo asked, 30 min ago');
});

test('a topic with replies says who spoke last', () => {
  const now = Date.parse('2026-08-22T12:00:00Z');
  const line = lastWordLine(
    {
      postCount: 4,
      lastPostName: 'sofia',
      lastPostAt: '2026-08-22T11:55:00Z',
      authorName: 'grumbo',
      createdAt: '2026-08-22T09:00:00Z',
    },
    now
  );
  assert.equal(line, 'sofia replied, 5 min ago');
});

test('a missing last name falls back to whoever started it, never to blank', () => {
  const now = Date.parse('2026-08-22T12:00:00Z');
  const line = lastWordLine(
    {
      postCount: 3,
      lastPostName: null,
      lastPostAt: '2026-08-22T11:00:00Z',
      authorName: 'grumbo',
      createdAt: '2026-08-22T09:00:00Z',
    },
    now
  );
  assert.equal(line, 'grumbo replied, 1 hour ago');
});

test('an empty board says something different to somebody who cannot post', () => {
  assert.equal(emptyBoardLine(true), 'Nobody has posted yet. Ask for a game and see who answers.');
  assert.equal(
    emptyBoardLine(false),
    'Nobody has posted yet. Sign in if you want to be the first.'
  );
});

/* -------------------------------------------------------------------------- */
/* Starting one                                                               */
/* -------------------------------------------------------------------------- */

test('a draft is refused before it costs a round trip, in the same words', () => {
  assert.equal(whyNotStartTopic('hi', 'body'), 'Give it a title so people know what it is about.');
  assert.equal(whyNotStartTopic('a real title', '   '), 'Write something to go with it.');
  assert.equal(whyNotStartTopic('a real title', 'and a real body'), null);
});

test('the lengths the box enforces are the lengths the database enforces', () => {
  assert.equal(whyNotStartTopic('x'.repeat(121), 'body'), 'A title is 120 characters at most.');
  assert.equal(whyNotStartTopic('a real title', 'x'.repeat(2001)), 'A post is 2000 characters at most.');
  assert.equal(whyNotStartTopic('x'.repeat(120), 'x'.repeat(2000)), null);
});

/* -------------------------------------------------------------------------- */
/* The copy rules                                                             */
/* -------------------------------------------------------------------------- */

test('nothing a person reads contains an em-dash', () => {
  const everything = [
    BOARD_BLURB,
    TABLE_TALK_BLURB,
    emptyBoardLine(true),
    emptyBoardLine(false),
    replyLine({ postCount: 3 }),
    postingVerdict({ signedIn: false }).reason ?? '',
    postingVerdict({ signedIn: true, blocked: true }).reason ?? '',
    postingVerdict({ signedIn: true, locked: true }).reason ?? '',
    postingVerdict({ signedIn: true, atTable: true, seated: false }).reason ?? '',
    whyNotStartTopic('a', 'b') ?? '',
  ];

  for (const line of everything) {
    assert.equal(line.includes('—'), false, line);
    assert.equal(line.includes('–'), false, line);
  }
});

test('the board says out loud that anybody can read it', () => {
  assert.match(BOARD_BLURB, /anybody can read them/);
  assert.match(BOARD_BLURB, /not signed in/);
});

test('a table says out loud that its talk is private and temporary', () => {
  assert.match(TABLE_TALK_BLURB, /Only the people at this table/);
  assert.match(TABLE_TALK_BLURB, /goes when the table does/);
});
