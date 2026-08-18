/**
 * Unit tests for the ability bridge's read half.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/context.test.ts
 *
 * These test the seam, not the DSL and not the reducer: a `Selector` written by
 * the oracle-text compiler has to name the right permanents on a real
 * battlefield, and a `ValueExpr` has to come back as an integer no matter what
 * is thrown at it.
 *
 * Half of the assertions are negative — that a selector does NOT include
 * something. That half is the important one. An over-broad selector is how
 * "creatures you control get +1/+1" ends up pumping the opponent's board, and a
 * test that only checks for presence cannot catch it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from '../rules.ts';
import type { CardInstance, GameState, Zone } from '../types.ts';
import {
  compare,
  evalCondition,
  evalValue,
  idsInZone,
  makeContext,
  matchesFilter,
  parseTypeLine,
  printedView,
  resolvePlayers,
  resolveSelector,
} from './context.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: string;
  name: string;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
  power?: string;
  toughness?: string;
  cmc?: number;
  zone?: Zone;
  tapped?: boolean;
  counters?: Record<string, number>;
}

function game(specs: Spec[], playerCount = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: Array.from({ length: playerCount }, (_, index) => ({ name: `P${index + 1}` })),
    seed: 7,
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
        oracleText: spec.oracleText,
        keywords: spec.keywords,
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        cmc: spec.cmc ?? 2,
        tapped: spec.tapped ?? false,
        counters: spec.counters ?? {},
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

const ctxFor = (state: GameState, sourceId = 's', controllerId = 'p1') =>
  makeContext(state, sourceId, controllerId);

/* ------------------------------------------------------------------ *
 * Type lines
 * ------------------------------------------------------------------ */

test('parseTypeLine splits supertypes, types and subtypes', () => {
  assert.deepEqual(parseTypeLine('Legendary Creature — Elf Druid'), {
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['elf', 'druid'],
  });
});

test('parseTypeLine accepts a plain hyphen, because hand-written token type lines use one', () => {
  // Token specs are written by hand in TypeScript, not copied from Scryfall.
  // If only the em dash parsed, every token subtype would be invisible to
  // "Goblins you control" — a silent miss of exactly the kind this exists to kill.
  assert.deepEqual(parseTypeLine('Token Creature - Goblin').subtypes, ['goblin']);
});

test('parseTypeLine drops words that are neither a type nor a supertype', () => {
  // A printing oddity must never make a filter match something it should not.
  const parsed = parseTypeLine('Weird Creature — Horror');
  assert.deepEqual(parsed.types, ['creature']);
  assert.deepEqual(parsed.supertypes, []);
});

test('parseTypeLine on an empty type line is empty, not a crash', () => {
  assert.deepEqual(parseTypeLine(undefined), { supertypes: [], types: [], subtypes: [] });
});

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

test('{sel:"self"} names the source and nothing else', () => {
  const state = game([{ id: 's', name: 'Source' }, { id: 'a', name: 'Ally' }]);
  assert.deepEqual(resolveSelector({ sel: 'self' }, ctxFor(state)), ['s']);
});

test('{sel:"self"} names nothing when the source has left the game', () => {
  const state = game([{ id: 'a', name: 'Ally' }]);
  assert.deepEqual(resolveSelector({ sel: 'self' }, ctxFor(state, 'missing')), []);
});

test('"creatures you control" excludes the opponent\'s creatures', () => {
  const state = game([
    { id: 's', name: 'Source', owner: 'p1' },
    { id: 'mine', name: 'Mine', owner: 'p1' },
    { id: 'theirs', name: 'Theirs', owner: 'p2' },
  ]);

  const ids = resolveSelector(
    { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    ctxFor(state)
  );

  assert.deepEqual(ids, ['s', 'mine']);
  assert.ok(!ids.includes('theirs'), 'an anthem must never pump the opponent');
});

test('"other creatures you control" excludes the source itself', () => {
  const state = game([
    { id: 's', name: 'Lord', owner: 'p1' },
    { id: 'mine', name: 'Mine', owner: 'p1' },
  ]);

  const ids = resolveSelector(
    {
      sel: 'all',
      where: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'other' }] },
      controller: { who: 'you' },
    },
    ctxFor(state)
  );

  assert.deepEqual(ids, ['mine']);
});

test('a selector returns ids in seat order then battlefield order, so two clients agree', () => {
  const state = game([
    { id: 'b', name: 'B', owner: 'p1' },
    { id: 'a', name: 'A', owner: 'p1' },
    { id: 'z', name: 'Z', owner: 'p2' },
  ]);

  const ids = resolveSelector({ sel: 'all', where: { is: 'any' } }, ctxFor(state));
  assert.deepEqual(ids, ['b', 'a', 'z']);
});

test('a selector skips cards that have left the game', () => {
  let state = game([{ id: 's', name: 'Source' }, { id: 'gone', name: 'Gone' }]);
  state = {
    ...state,
    cards: { ...state.cards, gone: { ...state.cards.gone, removedFromGame: true } },
  };
  assert.deepEqual(resolveSelector({ sel: 'all', where: { is: 'any' } }, ctxFor(state)), ['s']);
});

test('{sel:"target"} reads the announced target and nothing else', () => {
  const state = game([{ id: 's', name: 'Source' }, { id: 't', name: 'Target' }]);
  const ctx = makeContext(state, 's', 'p1', {
    targets: [{ kind: 'card', instanceId: 't', zone: 'battlefield' }],
  });
  assert.deepEqual(resolveSelector({ sel: 'target', ref: 0 }, ctx), ['t']);
  assert.deepEqual(resolveSelector({ sel: 'target', ref: 1 }, ctx), [], 'no second target announced');
});

test('{sel:"none"} names nothing, always', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  assert.deepEqual(resolveSelector({ sel: 'none' }, ctxFor(state)), []);
});

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

test('a subtype filter matches the type line', () => {
  const state = game([{ id: 'g', name: 'Goblin', typeLine: 'Creature — Goblin Warrior' }]);
  const ctx = ctxFor(state, 'g');
  assert.ok(matchesFilter({ is: 'subtype', value: 'goblin' }, 'g', ctx));
  assert.ok(!matchesFilter({ is: 'subtype', value: 'elf' }, 'g', ctx));
});

test('a power filter reads counters, so a +1/+1 counter is visible to "power 4 or greater"', () => {
  const state = game([
    { id: 'c', name: 'Bear', power: '2', toughness: '2', counters: { '+1/+1': 2 } },
  ]);
  const ctx = ctxFor(state, 'c');
  assert.equal(printedView(state.cards.c).power, 4);
  assert.ok(matchesFilter({ is: 'power', cmp: 'gte', value: 4 }, 'c', ctx));
  assert.ok(!matchesFilter({ is: 'power', cmp: 'gte', value: 5 }, 'c', ctx));
});

test('an unknown predicate matches NOTHING rather than everything', () => {
  // The conservative direction on purpose: a filter that matches nothing is a
  // visible no-op; one that matches everything is a board wipe nobody asked for.
  const state = game([{ id: 'c', name: 'Bear' }]);
  const bogus = { is: 'not-a-real-predicate', value: 'x' } as never;
  assert.equal(matchesFilter(bogus, 'c', ctxFor(state, 'c')), false);
});

test('tapped and untapped are read off the instance, not the type line', () => {
  const state = game([
    { id: 'a', name: 'A', tapped: true },
    { id: 'b', name: 'B', tapped: false },
  ]);
  const ctx = ctxFor(state, 'a');
  assert.ok(matchesFilter({ is: 'tapped' }, 'a', ctx));
  assert.ok(matchesFilter({ is: 'untapped' }, 'b', ctx));
  assert.ok(!matchesFilter({ is: 'tapped' }, 'b', ctx));
});

test('and / or / not compose', () => {
  const state = game([{ id: 'g', name: 'Goblin', typeLine: 'Creature — Goblin', tapped: true }]);
  const ctx = ctxFor(state, 'g');
  const goblin = { is: 'subtype' as const, value: 'goblin' };
  const untapped = { is: 'untapped' as const };

  assert.ok(matchesFilter({ is: 'and', of: [goblin, { is: 'not', of: untapped }] }, 'g', ctx));
  assert.ok(matchesFilter({ is: 'or', of: [untapped, goblin] }, 'g', ctx));
  assert.ok(!matchesFilter({ is: 'and', of: [goblin, untapped] }, 'g', ctx));
});

/* ------------------------------------------------------------------ *
 * Players
 * ------------------------------------------------------------------ */

test('each-opponent excludes the controller and anyone who has lost', () => {
  let state = game([], 3);
  state = {
    ...state,
    players: state.players.map(player =>
      player.id === 'p3' ? { ...player, hasLost: true } : player
    ),
  };

  assert.deepEqual(resolvePlayers({ who: 'each-opponent' }, ctxFor(state, 's', 'p1')), ['p2']);
});

test('{who:"defending"} is nobody until combat names a defender', () => {
  // Guessing a defender is how a burn spell ends up hitting the wrong seat.
  const state = game([], 3);
  assert.deepEqual(resolvePlayers({ who: 'defending' }, ctxFor(state)), []);

  const withDefender = makeContext(state, 's', 'p1', { defendingPlayerId: 'p2' });
  assert.deepEqual(resolvePlayers({ who: 'defending' }, withDefender), ['p2']);
});

test('an unknown player selector is nobody, never everybody', () => {
  const state = game([], 3);
  const bogus = { who: 'not-a-real-selector' } as never;
  assert.deepEqual(resolvePlayers(bogus, ctxFor(state)), []);
});

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

test('evalValue counts a selector', () => {
  const state = game([
    { id: 's', name: 'Source', owner: 'p1' },
    { id: 'a', name: 'A', owner: 'p1' },
    { id: 'z', name: 'Z', owner: 'p2' },
  ]);

  assert.equal(
    evalValue(
      { v: 'count', of: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' } } },
      ctxFor(state)
    ),
    2
  );
});

test('evalValue never returns NaN or Infinity', () => {
  // A NaN reaching the reducer as a damage amount is a silent no-op — exactly
  // the failure this engine exists to prevent.
  const state = game([{ id: 's', name: 'Source' }]);
  const ctx = ctxFor(state);

  assert.equal(evalValue({ v: 'div', a: 5, b: 0 }, ctx), 0, 'division by zero is zero');
  assert.equal(evalValue({ v: 'min', of: [] }, ctx), 0, 'min of nothing is zero');
  assert.equal(evalValue({ v: 'max', of: [] }, ctx), 0, 'max of nothing is zero');
  assert.equal(evalValue(Number.NaN as never, ctx), 0);
  assert.equal(evalValue(Infinity as never, ctx), 0);
});

test('evalValue floors division rather than returning a fraction', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  assert.equal(evalValue({ v: 'div', a: 7, b: 2 }, ctxFor(state)), 3);
});

test('evalValue does arithmetic over sub-expressions', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const ctx = ctxFor(state);
  assert.equal(evalValue({ v: 'add', of: [2, 3, 4] }, ctx), 9);
  assert.equal(evalValue({ v: 'mul', of: [2, 3] }, ctx), 6);
  assert.equal(evalValue({ v: 'sub', a: 10, b: 4 }, ctx), 6);
  assert.equal(evalValue({ v: 'min', of: [5, 2, 9] }, ctx), 2);
  assert.equal(evalValue({ v: 'max', of: [5, 2, 9] }, ctx), 9);
});

test('evalValue reads the announced X', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  assert.equal(evalValue({ v: 'x' }, makeContext(state, 's', 'p1', { x: 4 })), 4);
});

test('evalValue reads life totals and zone sizes', () => {
  const state = game([{ id: 'h', name: 'InHand', zone: 'hand', owner: 'p1' }]);
  const ctx = ctxFor(state, 'h');
  assert.equal(evalValue({ v: 'life', of: { who: 'you' } }, ctx), 40);
  assert.equal(evalValue({ v: 'cards-in', zone: 'hand', of: { who: 'you' } }, ctx), 1);
});

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

test('a "controls" condition counts only that player\'s battlefield', () => {
  const state = game([
    { id: 'g1', name: 'G1', owner: 'p1', typeLine: 'Creature — Goblin' },
    { id: 'g2', name: 'G2', owner: 'p2', typeLine: 'Creature — Goblin' },
  ]);

  const ctx = ctxFor(state, 'g1');
  const goblins = { is: 'subtype' as const, value: 'goblin' };

  assert.ok(evalCondition({ if: 'controls', who: { who: 'you' }, what: goblins, cmp: 'eq', value: 1 }, ctx));
  assert.ok(!evalCondition({ if: 'controls', who: { who: 'you' }, what: goblins, cmp: 'gte', value: 2 }, ctx));
});

test('your-turn is true only on the controller\'s own turn', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  assert.ok(evalCondition({ if: 'your-turn' }, ctxFor(state, 's', 'p1')));
  assert.ok(!evalCondition({ if: 'your-turn' }, ctxFor(state, 's', 'p2')));
});

test('not / and / or compose over conditions', () => {
  const state = game([{ id: 's', name: 'Source' }]);
  const ctx = ctxFor(state);
  const yes = { if: 'value' as const, a: 1, cmp: 'eq' as const, b: 1 };
  const no = { if: 'value' as const, a: 1, cmp: 'eq' as const, b: 2 };

  assert.ok(evalCondition({ if: 'not', of: no }, ctx));
  assert.ok(evalCondition({ if: 'and', of: [yes, yes] }, ctx));
  assert.ok(!evalCondition({ if: 'and', of: [yes, no] }, ctx));
  assert.ok(evalCondition({ if: 'or', of: [no, yes] }, ctx));
});

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

test('compare covers every comparison the DSL can express', () => {
  assert.ok(compare(1, 'lt', 2));
  assert.ok(compare(2, 'lte', 2));
  assert.ok(compare(2, 'eq', 2));
  assert.ok(compare(3, 'gte', 2));
  assert.ok(compare(3, 'gt', 2));
  assert.ok(compare(3, 'ne', 2));
  assert.ok(!compare(2, 'gt', 3));
});

test('idsInZone walks players in seat order', () => {
  const state = game([
    { id: 'a', name: 'A', owner: 'p2' },
    { id: 'b', name: 'B', owner: 'p1' },
  ]);
  assert.deepEqual(idsInZone(state, 'battlefield'), ['b', 'a']);
});

test('a supplied layer view overrides printed characteristics', () => {
  const state = game([{ id: 'c', name: 'Bear', power: '2', toughness: '2' }]);
  const base = printedView(state.cards.c as CardInstance);
  const ctx = makeContext(state, 'c', 'p1', {
    view: { c: { ...base, power: 9 } },
  });

  assert.ok(matchesFilter({ is: 'power', cmp: 'gte', value: 9 }, 'c', ctx));
});
