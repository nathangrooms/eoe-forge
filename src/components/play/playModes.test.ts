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
  COVER_BASE,
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
    const all = [mode.eyebrow, mode.title, mode.meta, ...mode.lines];
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

test('a cover is one asset per mode at a known path and a known shape', () => {
  /* The covers decode 1376 x 768, checked on 22 Aug 2026 by reading the JPEG
     frame header of all four. The door is cut to that, not to 16/9, because
     the 0.8% between the two ratios is the only thing `object-cover` would
     have had to throw away and the brief is that nothing is cropped. */
  assert.equal(COVER_ASPECT, '1376 / 768');
  assert.equal(
    coverPathFor('online'),
    'https://udnaflcohfyljrsgqggy.supabase.co/storage/v1/object/public/art/play-mode-online.png'
  );
  for (const mode of PLAY_MODES) assert.equal(mode.cover, coverPathFor(mode.id));
});

test('the door is cut to the picture, so object-cover crops nothing', () => {
  const [w, h] = COVER_ASPECT.split('/').map(part => Number(part.trim()));
  assert.equal(w, 1376);
  assert.equal(h, 768);
});

test('no cover points at card art, which the licence forbids darkening', () => {
  for (const mode of PLAY_MODES) {
    assert.ok(!/scryfall|gatherer|cards\//i.test(mode.cover), mode.id);
    assert.ok(mode.cover.startsWith(`${COVER_BASE}/play-mode-`), mode.id);
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
