/**
 * Unit tests for the combat maths.
 *
 *   node --test --experimental-strip-types src/lib/game/combat.test.ts
 *
 * Keyword abilities are the one part of Magic's rules this project implements
 * properly, on the grounds that they are a closed set with fixed meanings. That
 * claim is only worth making if it is checked, so every keyword `combat.ts`
 * says it handles gets a case here, and the awkward interactions between them —
 * deathtouch with trample, trample over a blocker that died to first strike,
 * protection preventing damage that was still assigned — get one each too.
 *
 * These call `resolveCombat` directly against a hand-built state rather than
 * going through `applyAction`, so a failure points at the damage maths and not
 * at the reducer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from './rules.ts';
import {
  blockersRequiredFor,
  canBlock,
  eligibleAttackers,
  powerOf,
  resolveCombat,
  statLine,
  tapsToAttack,
  toughnessOf,
  validateBlockGroup,
} from './combat.ts';
import type { CardInstance, GameState, InstanceId, PlayerId } from './types.ts';

/* ------------------------------------------------------------------ *
 * Table building
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner: PlayerId;
  name?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  oracleText?: string;
  counters?: Record<string, number>;
  tapped?: boolean;
  summoningSick?: boolean;
  isCommander?: boolean;
  colorIdentity?: CardInstance['colorIdentity'];
  powerOverride?: number;
  toughnessOverride?: number;
}

/** Two players, `life` each, with the given creatures already on the battlefield. */
function table(specs: Spec[], life = 20): GameState {
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
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name ?? spec.id,
        ownerId: spec.owner,
        controllerId: spec.owner,
        typeLine: 'Creature — Test',
        power: spec.power ?? '1',
        toughness: spec.toughness ?? '1',
        keywords: spec.keywords ?? [],
        oracleText: spec.oracleText ?? '',
        counters: spec.counters ?? {},
        tapped: spec.tapped ?? false,
        summoningSick: spec.summoningSick ?? false,
        isCommander: spec.isCommander ?? false,
        colorIdentity: spec.colorIdentity,
        powerOverride: spec.powerOverride,
        toughnessOverride: spec.toughnessOverride,
      },
      'battlefield'
    );
  }

  return state;
}

/** Declare an attack (and optional blocks) without going through the reducer. */
function withCombat(
  state: GameState,
  attacks: Array<{ attacker: InstanceId; defender?: PlayerId; blockedBy?: InstanceId[] }>
): GameState {
  return {
    ...state,
    combat: {
      attackers: attacks.map(attack => ({
        attackerId: attack.attacker,
        defenderPlayerId: attack.defender ?? 'p2',
        blockedBy: attack.blockedBy ?? [],
      })),
    },
  };
}

function damageTo(outcome: ReturnType<typeof resolveCombat>, playerId: PlayerId): number {
  return outcome.playerDamage.find(entry => entry.playerId === playerId)?.amount ?? 0;
}

function lifeGained(outcome: ReturnType<typeof resolveCombat>, playerId: PlayerId): number {
  return outcome.lifelink.find(entry => entry.playerId === playerId)?.amount ?? 0;
}

/* ------------------------------------------------------------------ *
 * Characteristics
 * ------------------------------------------------------------------ */

test('counters move power and toughness together', () => {
  const state = table([
    { id: 'a', owner: 'p1', power: '2', toughness: '2', counters: { '+1/+1': 3 } },
    { id: 'b', owner: 'p1', power: '4', toughness: '4', counters: { '-1/-1': 2 } },
  ]);
  assert.equal(powerOf(state.cards.a), 5);
  assert.equal(toughnessOf(state.cards.a), 5);
  assert.equal(powerOf(state.cards.b), 2);
  assert.equal(toughnessOf(state.cards.b), 2);
  assert.equal(statLine(state.cards.a), '5/5');
});

test('a hand-set stat replaces the printed one and counters still stack on top', () => {
  const state = table([
    {
      id: 'a',
      owner: 'p1',
      power: '1',
      toughness: '1',
      powerOverride: 4,
      toughnessOverride: 4,
      counters: { '+1/+1': 1 },
    },
  ]);
  assert.equal(statLine(state.cards.a), '5/5');
});

test('power never reads below zero', () => {
  const state = table([
    { id: 'a', owner: 'p1', power: '1', toughness: '1', counters: { '-1/-1': 5 } },
  ]);
  assert.equal(powerOf(state.cards.a), 0);
  assert.equal(toughnessOf(state.cards.a), -4);
});

/* ------------------------------------------------------------------ *
 * Attack and block legality
 * ------------------------------------------------------------------ */

test('defender cannot attack, and haste beats summoning sickness', () => {
  const state = table([
    { id: 'wall', owner: 'p1', keywords: ['defender'] },
    { id: 'sick', owner: 'p1', summoningSick: true },
    { id: 'hasty', owner: 'p1', summoningSick: true, keywords: ['haste'] },
    { id: 'tapped', owner: 'p1', tapped: true },
    { id: 'ready', owner: 'p1' },
  ]);
  const ids = eligibleAttackers(state, 'p1').map(card => card.instanceId).sort();
  assert.deepEqual(ids, ['hasty', 'ready']);
});

test('vigilance keeps an attacker untapped', () => {
  const state = table([
    { id: 'v', owner: 'p1', keywords: ['vigilance'] },
    { id: 'n', owner: 'p1' },
  ]);
  assert.equal(tapsToAttack(state, state.cards.v), false);
  assert.equal(tapsToAttack(state, state.cards.n), true);
});

test('flying can only be blocked by flying or reach', () => {
  const state = table([
    { id: 'flier', owner: 'p1', keywords: ['flying'] },
    { id: 'ground', owner: 'p2' },
    { id: 'bird', owner: 'p2', keywords: ['flying'] },
    { id: 'spider', owner: 'p2', keywords: ['reach'] },
  ]);
  assert.equal(canBlock(state, state.cards.flier, state.cards.ground), false);
  assert.equal(canBlock(state, state.cards.flier, state.cards.bird), true);
  assert.equal(canBlock(state, state.cards.flier, state.cards.spider), true);
});

test('a tapped creature cannot block', () => {
  const state = table([
    { id: 'a', owner: 'p1' },
    { id: 'b', owner: 'p2', tapped: true },
  ]);
  assert.equal(canBlock(state, state.cards.a, state.cards.b), false);
});

test('menace needs two blockers, and one is rejected with a reason', () => {
  const state = table([
    { id: 'menacer', owner: 'p1', keywords: ['menace'] },
    { id: 'x', owner: 'p2' },
    { id: 'y', owner: 'p2' },
  ]);
  assert.equal(blockersRequiredFor(state, state.cards.menacer), 2);

  const single = validateBlockGroup(state, state.cards.menacer, [state.cards.x]);
  assert.equal(single.ok, false);
  assert.match(single.reason, /menace/);

  const pair = validateBlockGroup(state, state.cards.menacer, [state.cards.x, state.cards.y]);
  assert.equal(pair.ok, true);
});

test('protection from red stops a red creature blocking', () => {
  const state = table([
    { id: 'knight', owner: 'p1', keywords: ['protection'], oracleText: 'Protection from red' },
    { id: 'goblin', owner: 'p2', colorIdentity: ['R'] },
    { id: 'bear', owner: 'p2', colorIdentity: ['G'] },
  ]);
  assert.equal(canBlock(state, state.cards.knight, state.cards.goblin), false);
  assert.equal(canBlock(state, state.cards.knight, state.cards.bear), true);
  assert.match(validateBlockGroup(state, state.cards.knight, [state.cards.goblin]).reason, /protection/);
});

/* ------------------------------------------------------------------ *
 * Damage
 * ------------------------------------------------------------------ */

test('an unblocked attacker hits the defending player for its power', () => {
  const state = withCombat(table([{ id: 'a', owner: 'p1', power: '3', toughness: '3' }]), [
    { attacker: 'a' },
  ]);
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 3);
  assert.deepEqual(outcome.destroyed, []);
});

test('two two-drops trade', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '2', toughness: '2' },
      { id: 'b', owner: 'p2', power: '2', toughness: '2' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed.sort(), ['a', 'b']);
  assert.equal(damageTo(outcome, 'p2'), 0);
});

test('a blocked attacker with no trample deals nothing to the player', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '5', toughness: '5' },
      { id: 'b', owner: 'p2', power: '1', toughness: '1' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 0);
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('trample sends the excess over lethal to the player', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '5', toughness: '5', keywords: ['trample'] },
      { id: 'b', owner: 'p2', power: '1', toughness: '2' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 3);
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('deathtouch makes one point lethal, so trample carries almost everything over', () => {
  const state = withCombat(
    table([
      {
        id: 'a',
        owner: 'p1',
        power: '5',
        toughness: '5',
        keywords: ['trample', 'deathtouch'],
      },
      { id: 'b', owner: 'p2', power: '1', toughness: '4' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 4);
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('a 1/1 with deathtouch kills a 5/5 and dies doing it', () => {
  const state = withCombat(
    table([
      { id: 'big', owner: 'p1', power: '5', toughness: '5' },
      { id: 'snake', owner: 'p2', power: '1', toughness: '1', keywords: ['deathtouch'] },
    ]),
    [{ attacker: 'big', blockedBy: ['snake'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed.sort(), ['big', 'snake']);
});

test('indestructible survives lethal damage and deathtouch', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '9', toughness: '9', keywords: ['deathtouch'] },
      { id: 'wall', owner: 'p2', power: '0', toughness: '1', keywords: ['indestructible'] },
    ]),
    [{ attacker: 'a', blockedBy: ['wall'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed, []);
});

test('damage assignment spreads lethal-first across several blockers', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '5', toughness: '5' },
      { id: 'x', owner: 'p2', power: '1', toughness: '2' },
      { id: 'y', owner: 'p2', power: '1', toughness: '2' },
      { id: 'z', owner: 'p2', power: '1', toughness: '2' },
    ]),
    [{ attacker: 'a', blockedBy: ['x', 'y', 'z'] }]
  );
  const outcome = resolveCombat(state);
  // 2 + 2 kills x and y; the fifth point is not lethal on z. The attacker takes
  // 3 back from the three blockers and survives on 5 toughness.
  assert.deepEqual(outcome.destroyed.sort(), ['x', 'y']);
});

/* ------------------------------------------------------------------ *
 * First strike
 * ------------------------------------------------------------------ */

test('first strike kills the blocker before it can hit back', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '2', toughness: '2', keywords: ['first strike'] },
      { id: 'b', owner: 'p2', power: '2', toughness: '2' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(outcome.firstStrikeStep, true);
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('first strike does not save an attacker that failed to kill', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '2', toughness: '2', keywords: ['first strike'] },
      { id: 'b', owner: 'p2', power: '3', toughness: '3' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed, ['a']);
});

test('double strike hits twice when unblocked', () => {
  const state = withCombat(
    table([{ id: 'a', owner: 'p1', power: '3', toughness: '3', keywords: ['double strike'] }]),
    [{ attacker: 'a' }]
  );
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 6);
});

test('double strike finishes a blocker across the two steps', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '2', toughness: '5', keywords: ['double strike'] },
      { id: 'b', owner: 'p2', power: '1', toughness: '3' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  // 2 in the first-strike step is not lethal; 2 more in the regular step is.
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('a first-strike trampler that kills its blocker sends only the excess through', () => {
  const state = withCombat(
    table([
      {
        id: 'a',
        owner: 'p1',
        power: '4',
        toughness: '4',
        keywords: ['first strike', 'trample'],
      },
      { id: 'b', owner: 'p2', power: '2', toughness: '2' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(damageTo(outcome, 'p2'), 2);
  assert.deepEqual(outcome.destroyed, ['b']);
});

test('a non-trampler whose only blocker died to first strike still deals nothing', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '4', toughness: '4' },
      { id: 'fs', owner: 'p2', power: '4', toughness: '4', keywords: ['first strike'] },
    ]),
    [{ attacker: 'a', blockedBy: ['fs'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed, ['a']);
  assert.equal(damageTo(outcome, 'p2'), 0);
});

/* ------------------------------------------------------------------ *
 * Lifelink and protection
 * ------------------------------------------------------------------ */

test('lifelink gains the controller life for damage dealt to a player', () => {
  const state = withCombat(
    table([{ id: 'a', owner: 'p1', power: '4', toughness: '4', keywords: ['lifelink'] }]),
    [{ attacker: 'a' }]
  );
  const outcome = resolveCombat(state);
  assert.equal(lifeGained(outcome, 'p1'), 4);
  assert.ok(
    outcome.actions.some(
      action => action.type === 'LIFE_CHANGE' && action.playerId === 'p1' && action.delta === 4
    )
  );
});

test('lifelink counts damage dealt to a blocker too', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '3', toughness: '3', keywords: ['lifelink'] },
      { id: 'b', owner: 'p2', power: '1', toughness: '4' },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.equal(lifeGained(outcome, 'p1'), 3);
});

test('protection prevents the damage but the attacker still had to assign it', () => {
  const state = withCombat(
    table([
      { id: 'a', owner: 'p1', power: '4', toughness: '4', colorIdentity: ['R'] },
      {
        id: 'b',
        owner: 'p2',
        power: '1',
        toughness: '2',
        keywords: ['protection'],
        oracleText: 'Protection from red',
      },
    ]),
    [{ attacker: 'a', blockedBy: ['b'] }]
  );
  const outcome = resolveCombat(state);
  assert.deepEqual(outcome.destroyed, []);
  assert.equal(damageTo(outcome, 'p2'), 0);
});

/* ------------------------------------------------------------------ *
 * Commander damage
 * ------------------------------------------------------------------ */

test('an unblocked commander tags the defender with commander damage', () => {
  let state = table([{ id: 'cmd', owner: 'p1', power: '6', toughness: '6', isCommander: true }], 40);
  state = {
    ...state,
    players: state.players.map(player =>
      player.id === 'p1'
        ? {
            ...player,
            commanders: [{ id: 'p1-cmd1', playerId: 'p1', name: 'cmd', instanceId: 'cmd', castCount: 1 }],
          }
        : player
    ),
  };
  const outcome = resolveCombat(withCombat(state, [{ attacker: 'cmd' }]));
  const damage = outcome.actions.find(action => action.type === 'DAMAGE');
  assert.ok(damage && damage.type === 'DAMAGE');
  assert.equal(damage.commanderId, 'p1-cmd1');
  assert.equal(outcome.playerDamage[0].commander, true);
});

test('no declared attackers resolves to nothing at all', () => {
  const outcome = resolveCombat(table([{ id: 'a', owner: 'p1' }]));
  assert.deepEqual(outcome.actions, []);
  assert.equal(outcome.summary, 'No combat damage.');
});
