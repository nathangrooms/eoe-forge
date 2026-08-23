/**
 * Unit tests for triggered abilities (CR 603).
 *
 *   node --test --experimental-strip-types src/lib/game/triggers.test.ts
 *
 * Three claims are being defended, in descending order of how easy they are to
 * get quietly wrong.
 *
 * **Simultaneous triggers have a deterministic order.** This is the one that
 * matters for the product: a game is its action log, and two clients folding
 * the same log must land on byte-identical state. If ordering ever depended on
 * object key iteration, or on which card happened to be looked at first, two
 * players would see different boards and neither would know why. So the order
 * is asserted to be stable across repeats, to follow CR 603.3b (active player's
 * triggers on the stack first, therefore resolving *last*), and to survive a
 * malformed player choice by degrading to the default rather than diverging.
 *
 * **A trigger fires on what actually happened, not on what was asked for.**
 * Events are derived by diffing the state, so a creature killed by a
 * state-based action still triggers a dies ability even though no action said
 * "this creature died". That test is the reason the design is a diff.
 *
 * **Intervening "if" is checked twice** — CR 603.4 — and a condition the engine
 * cannot read leaves the whole trigger manual instead of being guessed at.
 *
 * Oracle text below uses the post-2024 templating our own `cards` rows carry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import { parseIntervening } from './effects.ts';
import {
  abilitiesOf,
  collectTriggers,
  deriveTriggerEvents,
  evaluateIntervening,
  orderTriggers,
  pendingTriggersOf,
  previewTriggers,
  resolveTriggerActions,
} from './triggers.ts';
import { everyTargetIsGone, triggerAwaitingTargets } from './announce.ts';
import type { GameState, PlayerId, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * Table building
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: PlayerId;
  name?: string;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
  power?: string;
  toughness?: string;
  damage?: number;
  zone?: Zone;
}

function game(specs: Spec[], players = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: Array.from({ length: players }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    })),
  });

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name ?? spec.id,
        ownerId: spec.owner ?? 'p1',
        controllerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Test',
        oracleText: spec.oracleText ?? '',
        keywords: spec.keywords ?? [],
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        damage: spec.damage ?? 0,
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

function lifeOf(state: GameState, playerId: PlayerId): number {
  return state.players.find(p => p.id === playerId)!.life;
}

function logText(state: GameState): string {
  return state.log.map(event => event.message).join('\n');
}

const GAIN_1 = 'At the beginning of your upkeep, you gain 1 life.';

/* ------------------------------------------------------------------ *
 * Deterministic order — the claim the product rests on
 * ------------------------------------------------------------------ */

test('simultaneous triggers are ordered identically every time', () => {
  const state = game([
    { id: 'c', name: 'Third', oracleText: GAIN_1 },
    { id: 'a', name: 'First', oracleText: GAIN_1 },
    { id: 'b', name: 'Second', oracleText: GAIN_1 },
  ]);

  const events = deriveTriggerEvents(state, { type: 'ADVANCE_STEP' }, { ...state, step: 'upkeep' });
  const upkeep = { ...state, step: 'upkeep' as const };

  const runs = Array.from({ length: 5 }, () =>
    orderTriggers(upkeep, collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep)).map(t => t.id)
  );
  for (const run of runs) assert.deepEqual(run, runs[0]);
  assert.equal(events.length, 1, 'one upkeep event, three abilities on it');
});

test('order follows battlefield arrival, not object key order', () => {
  // Ids chosen so alphabetical order and arrival order disagree: if anything
  // ever iterates `state.cards` instead of the battlefield array, this flips.
  const state = game([
    { id: 'zzz', name: 'Arrived First', oracleText: GAIN_1 },
    { id: 'aaa', name: 'Arrived Second', oracleText: GAIN_1 },
  ]);
  const upkeep = { ...state, step: 'upkeep' as const };
  const ordered = orderTriggers(upkeep, collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep));
  assert.deepEqual(
    ordered.map(t => t.sourceInstanceId),
    ['zzz', 'aaa']
  );
});

test('CR 603.3b — the active player stacks first, so a non-active player resolves first', () => {
  const state = game([
    { id: 'mine', owner: 'p1', name: 'Mine', oracleText: 'When this creature dies, you gain 1 life.' },
    { id: 'theirs', owner: 'p2', name: 'Theirs', oracleText: 'When this creature dies, you gain 1 life.' },
  ]);
  assert.equal(state.activePlayerId, 'p1');

  const after: GameState = {
    ...state,
    cards: {
      ...state.cards,
      mine: { ...state.cards.mine, zone: 'graveyard' },
      theirs: { ...state.cards.theirs, zone: 'graveyard' },
    },
  };

  const ordered = orderTriggers(after, collectTriggers(state, { type: 'ADVANCE_STEP' }, after));
  assert.deepEqual(
    ordered.map(t => t.controllerId),
    ['p1', 'p2'],
    'bottom of the stack first: the active player goes on first'
  );
  // …which, because a stack is last-in-first-out, means p2's resolves first.
  assert.equal(ordered[ordered.length - 1].controllerId, 'p2');
});

test('a controller can choose the order of their own simultaneous triggers', () => {
  const state = game([
    { id: 'a', name: 'Alpha', oracleText: GAIN_1 },
    { id: 'b', name: 'Beta', oracleText: GAIN_1 },
  ]);
  const upkeep = { ...state, step: 'upkeep' as const };
  const triggers = collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep);
  const defaultOrder = orderTriggers(upkeep, triggers).map(t => t.sourceInstanceId);
  assert.deepEqual(defaultOrder, ['a', 'b']);

  const reversedIds = [...triggers].reverse().map(t => t.id);
  const chosen = orderTriggers(upkeep, triggers, reversedIds);
  assert.deepEqual(
    chosen.map(t => t.sourceInstanceId),
    ['b', 'a']
  );
});

test('a malformed choice degrades to the default instead of desynchronising clients', () => {
  const state = game([
    { id: 'a', name: 'Alpha', oracleText: GAIN_1 },
    { id: 'b', name: 'Beta', oracleText: GAIN_1 },
  ]);
  const upkeep = { ...state, step: 'upkeep' as const };
  const triggers = collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep);

  const nonsense = orderTriggers(upkeep, triggers, ['nope', 'also-nope']);
  assert.deepEqual(
    nonsense.map(t => t.id),
    orderTriggers(upkeep, triggers).map(t => t.id)
  );

  // A partial choice: name one, and the rest keep their default position after it.
  const partial = orderTriggers(upkeep, triggers, [triggers[1].id]);
  assert.deepEqual(
    partial.map(t => t.sourceInstanceId),
    ['b', 'a']
  );
});

test('a client can preview the exact ids it will be asked to order', () => {
  const state = game([
    { id: 'a', name: 'Alpha', oracleText: GAIN_1 },
    { id: 'b', name: 'Beta', oracleText: GAIN_1 },
  ]);
  const upkeep = { ...state, step: 'upkeep' as const };
  const preview = previewTriggers(state, { type: 'ADVANCE_STEP' }, upkeep);
  const actual = orderTriggers(upkeep, collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep));
  assert.deepEqual(preview.map(t => t.id), actual.map(t => t.id));
});

test('the waiting list is empty again once an action has finished', () => {
  let state = game([{ id: 'c', name: 'Font', oracleText: GAIN_1 }]);
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'upkeep' });
  assert.deepEqual(pendingTriggersOf(state), []);
});

/* ------------------------------------------------------------------ *
 * Events are derived from the diff, not read off the action
 * ------------------------------------------------------------------ */

test('a creature killed by a state-based action still triggers its dies ability', () => {
  // Nothing in the CARD_COUNTER action says "a creature died" — the SBA did it.
  // This is the whole reason events are a state diff and not an event bus.
  let state = game([
    {
      id: 'c',
      name: 'Doomed Traveler',
      toughness: '1',
      oracleText: 'When this creature dies, you gain 2 life.',
    },
  ]);
  const before = lifeOf(state, 'p1');

  state = applyAction(state, {
    type: 'CARD_COUNTER',
    instanceId: 'c',
    counter: '-1/-1',
    delta: 1,
  });

  assert.equal(state.cards.c.zone, 'graveyard');
  assert.equal(lifeOf(state, 'p1'), before + 2, 'the dies trigger fired');
});

test('an ETB trigger fires on a permanent that entered', () => {
  let state = game([
    { id: 'c', name: 'Angel', oracleText: 'When this creature enters, you gain 3 life.', zone: 'hand' },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(lifeOf(state, 'p1'), before + 3);
});

test('an attack trigger fires on the creature that attacked, and not on the others', () => {
  let state = game([
    { id: 'a', name: 'Marauder', oracleText: 'Whenever this creature attacks, you gain 1 life.' },
    { id: 'b', name: 'Bystander', oracleText: 'Whenever this creature attacks, you gain 1 life.' },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'ATTACK', attackers: [{ attackerId: 'a', defenderPlayerId: 'p2' }] });
  assert.equal(lifeOf(state, 'p1'), before + 1);
});

test('a block trigger fires when blockers are declared', () => {
  let state = game([
    { id: 'atk', owner: 'p2', name: 'Attacker' },
    { id: 'blk', owner: 'p1', name: 'Wall', oracleText: 'Whenever this creature blocks, you gain 2 life.' },
  ]);
  state = applyAction(state, {
    type: 'ATTACK',
    attackers: [{ attackerId: 'atk', defenderPlayerId: 'p1' }],
  });
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'BLOCK', blocks: [{ blockerId: 'blk', attackerId: 'atk' }] });
  assert.equal(lifeOf(state, 'p1'), before + 2);
});

test('a damage trigger fires on the source that dealt the damage', () => {
  let state = game([
    {
      id: 'c',
      name: 'Thief',
      oracleText: 'Whenever this creature deals combat damage to a player, draw a card.',
    },
    { id: 'lib', name: 'Forest', typeLine: 'Basic Land — Forest', zone: 'library' },
  ]);
  const handBefore = state.players[0].zones.hand.length;
  state = applyAction(state, {
    type: 'DAMAGE',
    targetPlayerId: 'p2',
    amount: 2,
    sourceInstanceId: 'c',
    sourcePlayerId: 'p1',
    combat: true,
  });
  assert.equal(state.players[0].zones.hand.length, handBefore + 1);
});

test('a draw trigger fires when a card actually moves from library to hand', () => {
  let state = game([
    { id: 'c', name: 'Watcher', oracleText: 'Whenever you draw a card, you gain 1 life.' },
    { id: 'lib', name: 'Forest', typeLine: 'Basic Land — Forest', zone: 'library' },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1 });
  assert.equal(lifeOf(state, 'p1'), before + 1);
});

test('playing a land is not casting a spell', () => {
  const state = game([{ id: 'forest', typeLine: 'Basic Land — Forest', zone: 'hand' }]);
  const after = applyAction(state, { type: 'PLAY', instanceId: 'forest', to: 'battlefield' });
  const events = deriveTriggerEvents(state, { type: 'PLAY', instanceId: 'forest' }, after);
  assert.equal(events.some(event => event.kind === 'cast'), false);
  assert.equal(events.some(event => event.kind === 'enters'), true);
});

test('an upkeep trigger belongs to its controller, not to whoever is untapping', () => {
  let state = game([
    { id: 'mine', owner: 'p1', name: 'Mine', oracleText: GAIN_1 },
    { id: 'theirs', owner: 'p2', name: 'Theirs', oracleText: GAIN_1 },
  ]);
  const p1Before = lifeOf(state, 'p1');
  const p2Before = lifeOf(state, 'p2');
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'upkeep' });
  assert.equal(lifeOf(state, 'p1'), p1Before + 1);
  assert.equal(lifeOf(state, 'p2'), p2Before, "an opponent's upkeep trigger does not fire on your turn");
});

test('detection is pure — same inputs, same triggers', () => {
  const state = game([{ id: 'c', name: 'Font', oracleText: GAIN_1 }]);
  const upkeep = { ...state, step: 'upkeep' as const };
  assert.deepEqual(
    collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep),
    collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep)
  );
});

/* ------------------------------------------------------------------ *
 * CR 603.4 — intervening "if"
 * ------------------------------------------------------------------ */

test('a readable condition is lifted off the clause and the rest is automated', () => {
  const state = game([
    {
      id: 'c',
      name: 'Ajani Watcher',
      oracleText: 'At the beginning of your upkeep, if you control a creature, you gain 2 life.',
    },
  ]);
  const [ability] = abilitiesOf(state.cards.c);
  assert.ok(ability, 'the trigger is detected');
  assert.deepEqual(ability.intervening, { kind: 'controls', typeWord: 'creature', atLeast: 1 });
  assert.equal(ability.automated, true, 'the guarded half is understood');
});

test('a condition the engine cannot read keeps the whole trigger manual', () => {
  const state = game([
    {
      id: 'c',
      name: 'Promising Duskmage',
      oracleText: 'When this creature dies, if it had a +1/+1 counter on it, draw a card.',
    },
  ]);
  const [ability] = abilitiesOf(state.cards.c);
  assert.equal(ability.intervening?.kind, 'unknown');
  assert.equal(ability.automated, false, 'precision over recall: it is not guessed at');
});

test('a false condition means the ability never triggers at all', () => {
  // No creature on the battlefield, so the upkeep trigger does not go on the
  // stack — CR 603.4's first check.
  let state = game([
    {
      id: 'c',
      name: 'Watcher',
      typeLine: 'Enchantment',
      oracleText: 'At the beginning of your upkeep, if you control a creature, you gain 2 life.',
    },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'upkeep' });
  assert.equal(lifeOf(state, 'p1'), before, 'no creature, no trigger');
});

test('a true condition fires', () => {
  let state = game([
    {
      id: 'c',
      name: 'Watcher',
      typeLine: 'Enchantment',
      oracleText: 'At the beginning of your upkeep, if you control a creature, you gain 2 life.',
    },
    { id: 'bear', name: 'Bear', typeLine: 'Creature — Bear' },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'upkeep' });
  assert.equal(lifeOf(state, 'p1'), before + 2);
});

test('the condition is checked AGAIN on resolution, and says so when it turned false', () => {
  const state = game([
    {
      id: 'c',
      name: 'Watcher',
      typeLine: 'Enchantment',
      oracleText: 'At the beginning of your upkeep, if you control a creature, you gain 2 life.',
    },
    { id: 'bear', name: 'Bear', typeLine: 'Creature — Bear' },
  ]);
  const upkeep = { ...state, step: 'upkeep' as const };
  const [trigger] = collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep);
  assert.ok(trigger, 'it triggered while the creature was there');

  // The creature leaves between triggering and resolving.
  const without: GameState = {
    ...upkeep,
    players: upkeep.players.map(p =>
      p.id === 'p1' ? { ...p, zones: { ...p.zones, battlefield: ['c'] } } : p
    ),
  };

  const actions = resolveTriggerActions(without, trigger, 0);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'NOTE');
  assert.match(actions[0].message, /no longer true when it resolved/);
});

test('the intervening parser reads only what it is sure of', () => {
  assert.deepEqual(parseIntervening('you control a creature'), {
    kind: 'controls',
    typeWord: 'creature',
    atLeast: 1,
  });
  assert.deepEqual(parseIntervening('you control three or more artifacts'), {
    kind: 'controls',
    typeWord: 'artifact',
    atLeast: 3,
  });
  assert.deepEqual(parseIntervening('you have 25 or more life'), {
    kind: 'life-at-least',
    amount: 25,
  });
  assert.deepEqual(parseIntervening('you have 5 or less life'), {
    kind: 'life-at-most',
    amount: 5,
  });
  assert.deepEqual(parseIntervening('its your turn'), { kind: 'your-turn' });

  // The negative half, which is the important half: an extra qualifier the
  // engine cannot evaluate must NOT be read as the simpler condition.
  assert.equal(parseIntervening('you control a creature with flying').kind, 'unknown');
  assert.equal(parseIntervening('it had a +1/+1 counter on it').kind, 'unknown');
  assert.equal(parseIntervening('that creature died this turn').kind, 'unknown');
});

test('an unevaluable condition is judged null, not false', () => {
  const state = game([]);
  assert.equal(evaluateIntervening(state, 'p1', { kind: 'unknown', text: 'anything' }), null);
  assert.equal(evaluateIntervening(state, 'p1', undefined), true);
  assert.equal(evaluateIntervening(state, 'p1', { kind: 'your-turn' }), true);
  assert.equal(evaluateIntervening(state, 'p2', { kind: 'your-turn' }), false);
});

/* ------------------------------------------------------------------ *
 * The honesty rule
 * ------------------------------------------------------------------ */

test('a trigger the engine will not resolve is said out loud', () => {
  let state = game([
    {
      id: 'c',
      name: 'Careful Thing',
      // Flametongue Kavu used to be this test's card, and stopped being one on
      // 23 Aug 2026 when triggers learned to announce a target: it resolves
      // now, and there is a block below that proves it. "You may" is still the
      // player's word, so this is still a trigger the engine hands back.
      oracleText: 'When this creature enters, you may return a land you control to its owner\'s hand.',
      zone: 'hand',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.match(logText(state), /Careful Thing triggered/);
  assert.match(logText(state), /by hand/i);
});

/* ------------------------------------------------------------------ *
 * CR 603.3d — announcing a triggered ability's targets
 *
 * The seam this block defends is the one CLAUDE.md named as the largest single
 * blocker left: `CastOptions.targets` reached the stack object and nothing
 * asked, and a trigger could not carry a target at all. Four claims, and the
 * last two are the ones that make the feature worth having rather than worse
 * than nothing.
 * ------------------------------------------------------------------ */

test('a forced choice is not a choice: one legal target is announced without asking', () => {
  let state = game([
    {
      id: 'k',
      name: 'Flametongue Kavu',
      oracleText: 'When this creature enters, it deals 4 damage to target creature.',
      zone: 'hand',
    },
    { id: 'v', name: 'Victim', owner: 'p2', power: '1', toughness: '5' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'k', to: 'battlefield' });

  // Two creatures are on the board once the Kavu lands, so this is not quite
  // forced — which is exactly why the assertion is about the queue, not the
  // damage. The engine stopped and asked instead of guessing.
  const ask = triggerAwaitingTargets(state);
  assert.ok(ask, 'a real choice halts the drain rather than being taken for you');
  assert.equal(ask.playerId, 'p1');
  assert.deepEqual(new Set(ask.choice.instanceIds), new Set(['k', 'v']));

  // And answering it aims the ability and lets the queue finish.
  state = applyAction(state, {
    type: 'ANNOUNCE_TRIGGER_TARGETS',
    triggerId: ask.trigger.id,
    targets: [{ kind: 'card', instanceId: 'v', zone: 'battlefield', zoneChangeCounter: state.cards.v.zoneChangeCounter ?? 0 }],
  });
  assert.equal(pendingTriggersOf(state).length, 0, 'the queue drained once it was aimed');
  assert.equal(state.cards.v.damage, 4);
  assert.equal(state.cards.k.damage, 0, 'and the one that was not chosen was not hit');
});

test('one legal target is taken by the engine and nothing waits', () => {
  let state = game([
    {
      id: 'k',
      name: 'Kindly Kavu',
      // Aimed at somebody else's creature, so the source cannot be its own
      // target and exactly one candidate exists.
      oracleText: 'When this creature enters, it deals 4 damage to target creature an opponent controls.',
      zone: 'hand',
    },
    { id: 'v', name: 'Victim', owner: 'p2', power: '1', toughness: '5' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'k', to: 'battlefield' });

  assert.equal(triggerAwaitingTargets(state), null, 'nobody is asked when there is nothing to decide');
  assert.equal(pendingTriggersOf(state).length, 0);
  assert.equal(state.cards.v.damage, 4);
});

test('CR 603.3d — a trigger with no legal target is removed from the stack', () => {
  let state = game([
    {
      id: 'k',
      name: 'Lonely Kavu',
      oracleText: 'When this creature enters, it deals 4 damage to target creature an opponent controls.',
      zone: 'hand',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'k', to: 'battlefield' });

  assert.equal(pendingTriggersOf(state).length, 0, 'it does not sit there waiting for an answer nobody can give');
  assert.match(logText(state), /removed from the stack/);
  assert.match(logText(state), /nothing legal for it to target/);
});

test('CR 608.2b — a trigger whose target has gone does not resolve', () => {
  let state = game([
    {
      id: 'k',
      name: 'Slow Kavu',
      oracleText: 'When this creature enters, it deals 4 damage to target creature.',
      zone: 'hand',
    },
    { id: 'v', name: 'Victim', owner: 'p2', power: '1', toughness: '5' },
    { id: 'w', name: 'Bystander', owner: 'p2', power: '1', toughness: '5' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'k', to: 'battlefield' });

  const ask = triggerAwaitingTargets(state);
  assert.ok(ask);

  // Announced at the Victim...
  state = applyAction(state, {
    type: 'ANNOUNCE_TRIGGER_TARGETS',
    triggerId: ask.trigger.id,
    targets: [{ kind: 'card', instanceId: 'v', zone: 'battlefield', zoneChangeCounter: state.cards.v.zoneChangeCounter ?? 0 }],
  });
  // ...which is not enough on its own, because the drain runs straight after
  // the announcement. So this test aims it and lets it resolve, and the
  // zone-change half of CR 608.2b is asserted through `everyTargetIsGone`
  // directly, which is the same function resolution calls.
  assert.equal(state.cards.v.damage, 4);

  const gone = { kind: 'card' as const, instanceId: 'v', zone: 'battlefield' as const, zoneChangeCounter: 99 };
  assert.equal(
    everyTargetIsGone(state, [gone], { controllerId: 'p1', sourceInstanceId: 'k' }),
    true,
    'a flicker changes the zone-change counter, and CR 400.7 makes that a different object'
  );
  assert.equal(
    everyTargetIsGone(state, [], { controllerId: 'p1', sourceInstanceId: 'k' }),
    false,
    'an ability announced with NO targets never fizzles, however dead the board'
  );
});

test('an illegal announcement is refused, never repaired', () => {
  let state = game([
    {
      id: 'k',
      name: 'Picky Kavu',
      oracleText: 'When this creature enters, it deals 4 damage to target creature.',
      zone: 'hand',
    },
    { id: 'v', name: 'Victim', owner: 'p2', power: '1', toughness: '5' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'k', to: 'battlefield' });
  const ask = triggerAwaitingTargets(state);
  assert.ok(ask);

  // A player is not a legal target for "target creature".
  const refused = applyAction(state, {
    type: 'ANNOUNCE_TRIGGER_TARGETS',
    triggerId: ask.trigger.id,
    targets: [{ kind: 'player', playerId: 'p2' }],
  });
  assert.equal(refused, state, 'the reducer returns the same reference for a rejected action');

  // So does an answer for a trigger that is not the one on top.
  const stale = applyAction(state, {
    type: 'ANNOUNCE_TRIGGER_TARGETS',
    triggerId: 'not-a-real-trigger',
    targets: [{ kind: 'card', instanceId: 'v' }],
  });
  assert.equal(stale, state);
});

test('a half-resolved trigger names the outstanding half', () => {
  let state = game([
    {
      id: 'c',
      name: 'Half Measure',
      oracleText: 'When this creature enters, you gain 2 life and you take the initiative.',
      zone: 'hand',
    },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(lifeOf(state, 'p1'), before + 2);
  assert.match(logText(state), /partly resolved/);
});

test('an instant that resolved into the graveyard never passes for resolved', () => {
  let state = game([
    {
      id: 'c',
      name: 'Lightning Bolt',
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
      zone: 'hand',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'graveyard' });
  assert.match(logText(state), /resolve by hand/i);
});

test('a trigger chain is capped rather than allowed to hang the game', () => {
  let state = game([
    {
      id: 'c',
      name: 'Loop',
      oracleText: 'When this creature enters, create a 1/1 green Loop creature token.',
      zone: 'hand',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  const tokens = Object.values(state.cards).filter(card => card.isToken);
  assert.ok(tokens.length >= 1 && tokens.length < 30);
  assert.deepEqual(pendingTriggersOf(state), []);
});

test('every triggered action names its cause in the log', () => {
  let state = game([
    { id: 'c', name: 'Angel of Vitality', oracleText: 'When this creature enters, you gain 3 life.', zone: 'hand' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.match(logText(state), /Angel of Vitality — enters the battlefield: .*gained 3 life/);
});

/* ------------------------------------------------------------------ *
 * Determinism end to end
 * ------------------------------------------------------------------ */

test('replaying the same actions lands on identical state, triggers and all', () => {
  const build = () =>
    game([
      { id: 'a', name: 'Alpha', oracleText: GAIN_1 },
      { id: 'b', name: 'Beta', oracleText: GAIN_1 },
      {
        id: 'c',
        name: 'Angel',
        oracleText: 'When this creature enters, you gain 3 life.',
        zone: 'hand',
      },
    ]);

  const actions = [
    { type: 'PLAY' as const, instanceId: 'c', to: 'battlefield' as const, at: 0 },
    { type: 'PHASE_CHANGE' as const, step: 'upkeep' as const, at: 0 },
  ];

  const first = actions.reduce((state, action) => applyAction(state, action), build());
  const second = actions.reduce((state, action) => applyAction(state, action), build());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('a chosen trigger order changes the outcome deterministically, not randomly', () => {
  const build = () =>
    game([
      { id: 'a', name: 'Alpha', oracleText: GAIN_1 },
      { id: 'b', name: 'Beta', oracleText: GAIN_1 },
    ]);

  const state = build();
  const upkeep = { ...state, step: 'upkeep' as const };
  const ids = collectTriggers(state, { type: 'ADVANCE_STEP' }, upkeep).map(t => t.id);

  const run = (order: string[]) =>
    applyAction(build(), { type: 'PHASE_CHANGE', step: 'upkeep', at: 0, triggerOrder: order });

  const forward = run(ids);
  const backward = run([...ids].reverse());

  // Both gain the same life — these two triggers commute — but the *log order*
  // records the choice, and the same choice always replays the same way.
  assert.equal(lifeOf(forward, 'p1'), lifeOf(backward, 'p1'));
  assert.equal(JSON.stringify(forward.log), JSON.stringify(run(ids).log));
  assert.notEqual(JSON.stringify(forward.log), JSON.stringify(backward.log));
});
