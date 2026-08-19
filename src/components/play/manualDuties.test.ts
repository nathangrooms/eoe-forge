/**
 * The Aether Vial report, from the engine to the moment the board stops.
 *
 *   node --test --experimental-strip-types src/components/play/manualDuties.test.ts
 *
 * Owner: *"I also have an artifact in play, which says at beginning of my
 * upkeep I can place a charge counter (Aether Vial) — no way to do this."*
 *
 * The engine was never wrong about this card. `automationFor` reads the upkeep
 * trigger out of its oracle text and correctly reports that it will not resolve
 * it. What was missing was the two things a player needs: to be told, and to be
 * given the time to act. This drives both.
 *
 * The second half matters as much as the first. `/play` walks a step every
 * 130 ms whenever no decision is owed, and an upkeep trigger has no moment of
 * its own — nothing enters, nothing dies, nothing lands in the feed — so a
 * marker with no stop behind it would have flashed past before it could be
 * read. `decisionFor` returning 'manual' is what holds the step open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from '../../lib/game/rules.ts';
import { advanceActions } from '../../lib/game/moves.ts';
import { manualDutiesFor, cardCounter } from '../../lib/game/manual.ts';
import { automationFor } from '../../lib/game/effects.ts';
import type { GameState, PlayerId, Step } from '../../lib/game/types.ts';
import { decisionFor } from './turnFlow.ts';

const ME: PlayerId = 'p1';

const VIAL_TEXT =
  'At the beginning of your upkeep, you may put a charge counter on Aether Vial.\n' +
  '{T}: You may put a creature card with mana value equal to the number of ' +
  'charge counters on Aether Vial from your hand onto the battlefield.';

function board(options: { vial?: boolean; bear?: boolean } = {}): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
  });

  if (options.vial !== false) {
    state = addCard(
      state,
      {
        instanceId: 'vial',
        cardId: 'vial',
        name: 'Aether Vial',
        ownerId: ME,
        controllerId: ME,
        typeLine: 'Artifact',
        manaCost: '{1}',
        cmc: 1,
        counters: {},
        tapped: false,
        summoningSick: false,
        oracleText: VIAL_TEXT,
      },
      'battlefield'
    );
  }

  /* Something to draw. Without a library both seats lose to the draw step, the
     game ends, and every walk below stops one step in. */
  for (const owner of ['p1', 'p2'] as PlayerId[]) {
    for (let i = 0; i < 12; i++) {
      state = addCard(
        state,
        {
          instanceId: `${owner}-lib${i}`,
          cardId: 'forest',
          name: 'Forest',
          ownerId: owner,
          controllerId: owner,
          typeLine: 'Basic Land — Forest',
          counters: {},
          tapped: false,
          summoningSick: false,
          oracleText: '({T}: Add {G}.)',
        },
        'library'
      );
    }
  }

  if (options.bear) {
    state = addCard(
      state,
      {
        instanceId: 'bear',
        cardId: 'bear',
        name: 'Grizzly Bears',
        ownerId: ME,
        controllerId: ME,
        typeLine: 'Creature — Bear',
        power: '2',
        toughness: '2',
        counters: {},
        tapped: false,
        summoningSick: false,
        oracleText: '',
      },
      'battlefield'
    );
  }

  return state;
}

/** Walk the turn to a named step the way the page walks it. */
function walkTo(state: GameState, step: Step): GameState {
  let current = state;
  for (let i = 0; i < 24 && current.step !== step; i++) {
    current = applyActions(current, advanceActions(current, i));
  }
  assert.equal(current.step, step, `could not reach ${step}`);
  return current;
}

/* -------------------------------------------------------------------------- */

test('the engine already knows Aether Vial has a trigger it will not run', () => {
  const automation = automationFor(board().cards.vial);
  assert.equal(automation.needsManual, true, 'so the card must carry a marker');
  const upkeep = automation.triggers.find(trigger => trigger.timing === 'upkeep');
  assert.ok(upkeep, 'and the trigger it detected is an upkeep one');
  assert.equal(upkeep.automated, false, 'that the engine declines to resolve');
});

test('the upkeep is where the duty shows up, and only there', () => {
  const state = board();
  assert.deepEqual(manualDutiesFor(walkTo(state, 'untap'), ME), []);
  assert.equal(manualDutiesFor(walkTo(state, 'upkeep'), ME).length, 1);
  assert.deepEqual(manualDutiesFor(walkTo(state, 'precombat_main'), ME), []);
});

test('the duty names the card and quotes what has to happen', () => {
  const [duty] = manualDutiesFor(walkTo(board(), 'upkeep'), ME);
  assert.equal(duty.card.name, 'Aether Vial');
  assert.equal(duty.timing, 'upkeep');
  assert.match(duty.clause, /charge counter/i);
});

/*
 * Found by playing rather than by reading: the upkeep strip on the mat read
 * "you may put a charge counter on ~". The tilde is normalize.ts standing in
 * for the card's own name so one pattern matches every printing, and it has no
 * business in the sentence a player is being asked to act on.
 */
test('the clause reads as English, with no compiler notation left in it', () => {
  const [duty] = manualDutiesFor(walkTo(board(), 'upkeep'), ME);
  assert.doesNotMatch(duty.clause, /~/, 'a tilde is a parser detail, not a sentence');
  assert.match(duty.clause, /Aether Vial/, 'the name goes back where the tilde was');
});

test('a vanilla board owes nothing, so nothing is drawn', () => {
  const state = walkTo(board({ vial: false, bear: true }), 'upkeep');
  assert.deepEqual(manualDutiesFor(state, ME), []);
});

test('it is not the other seat’s job', () => {
  const state = walkTo(board(), 'upkeep');
  assert.deepEqual(
    manualDutiesFor(state, 'p2'),
    [],
    'your upkeep trigger is not the opponent’s to resolve'
  );
});

test('the board STOPS on the upkeep rather than walking past it', () => {
  const state = walkTo(board(), 'upkeep');
  assert.equal(
    decisionFor(state, ME),
    'manual',
    'a 130 ms auto-walk would otherwise have taken the step before it was read'
  );
});

test('an upkeep with nothing to do is still walked straight past', () => {
  const state = walkTo(board({ vial: false, bear: true }), 'upkeep');
  assert.equal(
    decisionFor(state, ME),
    null,
    'stopping every upkeep would be the click-through gate the owner rejected'
  );
});

test('the player can actually do it, and the game records that they did', () => {
  const state = walkTo(board(), 'upkeep');
  const after = applyActions(state, cardCounter('vial', 'charge', 1, 1));
  assert.equal(after.cards.vial.counters.charge, 1);
  assert.ok(
    after.log.some(entry => /charge/i.test(entry.message)),
    'a hand-placed counter goes in the log like any other, or the feed is a lie'
  );
});

test('the duty comes back next upkeep, because the trigger happens again', () => {
  const first = walkTo(board(), 'upkeep');
  const resolved = applyActions(first, cardCounter('vial', 'charge', 1, 1));
  // Round the turn back to this seat's next upkeep.
  let next = resolved;
  for (let i = 0; i < 60; i++) {
    next = applyActions(next, advanceActions(next, i));
    if (next.step === 'upkeep' && next.activePlayerId === ME && next.turn > resolved.turn) break;
  }
  assert.equal(next.step, 'upkeep');
  assert.equal(next.activePlayerId, ME);
  assert.equal(manualDutiesFor(next, ME).length, 1, 'every turn, not once');
});
