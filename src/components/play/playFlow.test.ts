/**
 * Mode, deck, table, in every mode, wearing the same three pieces.
 *
 * The thing these tests are really guarding is the project law: if a mode ever
 * grows its own step names, its own breadcrumb or its own idea of what comes
 * next, that is the moment four modes stop being one product.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAY_STEPS,
  UNCHOSEN,
  breadcrumbFor,
  forwardLabelFor,
  headingFor,
  nextStep,
  previousStep,
  startLabelFor,
} from './playFlow.ts';
import { PLAY_MODES } from './playModes.ts';

test('three steps, in this order, for every mode', () => {
  assert.deepEqual([...PLAY_STEPS], ['mode', 'deck', 'table']);
  assert.equal(previousStep('mode'), null);
  assert.equal(previousStep('deck'), 'mode');
  assert.equal(nextStep('deck'), 'table');
  assert.equal(nextStep('table'), null);
});

test('every step of every mode has a label and a title', () => {
  for (const mode of PLAY_MODES) {
    for (const step of PLAY_STEPS) {
      const heading = headingFor(step, mode.id);
      assert.match(heading.label, /^Step (one|two|three)$/, `${mode.id}/${step}`);
      assert.ok(heading.title.length > 3, `${mode.id}/${step}`);
    }
  }
});

test('step two is the same step whatever mode you came from', () => {
  const titles = new Set(PLAY_MODES.map(mode => headingFor('deck', mode.id).title));
  assert.deepEqual([...titles], ['Choose your deck']);
});

test('the breadcrumb always carries all three choices, made or not', () => {
  const crumbs = breadcrumbFor({ mode: 'online', deckName: null, tableLabel: null });
  assert.deepEqual(
    crumbs.map(crumb => crumb.label),
    ['Mode', 'Deck', 'Table']
  );
  assert.equal(crumbs[0].value, 'Online');
  assert.equal(crumbs[1].value, null);
});

test('an unmade choice is a word, never a dash and never a blank', () => {
  assert.equal(UNCHOSEN, 'Not yet');
  assert.ok(!/[—–-]/.test(UNCHOSEN));
});

test('the breadcrumb carries the mode already picked into step two', () => {
  const crumbs = breadcrumbFor({ mode: 'playtest', deckName: 'Atraxa', tableLabel: null });
  assert.equal(crumbs[0].value, 'Playtest');
  assert.equal(crumbs[1].value, 'Atraxa');
  assert.equal(crumbs[2].value, null);
});

test('each crumb knows the step it goes back to', () => {
  const crumbs = breadcrumbFor({ mode: 'bots', deckName: 'Atraxa', tableLabel: '4 seats' });
  assert.deepEqual(
    crumbs.map(crumb => crumb.step),
    ['mode', 'deck', 'table']
  );
});

test('the forward control names what it is about to do, never "Next"', () => {
  for (const mode of PLAY_MODES) {
    for (const step of PLAY_STEPS) {
      const label = forwardLabelFor(step, mode.id);
      assert.notEqual(label, 'Next', `${mode.id}/${step}`);
      assert.ok(label.length > 4, `${mode.id}/${step}`);
    }
  }
  assert.equal(forwardLabelFor('mode', null), 'Choose a deck');
  assert.equal(forwardLabelFor('deck', 'online'), 'Find a table');
  assert.equal(forwardLabelFor('deck', 'goldfish'), 'Set up your seat');
});

test('the start control says how many seats it is about to deal', () => {
  assert.equal(startLabelFor('goldfish', 1), 'Start goldfish');
  assert.equal(startLabelFor('bots', 4), 'Start 4-player game');
  assert.equal(startLabelFor('playtest', 3), 'Watch the 3-player game');
  assert.equal(startLabelFor('online', 2), 'Open a table');
});

test('no em-dashes in any step copy', () => {
  const emdash = /[—–]/;
  for (const mode of PLAY_MODES) {
    for (const step of PLAY_STEPS) {
      const heading = headingFor(step, mode.id);
      assert.ok(!emdash.test(heading.title + (heading.note ?? '')), `${mode.id}/${step}`);
      assert.ok(!emdash.test(forwardLabelFor(step, mode.id)), `${mode.id}/${step}`);
    }
  }
});
