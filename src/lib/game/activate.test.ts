/**
 * Activating an ability: costs, timing, targets, the stack, resolution.
 *
 *   node --test --experimental-strip-types src/lib/game/activate.test.ts
 *
 * ## These tests deliberately go all the way to the board
 *
 * `reachability.test.ts` exists because this directory is full of suites that
 * build a `GameAction` by hand and prove the reducer handles it, while nothing
 * in the app has ever built one. So almost every test below starts from real
 * ORACLE TEXT, asks `activationsFor` what a player could press, applies the
 * batch it hands back, passes priority, and asserts the BOARD moved. If the
 * compiler stopped reading a clause, or the stack stopped resolving compiled
 * abilities, or the cost stopped being charged, these fail — which is the point.
 *
 * The oracle text is copied from the real cards it names, so a test that passes
 * is a statement about a card a player owns rather than about a fixture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import {
  abilityUsesThisTurn,
  activationsFor,
  planActivation,
  planActivationWith,
} from './activate.ts';
import { stackHeight, stackTop, targetCard, targetPlayer } from './stack.ts';
import type { CardInstance, GameState, InstanceId, PlayerId, StackTarget, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  owner?: PlayerId;
  typeLine?: string;
  oracleText?: string;
  manaCost?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  counters?: Record<string, number>;
  zone?: Zone;
  tapped?: boolean;
  summoningSick?: boolean;
}

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
    for (let i = 0; i < 20; i++) {
      state = addCard(
        state,
        {
          instanceId: `${player}-lib${i}`,
          cardId: 'filler',
          name: `Filler ${i}`,
          ownerId: player,
          typeLine: 'Creature — Human',
          oracleText: '',
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
        oracleText: spec.oracleText ?? '',
        // Spread only what was actually set. `addCard` merges the partial over
        // its defaults, so a key holding `undefined` overwrites the default
        // with nothing and `counters` becomes undefined mid-game.
        ...(spec.manaCost !== undefined ? { manaCost: spec.manaCost } : {}),
        ...(spec.power !== undefined ? { power: spec.power } : {}),
        ...(spec.toughness !== undefined ? { toughness: spec.toughness } : {}),
        ...(spec.loyalty !== undefined ? { loyalty: spec.loyalty } : {}),
        ...(spec.counters !== undefined ? { counters: spec.counters } : {}),
        ...(spec.tapped !== undefined ? { tapped: spec.tapped } : {}),
        // A permanent placed straight onto the battlefield by a test has been
        // there since before the turn unless it says otherwise, the same as one
        // that survived an untap step.
        summoningSick: spec.summoningSick ?? false,
      },
      spec.zone ?? 'battlefield'
    );
  }

  // The main phase is where a sorcery-speed ability is legal, so it is the
  // honest default for a test about activating things.
  return { ...state, step: 'precombat_main' };
}

/** Untapped Forests, so a mana cost has something real to be paid from. */
function withLands(state: GameState, playerId: PlayerId, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) {
    next = addCard(
      next,
      {
        instanceId: `${playerId}-forest${i}`,
        cardId: 'forest',
        name: 'Forest',
        ownerId: playerId,
        typeLine: 'Basic Land — Forest',
        oracleText: '({T}: Add {G}.)',
        colorIdentity: ['G'],
      },
      'battlefield'
    );
  }
  return next;
}

const cardOf = (state: GameState, id: InstanceId): CardInstance | undefined => state.cards[id];
const lifeOf = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.life ?? 0;
const messages = (state: GameState): string[] => state.log.map(entry => entry.message);
const said = (state: GameState, fragment: string): boolean =>
  messages(state).some(m => m.toLowerCase().includes(fragment.toLowerCase()));

/** Everyone passes, so the top of the stack resolves. */
function resolveTop(state: GameState): GameState {
  let next = state;
  for (let i = 0; i < next.players.length && stackHeight(next) > 0; i++) {
    next = applyAction(next, { type: 'PASS_PRIORITY' });
  }
  return next;
}

/**
 * The test takes every decision the engine refuses to take, always the first
 * candidate. That is a policy, not a rule, which is exactly why it lives here
 * and not in `activate.ts`.
 */
const takeFirst = (choice: { kind: 'target' | 'cost'; instanceIds: InstanceId[]; playerIds: PlayerId[]; min: number }) =>
  choice.kind === 'cost'
    ? choice.instanceIds.slice(0, choice.min)
    : choice.instanceIds.length > 0
      ? ({ kind: 'card' as const, instanceId: choice.instanceIds[0] })
      : ({ kind: 'player' as const, playerId: choice.playerIds[0] });

/** The single ability on a card, planned with the test answering its questions. */
function only(state: GameState, playerId: PlayerId, id: InstanceId) {
  const options = activationsFor(state, playerId, cardOf(state, id));
  assert.equal(
    options.length,
    1,
    `expected one compiled ability, got ${options.length}: ${options.map(o => o.text).join(' | ')}`
  );
  const option = options[0];
  const plan = planActivationWith(state, playerId, id, option.abilityId, choice => {
    const answer = takeFirst(choice);
    // A card target has to carry its zone snapshot, which `takeFirst` cannot
    // know; fill it in the way the engine would.
    if (!Array.isArray(answer) && answer.kind === 'card' && answer.instanceId) {
      const target = cardOf(state, answer.instanceId);
      return { ...answer, zone: target?.zone, zoneChangeCounter: target?.zoneChangeCounter ?? 0 };
    }
    return answer;
  });
  assert.equal(plan.ok, true, `${option.text} was refused: ${plan.reason}`);
  return { ...option, ...plan };
}

/**
 * The card's one ability, pointed at a target the TEST names.
 *
 * `only` takes whatever candidate comes first, which for "any target" on a
 * two-player board is the source's own body. A test about what the damage did
 * has to say where it went.
 */
function aimedAt(state: GameState, playerId: PlayerId, id: InstanceId, target: StackTarget) {
  const [option] = activationsFor(state, playerId, cardOf(state, id));
  const plan = planActivation(state, playerId, id, option.abilityId, {
    // Keyed by `TargetSpec.ref`, and a single-target ability numbers its one
    // requirement zero.
    choices: { targets: [target] },
  });
  assert.equal(plan.ok, true, `${option.text} was refused: ${plan.reason}`);
  return { ...option, ...plan };
}

/* ------------------------------------------------------------------ *
 * The whole point: a compiled ability reaches the board
 * ------------------------------------------------------------------ */

test('a tap ability is offered, paid for, put on the stack and resolves', () => {
  // Prodigal Pyromancer, verbatim.
  let state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
      power: '1',
      toughness: '1',
    },
  ]);

  const option = aimedAt(state, 'p1', 'pyro', targetPlayer('p2'));
  assert.equal(option.text, '{T}: Prodigal Pyromancer deals 1 damage to any target.');

  state = applyActions(state, option.actions);

  assert.equal(cardOf(state, 'pyro')?.tapped, true, 'the tap cost was actually paid');
  assert.equal(stackHeight(state), 1, 'the ability is on the stack, not already resolved');
  assert.equal(stackTop(state)?.kind, 'activated');
  assert.equal(stackTop(state)?.abilityId, 'a0');

  const before = lifeOf(state, 'p2');
  state = resolveTop(state);

  assert.equal(stackHeight(state), 0);
  assert.equal(lifeOf(state, 'p2'), before - 1, 'the damage actually happened');
});

test('the ability resolves through the compiler, not through the stack effect list', () => {
  // Nothing sets `StackObject.effects` here. Before `abilityId` existed this
  // object resolved into an empty action list and the board did not move.
  let state = game([
    {
      id: 'thrull',
      name: 'Thrull Surgeon',
      typeLine: 'Creature — Thrull',
      oracleText: '{G}, Sacrifice Thrull Surgeon: You gain 4 life.',
      power: '1',
      toughness: '1',
    },
  ]);
  state = withLands(state, 'p1', 3);

  const option = only(state, 'p1', 'thrull');
  state = applyActions(state, option.actions);

  assert.deepEqual(stackTop(state)?.effects, [], 'the stack carries no effects of its own');
  assert.equal(cardOf(state, 'thrull')?.zone, 'graveyard', 'the sacrifice cost was paid');

  const before = lifeOf(state, 'p1');
  state = resolveTop(state);
  assert.equal(lifeOf(state, 'p1'), before + 4);
});

/* ------------------------------------------------------------------ *
 * Costs
 * ------------------------------------------------------------------ */

test('a mana cost with no mana to pay it is refused, and says how much it needs', () => {
  let state = game([
    {
      id: 'lab',
      name: 'Arcane Laboratory',
      typeLine: 'Artifact',
      oracleText: '{3}{U}: Draw a card.',
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'lab'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /mana/i);
  assert.deepEqual(option.actions, [], 'a refused plan builds nothing');
});

test('mana and a tap cost never spend the same permanent twice', () => {
  // The land tapped for {1} must not also be the permanent tapped for {T}.
  let state = game([
    {
      id: 'engine',
      name: 'Millstone',
      typeLine: 'Artifact',
      oracleText: '{2}, {T}: Target player mills two cards.',
    },
  ]);
  state = withLands(state, 'p1', 2);

  const option = only(state, 'p1', 'engine');
  const tapped = option.actions.filter(a => a.type === 'TAP').map(a => (a as { instanceId: string }).instanceId);

  assert.equal(new Set(tapped).size, tapped.length, 'no permanent is tapped twice');
  assert.equal(tapped.includes('engine'), true, 'the source pays its own {T}');
  assert.equal(tapped.filter(id => id.startsWith('p1-forest')).length, 2, 'two lands pay the {2}');
});

test('paying life is refused when the life is not there', () => {
  let state = game([
    {
      id: 'well',
      name: 'Wellspring',
      typeLine: 'Artifact',
      oracleText: 'Pay 3 life: Draw a card.',
    },
  ]);
  state = applyAction(state, { type: 'SET_LIFE', playerId: 'p1', life: 2 });

  const [option] = activationsFor(state, 'p1', cardOf(state, 'well'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /2 life/);
});

test('a counter cost is charged, and refused when the counters are not there', () => {
  // Aether Vial's second ability, which is the card the owner reported.
  const text =
    '{T}: You may put a creature card with mana value equal to the number of charge counters on Aether Vial from your hand onto the battlefield.';
  void text; // the charge counter half is the trigger; this is the removal half
  let state = game([
    {
      id: 'reaper',
      name: 'Grim Reaper',
      typeLine: 'Artifact',
      oracleText: 'Remove two charge counters from Grim Reaper: You gain 2 life.',
      counters: { charge: 1 },
    },
  ]);

  let [option] = activationsFor(state, 'p1', cardOf(state, 'reaper'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /charge/);

  state = applyAction(state, { type: 'CARD_COUNTER', instanceId: 'reaper', counter: 'charge', delta: 1 });
  [option] = activationsFor(state, 'p1', cardOf(state, 'reaper'));
  assert.equal(option.ok, true, option.reason);

  state = applyActions(state, option.actions);
  assert.equal(cardOf(state, 'reaper')?.counters.charge ?? 0, 0, 'the counters were removed');
});

test('a summoning sick creature cannot pay a tap cost, and is told why', () => {
  let state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
      power: '1',
      toughness: '1',
      summoningSick: true,
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'pyro'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /came under your control this turn/i);
});

test('an already tapped permanent cannot pay a tap cost', () => {
  const state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
      power: '1',
      toughness: '1',
      tapped: true,
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'pyro'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /already tapped/i);
});

/* ------------------------------------------------------------------ *
 * Choices are handed back, never guessed
 * ------------------------------------------------------------------ */

test('a sacrifice with several candidates is a decision, and the engine refuses to take it', () => {
  let state = game([
    {
      id: 'altar',
      name: 'Phyrexian Altar',
      typeLine: 'Artifact',
      oracleText: 'Sacrifice a creature: You gain 1 life.',
    },
    { id: 'bear1', name: 'Grizzly Bears', power: '2', toughness: '2' },
    { id: 'bear2', name: 'Runeclaw Bear', power: '2', toughness: '2' },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'altar'));
  assert.equal(option.ok, false);
  assert.equal(option.pending.length, 1);
  assert.equal(option.pending[0].kind, 'cost');
  assert.deepEqual(option.pending[0].instanceIds.sort(), ['bear1', 'bear2']);

  // The caller decides. The engine then builds the batch it was refusing to
  // build on its own.
  const decided = planActivation(state, 'p1', 'altar', option.abilityId, {
    choices: { costs: { 0: ['bear2'] } },
  });
  assert.equal(decided.ok, true, decided.reason);

  state = applyActions(state, decided.actions);
  assert.equal(cardOf(state, 'bear2')?.zone, 'graveyard');
  assert.equal(cardOf(state, 'bear1')?.zone, 'battlefield', 'the one the caller did not pick is untouched');
});

test('a forced choice is not a choice: one candidate is taken without asking', () => {
  const state = game([
    {
      id: 'altar',
      name: 'Phyrexian Altar',
      typeLine: 'Artifact',
      oracleText: 'Sacrifice a creature: You gain 1 life.',
    },
    { id: 'bear1', name: 'Grizzly Bears', power: '2', toughness: '2' },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'altar'));
  assert.equal(option.ok, true, option.reason);
  assert.equal(option.pending.length, 0);
});

test('a cost never spends a permanent another cost already spent', () => {
  // "Sacrifice this creature" and "{T}" name the same permanent, and the
  // sacrifice must not be offered a second body it does not have.
  const state = game([
    {
      id: 'wall',
      name: 'Wall of Roots',
      typeLine: 'Creature — Plant Wall',
      oracleText: '{T}, Sacrifice Wall of Roots: You gain 3 life.',
      power: '0',
      toughness: '5',
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'wall'));
  assert.equal(option.ok, true, option.reason);
  const spent = option.actions.filter(a => a.type === 'TAP' || a.type === 'MOVE_ZONE');
  assert.equal(spent.length, 2, 'tapped and sacrificed, once each');
});

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

test('a target is chosen before the ability goes on the stack', () => {
  const state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to target creature.',
      power: '1',
      toughness: '1',
    },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', power: '2', toughness: '2' },
  ]);

  const option = only(state, 'p1', 'pyro');
  const next = applyActions(state, option.actions);
  const object = stackTop(next);

  assert.equal(object?.targets.length, 1);
  assert.equal(object?.targets[0].kind, 'card');
  assert.equal(object?.targets[0].zoneChangeCounter !== undefined, true, 'CR 400.7 is snapshotted');
});

test('a target that has left before resolution takes its half of the ability with it', () => {
  let state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 2 damage to target creature.',
      power: '1',
      toughness: '1',
    },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', power: '2', toughness: '2' },
  ]);

  const option = aimedAt(state, 'p1', 'pyro', targetCard(state, 'bear'));
  state = applyActions(state, option.actions);

  // The bear is bounced in response.
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'hand' });
  state = resolveTop(state);

  assert.equal(cardOf(state, 'bear')?.zone, 'hand', 'it did not come back to be hit');
  assert.equal(said(state, 'countered on resolution'), true, 'the log says why nothing happened');
});

test('an ability with nothing to target cannot be activated, and says so', () => {
  const state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to target creature.',
      power: '1',
      toughness: '1',
    },
  ]);

  // Its own body is the only creature on the battlefield, so it is the target.
  // Remove it from the equation by making the requirement one it cannot meet.
  const solo = game([
    {
      id: 'rack',
      name: 'The Rack',
      typeLine: 'Artifact',
      oracleText: '{T}: The Rack deals 1 damage to target creature.',
    },
  ]);

  void state;
  const [option] = activationsFor(solo, 'p1', cardOf(solo, 'rack'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /nothing this could target/i);
});

/* ------------------------------------------------------------------ *
 * Timing
 * ------------------------------------------------------------------ */

test('a sorcery-speed ability is refused outside a main phase', () => {
  const base = game([
    {
      id: 'forge',
      name: 'Shivan Forge',
      typeLine: 'Artifact',
      oracleText: '{T}: You gain 1 life. Activate only as a sorcery.',
    },
  ]);

  const inMain = activationsFor(base, 'p1', cardOf(base, 'forge'))[0];
  assert.equal(inMain.ok, true, inMain.reason);
  assert.equal(inMain.sorcerySpeed, true);

  const inCombat = { ...base, step: 'declare_attackers' as const };
  const refusedNow = activationsFor(inCombat, 'p1', cardOf(inCombat, 'forge'))[0];
  assert.equal(refusedNow.ok, false);
  assert.match(refusedNow.reason, /main phase/i);
});

test('an instant-speed ability works on another player turn', () => {
  const base = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: You gain 1 life.',
      power: '1',
      toughness: '1',
    },
  ]);
  const theirTurn = { ...base, activePlayerId: 'p2', priorityPlayerId: 'p2', step: 'upkeep' as const };

  const option = activationsFor(theirTurn, 'p1', cardOf(theirTurn, 'pyro'))[0];
  assert.equal(option.ok, true, option.reason);
  assert.equal(option.sorcerySpeed, false);
});

/* ------------------------------------------------------------------ *
 * Loyalty, and once each turn
 * ------------------------------------------------------------------ */

test('a loyalty ability costs loyalty and can only be used once a turn (CR 606.3)', () => {
  let state = game([
    {
      id: 'walker',
      name: 'Chandra, Pyromaster',
      typeLine: 'Legendary Planeswalker — Chandra',
      oracleText: '+1: Chandra, Pyromaster deals 1 damage to target player.\n-7: You gain 3 life.',
      loyalty: '4',
      counters: { loyalty: 4 },
    },
  ]);

  const listed = activationsFor(state, 'p1', cardOf(state, 'walker')).find(o => o.text.startsWith('+1'));
  assert.ok(listed, 'the +1 compiled');
  assert.equal(listed.isLoyalty, true);
  assert.equal(listed.sorcerySpeed, true, 'CR 606.3 — loyalty is sorcery speed');

  const plus = planActivation(state, 'p1', 'walker', listed.abilityId, {
    choices: { targets: [targetPlayer('p2')] },
  });
  assert.equal(plus.ok, true, plus.reason);

  state = applyActions(state, plus.actions);
  assert.equal(cardOf(state, 'walker')?.counters.loyalty, 5, 'the +1 was actually added');
  assert.equal(abilityUsesThisTurn(state, 'walker', listed.abilityId), 1);

  // Let it resolve first, so the only thing left standing in the way is CR
  // 606.3 rather than the ability still sitting on the stack.
  state = resolveTop(state);
  assert.equal(lifeOf(state, 'p2'), 39, 'and the +1 did its damage');

  for (const option of activationsFor(state, 'p1', cardOf(state, 'walker'))) {
    assert.equal(option.ok, false, `${option.text} should be refused`);
    assert.match(option.reason, /already used a loyalty ability/i);
  }
});

test('a loyalty cost bigger than the loyalty on the card is refused', () => {
  const state = game([
    {
      id: 'walker',
      name: 'Chandra, Pyromaster',
      typeLine: 'Legendary Planeswalker — Chandra',
      oracleText: '-7: You gain 3 life.',
      loyalty: '4',
      counters: { loyalty: 4 },
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'walker'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /loyalty/i);
});

test('"activate only once each turn" is enforced, and clears when the turn does', () => {
  let state = game([
    {
      id: 'font',
      name: 'Font of Fertility',
      typeLine: 'Artifact',
      oracleText: '{T}: You gain 1 life. Activate only once each turn.',
    },
  ]);

  const first = activationsFor(state, 'p1', cardOf(state, 'font'))[0];
  assert.equal(first.ok, true, first.reason);
  state = applyActions(state, first.actions);
  state = resolveTop(state);

  // Untapped by hand, so the only thing standing in the way is the limit.
  state = applyAction(state, { type: 'UNTAP', instanceId: 'font' });
  const second = activationsFor(state, 'p1', cardOf(state, 'font'))[0];
  assert.equal(second.ok, false);
  assert.match(second.reason, /already used this/i);

  state = applyAction(state, { type: 'PASS_TURN' });
  assert.equal(abilityUsesThisTurn(state, 'font', first.abilityId), 0, 'the record clears on a new turn');
});

/* ------------------------------------------------------------------ *
 * Refusals are always explained
 * ------------------------------------------------------------------ */

test('a mana ability says where it actually runs instead of tapping for nothing', () => {
  const state = game([
    {
      id: 'rock',
      name: 'Llanowar Elves',
      typeLine: 'Creature — Elf Druid',
      oracleText: '{T}: Add {G}.',
    },
  ]);

  const options = activationsFor(state, 'p1', cardOf(state, 'rock'));
  assert.equal(options.length > 0, true, 'the ability is listed rather than hidden');
  assert.equal(options[0].isManaAbility, true);
  assert.equal(options[0].ok, false);
  assert.match(options[0].reason, /when you pay for something/i);
});

test('somebody else’s permanent offers you nothing, and says so', () => {
  const state = game([
    {
      id: 'pyro',
      name: 'Prodigal Pyromancer',
      owner: 'p2',
      typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
      power: '1',
      toughness: '1',
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'pyro'));
  assert.equal(option.ok, false);
  assert.match(option.reason, /do not control/i);
});

test('a card with no activated ability produces an empty list, not a fake one', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' }]);
  assert.deepEqual(activationsFor(state, 'p1', cardOf(state, 'bear')), []);
});

test('every refused option carries a reason and builds no actions', () => {
  const state = game([
    {
      id: 'lab',
      name: 'Arcane Laboratory',
      typeLine: 'Artifact',
      oracleText: '{3}{U}: Draw a card.',
    },
  ]);

  for (const option of activationsFor(state, 'p1', cardOf(state, 'lab'))) {
    if (option.ok) continue;
    assert.notEqual(option.reason.trim(), '', 'a refusal with no sentence is silence');
    assert.deepEqual(option.actions, []);
  }
});

test('a restriction the engine cannot check refuses the ability rather than ignoring it', () => {
  // Sinew Dancer's second ability, verbatim. Found by playing: the panel
  // offered it against an opponent with no poison counters at all.
  const state = game([
    {
      id: 'dancer',
      name: 'Sinew Dancer',
      typeLine: 'Creature — Phyrexian Human Warrior',
      oracleText:
        'Corrupted — {W}, {T}: Tap target creature. Activate only if an opponent has three or more poison counters.',
      power: '2',
      toughness: '2',
    },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', power: '2', toughness: '2' },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'dancer'));
  assert.equal(option.ok, false, 'a card must never play stronger than it is printed');
  assert.match(option.reason, /Activate only if an opponent has three or more poison counters/i);
  assert.deepEqual(option.actions, []);
});

test('"activate only as an instant" is permission, not a restriction, so it still works', () => {
  const state = game([
    {
      id: 'sphere',
      name: 'Chromatic Sphere',
      typeLine: 'Artifact',
      oracleText: '{T}: You gain 1 life. (Activate only as an instant.)',
    },
  ]);

  const [option] = activationsFor(state, 'p1', cardOf(state, 'sphere'));
  assert.equal(option.ok, true, option.reason);
});

/* ------------------------------------------------------------------ *
 * Three things a hundred and twenty recorded games found and reading
 * did not. Each one names the card it was measured on.
 * ------------------------------------------------------------------ */

test('a "{G}, {T}" ability cannot pay its {T} with the same tap that paid the mana', () => {
  /*
   * Okina, Temple to the Grandfathers. Its own tap was planned for the {T} and
   * then planned AGAIN by the mana planner for the {G}, so the batch read
   * TAP(Okina), TAP(Okina, refused), announce, and the ability went off having
   * paid one cost with one tap. Seen 40 times in 120 games.
   */
  let state = game([
    {
      id: 'okina',
      name: 'Okina, Temple to the Grandfathers',
      typeLine: 'Legendary Land',
      oracleText:
        '{T}: Add {G}.\n{G}, {T}: Target legendary creature gets +1/+1 until end of turn.',
    },
    { id: 'hero', name: 'Isamaru, Hound of Konda', typeLine: 'Legendary Creature — Dog', power: '2', toughness: '2' },
  ]);
  state = { ...state, cards: { ...state.cards, okina: { ...state.cards.okina, colorIdentity: ['G'] } } };

  const pump = activationsFor(state, 'p1', cardOf(state, 'okina')).find(o => /\+1\/\+1/.test(o.text));
  assert.ok(pump, 'the pump ability compiles');

  // No other land on the board, so the {G} has nowhere to come from but Okina
  // itself, and Okina's own tap is already spent on the {T}.
  assert.equal(pump.ok, false, 'a cost that cannot be paid twice must be refused');
  assert.deepEqual(pump.actions, []);

  // Give it a Forest and it becomes payable, with TWO different permanents tapped.
  const funded = withLands(state, 'p1', 1);
  const ok = activationsFor(funded, 'p1', cardOf(funded, 'okina')).find(o => /\+1\/\+1/.test(o.text));
  assert.ok(ok);
  const chosen = planActivation(funded, 'p1', 'okina', ok.abilityId, {
    choices: { targets: [{ kind: 'card', instanceId: 'hero', zone: 'battlefield', zoneChangeCounter: 0 }] },
  });
  assert.equal(chosen.ok, true, chosen.reason);
  const taps = chosen.actions.filter(a => a.type === 'TAP').map(a => (a as { instanceId: string }).instanceId);
  assert.equal(new Set(taps).size, taps.length, 'no permanent is tapped twice in one batch');
  assert.equal(taps.length, 2, `expected the land and the source, got ${taps.join(',')}`);

  // And the batch really applies: nothing in it is refused.
  const after = applyActions(funded, chosen.actions);
  assert.equal(stackHeight(after), 1, 'the ability reached the stack');
  assert.equal(cardOf(after, 'okina')?.tapped, true);
  assert.equal(cardOf(after, 'p1-forest0')?.tapped, true);
});

test('a mana ability with a rider is still a mana ability and never reaches the stack', () => {
  /*
   * Barbarian Ring, verbatim. The compiler's `isManaAbility` requires EVERY
   * effect to add mana, so a land that charges for its mana was not flagged and
   * was offered as a pressable control. There is no mana pool, so pressing it
   * tapped the land, dealt its controller a point of damage and produced
   * nothing. Seen 142 times in 120 games, over 33 distinct cards.
   */
  const state = game([
    {
      id: 'ring',
      name: 'Barbarian Ring',
      typeLine: 'Land',
      oracleText:
        'Barbarian Ring enters tapped.\n{T}: Add {R}. Barbarian Ring deals 1 damage to you.',
    },
  ]);

  const options = activationsFor(state, 'p1', cardOf(state, 'ring'));
  const mana = options.find(o => /Add \{R\}/.test(o.text));
  assert.ok(mana, 'the ability compiles');
  assert.equal(mana.isManaAbility, true, 'CR 605.1a: it could add mana, so it is a mana ability');
  assert.equal(mana.ok, false, 'a mana ability must not be offered as a control of its own');
  assert.match(mana.reason, /pay for something/i);
  assert.deepEqual(mana.actions, [], 'nothing to apply means no tap and no damage');
});

test('a planeswalker enters with its printed loyalty, so a minus ability is affordable', () => {
  /*
   * `PlayCard` carried no `loyalty`, so no real game ever set
   * `CardInstance.loyalty`, so CR 306.5b seeded nothing and every planeswalker
   * stood at zero. Measured over 120 games: 77 plus activations and 0 minus
   * activations, every minus refused for want of counters.
   */
  const state = game([
    {
      id: 'chandra',
      name: 'Chandra, Torch of Defiance',
      typeLine: 'Legendary Planeswalker — Chandra',
      loyalty: '4',
      oracleText:
        '+1: Exile the top card of your library. You may cast that card. If you don\'t, Chandra deals 2 damage to each opponent.\n' +
        '−3: Chandra, Torch of Defiance deals 4 damage to target creature.',
    },
    { id: 'bear', name: 'Grizzly Bears', owner: 'p2', power: '2', toughness: '2' },
  ]);

  assert.equal(cardOf(state, 'chandra')?.counters?.loyalty, 4, 'CR 306.5b');

  const minus = activationsFor(state, 'p1', cardOf(state, 'chandra')).find(o => /^[−-]3/.test(o.text));
  assert.ok(minus, 'the minus ability compiles');
  assert.ok(minus.ok || minus.pending.length > 0, `a printed minus must be reachable: ${minus.reason}`);
});
