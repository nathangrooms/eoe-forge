/**
 * The "Anything else?" box, read by the engine.
 *
 * Written as much as an ATTACK LIST as a behaviour list, because the danger
 * here is not failing to understand a phrase: it is understanding one wrongly
 * and quietly banning a card the player never named. Every test that asserts
 * something lands in `unread` is guarding that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { readRequestNotes, describeRequestNotes } from './requestNotes.ts';

const POOL = [
  'Cyclonic Rift',
  'Counterspell',
  'Sol Ring',
  'Rhystic Study',
  "Gaea's Cradle",
];

const read = (text: string | null | undefined) => readRequestNotes(text, POOL);

test('an empty box asks for nothing', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const notes = read(empty);
    assert.deepEqual(notes.excludeNames, []);
    assert.equal(notes.maxManaValue, null);
    assert.deepEqual(notes.unread, []);
  }
});

test('a named card is kept out, in the catalogue spelling', () => {
  for (const phrase of [
    'keep Cyclonic Rift out',
    'no Cyclonic Rift',
    'without cyclonic rift',
    "don't include Cyclonic Rift",
    'leave cyclonic rift out',
    'no cyclonic rift.',
  ]) {
    assert.deepEqual(read(phrase).excludeNames, ['Cyclonic Rift'], phrase);
  }
});

test('punctuation and apostrophes fold to the real name', () => {
  assert.deepEqual(read("no Gaea's Cradle").excludeNames, ["Gaea's Cradle"]);
  assert.deepEqual(read('no gaeas cradle').excludeNames, ["Gaea's Cradle"]);
});

test('a category is NOT a card, and says so instead of guessing', () => {
  /* The placeholder on the box itself says "more counterspells". Stripping the
     plural would ban `Counterspell`, which is not what that asks for. */
  const notes = read('more counterspells');
  assert.deepEqual(notes.excludeNames, []);
  assert.deepEqual(notes.unread, ['more counterspells']);

  const banned = read('no counterspells');
  assert.deepEqual(banned.excludeNames, [], 'a plural must not resolve to the singular card');
  assert.deepEqual(banned.unread, ['no counterspells']);
});

test('a card that is not in the pool is reported, never banned', () => {
  const notes = read('no Black Lotus');
  assert.deepEqual(notes.excludeNames, []);
  assert.deepEqual(notes.unread, ['no Black Lotus']);
});

test('a mana ceiling is read', () => {
  for (const phrase of [
    'nothing over 4 mana',
    'no cards above 4',
    'max 4 mana',
    'maximum mana value 4',
    '4 mana or less',
  ]) {
    assert.equal(read(phrase).maxManaValue, 4, phrase);
  }
});

test('the tightest ceiling wins when two are given', () => {
  assert.equal(read('nothing over 6 mana, max 3 mana').maxManaValue, 3);
});

test('an out-of-range ceiling is unread rather than clamped', () => {
  /* Clamping would act on a number the player did not type. */
  for (const phrase of ['nothing over 0 mana', 'max 99 mana']) {
    const notes = read(phrase);
    assert.equal(notes.maxManaValue, null, phrase);
    assert.deepEqual(notes.unread, [phrase]);
  }
});

test('a list is read clause by clause', () => {
  const notes = read('no Cyclonic Rift, nothing over 5 mana, more ramp');
  assert.deepEqual(notes.excludeNames, ['Cyclonic Rift']);
  assert.equal(notes.maxManaValue, 5);
  assert.deepEqual(notes.unread, ['more ramp']);
});

test('newlines separate clauses too', () => {
  const notes = read('no Sol Ring\nno Rhystic Study');
  assert.deepEqual(notes.excludeNames, ['Sol Ring', 'Rhystic Study']);
});

test('the same card asked for twice is listed once', () => {
  assert.deepEqual(read('no Sol Ring, no sol ring').excludeNames, ['Sol Ring']);
});

test('free prose is left alone entirely', () => {
  const notes = read('make it good please');
  assert.deepEqual(notes.excludeNames, []);
  assert.equal(notes.maxManaValue, null);
  assert.deepEqual(notes.unread, ['make it good please']);
});

test('the sentence read back says what was NOT done', () => {
  const notes = read('no Sol Ring, more counterspells');
  const said = describeRequestNotes(notes);
  assert.ok(said && said.includes('Sol Ring'));
  assert.ok(said.includes('more counterspells'), 'the player must be told what was ignored');
  assert.ok(!said.includes('—'), 'copy rules: no em-dashes in user-facing text');
});

test('nothing to say produces no sentence', () => {
  assert.equal(describeRequestNotes(read('')), null);
});
