/**
 * Unit tests for replacement effects (CR 614) — ordering and the once-only rule.
 *
 *   node --test --experimental-strip-types src/lib/game/replacement.test.ts
 *
 * Two rules carry this file, because they are the two a naive implementation
 * gets wrong:
 *
 *   1. **Once each (CR 614.5).** "If you would draw a card, draw two instead"
 *      produces another draw. A loop over applicable effects that re-checks
 *      from scratch will apply it again, and again. The marker that stops it
 *      lives on the action, so it survives the trip through the reducer and
 *      through a replay.
 *   2. **Order is a choice (CR 616.1).** Prevent-then-double and
 *      double-then-prevent give different answers, so the order cannot be
 *      invented by the engine — it travels in the action. Absent a choice the
 *      fallback is total and deterministic, which is tested too, because a
 *      client that never prompts must not diverge from one that does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import {
  activeReplacements,
  chooseReplacement,
  entersTapped,
  entersWithCounters,
  eventForAction,
  pendingReplacementChoice,
  preventDamage,
  redirectDamage,
  replaceAction,
  replaceDraw,
  scaleCounterPlacement,
  scaleDamage,
  scaleDraw,
} from './replacement.ts';
import type { GameAction, GameState, PlayerId, ReplacementEffect } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function game(): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });

  for (const player of ['p1', 'p2'] as const) {
    for (let i = 0; i < 20; i++) {
      state = addCard(
        state,
        {
          instanceId: `${player}-lib${i}`,
          cardId: 'filler',
          name: `Filler ${i}`,
          ownerId: player,
          typeLine: 'Creature — Human',
        },
        'library'
      );
    }
  }
  return state;
}

function withCard(
  state: GameState,
  id: string,
  options: { owner?: PlayerId; typeLine?: string; zone?: 'hand' | 'battlefield' } = {}
): GameState {
  return addCard(
    state,
    {
      instanceId: id,
      cardId: id,
      name: id,
      ownerId: options.owner ?? 'p1',
      typeLine: options.typeLine ?? 'Creature — Bear',
      oracleText: '',
    },
    options.zone ?? 'hand'
  );
}

const register = (state: GameState, ...effects: ReplacementEffect[]): GameState =>
  applyActions(
    state,
    effects.map(effect => ({ type: 'ADD_REPLACEMENT', effect }) as GameAction)
  );

const lifeOf = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.life ?? 0;
const handSize = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.zones.hand.length ?? 0;
const messages = (state: GameState): string[] => state.log.map(entry => entry.message);
const said = (state: GameState, fragment: string): boolean =>
  messages(state).some(message => message.toLowerCase().includes(fragment.toLowerCase()));

/* ------------------------------------------------------------------ *
 * Nothing registered changes nothing
 * ------------------------------------------------------------------ */

test('with no replacement effects registered, events happen exactly as before', () => {
  let state = game();
  assert.deepEqual(state.replacements, []);
  assert.equal(replaceAction(state, { type: 'DRAW', playerId: 'p1', count: 1 }), null);

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 1);
});

test('an action that is not a replaceable event is left alone', () => {
  const state = game();
  assert.equal(eventForAction(state, { type: 'SHUFFLE', playerId: 'p1' }), null);
  assert.equal(eventForAction(state, { type: 'SET_MONARCH', playerId: 'p1' }), null);
  assert.equal(eventForAction(state, { type: 'CARD_COUNTER', instanceId: 'x', counter: 'a', delta: -1 }), null);
});

/* ------------------------------------------------------------------ *
 * The once-only rule (CR 614.5)
 * ------------------------------------------------------------------ */

test('CR 614.5 — a draw-doubler applies once, not forever', () => {
  let state = game();
  state = register(state, scaleDraw('archive', "Alhammarret's Archive", 'p1', { multiply: 2 }));

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 2, 'doubled once — a re-check loop would never stop');
});

test('the once-only marker is what stops it, and it rides on the action', () => {
  let state = game();
  state = register(state, scaleDraw('archive', "Alhammarret's Archive", 'p1', { multiply: 2 }));

  const first = replaceAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.ok(first);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].replacedBy, ['archive']);

  // Feed the *output* back in: the effect is spent for this event.
  assert.equal(replaceAction(state, first[0]), null);
});

test('two draw-doublers each get exactly one bite: one card becomes four', () => {
  let state = game();
  state = register(
    state,
    scaleDraw('a-archive', 'Archive', 'p1', { multiply: 2 }),
    scaleDraw('b-thassa', 'Thassa Bident', 'p1', { multiply: 2 })
  );

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 4, '2 then 2 — not 2, and not an infinite loop');
});

test('the marker is inherited by whatever an "instead" produced', () => {
  let state = game();
  // "If you would draw a card, instead draw a card." A self-referential
  // replacement is exactly the shape that hangs a naive implementation.
  state = register(
    state,
    replaceDraw('loop', 'Looping Effect', 'p1', [{ type: 'DRAW', playerId: 'p1', count: 1 }])
  );

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 1, 'it resolved once and stopped');
});

test('an effect only applies to the player it names', () => {
  let state = game();
  state = register(state, scaleDraw('archive', 'Archive', 'p1', { multiply: 2 }));

  state = applyAction(state, { type: 'DRAW', playerId: 'p2', count: 1 });
  assert.equal(handSize(state, 'p2'), 1);
  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 2);
});

/* ------------------------------------------------------------------ *
 * Ordering (CR 616.1) — the affected player chooses
 * ------------------------------------------------------------------ */

/** A shield and a doubler, aimed at the same player. Order changes the answer. */
function shieldAndDoubler(): ReplacementEffect[] {
  return [
    preventDamage('a-shield', 'Shield', { playerId: 'p2' }, 2),
    scaleDamage('b-double', 'Furnace', { playerId: 'p2' }, { multiply: 2 }),
  ];
}

test('CR 616.1 — the affected player orders the effects, and the order matters', () => {
  const base = register(game(), ...shieldAndDoubler());

  // Shield first: 4 - 2 = 2, doubled = 4.
  const shieldFirst = applyAction(base, {
    type: 'DAMAGE',
    targetPlayerId: 'p2',
    amount: 4,
    replacementOrder: ['a-shield', 'b-double'],
  });
  assert.equal(lifeOf(shieldFirst, 'p2'), 36);

  // Doubler first: 4 * 2 = 8, minus 2 = 6.
  const doubleFirst = applyAction(base, {
    type: 'DAMAGE',
    targetPlayerId: 'p2',
    amount: 4,
    replacementOrder: ['b-double', 'a-shield'],
  });
  assert.equal(lifeOf(doubleFirst, 'p2'), 34);

  assert.notEqual(lifeOf(shieldFirst, 'p2'), lifeOf(doubleFirst, 'p2'), 'order is not cosmetic');
});

test('without a stated order the fallback is total, and identical every time', () => {
  const base = register(game(), ...shieldAndDoubler());
  const action: GameAction = { type: 'DAMAGE', targetPlayerId: 'p2', amount: 4 };

  const a = applyAction(base, action);
  const b = applyAction(base, action);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // Id order: 'a-shield' before 'b-double'.
  assert.equal(lifeOf(a, 'p2'), 36);
});

test('the fallback order does not depend on registration order', () => {
  const forwards = register(game(), ...shieldAndDoubler());
  const backwards = register(game(), ...shieldAndDoubler().slice().reverse());
  const action: GameAction = { type: 'DAMAGE', targetPlayerId: 'p2', amount: 4 };

  assert.equal(lifeOf(applyAction(forwards, action), 'p2'), lifeOf(applyAction(backwards, action), 'p2'));
});

test('CR 614.13 — a self-replacement effect goes first, whatever its id sorts to', () => {
  let state = withCard(game(), 'walker', { typeLine: 'Creature — Elemental' });
  state = register(
    state,
    // Deliberately named so plain id order would run the doubler first.
    scaleCounterPlacement('a-doubling-season', 'Doubling Season', { counter: '+1/+1' }, { multiply: 2 }),
    {
      ...entersWithCounters('z-self', 'Walker', 'walker', '+1/+1', 1),
      // Doubling Season watches the *entering* event too.
    },
    {
      id: 'a-enters-doubler',
      name: 'Doubling Season',
      event: 'enters',
      apply: { op: 'scale-counters', multiply: 2 },
    }
  );

  state = applyAction(state, { type: 'PLAY', instanceId: 'walker', to: 'battlefield' });

  // Self-replacement puts one counter on, then the doubler doubles it.
  // Doubler-first would have doubled nothing and left a single counter.
  assert.equal(state.cards.walker.counters['+1/+1'], 2);
});

test('chooseReplacement is a pure total order, and it is stable', () => {
  const effects = shieldAndDoubler();
  assert.equal(chooseReplacement(effects)?.id, 'a-shield');
  assert.equal(chooseReplacement(effects, ['b-double'])?.id, 'b-double');
  assert.equal(chooseReplacement(effects.slice().reverse())?.id, 'a-shield');
  assert.equal(chooseReplacement([]), undefined);
});

test('a UI is told when there is a choice to make, and when there is not', () => {
  const two = register(game(), ...shieldAndDoubler());
  const choice = pendingReplacementChoice(two, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 4 });
  assert.ok(choice);
  assert.equal(choice.playerId, 'p2', 'the affected player chooses');
  assert.equal(choice.options.length, 2);

  const one = register(game(), shieldAndDoubler()[0]);
  assert.equal(pendingReplacementChoice(one, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 4 }), null);

  // Once the order is stated there is nothing left to ask.
  assert.equal(
    pendingReplacementChoice(two, {
      type: 'DAMAGE',
      targetPlayerId: 'p2',
      amount: 4,
      replacementOrder: ['a-shield', 'b-double'],
    }),
    null
  );
});

/* ------------------------------------------------------------------ *
 * Enters-the-battlefield replacements
 * ------------------------------------------------------------------ */

test('"enters tapped" means it is never untapped on the battlefield', () => {
  let state = withCard(game(), 'mine', { typeLine: 'Land' });
  state = register(state, entersTapped('mine-tapped', 'Sulfur Falls', 'mine'));

  state = applyAction(state, { type: 'PLAY', instanceId: 'mine', to: 'battlefield' });
  assert.equal(state.cards.mine.tapped, true);
  assert.equal(state.cards.mine.zone, 'battlefield');
});

test('"enters with N counters" puts them on as it arrives, not afterwards', () => {
  let state = withCard(game(), 'hydra');
  state = register(state, entersWithCounters('hydra-counters', 'Hydra', 'hydra', '+1/+1', 3));

  state = applyAction(state, { type: 'PLAY', instanceId: 'hydra', to: 'battlefield' });
  assert.equal(state.cards.hydra.counters['+1/+1'], 3);
});

test('a table-wide "enters tapped" matches by type line, and only that type', () => {
  let state = withCard(game(), 'forest', { typeLine: 'Land — Forest' });
  state = withCard(state, 'bear', { typeLine: 'Creature — Bear' });
  state = register(state, {
    id: 'blood-moon',
    name: 'Contamination',
    event: 'enters',
    match: { typeLine: 'land', controllerId: 'p1' },
    apply: { op: 'enters-tapped' },
  });

  state = applyAction(state, { type: 'PLAY', instanceId: 'forest', to: 'battlefield' });
  state = applyAction(state, { type: 'PLAY', instanceId: 'bear', to: 'battlefield' });

  assert.equal(state.cards.forest.tapped, true);
  assert.equal(state.cards.bear.tapped, false);
});

test('a permanent already on the battlefield is not entering', () => {
  let state = withCard(game(), 'bear', { zone: 'battlefield' });
  state = register(state, entersTapped('t', 'Anything', 'bear'));
  assert.equal(eventForAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'battlefield' }), null);
});

/* ------------------------------------------------------------------ *
 * Damage prevention and redirection
 * ------------------------------------------------------------------ */

test('prevention with no amount stops the damage entirely, and says so', () => {
  let state = register(game(), preventDamage('fog', 'Fog', { playerId: 'p2' }));
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 7 });

  assert.equal(lifeOf(state, 'p2'), 40);
  assert.ok(said(state, 'Fog replaced'), messages(state).join(' | '));
});

test('partial prevention lets the rest through', () => {
  let state = register(game(), preventDamage('shield', 'Shield', { playerId: 'p2' }, 2));
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 5 });
  assert.equal(lifeOf(state, 'p2'), 37);
});

test('prevention can be narrowed to combat damage only', () => {
  const base = register(game(), preventDamage('fog', 'Fog', { playerId: 'p2', combat: true }));

  const combat = applyAction(base, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 5, combat: true });
  assert.equal(lifeOf(combat, 'p2'), 40);

  const burn = applyAction(base, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 5 });
  assert.equal(lifeOf(burn, 'p2'), 35);
});

test('redirection moves the damage to somebody else', () => {
  let state = register(game(), redirectDamage('shield', 'Palisade Giant', { playerId: 'p1' }, 'p2'));
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p1', amount: 6 });

  assert.equal(lifeOf(state, 'p1'), 40);
  assert.equal(lifeOf(state, 'p2'), 34);
});

test('redirected damage does not carry commander damage to the new recipient', () => {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One', commanders: [{ id: 'cmd1', name: 'General' }] },
      { id: 'p2', name: 'Two' },
    ],
  });
  state = register(state, redirectDamage('shield', 'Guard', { playerId: 'p2' }, 'p1'));

  state = applyAction(state, {
    type: 'DAMAGE',
    targetPlayerId: 'p2',
    amount: 5,
    commanderId: 'cmd1',
  });

  assert.equal(lifeOf(state, 'p1'), 35);
  assert.deepEqual(state.players[0].commanderDamage, {}, 'the redirected hit is not commander damage');
  assert.deepEqual(state.players[1].commanderDamage, {});
});

test('damage can be turned into poison', () => {
  let state = register(game(), {
    id: 'infect',
    name: 'Corrupting Aura',
    event: 'damage',
    match: { playerId: 'p2' },
    apply: { op: 'damage-as-poison' },
  });
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 3 });

  assert.equal(lifeOf(state, 'p2'), 40);
  assert.equal(state.players[1].poison, 3);
});

test('a minimum floor survives a doubling shield stack', () => {
  let state = register(
    game(),
    scaleDamage('halve', 'Mitigation', { playerId: 'p2' }, { multiply: 0.5, min: 1 })
  );
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 1 });
  assert.equal(lifeOf(state, 'p2'), 39, 'rounded to zero, then floored back to one');
});

/* ------------------------------------------------------------------ *
 * "If you would draw, instead..."
 * ------------------------------------------------------------------ */

test('a draw can be replaced with something else entirely', () => {
  let state = register(
    game(),
    replaceDraw('no-draw', 'Maralen', 'p1', [{ type: 'LIFE_CHANGE', playerId: 'p1', delta: 2 }])
  );

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 0, 'no card was drawn');
  assert.equal(lifeOf(state, 'p1'), 42);
});

test('the replacement names its cause in the log', () => {
  let state = register(
    game(),
    replaceDraw('no-draw', 'Maralen', 'p1', [{ type: 'LIFE_CHANGE', playerId: 'p1', delta: 2 }])
  );
  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.ok(said(state, 'Maralen:'), messages(state).join(' | '));
});

/* ------------------------------------------------------------------ *
 * Counter placement
 * ------------------------------------------------------------------ */

test('counter doubling applies to counters put on a permanent already in play', () => {
  let state = withCard(game(), 'bear', { zone: 'battlefield' });
  state = register(
    state,
    scaleCounterPlacement('doubling', 'Doubling Season', { counter: '+1/+1' }, { multiply: 2 })
  );

  state = applyAction(state, { type: 'CARD_COUNTER', instanceId: 'bear', counter: '+1/+1', delta: 3 });
  assert.equal(state.cards.bear.counters['+1/+1'], 6);
});

test('removing counters is not a counter-placement event', () => {
  let state = withCard(game(), 'bear', { zone: 'battlefield' });
  state = applyAction(state, { type: 'CARD_COUNTER', instanceId: 'bear', counter: '+1/+1', delta: 4 });
  state = register(
    state,
    scaleCounterPlacement('doubling', 'Doubling Season', { counter: '+1/+1' }, { multiply: 2 })
  );

  state = applyAction(state, { type: 'CARD_COUNTER', instanceId: 'bear', counter: '+1/+1', delta: -2 });
  assert.equal(state.cards.bear.counters['+1/+1'], 2, 'not doubled into oblivion');
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

test('an effect stops applying the moment its source leaves the battlefield', () => {
  let state = withCard(game(), 'season', { zone: 'battlefield' });
  state = register(state, {
    ...scaleDraw('archive', 'Archive', 'p1', { multiply: 2 }),
    sourceInstanceId: 'season',
  });

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 2);

  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'season', to: 'graveyard' });
  assert.equal(activeReplacements(state).length, 0, 'no deregistration needed');

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 3, 'one card this time');
});

test('a sourceless effect is always live', () => {
  const state = register(game(), scaleDraw('emblem', 'An Emblem', 'p1', { multiply: 2 }));
  assert.equal(activeReplacements(state).length, 1);
});

test('registering the same id twice replaces rather than stacks', () => {
  let state = register(state0(), scaleDraw('archive', 'Archive', 'p1', { multiply: 2 }));
  state = register(state, scaleDraw('archive', 'Archive', 'p1', { multiply: 2 }));
  assert.equal(state.replacements?.length, 1);

  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 2);
});

test('an effect can be removed by id', () => {
  let state = register(game(), scaleDraw('archive', 'Archive', 'p1', { multiply: 2 }));
  state = applyAction(state, { type: 'REMOVE_REPLACEMENT', replacementId: 'archive' });
  assert.deepEqual(state.replacements, []);
  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(handSize(state, 'p1'), 1);
});

/* ------------------------------------------------------------------ *
 * Determinism
 * ------------------------------------------------------------------ */

test('replacement effects survive a JSON round trip and replay identically', () => {
  const base = register(game(), ...shieldAndDoubler());
  const script: GameAction[] = [
    { type: 'DAMAGE', targetPlayerId: 'p2', amount: 4, at: 1, replacementOrder: ['b-double', 'a-shield'] },
    { type: 'DRAW', playerId: 'p1', count: 1, at: 2 },
  ];

  const direct = applyActions(base, script);
  const revived = applyActions(JSON.parse(JSON.stringify(base)) as GameState, script);
  assert.equal(JSON.stringify(direct), JSON.stringify(revived));
  assert.equal(lifeOf(direct, 'p2'), 34);
});

function state0(): GameState {
  return game();
}
