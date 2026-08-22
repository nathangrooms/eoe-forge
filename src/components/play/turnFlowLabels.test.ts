import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECISION_ACTION,
  DECISION_LABEL,
  OPENING_ACTION,
  OPENING_LABEL,
  decisionOwnsTheButton,
  waitingLine,
  type OpeningStop,
  type PlayDecision,
} from './turnFlow.ts';

const ALL: PlayDecision[] = [
  'main',
  'second-main',
  'attackers',
  'blockers',
  'manual',
  'respond',
];

/*
 * The moment this file exists for, measured on 22 Aug 2026 in a real bot game:
 *
 *   the big top-right button   "PLARGG AND NASSARI'S TURN", greyed out
 *   the line under the phases  "Plargg and Nassari has priority"
 *   the phase pill             "Declare Blockers"
 *
 * The game was waiting for the reader to declare blockers. Two of the three
 * loudest things on the page said the opponent was acting, and pressing the
 * biggest control did nothing.
 */

test('blocking is owed on somebody else’s turn, so the button cannot ask about turns', () => {
  assert.equal(decisionOwnsTheButton('blockers'), true);
  assert.equal(decisionOwnsTheButton('respond'), true);
  assert.equal(decisionOwnsTheButton('attackers'), true);
  assert.equal(decisionOwnsTheButton('manual'), true);
});

test('a main phase still resolves to END TURN, which is the right word there', () => {
  assert.equal(decisionOwnsTheButton('main'), false);
  assert.equal(decisionOwnsTheButton('second-main'), false);
  assert.equal(DECISION_ACTION.main, 'End turn');
  assert.equal(DECISION_ACTION['second-main'], 'End turn');
});

test('nothing owed leaves the button alone', () => {
  assert.equal(decisionOwnsTheButton(null), false);
});

test('the line says who the game is waiting for, from the reader’s side', () => {
  assert.equal(
    waitingLine({ over: false, decision: 'blockers', myTurn: false, activeName: 'Plargg' }),
    'The game is waiting for you',
    'this is the exact case that used to read "Plargg has priority"'
  );
  assert.equal(
    waitingLine({ over: false, decision: null, myTurn: false, activeName: 'Plargg' }),
    'Waiting on Plargg'
  );
  assert.equal(
    waitingLine({ over: false, decision: null, myTurn: true, activeName: 'You' }),
    'Your turn, nothing owed'
  );
  assert.equal(
    waitingLine({ over: true, decision: null, myTurn: true, activeName: 'You' }),
    'Game over'
  );
});

test('a seat with no name never puts the word undefined on screen', () => {
  assert.equal(
    waitingLine({ over: false, decision: null, myTurn: false, activeName: null }),
    'Waiting on another seat'
  );
});

test('every decision has both a description and a control label', () => {
  for (const decision of ALL) {
    assert.equal(typeof DECISION_LABEL[decision], 'string', decision);
    assert.ok(DECISION_LABEL[decision].length > 0, decision);
    assert.equal(typeof DECISION_ACTION[decision], 'string', decision);
    assert.ok(DECISION_ACTION[decision].length > 0, decision);
  }
});

test('a control label is short enough to be a button', () => {
  for (const decision of ALL) {
    assert.ok(
      DECISION_ACTION[decision].length <= 20,
      `${decision}: "${DECISION_ACTION[decision]}" is a sentence, not a button`
    );
  }
});

test('no control label is a player’s name or a turn', () => {
  for (const decision of ALL) {
    assert.ok(
      !/turn'?s?$/i.test(DECISION_ACTION[decision]) ||
        DECISION_ACTION[decision] === 'End turn',
      decision
    );
  }
});

/*
 * ---------------------------------------------------------------------------
 * THE OPENING HAND
 * ---------------------------------------------------------------------------
 * The same defect as the block above, one screen earlier, and worse. Measured
 * on 22 Aug 2026 driving the shipped page in a two-player bot game:
 *
 *   the mulligan bar   "Your opening hand. Keep it, or shuffle back"
 *   the status line    "Your turn, nothing owed"
 *   the big control    a live red END TURN
 *
 * Pressing END TURN froze that control on a disabled "Ending…" spinner, and
 * then pressing KEEP spent turn one before the reader ever saw it.
 *
 * The reducer has already started turn one under the mulligan, so `decisionFor`
 * cannot see this and `myTurn` is true. The fact is handed in instead.
 */

const OPENINGS: OpeningStop[] = ['keep-or-mulligan', 'bottom'];

test('an unanswered opening hand is the game waiting for you, not a quiet turn', () => {
  for (const opening of OPENINGS) {
    assert.equal(
      waitingLine({ over: false, decision: null, myTurn: true, activeName: 'You', opening }),
      'The game is waiting for you',
      opening
    );
  }
});

test('the opening hand never reads as "nothing owed", which is what invited END TURN', () => {
  for (const opening of OPENINGS) {
    assert.notEqual(
      waitingLine({ over: false, decision: null, myTurn: true, activeName: 'You', opening }),
      'Your turn, nothing owed',
      opening
    );
  }
});

test('a finished game still says so, even with an opening hand left set', () => {
  assert.equal(
    waitingLine({
      over: true,
      decision: null,
      myTurn: true,
      activeName: 'You',
      opening: 'keep-or-mulligan',
    }),
    'Game over'
  );
});

test('leaving the opening out changes nothing, so every existing caller is safe', () => {
  assert.equal(
    waitingLine({ over: false, decision: null, myTurn: true, activeName: 'You' }),
    'Your turn, nothing owed'
  );
  assert.equal(
    waitingLine({ over: false, decision: null, myTurn: true, activeName: 'You', opening: null }),
    'Your turn, nothing owed'
  );
});

test('the opening hand has a description and a button label, and neither says END TURN', () => {
  for (const opening of OPENINGS) {
    assert.ok(OPENING_LABEL[opening].length > 0, opening);
    assert.ok(OPENING_ACTION[opening].length > 0, opening);
    assert.ok(
      OPENING_ACTION[opening].length <= 20,
      `${opening}: "${OPENING_ACTION[opening]}" is a sentence, not a button`
    );
    assert.ok(!/end turn/i.test(OPENING_ACTION[opening]), opening);
    assert.ok(!/turn/i.test(OPENING_LABEL[opening]), opening);
  }
});
