/**
 * E6 — the watcher fold.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/watch.test.ts
 *
 * The property under test is not "does it count things". It is that the count
 * is a PURE FUNCTION OF THE ACTION LOG — no mutable observer, no state written
 * anywhere, and therefore identical on every client that replays the same log.
 * That is the whole reason this is a query rather than an XMage-style `Watcher`,
 * and the determinism tests at the bottom are the ones that keep it true.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../rules.ts';
import type { GameAction, GameState, Zone } from '../types.ts';
import type { WatchQuery } from '../../cards/abilities/dsl.ts';
import {
  EMPTY_WATCH_LOG,
  countWatched,
  deriveWatchLog,
  matchesSnapshot,
  observeAction,
  snapshotOf,
} from './watch.ts';
import { evalValue, makeContext } from './context.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function game(): GameState {
  const state = createGame({
    mode: 'full',
    format: 'commander',
    players: [{ name: 'Ana' }, { name: 'Ben' }],
    seed: 11,
  });
  return { ...state, status: 'playing' };
}

/** `addCard`'s third argument is authoritative for the zone, not the card object. */
function put(
  state: GameState,
  instanceId: string,
  ownerId: string,
  typeLine: string,
  zone: Zone
): GameState {
  return addCard(
    state,
    { instanceId, cardId: `c-${instanceId}`, name: instanceId, ownerId, typeLine, power: '2', toughness: '2' },
    zone
  );
}

function withCards(state: GameState): GameState {
  let next = put(state, 'bear', 'p1', 'Creature — Bear', 'battlefield');
  next = put(next, 'rock', 'p1', 'Artifact', 'battlefield');
  next = put(next, 'ogre', 'p2', 'Creature — Ogre', 'battlefield');
  return next;
}

/** Fold a list of actions and hand back both the final state and the log. */
function fold(state: GameState, actions: GameAction[]) {
  return { log: deriveWatchLog(state, actions, applyAction), final: actions.reduce(applyAction, state) };
}

const diedCreatures: WatchQuery = {
  event: { saw: 'died', what: { is: 'type', value: 'creature' } },
  window: 'this-turn',
  measure: 'events',
};

/* ------------------------------------------------------------------ *
 * The fold
 * ------------------------------------------------------------------ */

test('a creature moving from the battlefield to the graveyard is a death', () => {
  const state = withCards(game());
  const { log } = fold(state, [{ type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' }]);

  assert.equal(countWatched(diedCreatures, log, undefined), 1);
});

test('the same move from the HAND is not a death — the before-state is what decides', () => {
  // A discard and a destruction are the same action type. Only the zone the
  // card came from tells them apart, which is why `observeAction` takes the
  // state the action was applied to and not just the action.
  let state = withCards(game());
  state = put(state, 'inhand', 'p1', 'Creature — Human', 'hand');

  const { log } = fold(state, [{ type: 'MOVE_ZONE', instanceId: 'inhand', to: 'graveyard' }]);
  assert.equal(countWatched(diedCreatures, log, undefined), 0);
});

test('an artifact death does not count towards creatures — the filter is real', () => {
  const state = withCards(game());
  const { log } = fold(state, [{ type: 'MOVE_ZONE', instanceId: 'rock', to: 'graveyard' }]);
  assert.equal(countWatched(diedCreatures, log, undefined), 0);
});

test('a player selector narrows the count to that player\'s objects', () => {
  const state = withCards(game());
  const { log } = fold(state, [
    { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' },
    { type: 'MOVE_ZONE', instanceId: 'ogre', to: 'graveyard' },
  ]);

  assert.equal(countWatched(diedCreatures, log, undefined), 2, 'both, with no selector');
  assert.equal(countWatched(diedCreatures, log, ['p1']), 1, 'one, scoped to p1');
  assert.equal(countWatched(diedCreatures, log, ['p2']), 1, 'one, scoped to p2');
});

test('"events" and "amount" are different questions and answer differently', () => {
  const state = withCards(game());
  const { log } = fold(state, [{ type: 'DRAW', playerId: 'p1', count: 3 }]);

  const events: WatchQuery = { event: { saw: 'drew', by: { who: 'you' } }, window: 'this-turn', measure: 'events' };
  const amount: WatchQuery = { ...events, measure: 'amount' };

  assert.equal(countWatched(events, log, ['p1']), 1, 'one draw event');
  assert.equal(countWatched(amount, log, ['p1']), 3, 'three cards');
});

test('life gained and life lost are told apart by the sign of the delta', () => {
  const state = withCards(game());
  const { log } = fold(state, [
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 4 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: -2 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 0 },
  ]);

  const gained: WatchQuery = { event: { saw: 'gained-life' }, window: 'this-turn', measure: 'amount' };
  const lost: WatchQuery = { event: { saw: 'lost-life' }, window: 'this-turn', measure: 'amount' };

  assert.equal(countWatched(gained, log, ['p1']), 4);
  assert.equal(countWatched(lost, log, ['p1']), 2);
  assert.equal(
    countWatched({ ...gained, measure: 'events' }, log, ['p1']),
    1,
    'a zero-delta change is not an event at all',
  );
});

test('a land arriving from the hand is a land drop; one arriving from elsewhere is not', () => {
  let state = game();
  state = put(state, 'held-land', 'p1', 'Basic Land — Forest', 'hand');
  state = put(state, 'fetched-land', 'p1', 'Basic Land — Island', 'library');

  const query: WatchQuery = { event: { saw: 'land-played' }, window: 'this-turn', measure: 'events' };

  const played = fold(state, [{ type: 'PLAY', instanceId: 'held-land' }]);
  assert.equal(countWatched(query, played.log, ['p1']), 1);

  const fetched = fold(state, [{ type: 'MOVE_ZONE', instanceId: 'fetched-land', to: 'battlefield' }]);
  assert.equal(
    countWatched(query, fetched.log, ['p1']),
    0,
    'a fetch is not a land drop — counting it would make "if you played a land" true after a Crop Rotation',
  );
});

test('"this-turn" is a window, and last turn falls outside it', () => {
  const state = withCards(game());
  const { log } = fold(state, [
    { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' },
    { type: 'PASS_TURN' },
    { type: 'MOVE_ZONE', instanceId: 'ogre', to: 'graveyard' },
  ]);

  assert.equal(countWatched(diedCreatures, log, undefined), 1, 'only the death on the current turn');
  assert.equal(
    countWatched({ ...diedCreatures, window: 'this-game' }, log, undefined),
    2,
    'both, over the whole game',
  );
});

/* ------------------------------------------------------------------ *
 * Snapshots                                                          *
 * ------------------------------------------------------------------ */

test('a snapshot records only characteristics that do not move', () => {
  const state = withCards(game());
  const snapshot = snapshotOf(state.cards.bear);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.types, ['creature']);
  assert.deepEqual(snapshot.subtypes, ['bear']);
  assert.equal(snapshot.controllerId, 'p1');
  // Power, toughness, keywords and tapped state are absent BY DESIGN: they
  // change after the event and a remembered value would be a fabrication.
  assert.equal('power' in snapshot, false);
  assert.equal('keywords' in snapshot, false);
  assert.equal('tapped' in snapshot, false);
});

test('matchesSnapshot answers false for a predicate a snapshot cannot support', () => {
  // Which would be a silent under-count if such a filter could ever reach here.
  // It cannot: `isWatchableFilter` refuses to let the compiler build one.
  const state = withCards(game());
  const snapshot = snapshotOf(state.cards.bear)!;
  assert.equal(matchesSnapshot({ is: 'type', value: 'creature' }, snapshot), true);
  assert.equal(matchesSnapshot({ is: 'subtype', value: 'Bear' }, snapshot), true);
  assert.equal(matchesSnapshot({ is: 'tapped' }, snapshot), false);
  assert.equal(matchesSnapshot({ is: 'power', cmp: 'gte', value: 1 }, snapshot), false);
});

/* ------------------------------------------------------------------ *
 * Purity and determinism — the reason this is a fold                 *
 * ------------------------------------------------------------------ */

test('the fold mutates nothing: same input, same output, twice', () => {
  const state = withCards(game());
  const actions: GameAction[] = [
    { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' },
    { type: 'DRAW', playerId: 'p1', count: 2 },
    { type: 'LIFE_CHANGE', playerId: 'p2', delta: -3 },
  ];

  const first = deriveWatchLog(state, actions, applyAction);
  const second = deriveWatchLog(state, actions, applyAction);

  assert.deepEqual(first, second, 'two folds of one log are identical');
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(structuredClone(first), first, 'and the log is pure JSON');
});

test('observeAction returns a new log and leaves the one it was given alone', () => {
  const state = withCards(game());
  const before = { turn: state.turn, facts: [] as never[] };
  const action: GameAction = { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' };
  const after = applyAction(state, action);

  const next = observeAction(before, state, action, after);

  assert.equal(before.facts.length, 0, 'the input log is untouched — no mutable side channel');
  assert.equal(next.facts.length, 1);
  assert.notEqual(next, before);
});

test('two clients replaying the same log derive byte-identical facts', () => {
  // The property a mutable `Watcher` cannot give you, and the reason this
  // module exists in this shape.
  const state = withCards(game());
  const actions: GameAction[] = [
    { type: 'DRAW', playerId: 'p1', count: 1 },
    { type: 'MOVE_ZONE', instanceId: 'ogre', to: 'graveyard' },
    { type: 'CREATE_TOKEN', playerId: 'p1', token: { name: 'Treasure', typeLine: 'Token Artifact — Treasure' }, count: 2, instanceId: 'tk1' },
  ];

  const clientA = deriveWatchLog(state, actions, applyAction);
  // A second client that received the log one action at a time.
  let clientB = { turn: state.turn, facts: [] as never[] } as ReturnType<typeof deriveWatchLog>;
  let cursor = state;
  for (const action of actions) {
    const next = applyAction(cursor, action);
    clientB = observeAction(clientB, cursor, action, next);
    cursor = next;
  }

  assert.deepEqual(clientA, clientB);
});

/* ------------------------------------------------------------------ *
 * The honesty gate                                                   *
 * ------------------------------------------------------------------ */

test('HONEST SHORTFALL — with no log a watch value evaluates to 0, which is WRONG', () => {
  // Pinned deliberately. 0 is not a neutral answer here: "gain 1 life for each
  // creature that died this turn" would gain nothing after a board wipe and
  // read as a card that simply did not do much.
  //
  // Two guards keep that from being silent, and both have their own tests:
  // `runEffects` emits a note naming the query (to-actions), and
  // `unrunnableReason` refuses to let the ability engine own the card
  // (trigger-bridge). This assertion is the third leg — that the underlying
  // number really is wrong, so nobody later mistakes it for a safe default.
  const state = withCards(game());
  const withoutLog = makeContext(state, 'bear', 'p1');
  assert.equal(evalValue({ v: 'watch', query: diedCreatures }, withoutLog), 0);

  const { log } = fold(state, [{ type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' }]);
  const withLog = makeContext(state, 'bear', 'p1', { watch: log });
  assert.equal(evalValue({ v: 'watch', query: diedCreatures }, withLog), 1, 'and right once a log is supplied');
});

test('the empty log answers zero for everything without throwing', () => {
  assert.equal(countWatched(diedCreatures, EMPTY_WATCH_LOG, undefined), 0);
  assert.equal(countWatched({ ...diedCreatures, window: 'this-game' }, EMPTY_WATCH_LOG, ['p1']), 0);
});
