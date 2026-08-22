/**
 * The four doors, asserted as whole strings.
 *
 * The copy IS the feature on this screen. An eyebrow that says nothing and a
 * description that describes a machine rather than a game are the two failures
 * the redesign is replacing, and neither is catchable by a type.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COVER_ASPECT,
  PLAY_MODES,
  coverPathFor,
  isPlayMode,
  modeOf,
  seatsFor,
} from './playModes.ts';

test('there are exactly four doors, and online leads', () => {
  assert.equal(PLAY_MODES.length, 4);
  assert.deepEqual(
    PLAY_MODES.map(mode => mode.id),
    ['online', 'bots', 'goldfish', 'playtest']
  );
});

test('every door says what the mode IS, in one or two lines', () => {
  for (const mode of PLAY_MODES) {
    assert.ok(mode.lines.length >= 1 && mode.lines.length <= 2, mode.id);
    for (const line of mode.lines) {
      assert.ok(line.length > 20, `${mode.id}: "${line}" is not a description`);
      assert.ok(line.endsWith('.'), `${mode.id}: "${line}" is not a sentence`);
    }
  }
});

test('no em-dashes anywhere in the copy', () => {
  const emdash = /[—–]/;
  for (const mode of PLAY_MODES) {
    const all = [mode.eyebrow, mode.title, mode.meta, mode.developing ?? '', ...mode.lines];
    for (const piece of all) {
      assert.ok(!emdash.test(piece), `${mode.id}: "${piece}" holds a dash`);
    }
  }
});

test('the metadata line is a real fact, and it names seats or what is needed', () => {
  const facts: Record<string, string> = {
    online: '2 to 4 seats. Needs an account and one deck with cards in it.',
    bots: '2 to 4 seats. One of them is yours.',
    goldfish: '1 seat. Nothing blocks and nothing attacks back.',
    playtest: '2 to 4 seats. None of them are yours.',
  };
  for (const mode of PLAY_MODES) assert.equal(mode.meta, facts[mode.id]);
});

test('online says what is still being built, and the other three claim nothing', () => {
  const online = modeOf('online');
  assert.ok(online.developing);
  assert.match(online.developing as string, /still being built/);
  for (const id of ['bots', 'goldfish', 'playtest']) {
    assert.equal(modeOf(id).developing, null);
  }
});

test('a cover is one asset per mode at a known path and a known shape', () => {
  assert.equal(COVER_ASPECT, '3 / 4');
  assert.equal(coverPathFor('online'), '/covers/play/online.webp');
  for (const mode of PLAY_MODES) assert.equal(mode.cover, coverPathFor(mode.id));
});

test('no cover points at card art, which the licence forbids darkening', () => {
  for (const mode of PLAY_MODES) {
    assert.ok(!/scryfall|gatherer|cards\//i.test(mode.cover), mode.id);
    assert.ok(mode.cover.startsWith('/covers/play/'), mode.id);
  }
});

test('each door falls back to a different procedural surface', () => {
  const seen = new Set(PLAY_MODES.map(mode => `${mode.fallback.style}/${mode.fallback.tint}`));
  assert.equal(seen.size, 4);
});

test('an unknown mode never breaks the page', () => {
  assert.equal(modeOf(null).id, 'online');
  assert.equal(modeOf('nonsense').id, 'online');
  assert.equal(isPlayMode('bots'), true);
  assert.equal(isPlayMode('nonsense'), false);
  assert.equal(isPlayMode(undefined), false);
});

test('seat counts are clamped to what a table can hold', () => {
  assert.equal(seatsFor('goldfish', 3), 1);
  assert.equal(seatsFor('bots', 1), 2);
  assert.equal(seatsFor('bots', 3), 4);
  assert.equal(seatsFor('bots', 9), 4);
  assert.equal(seatsFor('playtest', 2), 2);
  assert.equal(seatsFor('playtest', 9), 4);
  assert.equal(seatsFor('online', 0), 2);
});
