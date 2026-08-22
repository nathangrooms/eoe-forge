/**
 * These strings are shown to other people, so they are asserted whole.
 *
 * The thing being guarded is not spelling. It is that the phrase stays a coarse
 * description of a person and never becomes a description of a game position.
 * Anything naming a card, a life total, an opponent or a turn number would be
 * telling somebody's friends what is in their hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { presenceDoing } from './presenceWords.ts';

test('every phrase is something a player would say out loud', () => {
  assert.equal(presenceDoing('mode', null), 'choosing what to play');
  assert.equal(presenceDoing('deck', 'bots'), 'picking a deck');
  assert.equal(presenceDoing('table', 'bots'), 'setting up a game');
  assert.equal(presenceDoing('lobby', 'online'), 'looking for a game');
});

test('a game in progress says which kind and nothing about the position', () => {
  assert.equal(presenceDoing('playing', 'bots'), 'playing against bots');
  assert.equal(presenceDoing('playing', 'goldfish'), 'goldfishing a deck');
  assert.equal(presenceDoing('playing', 'playtest'), 'watching a playtest');
  assert.equal(presenceDoing('playing', 'online'), 'in a game');
  assert.equal(presenceDoing('playing', null), 'in a game');
});

test('the phrase fits the column the database keeps it in', () => {
  // `touch_presence` trims to 24 characters. A phrase longer than that would be
  // cut mid word on somebody else's screen.
  const every = [
    presenceDoing('mode', null),
    presenceDoing('deck', null),
    presenceDoing('table', null),
    presenceDoing('lobby', null),
    presenceDoing('playing', 'bots'),
    presenceDoing('playing', 'goldfish'),
    presenceDoing('playing', 'playtest'),
    presenceDoing('playing', 'online'),
  ];
  for (const phrase of every) {
    assert.ok(phrase.length <= 24, `${phrase} is ${phrase.length} characters`);
    assert.equal(phrase.includes('—'), false);
  }
});
