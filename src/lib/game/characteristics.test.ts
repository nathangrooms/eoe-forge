/**
 * Tests for the WIRED path — the gap `layers.test.ts` could not catch.
 *
 *   node --test --experimental-strip-types src/lib/game/characteristics.test.ts
 *
 * ## Why this file exists, stated plainly
 *
 * `layers.test.ts` has 41 tests and they all passed while the real game was
 * wrong. They prove `computeLayers` in isolation: hand it objects and effects,
 * check the characteristics. Nothing in them could fail because of the actual
 * defect, which was that **no code outside that module ever called it**. The
 * battlefield read `combat.ts`'s `powerOf`, which is handed a `CardInstance` and
 * cannot see an anthem, so a 2/2 under Glorious Anthem with a +1/+1 counter
 * displayed 3/3 while the layer engine, correctly, said 4/4.
 *
 * A test proving a module in isolation is exactly how a wiring gap survives. So
 * every test here builds a **real `GameState`** with `createGame` and `addCard`,
 * puts real cards with real oracle text on a real battlefield, and asserts on
 * the value the board, the inspector, combat and the bot actually read.
 *
 * The rule for anything added here: assert through the accessor a caller uses
 * (`statLineIn` is what `GameCardView` calls), never through `computeLayers`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from './rules.ts';
import {
  boardCharacteristics,
  combatPowerIn,
  hasKeywordIn,
  powerIn,
  ptIsUnknownIn,
  statLineIn,
  toughnessIn,
} from './characteristics.ts';
import { powerOf, toughnessOf } from './printed.ts';
import { canBlock, eligibleBlockers, resolveCombat } from './combat.ts';
import { stateBasedActions } from './sba.ts';
import type { CardInstance, GameState, InstanceId, PlayerId } from './types.ts';

/* ------------------------------------------------------------------ *
 * Table building — a real state, never a hand-made LayerInput
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: PlayerId;
  name?: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  oracleText?: string;
  keywords?: string[];
  counters?: Record<string, number>;
  powerOverride?: number;
  toughnessOverride?: number;
  tapped?: boolean;
}

function table(specs: Spec[], life = 40): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: life,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });

  for (const spec of specs) {
    const owner = spec.owner ?? 'p1';
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name ?? spec.id,
        ownerId: owner,
        controllerId: owner,
        typeLine: spec.typeLine ?? 'Creature — Bear',
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        keywords: spec.keywords ?? [],
        oracleText: spec.oracleText ?? '',
        counters: spec.counters ?? {},
        tapped: spec.tapped ?? false,
        summoningSick: false,
        isCommander: false,
        powerOverride: spec.powerOverride,
        toughnessOverride: spec.toughnessOverride,
      } as unknown as CardInstance,
      'battlefield'
    );
  }

  return state;
}

const ANTHEM: Spec = {
  id: 'anthem',
  name: 'Glorious Anthem',
  typeLine: 'Enchantment',
  power: '',
  toughness: '',
  oracleText: 'Creatures you control get +1/+1.',
};

function withCombat(
  state: GameState,
  attacks: Array<{ attacker: InstanceId; defender?: PlayerId; blockedBy?: InstanceId[] }>
): GameState {
  return {
    ...state,
    combat: {
      attackers: attacks.map(a => ({
        attackerId: a.attacker,
        defenderPlayerId: a.defender ?? 'p2',
        blockedBy: a.blockedBy ?? [],
      })),
    },
  };
}

/* ------------------------------------------------------------------ *
 * The test that was missing
 * ------------------------------------------------------------------ */

test('THE case: anthem + counter + set-P/T resolves to 2/3 on the board', () => {
  /*
   * Base 2/2 Grizzly Bears, with three things happening at once:
   *
   *   - a hand-set base P/T of 0/1 ("becomes 0/1"), which `layers.ts` treats as
   *     the BASE value, i.e. layer 7b;
   *   - Glorious Anthem, +1/+1 in layer 7c;
   *   - one +1/+1 counter, layer 7d.
   *
   * CR 613 applies those in that order: 0/1 -> 1/2 -> 2/3. Any implementation
   * that adds counters to a printed value and stops gets a different number.
   */
  const state = table([
    ANTHEM,
    {
      id: 'bear',
      name: 'Grizzly Bears',
      power: '2',
      toughness: '2',
      powerOverride: 0,
      toughnessOverride: 1,
      counters: { '+1/+1': 1 },
    },
  ]);

  // `statLineIn` is literally the function `GameCardView` calls to draw the
  // badge, so this asserts the pixels, not an intermediate value.
  assert.equal(statLineIn(state, 'bear'), '2/3');
  assert.equal(powerIn(state, 'bear'), 2);
  assert.equal(toughnessIn(state, 'bear'), 3);
});

test('the pre-wiring implementation really did disagree — this is the bug, pinned', () => {
  const state = table([
    ANTHEM,
    {
      id: 'bear',
      power: '2',
      toughness: '2',
      powerOverride: 0,
      toughnessOverride: 1,
      counters: { '+1/+1': 1 },
    },
  ]);

  const card = state.cards.bear;

  // What the board used to show: printed accessors, blind to the anthem.
  assert.equal(`${powerOf(card)}/${toughnessOf(card)}`, '1/2');
  // What it shows now.
  assert.equal(statLineIn(state, 'bear'), '2/3');

  // If these two are ever equal for this board, the wiring has been undone and
  // the printed value is back on screen.
  assert.notEqual(`${powerOf(card)}/${toughnessOf(card)}`, statLineIn(state, 'bear'));
});

test('a plain anthem pumps a plain creature — the simplest case, end to end', () => {
  const state = table([ANTHEM, { id: 'bear', power: '2', toughness: '2' }]);
  assert.equal(statLineIn(state, 'bear'), '3/3');
});

test('an anthem does not pump the opponent', () => {
  const state = table([
    ANTHEM,
    { id: 'mine', power: '2', toughness: '2' },
    { id: 'theirs', owner: 'p2', power: '2', toughness: '2' },
  ]);
  assert.equal(statLineIn(state, 'mine'), '3/3');
  assert.equal(statLineIn(state, 'theirs'), '2/2');
});

/* ------------------------------------------------------------------ *
 * Everyone asks the same function
 * ------------------------------------------------------------------ */

test('combat damage uses the layered power, so an anthem hits harder', () => {
  const state = withCombat(
    table([ANTHEM, { id: 'bear', power: '2', toughness: '2' }]),
    [{ attacker: 'bear' }]
  );

  const outcome = resolveCombat(state);
  const dealt = outcome.playerDamage.find(entry => entry.playerId === 'p2')?.amount ?? 0;

  // 2/2 base, +1/+1 from the anthem: three damage, not two.
  assert.equal(dealt, 3);
  assert.equal(dealt, combatPowerIn(state, 'bear'));
  assert.equal(statLineIn(state, 'bear'), '3/3');
});

test('a granted keyword reaches combat: flying from an enchantment stops a ground blocker', () => {
  const state = table([
    {
      id: 'wings',
      name: 'Levitation',
      typeLine: 'Enchantment',
      power: '',
      toughness: '',
      oracleText: 'Creatures you control have flying.',
    },
    { id: 'attacker', power: '2', toughness: '2' },
    { id: 'ground', owner: 'p2', power: '2', toughness: '2' },
  ]);

  // The keyword is granted in layer 6 and is invisible to the card itself.
  assert.equal(hasKeywordIn(state, 'attacker', 'flying'), true);
  assert.equal((state.cards.attacker.keywords ?? []).length, 0);

  // And `canBlock` — which the inspector, the combat view and the bot all call —
  // now honours it.
  assert.equal(canBlock(state, state.cards.attacker, state.cards.ground), false);
});

test('state-based actions see a layered toughness, so a -2/-2 effect actually kills', () => {
  const state = table([
    {
      id: 'curse',
      name: 'Elesh Norn',
      typeLine: 'Enchantment',
      power: '',
      toughness: '',
      oracleText: 'Creatures your opponents control get -2/-2.',
    },
    { id: 'theirs', owner: 'p2', power: '2', toughness: '2' },
  ]);

  assert.equal(toughnessIn(state, 'theirs'), 0);

  const results = stateBasedActions(state);
  const died = results.some(
    entry => entry.instanceId === 'theirs' && entry.kind === 'creature-zero-toughness'
  );
  assert.equal(died, true, 'a creature at 0 toughness from a continuous effect must die');
});

/* ------------------------------------------------------------------ *
 * Honesty about what the engine does not know
 * ------------------------------------------------------------------ */

test('Tarmogoyf is not given a number the engine did not compute', () => {
  const state = table([
    { id: 'goyf', name: 'Tarmogoyf', typeLine: 'Creature — Lhurgoyf', power: '*', toughness: '1+*' },
  ]);

  // The layer engine says "I do not know", and that survives to the accessor.
  assert.equal(powerIn(state, 'goyf'), null);
  assert.equal(toughnessIn(state, 'goyf'), null);
  assert.equal(ptIsUnknownIn(state, 'goyf'), true);

  // The board prints the printed text rather than inventing a value. The old
  // `parseInt` path read "1+*" as a confident 1.
  assert.equal(statLineIn(state, 'goyf'), '*/1+*');
  assert.equal(toughnessOf(state.cards.goyf), 1);
});

test('a hand-set override answers the * and stops the unknown flag', () => {
  const state = table([
    {
      id: 'goyf',
      name: 'Tarmogoyf',
      typeLine: 'Creature — Lhurgoyf',
      power: '*',
      toughness: '1+*',
      powerOverride: 4,
      toughnessOverride: 5,
    },
  ]);

  assert.equal(ptIsUnknownIn(state, 'goyf'), false);
  assert.equal(statLineIn(state, 'goyf'), '4/5');
});

test('a card off the battlefield falls back to printed values', () => {
  // An anthem does not pump a creature card sitting in a hand.
  let state = table([ANTHEM]);
  state = addCard(
    state,
    {
      instanceId: 'inhand',
      cardId: 'inhand',
      name: 'Grizzly Bears',
      ownerId: 'p1',
      controllerId: 'p1',
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
      keywords: [],
      oracleText: '',
      counters: {},
      tapped: false,
      summoningSick: false,
      isCommander: false,
    } as unknown as CardInstance,
    'hand'
  );

  assert.equal(statLineIn(state, 'inhand'), '2/2');
});

/* ------------------------------------------------------------------ *
 * Determinism and memoisation
 * ------------------------------------------------------------------ */

test('memoisation is keyed on state identity and returns the identical object', () => {
  const state = table([ANTHEM, { id: 'bear' }]);

  const first = boardCharacteristics(state);
  const second = boardCharacteristics(state);

  // Same reference: the second ask did not recompute.
  assert.equal(first, second);
});

test('two independently built identical boards produce identical characteristics', () => {
  const specs: Spec[] = [
    ANTHEM,
    { id: 'bear', power: '2', toughness: '2', counters: { '+1/+1': 1 } },
    { id: 'other', owner: 'p2', power: '3', toughness: '3' },
  ];

  const a = boardCharacteristics(table(specs));
  const b = boardCharacteristics(table(specs));

  // Byte-identical, which is what lets two clients ship actions instead of state.
  assert.deepEqual(a.objects, b.objects);
  assert.deepEqual(a.order, b.order);
  assert.equal(JSON.stringify(a.objects), JSON.stringify(b.objects));
});

test('a new state object recomputes rather than serving a stale board', () => {
  const before = table([{ id: 'bear', power: '2', toughness: '2' }]);
  assert.equal(statLineIn(before, 'bear'), '2/2');

  // Same cards, plus an anthem: a genuinely different state object.
  const after = table([ANTHEM, { id: 'bear', power: '2', toughness: '2' }]);
  assert.equal(statLineIn(after, 'bear'), '3/3');

  // The first state still answers for the board it describes.
  assert.equal(statLineIn(before, 'bear'), '2/2');
});

/* ------------------------------------------------------------------ *
 * Restrictions — compiled from oracle text, enforced in combat
 * ------------------------------------------------------------------ */

test('a compiled "creatures can\'t block" restriction reaches combat legality', () => {
  const state = table([
    {
      id: 'fog',
      name: 'Silent Arbiter',
      typeLine: 'Enchantment',
      power: '',
      toughness: '',
      oracleText: "Creatures can't block.",
    },
    { id: 'attacker', power: '2', toughness: '2' },
    { id: 'wall', owner: 'p2', power: '0', toughness: '4' },
  ]);

  assert.equal(canBlock(state, state.cards.attacker, state.cards.wall), false);
  assert.equal(
    eligibleBlockers(state, 'p2').some(card => card.instanceId === 'wall'),
    false
  );
});
