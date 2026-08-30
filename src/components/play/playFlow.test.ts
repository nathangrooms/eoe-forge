/**
 * Mode, deck, table, in every mode, wearing the same pieces.
 *
 * The thing these tests are really guarding is the project law: if a mode ever
 * grows its own step names, its own breadcrumb or its own idea of what comes
 * next, that is the moment four modes stop being one product.
 *
 * What a mode IS allowed to differ on is how many steps it has, because that is
 * how many decisions it asks for. Goldfish asks two. The guard is that the
 * label says the count out loud, so a shorter flow reads as a shorter flow and
 * not as a missing screen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAY_STEPS,
  UNCHOSEN,
  breadcrumbFor,
  forwardLabelFor,
  headingFor,
  isLastStep,
  nextStep,
  previousStep,
  startLabelFor,
  stepFromUrl,
  stepLabel,
  stepsFor,
} from './playFlow.ts';
import { PLAY_MODES } from './playModes.ts';

test('three steps, in this order, for every mode that fills a table', () => {
  assert.deepEqual([...PLAY_STEPS], ['mode', 'deck', 'table']);
  for (const mode of ['online', 'bots', 'playtest'] as const) {
    assert.deepEqual([...stepsFor(mode)], ['mode', 'deck', 'table'], mode);
  }
});

test('goldfish has two steps, because it has two decisions', () => {
  assert.deepEqual([...stepsFor('goldfish')], ['mode', 'deck']);
  assert.equal(isLastStep('deck', 'goldfish'), true);
  assert.equal(isLastStep('deck', 'bots'), false);
  assert.equal(isLastStep('table', 'bots'), true);
  assert.equal(nextStep('deck', 'goldfish'), null);
  assert.equal(previousStep('deck', 'goldfish'), 'mode');
  assert.equal(previousStep('mode', 'goldfish'), null);
});

test('the label says which step and how many there are', () => {
  assert.equal(stepLabel('mode', null), 'Step one');
  assert.equal(stepLabel('deck', 'bots'), 'Step two of three');
  assert.equal(stepLabel('table', 'bots'), 'Step three of three');
  assert.equal(stepLabel('deck', 'goldfish'), 'Step two of two');
  /* A numeral here reads as a form field. Words, on every one of them. */
  for (const mode of PLAY_MODES) {
    for (const step of stepsFor(mode.id)) {
      assert.ok(!/\d/.test(stepLabel(step, mode.id)), `${mode.id}/${step}`);
    }
  }
});

test('every step of every mode has a label and a title', () => {
  for (const mode of PLAY_MODES) {
    for (const step of stepsFor(mode.id)) {
      const heading = headingFor(step, mode.id);
      assert.match(heading.label, /^Step (one|two|three) of (two|three)$/, `${mode.id}/${step}`);
      assert.ok(heading.title.length > 3, `${mode.id}/${step}`);
    }
  }
});

test('step two is the same step whatever mode you came from', () => {
  const titles = new Set(PLAY_MODES.map(mode => headingFor('deck', mode.id).title));
  assert.deepEqual([...titles], ['Choose your deck']);
});

test('the breadcrumb carries one crumb per step the mode actually has', () => {
  const crumbs = breadcrumbFor({ mode: 'online', deckName: null, tableLabel: null });
  assert.deepEqual(
    crumbs.map(crumb => crumb.label),
    ['Mode', 'Deck', 'Table']
  );
  assert.equal(crumbs[0].value, 'Online');
  assert.equal(crumbs[1].value, null);

  /* Goldfish never visits a table step, so it must never be told it has not
     chosen one yet. */
  const fish = breadcrumbFor({ mode: 'goldfish', deckName: 'Atraxa', tableLabel: null });
  assert.deepEqual(
    fish.map(crumb => crumb.label),
    ['Mode', 'Deck']
  );
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

/**
 * The step is in the address bar, so back and forward move between steps rather
 * than off the page. Anything can arrive in a URL, including a step the mode
 * does not have.
 */
test('a step read out of the URL is always one this mode owns', () => {
  assert.equal(stepFromUrl('table', 'bots'), 'table');
  assert.equal(stepFromUrl('deck', 'bots'), 'deck');
  assert.equal(stepFromUrl('mode', 'bots'), 'mode');
  /* Goldfish has no table step. The old link lands on the last screen it does
     have rather than on nothing. */
  assert.equal(stepFromUrl('table', 'goldfish'), 'deck');
  assert.equal(stepFromUrl('nonsense', 'bots'), 'deck');
  /* A mode named with no step is what a deck tile links to: the mode is chosen
     for you and the deck is the next thing to pick. */
  assert.equal(stepFromUrl(null, 'bots'), 'deck');
  /* No mode at all means nothing has been chosen, whatever the step says. */
  assert.equal(stepFromUrl('table', null), 'mode');
});

test('the forward control names what it is about to do, never "Next"', () => {
  for (const mode of PLAY_MODES) {
    for (const step of stepsFor(mode.id)) {
      const label = isLastStep(step, mode.id)
        ? startLabelFor(mode.id, 2)
        : forwardLabelFor(step, mode.id);
      assert.notEqual(label, 'Next', `${mode.id}/${step}`);
      assert.ok(label.length > 4, `${mode.id}/${step}`);
    }
  }
  assert.equal(forwardLabelFor('mode', null), 'Choose a deck');
  assert.equal(forwardLabelFor('deck', 'online'), 'Find a table');
  assert.equal(forwardLabelFor('deck', 'playtest'), 'Fill the seats');
});

test('the last step of a mode is the one that deals the game', () => {
  assert.equal(startLabelFor('goldfish', 1), 'Start goldfish');
  assert.equal(startLabelFor('bots', 4), 'Start 4-player game');
  assert.equal(startLabelFor('playtest', 3), 'Watch the 3-player game');
  assert.equal(startLabelFor('online', 2), 'Open a table');
});

test('no em-dashes in any step copy', () => {
  const emdash = /[—–]/;
  for (const mode of PLAY_MODES) {
    for (const step of stepsFor(mode.id)) {
      const heading = headingFor(step, mode.id);
      assert.ok(!emdash.test(heading.title + (heading.note ?? '')), `${mode.id}/${step}`);
      assert.ok(!emdash.test(forwardLabelFor(step, mode.id)), `${mode.id}/${step}`);
      assert.ok(!emdash.test(stepLabel(step, mode.id)), `${mode.id}/${step}`);
    }
  }
});
