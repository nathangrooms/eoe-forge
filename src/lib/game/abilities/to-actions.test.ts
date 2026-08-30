/**
 * Unit tests for the effect interpreter.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/to-actions.test.ts
 *
 * Two properties are being defended here, and they are the whole point of the
 * module:
 *
 *  1. **An effect becomes ordinary actions.** Nothing mutates, nothing is
 *     decided by a clock or a random source, and the ids that are minted are
 *     derived from state. That is what lets a second client replay the same log
 *     and land on byte-identical state.
 *
 *  2. **The engine never silently does nothing.** Every decision it declines to
 *     make on a player's behalf comes back in `deferred`, and
 *     `resolveAbilityActions` turns each one into a `NOTE`. A large half of
 *     these tests assert that something was NOT done automatically — that half
 *     is the important one, because a card that half-resolved quietly is the
 *     original bug.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../rules.ts';
import type { GameAction, GameState, Zone } from '../types.ts';
import { makeContext } from './context.ts';
import { resolveAbilityActions, runEffects } from './to-actions.ts';
import type { Effect } from '../../cards/abilities/dsl.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: string;
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  zone?: Zone;
  tapped?: boolean;
  damage?: number;
}

function game(specs: Spec[], playerCount = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: Array.from({ length: playerCount }, (_, index) => ({ name: `P${index + 1}` })),
    seed: 3,
  });
  state = { ...state, status: 'playing' };

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Human',
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        keywords: spec.keywords,
        tapped: spec.tapped ?? false,
        damage: spec.damage ?? 0,
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

const OPTIONS = { at: 0, cause: 'Test Source', idPrefix: 'v1:0' };

function run(effects: Effect[], state: GameState, sourceId = 's', controllerId = 'p1') {
  return runEffects(effects, makeContext(state, sourceId, controllerId), OPTIONS);
}

/* ------------------------------------------------------------------ *
 * Life, damage and counters
 * ------------------------------------------------------------------ */

test('gain-life becomes a LIFE_CHANGE for the controller', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const { actions } = run([{ do: 'gain-life', who: { who: 'you' }, amount: 3 }], state);

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: 'LIFE_CHANGE', playerId: 'p1', delta: 3, at: 0, cause: 'Test Source' });
});

test('each opponent losing life produces one action per living opponent', () => {
  let state = game([{ id: 's', name: 'Source' }], 4);
  state = {
    ...state,
    players: state.players.map(p => (p.id === 'p4' ? { ...p, hasLost: true } : p)),
  };

  const { actions } = run([{ do: 'lose-life', who: { who: 'each-opponent' }, amount: 2 }], state);

  assert.deepEqual(
    actions.map(a => (a as { playerId: string }).playerId),
    ['p2', 'p3'],
    'a player who has left the game takes no more life loss'
  );
  assert.ok(actions.every(a => (a as { delta: number }).delta === -2));
});

test('an amount of zero produces no action at all', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  assert.deepEqual(run([{ do: 'gain-life', who: { who: 'you' }, amount: 0 }], state).actions, []);
});

test('damage to a player carries the source, so the log can say where it came from', () => {
  const state = game([{ id: 's', name: 'Bolt Source' }]);
  const { actions } = run([{ do: 'damage', to: { who: 'each-opponent' }, amount: 3 }], state);

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    type: 'DAMAGE',
    targetPlayerId: 'p2',
    amount: 3,
    sourcePlayerId: 'p1',
    sourceInstanceId: 's',
    at: 0,
    cause: 'Test Source',
  });
});

/*
 * These two used to assert the opposite, and the old assertions were the defect
 * written down: lethal damage was turned into a `MOVE_ZONE` here and non-lethal
 * damage produced no action at all. Both are CR 119.3 failures. Damage is
 * MARKED; whether the mark kills anything is CR 704.5g, checked by `sba.ts`
 * after every action. Marking inline meant two Shocks at a 4/4 killed nothing,
 * because neither was lethal on its own and nothing accumulated.
 */
test('lethal damage to a permanent is MARKED, and sba.ts decides what that kills', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'v', name: 'Victim', power: '1', toughness: '2' },
  ]);
  const ctx = makeContext(state, 's', 'p1', {
    targets: [{ kind: 'card', instanceId: 'v', zone: 'battlefield' }],
  });

  const { actions } = runEffects(
    [{ do: 'damage', to: { sel: 'target', ref: 0 }, amount: 2 }],
    ctx,
    OPTIONS
  );

  assert.deepEqual(actions, [
    {
      type: 'DAMAGE_CARD',
      instanceId: 'v',
      amount: 2,
      sourceInstanceId: 's',
      sourcePlayerId: 'p1',
      at: 0,
      cause: 'Test Source',
    },
  ]);
});

test('non-lethal damage to a permanent accumulates instead of being deferred', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'v', name: 'Victim', toughness: '5' },
  ]);
  const ctx = makeContext(state, 's', 'p1', {
    targets: [{ kind: 'card', instanceId: 'v', zone: 'battlefield' }],
  });

  const result = runEffects([{ do: 'damage', to: { sel: 'target', ref: 0 }, amount: 2 }], ctx, OPTIONS);

  assert.deepEqual(result.deferred, []);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'DAMAGE_CARD');
  assert.equal((result.actions[0] as { amount: number }).amount, 2);
});

test('an indestructible creature is not destroyed, and the log says why', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'v', name: 'Darksteel', keywords: ['indestructible'] },
  ]);

  const { actions } = run(
    [{ do: 'destroy', what: { sel: 'all', where: { is: 'name', value: 'Darksteel' } } }],
    state
  );

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'NOTE');
  assert.match((actions[0] as { message: string }).message, /indestructible/);
});

test('add-counters and remove-counters differ only in sign', () => {
  const state = game([{ id: 's', name: 'Source' }]);

  const added = run(
    [{ do: 'add-counters', what: { sel: 'self' }, counter: '+1/+1', count: 2 }],
    state
  ).actions[0];
  const removed = run(
    [{ do: 'remove-counters', what: { sel: 'self' }, counter: '+1/+1', count: 2 }],
    state
  ).actions[0];

  assert.equal((added as { delta: number }).delta, 2);
  assert.equal((removed as { delta: number }).delta, -2);
});

/* ------------------------------------------------------------------ *
 * Tokens and derived ids
 * ------------------------------------------------------------------ */

test('token ids are derived from the id prefix, never random', () => {
  // Two clients replaying the same log must mint the same token ids, or the
  // next zone change refers to a card that exists on only one of them.
  const state = game([{ id: 's', name: 'Source' }]);
  const effect: Effect = {
    do: 'create-token',
    who: { who: 'you' },
    token: { name: 'Soldier', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1' },
    count: 2,
  };

  const first = run([effect], state).actions;
  const second = run([effect], state).actions;

  assert.deepEqual(
    first.map(a => (a as { instanceId: string }).instanceId),
    ['v1:0-tk0', 'v1:0-tk1']
  );
  assert.deepEqual(first, second, 'the same inputs must mint the same ids');
});

test('each token is its own action, so replacement effects can multiply them', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const { actions } = run(
    [
      {
        do: 'create-token',
        who: { who: 'you' },
        token: { name: 'Soldier' },
        count: 3,
      },
    ],
    state
  );

  assert.equal(actions.length, 3);
  assert.ok(actions.every(a => (a as { count: number }).count === 1));
});

/* ------------------------------------------------------------------ *
 * Tap, untap, zones
 * ------------------------------------------------------------------ */

test('tapping an already-tapped permanent emits nothing', () => {
  const state = game([{ id: 's', name: 'Source', tapped: true }]);
  assert.deepEqual(run([{ do: 'tap', what: { sel: 'self' } }], state).actions, []);
});

test('untap emits only for permanents that are actually tapped', () => {
  const state = game([
    { id: 's', name: 'Source', tapped: true },
    { id: 'b', name: 'Other', tapped: false },
  ]);
  const { actions } = run([{ do: 'untap', what: { sel: 'all', where: { is: 'any' } } }], state);
  assert.deepEqual(actions, [{ type: 'UNTAP', instanceId: 's', at: 0, cause: 'Test Source' }]);
});

test('mill moves exactly N cards off the top of the library', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'l1', name: 'L1', zone: 'library' },
    { id: 'l2', name: 'L2', zone: 'library' },
    { id: 'l3', name: 'L3', zone: 'library' },
  ]);

  const { actions } = run([{ do: 'mill', who: { who: 'you' }, count: 2 }], state);
  assert.deepEqual(
    actions.map(a => (a as { instanceId: string }).instanceId),
    ['l1', 'l2']
  );
});

/* ------------------------------------------------------------------ *
 * Decisions the engine refuses to make
 * ------------------------------------------------------------------ */

test('discarding the whole hand is forced, so it is applied', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'h1', name: 'H1', zone: 'hand' },
  ]);
  const result = run([{ do: 'discard', who: { who: 'you' }, count: 2 }], state);

  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.deferred, [], 'no choice existed, so nothing to defer');
});

test('discarding fewer cards than are held is a DECISION, not a guess', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'h1', name: 'H1', zone: 'hand' },
    { id: 'h2', name: 'H2', zone: 'hand' },
  ]);
  const result = run([{ do: 'discard', who: { who: 'you' }, count: 1 }], state);

  assert.deepEqual(result.actions, [], 'the engine must not pick the card');
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /discards 1 card/);
});

test('"you may" is never taken automatically', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const result = run(
    [
      {
        do: 'may',
        who: { who: 'you' },
        text: 'you may gain 2 life',
        effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 2 }],
      },
    ],
    state
  );

  assert.deepEqual(result.actions, [], '"you may" is the player\'s word, not ours');
  assert.equal(result.deferred.length, 1);
});

test('a modal spell defers the mode choice but runs when every mode is chosen', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const modes = [
    { text: 'gain 1 life', effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 1 }] as Effect[] },
    { text: 'draw a card', effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }] as Effect[] },
  ];

  const choose = run([{ do: 'choose-mode', min: 1, max: 1, modes }], state);
  assert.deepEqual(choose.actions, []);
  assert.equal(choose.deferred.length, 1);

  const all = run([{ do: 'choose-mode', min: 2, max: 2, modes }], state);
  assert.equal(all.actions.length, 2, 'choosing all of them is not a choice');
  assert.deepEqual(all.deferred, []);
});

test('a {do:"manual"} clause reaches the player verbatim', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const result = run(
    [{ do: 'manual', text: 'Then shuffle your graveyard into your library.', hint: 'unmodelled' }],
    state
  );

  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.deferred, [
    'Then shuffle your graveyard into your library. (unmodelled)',
  ]);
});

test('a pump builds a continuous effect that carries its own expiry', () => {
  /*
   * This used to assert that a pump was NAMED and never performed, because
   * `GameState` had no list to hold a duration-limited continuous effect and a
   * permanent stat change that never wore off would have been worse than
   * nothing. The list exists now (`GameState.timedEffects`), so the assertion
   * flips: an `ADD_CONTINUOUS` action, with an expiry the layer pass reads.
   */
  const state = game([{ id: 's', name: 'Source' }]);
  const result = run(
    [{ do: 'pump', what: { sel: 'self' }, power: 2, toughness: 2, duration: 'end-of-turn' }],
    state
  );

  assert.deepEqual(result.deferred, []);
  assert.equal(result.actions.length, 1);
  const action = result.actions[0] as { type: string; effect: { expiry: { kind: string }; note?: string } };
  assert.equal(action.type, 'ADD_CONTINUOUS');
  assert.equal(action.effect.expiry.kind, 'end-of-turn');
  assert.match(action.effect.note ?? '', /\+2\/\+2/);
});

test('a pump that finds nothing to pump still says so', () => {
  // CR 608.2 do-as-much-as-you-can. A spell that resolved and found no legal
  // recipient is a real event, and the log has to show it.
  const state = game([{ id: 's', name: 'Source' }]);
  const result = run(
    [
      {
        do: 'pump',
        what: { sel: 'all', where: { is: 'name', value: 'Nothing Named This' } },
        power: 2,
        toughness: 2,
        duration: 'end-of-turn',
      },
    ],
    state
  );

  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
});

/* ------------------------------------------------------------------ *
 * Control flow
 * ------------------------------------------------------------------ */

test('if/else takes exactly one branch', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const effect: Effect = {
    do: 'if',
    condition: { if: 'value', a: 1, cmp: 'eq', b: 1 },
    then: [{ do: 'gain-life', who: { who: 'you' }, amount: 1 }],
    else: [{ do: 'gain-life', who: { who: 'you' }, amount: 99 }],
  };

  const { actions } = run([effect], state);
  assert.equal(actions.length, 1);
  assert.equal((actions[0] as { delta: number }).delta, 1);
});

test('for-each over a selector binds {sel:"each"} to one permanent at a time', () => {
  const state = game([
    { id: 's', name: 'Source', owner: 'p1' },
    { id: 'a', name: 'A', owner: 'p1' },
  ]);

  const { actions } = run(
    [
      {
        do: 'for-each',
        over: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' } },
        effects: [{ do: 'add-counters', what: { sel: 'each' }, counter: '+1/+1', count: 1 }],
      },
    ],
    state
  );

  assert.deepEqual(
    actions.map(a => (a as { instanceId: string }).instanceId),
    ['s', 'a']
  );
});

test('repeat is capped, so a miscompiled count cannot hang a browser tab', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const result = run(
    [{ do: 'repeat', times: 1000, effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 1 }] }],
    state
  );

  assert.equal(result.actions.length, 64);
  assert.equal(result.deferred.length, 1, 'and the cap is reported rather than hidden');
});

test('an unhandled effect member throws instead of doing nothing', () => {
  // tsconfig.app.json sets "strict": false, so a missing case does not reliably
  // fail to compile. Throwing turns it into a failing test rather than a card
  // that quietly did nothing.
  const state = game([{ id: 's', name: 'Source' }]);
  assert.throws(
    () => run([{ do: 'not-a-real-effect' } as never], state),
    /unhandled effect/
  );
});

/* ------------------------------------------------------------------ *
 * The honesty invariant
 * ------------------------------------------------------------------ */

test('resolveAbilityActions emits a NOTE for every deferred decision', () => {
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'h1', name: 'H1', zone: 'hand' },
    { id: 'h2', name: 'H2', zone: 'hand' },
  ]);

  const actions = resolveAbilityActions(
    [
      { do: 'gain-life', who: { who: 'you' }, amount: 2 },
      { do: 'discard', who: { who: 'you' }, count: 1 },
    ],
    makeContext(state, 's', 'p1'),
    { ...OPTIONS, sourceInstanceId: 's' }
  );

  assert.equal(actions.length, 2, 'the automated half runs AND the rest is announced');
  assert.equal(actions[0].type, 'LIFE_CHANGE');
  assert.equal(actions[1].type, 'NOTE');
  assert.match((actions[1] as { message: string }).message, /not resolved automatically/);
});

test('there is no path that resolves a manual clause without saying so', () => {
  // The whole promise in one assertion: a card either resolves completely, or
  // visibly carries a marker. There is no third state.
  const state = game([{ id: 's', name: 'Source' }]);

  const actions = resolveAbilityActions(
    [{ do: 'manual', text: 'Exile it instead.' }],
    makeContext(state, 's', 'p1'),
    { ...OPTIONS, sourceInstanceId: 's' }
  );

  assert.ok(actions.length > 0, 'an ability must never resolve to complete silence');
  assert.ok(actions.some(a => a.type === 'NOTE'));
  assert.ok(
    actions.some(a => (a as { message?: string }).message?.includes('Exile it instead.')),
    'the unhandled clause reaches the player verbatim'
  );
});

test('an ability that does nothing at all still says it happened', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const actions = resolveAbilityActions(
    [{ do: 'gain-life', who: { who: 'you' }, amount: 0 }],
    makeContext(state, 's', 'p1'),
    { ...OPTIONS, sourceInstanceId: 's' }
  );

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'NOTE');
});

/* ------------------------------------------------------------------ *
 * End to end through the real reducer
 * ------------------------------------------------------------------ */

test('the actions an effect produces are accepted by the reducer unchanged', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const { actions } = run(
    [
      { do: 'gain-life', who: { who: 'you' }, amount: 3 },
      { do: 'add-counters', what: { sel: 'self' }, counter: '+1/+1', count: 1 },
    ],
    state
  );

  const after = actions.reduce<GameState>((current, action) => applyAction(current, action), state);

  assert.equal(after.players[0].life, 43);
  assert.equal(after.cards.s.counters['+1/+1'], 1);
  assert.ok(after.version > state.version, 'every effect action is logged');
});

test('replaying the same effect actions twice lands on identical state', () => {
  // The scaling argument in one test: a game is a seed plus an action log, so
  // two clients folding the same list must agree byte for byte.
  const state = game([{ id: 's', name: 'Source' }]);
  const effects: Effect[] = [
    { do: 'gain-life', who: { who: 'you' }, amount: 3 },
    { do: 'draw', who: { who: 'each-player' }, count: 1 },
    {
      do: 'create-token',
      who: { who: 'you' },
      token: { name: 'Soldier', power: '1', toughness: '1' },
      count: 2,
    },
  ];

  const fold = (): GameState => {
    const produced: GameAction[] = run(effects, state).actions;
    return produced.reduce<GameState>((current, action) => applyAction(current, action), state);
  };

  assert.equal(JSON.stringify(fold()), JSON.stringify(fold()));
});

/* ------------------------------------------------------------------ *
 * The four DSL extensions, on the honesty side
 *
 * Each of these asserts that something was NOT done, and says what the player
 * is told instead. That is the half of this file that matters: a new effect
 * member that quietly produces no actions and no note is indistinguishable
 * from a card that never resolved.
 * ------------------------------------------------------------------ */

test('E6: a watch value with no folded log is NAMED, not quietly answered as 0', () => {
  // The number really is 0 (asserted in watch.test.ts) and 0 really is wrong.
  // This is the guard that stops it being silent: the query is reported before
  // any effect computed from it runs.
  const state = game([{ id: 's', name: 'Source' }]);
  const effects: Effect[] = [
    {
      do: 'draw',
      who: { who: 'you' },
      count: {
        v: 'watch',
        query: {
          event: { saw: 'died', what: { is: 'type', value: 'creature' } },
          window: 'this-turn',
          measure: 'events',
        },
      },
    },
  ];

  const { actions, deferred } = run(effects, state);
  assert.equal(actions.length, 0, 'nothing is drawn, because the count evaluated to 0');
  assert.ok(
    deferred.some(line => line.includes('needs turn history') && line.includes('died')),
    `the query must be named verbatim; got ${JSON.stringify(deferred)}`
  );
});

test('E6: with a log supplied there is no note and the real number is used', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const log = {
    turn: state.turn,
    facts: [
      { seq: 0, turn: state.turn, kind: 'died' as const, playerId: 'p1', amount: 1,
        object: { instanceId: 'x', name: 'X', types: ['creature'], subtypes: [], supertypes: [], colors: [], manaValue: 1, controllerId: 'p1', isToken: false, isCommander: false } },
    ],
  };
  const ctx = makeContext(state, 's', 'p1', { watch: log });
  const { actions, deferred } = runEffects(
    [
      {
        do: 'draw',
        who: { who: 'you' },
        count: {
          v: 'watch',
          query: { event: { saw: 'died', what: { is: 'type', value: 'creature' } }, window: 'this-turn', measure: 'events' },
        },
      },
    ],
    ctx,
    OPTIONS
  );

  assert.deepEqual(deferred, [], 'no note once the question can be answered');
  assert.equal(actions.length, 1);
  assert.equal((actions[0] as { count?: number }).count, 1);
});

test('E4: unless-pays runs neither branch and says what is owed and what is at stake', () => {
  // Running the effects resolves Rhystic Study as though every opponent always
  // declined. Skipping them resolves it as though they always paid. Both are
  // wrong, so neither happens.
  const state = game([{ id: 's', name: 'Source' }]);
  const effects: Effect[] = [
    {
      do: 'unless-pays',
      who: { who: 'trigger-player' },
      cost: [{ pay: 'mana', cost: '{1}' }],
      effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }],
    },
  ];

  const { actions, deferred } = run(effects, state);
  assert.equal(actions.length, 0, 'no card is drawn and no cost is charged');
  assert.ok(deferred.some(line => line.includes('may pay {1}')), 'the cost is quoted');
  assert.ok(deferred.some(line => line.includes('if not paid')), 'and so is the consequence');
});

test('E4: an unbound "that player" is reported as unidentified, never as everybody', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const { deferred } = run(
    [
      {
        do: 'unless-pays',
        who: { who: 'trigger-player' },
        cost: [{ pay: 'mana', cost: '{2}' }],
        effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 1 }],
      },
    ],
    state
  );
  assert.ok(
    deferred.some(line => line.includes('never identified')),
    `an unbound trigger player must say so; got ${JSON.stringify(deferred)}`
  );
});

test('E4: a bound trigger player is named, and only that one player', () => {
  const state = game([{ id: 's', name: 'Source' }], 3);
  const ctx = makeContext(state, 's', 'p1', { triggerPlayerId: 'p2' });
  const { deferred } = runEffects(
    [
      {
        do: 'unless-pays',
        who: { who: 'trigger-player' },
        cost: [{ pay: 'mana', cost: '{2}' }],
        effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 1 }],
      },
    ],
    ctx,
    OPTIONS
  );
  assert.ok(deferred[0].startsWith('P2 may pay {2}'), deferred[0]);
  assert.equal(deferred[0].includes('P3'), false, 'one opponent, not the table');
});

test('E8: the ACTION carries the spend restriction and the computed count', () => {
  /*
   * This test used to assert a note, and the note had to say "{G}{G}{G}" and
   * quote the restriction because acting on a wrong note is the same failure as
   * saying nothing, one step later. Both facts still have to survive; they
   * survive into an action now instead of a sentence, because there is a mana
   * pool to put them in.
   *
   * Battle Hymn is the real card: "Add {R} for each creature you control."
   */
  const state = game([
    { id: 's', name: 'Source' },
    { id: 'c1', name: 'Creature One' },
    { id: 'c2', name: 'Creature Two' },
  ]);

  const { actions, deferred } = run(
    [
      {
        do: 'add-mana',
        who: { who: 'you' },
        mana: '{G}',
        count: { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' } },
        restriction: { spendOn: 'cast', what: { is: 'type', value: 'creature' }, text: 'spend this mana only to cast a creature spell' },
      },
    ],
    state
  );

  assert.deepEqual(deferred, []);
  assert.equal(actions.length, 1);
  const added = actions[0] as { type: string; mana: string; restriction?: string };
  assert.equal(added.type, 'ADD_MANA');
  assert.equal(added.mana, '{G}{G}{G}', 'three creatures on the board, three red');
  assert.equal(added.restriction, 'spend this mana only to cast a creature spell');
});

test('E8: zero copies of mana adds nothing and says nothing', () => {
  const state = game([{ id: 's', name: 'Source', typeLine: 'Artifact' }]);
  const { actions, deferred } = run(
    [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}', count: { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' } } }],
    state
  );
  assert.deepEqual(deferred, []);
  assert.deepEqual(actions, [], 'no creatures, so no mana, not one');
});
