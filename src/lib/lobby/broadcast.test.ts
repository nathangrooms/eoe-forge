/**
 * The shapes here are not invented. They were read off the websocket.
 *
 * `DATABASE_SENT` is the frame a real table received on 22 Aug 2026 when a
 * second player said something, decoded from the binary Phoenix frame and
 * parsed. The reader in `channel.ts` returned null on it, so the message never
 * reached the screen while the page said "Updating as it happens". That is the
 * case this file exists for.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { broadcastBody } from './broadcast.ts';

/** What `post_table_message` put on `game:<id>`, as the client received it. */
const DATABASE_SENT = {
  type: 'broadcast',
  event: 'chat',
  payload: {
    id: '21be3f12-705b-4b1f-837f-cd0f865b5a2b',
    kind: 'reply',
    topicId: 55,
    post: {
      id: 649,
      topic_id: 55,
      scope: 'table',
      display_name: 'Beta',
      body: 'LIVEPUSHCANARY does this appear without a reload',
      created_at: '2026-08-22T04:22:11.104+00:00',
    },
  },
};

/** A seat nudge. No body worth reading, which is why seats never broke. */
const SEAT_NUDGE = {
  type: 'broadcast',
  event: 'lobby',
  payload: { id: '25e533d9-49f5-4d86-86b0-9df55de9bd61', kind: 'lobby' },
};

/** What a browser sending its own broadcast would produce. */
const CLIENT_SENT = {
  type: 'broadcast',
  event: 'chat',
  payload: { payload: { kind: 'reply', topicId: 7 }, event: 'chat', type: 'broadcast' },
};

test('a message the database sent is read, not dropped', () => {
  const body = broadcastBody(DATABASE_SENT);
  assert.ok(body, 'the body came back null, which is the bug this file is about');
  assert.equal(body.kind, 'reply');
  assert.equal(body.topicId, 55);
  assert.equal((body.post as { id: number }).id, 649);
});

test('a nudge with no post in it still reads as a nudge', () => {
  assert.deepEqual(broadcastBody(SEAT_NUDGE), {
    id: '25e533d9-49f5-4d86-86b0-9df55de9bd61',
    kind: 'lobby',
  });
});

test('a message a browser sent is unwrapped one level deeper', () => {
  const body = broadcastBody(CLIENT_SENT);
  assert.ok(body);
  assert.equal(body.kind, 'reply');
  assert.equal(body.topicId, 7);
});

test('nothing to read comes back as nothing', () => {
  for (const empty of [null, undefined, {}, { payload: null }, { payload: 'text' }, 'text', 7]) {
    assert.equal(broadcastBody(empty), null);
  }
});

test('an array is not a body', () => {
  assert.equal(broadcastBody({ payload: [1, 2, 3] }), null);
  assert.deepEqual(broadcastBody({ payload: { kind: 'topic', payload: [1] } }), {
    kind: 'topic',
    payload: [1],
  });
});
