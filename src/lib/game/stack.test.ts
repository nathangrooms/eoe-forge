/**
 * Unit tests for the stack, priority, targeting and countering.
 *
 *   node --test --experimental-strip-types src/lib/game/stack.test.ts
 *
 * Fizzling gets the most attention here because it is the rule that is easiest
 * to write *almost* correctly: it is not "any target went away", it is "every
 * target went away", it applies to a spell that cannot be countered, and it does
 * not apply at all to a spell that never had targets. Each of those is a
 * separate test, and half of them assert a spell still resolves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame, validateAction } from './rules.ts';
import {
  allPlayersPassed,
  canRespond,
  castSpellAction,
  abilityAction,
  defaultResolutionZone,
  legalTargetsOf,
  passUntilResolved,
  stackHeight,
  stackIsEmpty,
  stackOf,
  stackTop,
  targetCard,
  targetPlayer,
  targetStackObject,
  willFizzle,
} from './stack.ts';
import { entersTapped, entersWithCounters, preventDamage } from './replacement.ts';
import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  StackEffect,
  Zone,
} from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: PlayerId;
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  zone?: Zone;
}

/** Two players, 'full' mode, and a library deep enough that nobody decks out. */
function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });

  for (const player of ['p1', 'p2'] as const) {
    for (let i = 0; i < 12; i++) {
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

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Bear',
        power: spec.power,
        toughness: spec.toughness,
        keywords: spec.keywords,
        oracleText: '',
      },
      spec.zone ?? 'hand'
    );
  }

  return state;
}

const messages = (state: GameState): string[] => state.log.map(entry => entry.message);
const said = (state: GameState, fragment: string): boolean =>
  messages(state).some(message => message.toLowerCase().includes(fragment.toLowerCase()));
const zoneOf = (state: GameState, id: InstanceId): Zone | undefined => state.cards[id]?.zone;
const lifeOf = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.life ?? 0;

/** "Destroy target creature", as our declarative effect list. */
const destroy: StackEffect[] = [{ op: 'move', zone: 'graveyard' }];

/* ------------------------------------------------------------------ *
 * Announcement
 * ------------------------------------------------------------------ */

test('a cast spell leaves hand for the stack and is not a permanent yet', () => {
  let state = game([{ id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant', zone: 'hand' }]);
  state = applyAction(
    state,
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
    })
  );

  assert.equal(stackHeight(state), 1);
  assert.equal(zoneOf(state, 'bolt'), 'stack');
  assert.equal(state.players[0].zones.hand.includes('bolt'), false);
  assert.equal(state.players[0].zones.stack.includes('bolt'), true);
  assert.equal(lifeOf(state, 'p2'), 40, 'nothing happens until it resolves');
});

test('CR 117.3c — putting a spell on the stack hands priority back to its caster', () => {
  let state = game([{ id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' }]);
  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p1' });
  assert.equal(state.priorityPlayerId, 'p2');

  state = applyAction(state, castSpellAction('p2', 'bolt', { targets: [targetPlayer('p1')] }));
  assert.equal(state.priorityPlayerId, 'p2');
  assert.deepEqual(state.passedPriority, [], 'everyone has to pass again');
});

test('a second spell sits on top of the first and resolves first (LIFO)', () => {
  let state = game([
    { id: 'gain', name: 'Healing Salve', typeLine: 'Instant' },
    { id: 'gain2', name: 'Second Salve', typeLine: 'Instant' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'gain', { effects: [{ op: 'life', amount: 1, to: { from: 'controller' } }] })
  );
  state = applyAction(
    state,
    castSpellAction('p1', 'gain2', { effects: [{ op: 'life', amount: 10, to: { from: 'controller' } }] })
  );

  assert.equal(stackTop(state)?.name, 'Second Salve');
  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(lifeOf(state, 'p1'), 50, 'the top of the stack went first');
  assert.equal(stackTop(state)?.name, 'Healing Salve');
});

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

test('CR 117.4 — a full round of passes resolves exactly one object', () => {
  let state = game([
    { id: 'gain', name: 'Healing Salve', typeLine: 'Instant' },
    { id: 'gain2', name: 'Second Salve', typeLine: 'Instant' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'gain', { effects: [{ op: 'life', amount: 1, to: { from: 'controller' } }] })
  );
  state = applyAction(
    state,
    castSpellAction('p1', 'gain2', { effects: [{ op: 'life', amount: 10, to: { from: 'controller' } }] })
  );
  assert.equal(stackHeight(state), 2);

  // p1 passes, p2 passes: one object resolves, and the stack still holds one.
  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p1' });
  assert.equal(stackHeight(state), 2, 'one pass is not a round');
  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p2' });

  assert.equal(stackHeight(state), 1);
  assert.equal(lifeOf(state, 'p1'), 50);
});

test('CR 117.3b — priority returns to the active player after something resolves', () => {
  let state = game([{ id: 'gain', name: 'Healing Salve', typeLine: 'Instant', owner: 'p2' }]);
  state = applyAction(
    state,
    castSpellAction('p2', 'gain', { effects: [{ op: 'life', amount: 3, to: { from: 'controller' } }] })
  );
  assert.equal(state.priorityPlayerId, 'p2');

  state = applyActions(state, passUntilResolved(state));
  assert.equal(state.activePlayerId, 'p1');
  assert.equal(state.priorityPlayerId, 'p1', 'the active player, not the caster');
  assert.deepEqual(state.passedPriority, []);
});

test('everyone passing on an empty stack ends the step', () => {
  let state = game([]);
  assert.equal(state.step, 'untap');
  assert.ok(stackIsEmpty(state));

  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p1' });
  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p2' });

  assert.equal(state.step, 'upkeep');
  assert.equal(state.priorityPlayerId, 'p1', 'the active player gets it back in the new step');
  assert.deepEqual(state.passedPriority, []);
});

test('a player who does not hold priority cannot pass it', () => {
  const state = game([]);
  const check = validateAction(state, { type: 'PASS_PRIORITY', playerId: 'p2' });
  assert.equal(check.ok, false);
  assert.match(check.reason ?? '', /priority/i);
  assert.equal(applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p2' }), state);
});

test('a fresh step starts a fresh round of passes', () => {
  let state = game([]);
  state = applyAction(state, { type: 'PASS_PRIORITY', playerId: 'p1' });
  assert.deepEqual(state.passedPriority, ['p1']);
  state = applyAction(state, { type: 'ADVANCE_STEP' });
  assert.deepEqual(state.passedPriority, []);
  assert.equal(allPlayersPassed(state), false);
});

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

test('a permanent spell resolves onto the battlefield', () => {
  let state = game([{ id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear' }]);
  state = applyAction(state, castSpellAction('p1', 'bear'));
  assert.equal(zoneOf(state, 'bear'), 'stack');

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'bear'), 'battlefield');
  assert.equal(state.cards.bear.controllerId, 'p1');
  assert.ok(stackIsEmpty(state));
});

test('an instant does its thing and then goes to the graveyard', () => {
  let state = game([{ id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' }]);
  state = applyAction(
    state,
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
    })
  );
  state = applyAction(state, { type: 'RESOLVE_STACK' });

  assert.equal(lifeOf(state, 'p2'), 37);
  assert.equal(zoneOf(state, 'bolt'), 'graveyard');
});

test('a triggered ability is not a card — it resolves and leaves nothing behind', () => {
  let state = game([{ id: 'src', name: 'Soul Warden', zone: 'battlefield' }]);
  state = applyAction(
    state,
    abilityAction('p1', 'Soul Warden trigger', {
      sourceInstanceId: 'src',
      effects: [{ op: 'life', amount: 1, to: { from: 'controller' } }],
    })
  );
  assert.equal(stackHeight(state), 1);

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(lifeOf(state, 'p1'), 41);
  assert.ok(stackIsEmpty(state));
  assert.equal(zoneOf(state, 'src'), 'battlefield');
});

test('an object that resolves and does nothing says so out loud', () => {
  let state = game([{ id: 'src', name: 'Something Unread', zone: 'battlefield' }]);
  state = applyAction(state, abilityAction('p1', 'Something Unread trigger', { sourceInstanceId: 'src' }));
  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.ok(said(state, 'resolve it by hand'), messages(state).join(' | '));
});

test('each-opponent hits every living opponent and never the controller', () => {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
      { id: 'p3', name: 'Three' },
    ],
  });
  state = addCard(
    state,
    { instanceId: 'drain', cardId: 'drain', name: 'Drain', ownerId: 'p1', typeLine: 'Sorcery' },
    'hand'
  );

  state = applyAction(
    state,
    castSpellAction('p1', 'drain', {
      effects: [{ op: 'life', amount: -2, to: { from: 'each-opponent' } }],
    })
  );
  state = applyAction(state, { type: 'RESOLVE_STACK' });

  assert.equal(lifeOf(state, 'p1'), 40);
  assert.equal(lifeOf(state, 'p2'), 38);
  assert.equal(lifeOf(state, 'p3'), 38);
});

/* ------------------------------------------------------------------ *
 * Fizzling (CR 608.2b) — the point of this file
 * ------------------------------------------------------------------ */

test('a spell whose only target is gone does not resolve, and says why', () => {
  let state = game([
    { id: 'kill', name: 'Murder', typeLine: 'Instant', zone: 'hand' },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', zone: 'battlefield' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'kill', { targets: [targetCard(state, 'bear')], effects: destroy })
  );
  // The bear is bounced in response.
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'hand' });

  const top = stackTop(state);
  assert.ok(top);
  assert.equal(willFizzle(state, top), true);

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'bear'), 'hand', 'the spell did nothing');
  assert.equal(zoneOf(state, 'kill'), 'graveyard', 'but the card still ends up in the graveyard');
  assert.ok(said(state, 'countered on resolution'), messages(state).join(' | '));
});

test('a spell with SOME targets left resolves, and does as much as it can', () => {
  let state = game([
    { id: 'sweep', name: 'Two-Headed Removal', typeLine: 'Sorcery' },
    { id: 'bearA', name: 'Bear A', owner: 'p2', zone: 'battlefield' },
    { id: 'bearB', name: 'Bear B', owner: 'p2', zone: 'battlefield' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'sweep', {
      targets: [targetCard(state, 'bearA'), targetCard(state, 'bearB')],
      effects: [
        { op: 'move', zone: 'graveyard', to: { from: 'target', index: 0 } },
        { op: 'move', zone: 'graveyard', to: { from: 'target', index: 1 } },
      ],
    })
  );
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bearA', to: 'hand' });

  const top = stackTop(state);
  assert.ok(top);
  assert.equal(willFizzle(state, top), false, 'one legal target is enough');
  assert.equal(legalTargetsOf(state, top).length, 1);

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'bearA'), 'hand', 'the illegal target is untouched');
  assert.equal(zoneOf(state, 'bearB'), 'graveyard', 'the legal one still dies');
  assert.equal(said(state, 'countered on resolution'), false);
});

test('a spell announced with NO targets never fizzles, whatever else has died', () => {
  let state = game([{ id: 'gain', name: 'Healing Salve', typeLine: 'Instant' }]);
  state = applyAction(
    state,
    castSpellAction('p1', 'gain', { effects: [{ op: 'life', amount: 3, to: { from: 'controller' } }] })
  );

  const top = stackTop(state);
  assert.ok(top);
  assert.deepEqual(top.targets, []);
  assert.equal(willFizzle(state, top), false);

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(lifeOf(state, 'p1'), 43);
});

test('CR 400.7 — a creature flickered out and straight back is a different object', () => {
  let state = game([
    { id: 'kill', name: 'Murder', typeLine: 'Instant' },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', zone: 'battlefield' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'kill', { targets: [targetCard(state, 'bear')], effects: destroy })
  );
  // Blink: out and back. Same instance id, same zone, new object.
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'exile' });
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'battlefield' });
  assert.equal(zoneOf(state, 'bear'), 'battlefield');

  const top = stackTop(state);
  assert.ok(top);
  assert.equal(willFizzle(state, top), true, 'zone alone would have missed this');

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'bear'), 'battlefield', 'it survived');
});

test('a creature that gains hexproof in response makes the spell fizzle', () => {
  let state = game([
    { id: 'kill', name: 'Murder', typeLine: 'Instant' },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', zone: 'battlefield' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'kill', { targets: [targetCard(state, 'bear')], effects: destroy })
  );
  state = applyAction(state, { type: 'SET_KEYWORD', instanceId: 'bear', keyword: 'hexproof', on: true });

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'bear'), 'battlefield');
  assert.ok(said(state, 'countered on resolution'));
});

test('a spell targeting a player who has left the game fizzles', () => {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
      { id: 'p3', name: 'Three' },
    ],
  });
  state = addCard(
    state,
    { instanceId: 'bolt', cardId: 'bolt', name: 'Lightning Bolt', ownerId: 'p1', typeLine: 'Instant' },
    'hand'
  );

  state = applyAction(
    state,
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p3')],
      effects: [{ op: 'damage', amount: 3 }],
    })
  );
  state = applyAction(state, { type: 'CONCEDE', playerId: 'p3' });

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.ok(said(state, 'countered on resolution'));
  assert.equal(zoneOf(state, 'bolt'), 'graveyard');
});

/* ------------------------------------------------------------------ *
 * Countering
 * ------------------------------------------------------------------ */

test('countering a spell removes it from the stack and bins the card', () => {
  let state = game([
    { id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' },
    { id: 'counter', name: 'Counterspell', typeLine: 'Instant', owner: 'p2' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
    })
  );
  const boltId = stackTop(state)!.stackId;

  state = applyAction(
    state,
    castSpellAction('p2', 'counter', {
      targets: [targetStackObject(boltId)],
      effects: [{ op: 'counter-spell' }],
    })
  );
  state = applyAction(state, { type: 'RESOLVE_STACK' });

  assert.ok(stackIsEmpty(state), 'both left the stack');
  assert.equal(zoneOf(state, 'bolt'), 'graveyard');
  assert.equal(zoneOf(state, 'counter'), 'graveyard');
  assert.equal(lifeOf(state, 'p2'), 40, 'the bolt never resolved');
});

test("a spell that can't be countered refuses COUNTER_SPELL with a reason", () => {
  let state = game([{ id: 'big', name: 'Supreme Verdict', typeLine: 'Sorcery' }]);
  state = applyAction(state, castSpellAction('p1', 'big', { cantBeCountered: true }));
  const stackId = stackTop(state)!.stackId;

  const check = validateAction(state, { type: 'COUNTER_SPELL', stackId });
  assert.equal(check.ok, false);
  assert.match(check.reason ?? '', /can't be countered/i);
  assert.equal(applyAction(state, { type: 'COUNTER_SPELL', stackId }), state);
});

test("CR 608.2b is not countering — a spell that can't be countered still fizzles", () => {
  let state = game([
    { id: 'big', name: 'Uncounterable Bolt', typeLine: 'Instant' },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', zone: 'battlefield' },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'big', {
      cantBeCountered: true,
      targets: [targetCard(state, 'bear')],
      effects: destroy,
    })
  );
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'hand' });
  state = applyAction(state, { type: 'RESOLVE_STACK' });

  assert.ok(said(state, 'countered on resolution'));
  assert.equal(zoneOf(state, 'big'), 'graveyard');
});

/* ------------------------------------------------------------------ *
 * Split second (CR 702.61)
 * ------------------------------------------------------------------ */

test('split second stops anyone casting in response', () => {
  let state = game([
    { id: 'ss', name: 'Krosan Grip', typeLine: 'Instant' },
    { id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant', owner: 'p2' },
  ]);

  state = applyAction(state, castSpellAction('p1', 'ss', { splitSecond: true }));

  const check = validateAction(state, castSpellAction('p2', 'bolt', { targets: [targetPlayer('p1')] }));
  assert.equal(check.ok, false);
  assert.match(check.reason ?? '', /split second/i);
  assert.equal(canRespond(state, 'p1').ok, false);
  assert.equal(stackHeight(applyAction(state, castSpellAction('p2', 'bolt'))), 1);
});

test('CR 702.61b — triggers still go on the stack under split second', () => {
  let state = game([
    { id: 'ss', name: 'Krosan Grip', typeLine: 'Instant' },
    { id: 'src', name: 'Soul Warden', owner: 'p2', zone: 'battlefield' },
  ]);
  state = applyAction(state, castSpellAction('p1', 'ss', { splitSecond: true }));

  state = applyAction(
    state,
    abilityAction('p2', 'Soul Warden trigger', {
      kind: 'triggered',
      sourceInstanceId: 'src',
      effects: [{ op: 'life', amount: 1, to: { from: 'controller' } }],
    })
  );
  assert.equal(stackHeight(state), 2);

  // An activated ability is a different matter.
  const check = validateAction(
    state,
    abilityAction('p2', 'Some activated thing', { kind: 'activated', sourceInstanceId: 'src' })
  );
  assert.equal(check.ok, false);
  assert.match(check.reason ?? '', /split second/i);
});

test('split second lifts once the spell has resolved', () => {
  let state = game([{ id: 'ss', name: 'Krosan Grip', typeLine: 'Instant' }]);
  state = applyAction(state, castSpellAction('p1', 'ss', { splitSecond: true }));
  assert.equal(canRespond(state, 'p1').ok, false);
  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(canRespond(state, 'p1').ok, true);
});

/* ------------------------------------------------------------------ *
 * Determinism
 * ------------------------------------------------------------------ */

test('the same action list replays to byte-identical state', () => {
  const start = game([
    { id: 'bear', name: 'Grizzly Bears' },
    { id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' },
    { id: 'kill', name: 'Murder', typeLine: 'Instant' },
    { id: 'chump', name: 'Chump', owner: 'p2', zone: 'battlefield' },
  ]);

  const script: GameAction[] = [
    castSpellAction('p1', 'bear', { at: 10 }),
    { type: 'PASS_PRIORITY', playerId: 'p1', at: 11 },
    { type: 'PASS_PRIORITY', playerId: 'p2', at: 12 },
    castSpellAction('p1', 'kill', {
      at: 13,
      targets: [targetCard(start, 'chump')],
      effects: destroy,
    }),
    castSpellAction('p1', 'bolt', {
      at: 14,
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
    }),
    { type: 'PASS_PRIORITY', playerId: 'p1', at: 15 },
    { type: 'PASS_PRIORITY', playerId: 'p2', at: 16 },
    { type: 'PASS_PRIORITY', playerId: 'p1', at: 17 },
    { type: 'PASS_PRIORITY', playerId: 'p2', at: 18 },
  ];

  const a = applyActions(start, script);
  const b = applyActions(start, script);

  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(lifeOf(a, 'p2'), 37);
  assert.equal(zoneOf(a, 'chump'), 'graveyard');
  assert.equal(zoneOf(a, 'bear'), 'battlefield');
});

test('everything on the stack survives a JSON round trip', () => {
  let state = game([{ id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' }]);
  state = applyAction(
    state,
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
      splitSecond: true,
    })
  );

  const revived = JSON.parse(JSON.stringify(state)) as GameState;
  assert.deepEqual(stackOf(revived), stackOf(state));
  assert.equal(applyAction(revived, { type: 'RESOLVE_STACK' }).players[1].life, 37);
});

test('stack ids are minted from state, never from a clock or a random', () => {
  let state = game([
    { id: 'a', name: 'Spell A', typeLine: 'Instant' },
    { id: 'b', name: 'Spell B', typeLine: 'Instant' },
  ]);
  state = applyAction(state, castSpellAction('p1', 'a'));
  state = applyAction(state, castSpellAction('p1', 'b'));
  assert.deepEqual(
    stackOf(state).map(object => object.stackId),
    ['s1', 's2']
  );
});

/* ------------------------------------------------------------------ *
 * The seam: a resolving spell is still a replaceable event
 * ------------------------------------------------------------------ */

test('a land cast through the stack still enters tapped', () => {
  let state = game([{ id: 'falls', name: 'Sulfur Falls', typeLine: 'Land' }]);
  state = applyAction(state, {
    type: 'ADD_REPLACEMENT',
    effect: entersTapped('falls-tapped', 'Sulfur Falls', 'falls'),
  });

  state = applyAction(state, castSpellAction('p1', 'falls'));
  assert.equal(state.cards.falls.tapped, false, 'nothing has happened yet — it is on the stack');

  state = applyAction(state, { type: 'RESOLVE_STACK' });
  assert.equal(zoneOf(state, 'falls'), 'battlefield');
  assert.equal(state.cards.falls.tapped, true);
});

test('a creature spell resolving arrives with the counters its replacement gives it', () => {
  let state = game([{ id: 'hydra', name: 'Hydra', typeLine: 'Creature — Hydra' }]);
  state = applyAction(state, {
    type: 'ADD_REPLACEMENT',
    effect: entersWithCounters('hydra-counters', 'Hydra', 'hydra', '+1/+1', 4),
  });

  state = applyActions(state, [castSpellAction('p1', 'hydra'), { type: 'RESOLVE_STACK' }]);
  assert.equal(state.cards.hydra.counters['+1/+1'], 4);
});

test('damage dealt by a resolving spell goes through the replacement layer', () => {
  let state = game([{ id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant' }]);
  state = applyAction(state, {
    type: 'ADD_REPLACEMENT',
    effect: preventDamage('shield', 'Shield', { playerId: 'p2' }, 2),
  });

  state = applyActions(state, [
    castSpellAction('p1', 'bolt', {
      targets: [targetPlayer('p2')],
      effects: [{ op: 'damage', amount: 3 }],
    }),
    { type: 'RESOLVE_STACK' },
  ]);

  assert.equal(lifeOf(state, 'p2'), 39, '3 damage, 2 prevented');
  assert.equal(zoneOf(state, 'bolt'), 'graveyard');
});

test('the stack is not a manual zone and a life counter has no stack at all', () => {
  const counter = createGame({
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
  const check = validateAction(counter, { type: 'PASS_PRIORITY', playerId: 'p1' });
  assert.equal(check.ok, false);
  assert.match(check.reason ?? '', /life counter/i);
});

/* -------------------------------------------------------------------------- */
/* Resolution zone: one face at a time                                        */
/* -------------------------------------------------------------------------- */

test('a modal double-faced permanent resolves onto the battlefield, not the graveyard', () => {
  // Aquatic Alchemist // Bubble Up. The back face is an instant and the type
  // line names both, which used to send the creature straight to the graveyard.
  const card = {
    instanceId: 'mdfc',
    typeLine: 'Creature — Elemental // Instant',
    flipped: false,
  } as unknown as CardInstance;

  assert.equal(defaultResolutionZone(card), 'battlefield');
});

test('the back face of a double-faced card still resolves to the graveyard', () => {
  const card = {
    instanceId: 'mdfc-back',
    typeLine: 'Creature — Elemental // Instant',
    flipped: true,
  } as unknown as CardInstance;

  assert.equal(defaultResolutionZone(card), 'graveyard');
});

test('a plain instant is unaffected', () => {
  const card = { instanceId: 'bolt', typeLine: 'Instant', flipped: false } as unknown as CardInstance;
  assert.equal(defaultResolutionZone(card), 'graveyard');
});

test('a split card with two spell halves still goes to the graveyard', () => {
  const card = {
    instanceId: 'split',
    typeLine: 'Sorcery // Sorcery',
    flipped: false,
  } as unknown as CardInstance;
  assert.equal(defaultResolutionZone(card), 'graveyard');
});
