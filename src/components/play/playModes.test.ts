/**
 * The four doors, asserted as whole strings.
 *
 * The copy IS the feature on this screen. A label that says nothing and a
 * description that describes a machine rather than a game are the two failures
 * the redesign is replacing, and neither is catchable by a type.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAY_MODES, isPlayMode, modeOf, seatsFor } from './playModes.ts';

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
    const all = [mode.opposite, mode.title, mode.meta, mode.action, ...mode.lines];
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

/**
 * The label above the title answers the question the page asks in its subtitle.
 *
 * It used to be a mood: OTHER PEOPLE, YOU AGAINST THE RULES, ONE SEAT, HANDS
 * OFF. Four moods do not tell four modes apart, and telling them apart is the
 * only job this screen has.
 */
test('each door names who is opposite you, and no two are the same', () => {
  const opposites: Record<string, string> = {
    online: 'Another player',
    bots: 'The computer',
    goldfish: 'Nobody',
    playtest: 'Your own decks',
  };
  for (const mode of PLAY_MODES) assert.equal(mode.opposite, opposites[mode.id]);
  assert.equal(new Set(PLAY_MODES.map(mode => mode.opposite)).size, 4);
});

/**
 * The drawn table has to agree with the seat counter, or a door promises a
 * table the flow will not deal.
 */
test('the drawn table matches the seats the mode actually deals', () => {
  for (const mode of PLAY_MODES) {
    assert.equal(
      mode.table.filled,
      seatsFor(mode.id, 1),
      `${mode.id}: the chairs drawn are not the seats dealt by default`
    );
    assert.equal(
      mode.table.max,
      seatsFor(mode.id, 9),
      `${mode.id}: the faint chairs are not seats this mode can hold`
    );
    assert.ok(mode.table.filled <= mode.table.max, mode.id);
  }
});

test('only playtest has no chair of your own', () => {
  const yours = PLAY_MODES.filter(mode => mode.table.yours).map(mode => mode.id);
  assert.deepEqual(yours, ['online', 'bots', 'goldfish']);
  assert.equal(modeOf('playtest').table.yours, false);
});

test('goldfish is the one door with nobody opposite', () => {
  const none = PLAY_MODES.filter(mode => mode.table.others === 'none').map(mode => mode.id);
  assert.deepEqual(none, ['goldfish']);
  assert.equal(modeOf('online').table.others, 'people');
  assert.equal(modeOf('bots').table.others, 'bots');
});

/**
 * No door carries a photograph any more, and none may carry card art.
 *
 * The second half is the licence: a cover has to be darkened for type to sit on
 * it and Scryfall forbid modifying card images. The first half is the owner's,
 * 29 Aug 2026, and this test is what stops a URL creeping back into this file.
 */
test('a door is drawn, never photographed, and never from card art', () => {
  for (const mode of PLAY_MODES) {
    const json = JSON.stringify(mode);
    assert.ok(!/https?:\/\//.test(json), `${mode.id} carries a URL`);
    assert.ok(!/scryfall|gatherer|\.png|\.jpg|\.webp/i.test(json), `${mode.id} carries an image`);
  }
});

test('each door is painted on a different weave, and none of them is tinted', () => {
  const seen = new Set(PLAY_MODES.map(mode => mode.surface));
  assert.equal(seen.size, 4);
  /* The mat tints are the five MTG colours. Handing one to a mode invents a
     meaning the mode does not have, which the design law reserves colour
     against, so a door names a weave and nothing else. */
  for (const mode of PLAY_MODES) assert.ok(!/^(W|U|B|R|G|WUBRG|deck)$/.test(mode.surface));
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
