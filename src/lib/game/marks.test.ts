/**
 * Dice and free markers, through the path a player actually presses.
 *
 *   node --test --experimental-strip-types src/lib/game/marks.test.ts
 *
 * Written the way `tokens.test.ts` is written and for the same reason: this
 * project's oldest lesson is that "the engine supports it" and "a player can do
 * it" are different claims, and a test that builds a `GameAction` literal and
 * feeds it to the reducer can only prove the first. `CARD_COUNTER` has been
 * green since long before there was any way to put a die on a permanent.
 *
 * So nothing below constructs an action literal. Every test starts either at
 * `manualControlsFor` — the menu `ManualPanel` renders — or at the `manual.ts`
 * builder that panel calls, and asserts on the state that comes back out of
 * `applyAction`. If the control leaves the menu, these fail.
 *
 * The other half of the job is the fence. A mark is stored as a counter, which
 * is right (CR 122.1 lets a permanent carry a counter of any kind) and is also
 * how a die could quietly become a rules object. So there are tests here that a
 * mark never reads as a rules counter, and that the storage prefix never
 * reaches a player's eyes — this codebase has already shipped a parser's tilde
 * onto the table once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import {
  adjustPlayerMark,
  cardCounter,
  clearPlayerMark,
  manualControlsFor,
  marksOn,
  rollDieOnCard,
  setPlayerMark,
} from './manual.ts';
import {
  DICE,
  MARK_LABEL_MAX,
  isPlayerMark,
  markKey,
  markLabel,
  markText,
  playerMarksOn,
  rulesCountersOn,
} from './marks.ts';
import type { CardInstance, GameAction, GameState } from './types.ts';

function game(): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
  state = addCard(
    state,
    {
      instanceId: 'bear',
      cardId: 'bear',
      name: 'Grizzly Bears',
      ownerId: 'p1',
      controllerId: 'p1',
      typeLine: 'Creature — Bear',
      oracleText: '',
      power: '2',
      toughness: '2',
    },
    'battlefield'
  );
  return state;
}

/** Dispatch a batch exactly the way `ManualPanel` does. */
function press(state: GameState, actions: GameAction[]): GameState {
  let next = state;
  for (const action of actions) next = applyAction(next, action);
  return next;
}

const bear = (state: GameState): CardInstance => state.cards.bear;

/** The log line a player reads for the most recent event. */
const lastLine = (state: GameState): string =>
  state.log[state.log.length - 1]?.message ?? '';

/* ------------------------------------------------------------------ *
 * A mark can be put on a permanent at all                            *
 * ------------------------------------------------------------------ */

test('a marker a player wrote lands on the permanent', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'sac at end', 1));

  const marks = marksOn(bear(state));
  assert.equal(marks.length, 1);
  assert.equal(marks[0].label, 'sac at end');
  assert.equal(marks[0].value, 1);
  assert.equal(marks[0].die, false);
});

test('a mark standing at one draws as its words, not as a tally', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'sac at end', 1));
  assert.equal(markText(marksOn(bear(state))[0]), 'sac at end');

  state = press(state, adjustPlayerMark('bear', 'sac at end', 2));
  assert.equal(markText(marksOn(bear(state))[0]), 'sac at end 3');
});

test('a die shows its face and nothing else', () => {
  let state = game();
  state = press(state, rollDieOnCard(bear(state), 20, 17));

  const [mark] = marksOn(bear(state));
  assert.equal(mark.die, true);
  assert.equal(mark.label, 'd20');
  assert.equal(markText(mark), '17');
});

test('rolling again replaces the face rather than adding to it', () => {
  let state = game();
  state = press(state, rollDieOnCard(bear(state), 20, 17));
  state = press(state, rollDieOnCard(bear(state), 20, 3));

  const marks = marksOn(bear(state));
  assert.equal(marks.length, 1, 'one die, not two');
  assert.equal(marks[0].value, 3);
});

test('every die offered has a label that reads back as a die', () => {
  for (const sides of DICE) {
    let state = game();
    state = press(state, rollDieOnCard(bear(state), sides, 1));
    const [mark] = marksOn(bear(state));
    assert.equal(mark.die, true, `d${sides} did not read back as a die`);
    assert.equal(mark.label, `d${sides}`);
  }
});

/* ------------------------------------------------------------------ *
 * The menu offers the way back off again                             *
 * ------------------------------------------------------------------ */

test('the menu offers no mark controls until there is a mark', () => {
  const state = game();
  const marks = manualControlsFor(state, bear(state)).filter(c => c.group === 'marks');
  assert.equal(marks.length, 0);
});

test('a mark on the card brings up, down and off into the menu', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'oil', 3));

  const controls = manualControlsFor(state, bear(state)).filter(c => c.group === 'marks');
  const ids = controls.map(c => c.id);
  assert.ok(ids.includes('mark+:oil'));
  assert.ok(ids.includes('mark-:oil'));
  assert.ok(ids.includes('mark:clear:oil'));
  assert.equal(controls[0].count, 3, 'the menu carries the current value');
});

test('pressing "take it off" through the menu removes the mark', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'oil', 3));

  const off = manualControlsFor(state, bear(state)).find(c => c.id === 'mark:clear:oil');
  assert.ok(off, 'nothing in the menu takes the mark off');
  state = press(state, off.actions);

  assert.equal(marksOn(bear(state)).length, 0);
  assert.equal(
    Object.values(bear(state).counters).filter(v => v !== 0).length,
    0,
    'a cleared mark leaves no zero behind'
  );
});

test('nudging a mark down to zero takes it off the card', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'oil', 1));
  const down = manualControlsFor(state, bear(state)).find(c => c.id === 'mark-:oil');
  assert.ok(down);
  state = press(state, down.actions);
  assert.equal(marksOn(bear(state)).length, 0);
});

/* ------------------------------------------------------------------ *
 * THE FENCE. A mark is a counter and must never read as a rules one  *
 * ------------------------------------------------------------------ */

test('a mark is not a rules counter, and a rules counter is not a mark', () => {
  let state = game();
  state = press(state, cardCounter('bear', '+1/+1', 2));
  state = press(state, rollDieOnCard(bear(state), 20, 11));

  const counters = bear(state).counters;
  assert.deepEqual(
    rulesCountersOn(counters).map(c => c.key),
    ['+1/+1'],
    'the die leaked into the rules counters'
  );
  assert.deepEqual(
    playerMarksOn(counters).map(m => m.label),
    ['d20'],
    'the +1/+1 counter leaked into the player marks'
  );
});

test('a mark does not change power or toughness the way a +1/+1 counter does', () => {
  let state = game();
  const before = `${bear(state).power}/${bear(state).toughness}`;
  state = press(state, setPlayerMark(bear(state), 'd20', 20));
  // The printed values are untouched, and nothing in `printed.ts` or `sba.ts`
  // reads a mark, because both ask for '+1/+1' and '-1/-1' by name.
  assert.equal(`${bear(state).power}/${bear(state).toughness}`, before);
  assert.equal(bear(state).counters['+1/+1'] ?? 0, 0);
});

test('a player cannot type a label that becomes a rules counter', () => {
  // The prefix is prepended, never matched, so even the exact name of a rules
  // counter stays fenced on the other side of it.
  const key = markKey('+1/+1');
  assert.ok(isPlayerMark(key));
  assert.equal(markLabel(key), '+1/+1');
  assert.notEqual(key, '+1/+1');
});

test('a label longer than the cap is cut once, at the source', () => {
  const long = 'x'.repeat(MARK_LABEL_MAX + 30);
  assert.equal(markLabel(markKey(long))?.length, MARK_LABEL_MAX);
  // And the same label written twice lands under one key rather than two.
  assert.equal(markKey(long), markKey(long + 'yyy'));
});

test('a blank label makes nothing at all', () => {
  const state = game();
  assert.deepEqual(setPlayerMark(bear(state), '   ', 1), []);
});

/* ------------------------------------------------------------------ *
 * THE STORAGE PREFIX NEVER REACHES A PLAYER                          *
 * ------------------------------------------------------------------ */

test('the log says what happened, without the storage prefix in it', () => {
  let state = game();

  state = press(state, setPlayerMark(bear(state), 'sac at end', 1));
  assert.equal(lastLine(state), 'Grizzly Bears marked sac at end.');

  state = press(state, adjustPlayerMark('bear', 'sac at end', 2));
  assert.equal(lastLine(state), 'Grizzly Bears: sac at end up to 3.');

  state = press(state, adjustPlayerMark('bear', 'sac at end', -1));
  assert.equal(lastLine(state), 'Grizzly Bears: sac at end down to 2.');

  state = press(state, clearPlayerMark(bear(state), 'sac at end'));
  assert.equal(lastLine(state), 'Grizzly Bears: sac at end taken off.');
});

test('a die is logged as the face it shows, not as the change to it', () => {
  let state = game();
  state = press(state, rollDieOnCard(bear(state), 20, 17));
  assert.equal(lastLine(state), 'Grizzly Bears: d20 showing 17.');

  // Rolling a 3 over a 17 is a delta of minus fourteen, and "minus fourteen on
  // a d20" is not a thing that happened at the table.
  state = press(state, rollDieOnCard(bear(state), 20, 3));
  assert.equal(lastLine(state), 'Grizzly Bears: d20 showing 3.');
});

test('an ordinary counter still logs the way it always did', () => {
  let state = game();
  state = press(state, cardCounter('bear', '+1/+1', 2));
  assert.equal(lastLine(state), 'Grizzly Bears +2 +1/+1 counters.');
});

test('no log line anywhere carries the storage prefix', () => {
  let state = game();
  state = press(state, rollDieOnCard(bear(state), 6, 4));
  state = press(state, setPlayerMark(bear(state), 'remember', 2));
  state = press(state, clearPlayerMark(bear(state), 'remember'));

  for (const entry of state.log) {
    assert.ok(
      !entry.message.includes('mark:'),
      `a storage prefix reached the table: ${entry.message}`
    );
  }
});

/* ------------------------------------------------------------------ *
 * It goes down the same path everything else does                    *
 * ------------------------------------------------------------------ */

test('a mark is undoable, because it is an ordinary logged action', () => {
  let state = game();
  const versionBefore = state.version;
  state = press(state, rollDieOnCard(bear(state), 20, 9));
  assert.ok(state.version > versionBefore, 'the mark did not bump the version');
  assert.equal(state.log[state.log.length - 1].type, 'CARD_COUNTER');
});

test('marks keep the order they were made in', () => {
  let state = game();
  state = press(state, setPlayerMark(bear(state), 'first', 1));
  state = press(state, rollDieOnCard(bear(state), 20, 5));
  state = press(state, setPlayerMark(bear(state), 'third', 1));
  // The rail on the mat draws left to right and the leftmost is the mark that
  // survives an overlapped row, so a stable order is what keeps a mark where
  // the player left it.
  assert.deepEqual(
    marksOn(bear(state)).map(m => m.label),
    ['first', 'd20', 'third']
  );

  state = press(state, adjustPlayerMark('bear', 'first', 4));
  assert.deepEqual(
    marksOn(bear(state)).map(m => m.label),
    ['first', 'd20', 'third'],
    'changing a mark moved it'
  );
});
