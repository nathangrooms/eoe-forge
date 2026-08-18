/**
 * Unit tests for state-based actions (CR 704).
 *
 *   node --test --experimental-strip-types src/lib/game/sba.test.ts
 *
 * Two things are being defended here, and the second is the one that usually
 * breaks.
 *
 * **The rules themselves.** Every branch of `stateBasedActions` gets a case,
 * including the three that are deliberately gated on knowing a number — a `*`/`*`
 * creature, a planeswalker with no printed loyalty, an Aura that enchants a
 * player. Those gates exist because putting a permanent into a graveyard on a
 * number the engine does not have is a silent corruption, and a test that only
 * checked the happy path would let someone "simplify" them away.
 *
 * **The loop.** Checking state-based actions once instead of until stable is
 * the classic implementation bug: it catches the first death and leaves the
 * cascade behind. `cascades until the board is stable` builds exactly that
 * cascade — a creature dies, its Aura becomes illegal, and the second pass has
 * to notice — and `stateBasedActions` is asserted to return nothing at the end,
 * which is the only real definition of "stable".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, checkStateBasedActions, createGame } from './rules.ts';
import {
  MAX_SBA_ITERATIONS,
  knownToughness,
  lossReasonsFor,
  runStateBasedActions,
  stateBasedActions,
} from './sba.ts';
import type { CardInstance, GameState, PlayerId, Zone } from './types.ts';

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
  loyalty?: string;
  counters?: Record<string, number>;
  damage?: number;
  damagedByDeathtouch?: boolean;
  attachedTo?: string;
  isToken?: boolean;
  zone?: Zone;
  controllerId?: PlayerId;
}

function table(specs: Spec[], life = 20, players = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: life,
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
        controllerId: spec.controllerId ?? spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Test',
        oracleText: spec.oracleText ?? '',
        keywords: spec.keywords ?? [],
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        loyalty: spec.loyalty,
        counters: spec.counters ?? {},
        damage: spec.damage ?? 0,
        damagedByDeathtouch: spec.damagedByDeathtouch,
        attachedTo: spec.attachedTo,
        isToken: spec.isToken ?? false,
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

function zoneOf(state: GameState, id: string): Zone | undefined {
  return state.cards[id]?.zone;
}

function kinds(state: GameState): string[] {
  return stateBasedActions(state).map(finding => finding.kind);
}

/* ------------------------------------------------------------------ *
 * The loop — the bug this file exists to catch
 * ------------------------------------------------------------------ */

test('the loop runs until nothing applies, not once', () => {
  // A creature about to die, wearing an Aura. Pass one kills the creature;
  // only pass two can see that the Aura is now attached to nothing. A
  // single-pass implementation leaves the Aura on the battlefield.
  let state = table([
    { id: 'bear', name: 'Bear', toughness: '2', damage: 2 },
    {
      id: 'aura',
      name: 'Holy Strength',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature',
      attachedTo: 'bear',
    },
  ]);

  state = checkStateBasedActions(state, 0);

  assert.equal(zoneOf(state, 'bear'), 'graveyard');
  assert.equal(zoneOf(state, 'aura'), 'graveyard');
  // Stable means: asked again, it has nothing to say.
  assert.deepEqual(stateBasedActions(state), []);
});

test('a single pass would have left the board wrong — proving the loop is load-bearing', () => {
  const state = table([
    { id: 'bear', name: 'Bear', toughness: '2', damage: 2 },
    {
      id: 'aura',
      name: 'Holy Strength',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature',
      attachedTo: 'bear',
    },
  ]);

  // One pass of detection sees only the creature. The Aura is invisible until
  // the creature has actually gone.
  const firstPass = stateBasedActions(state);
  assert.deepEqual(
    firstPass.map(f => f.kind),
    ['creature-destroyed']
  );
});

test('a three-deep cascade settles, and reports how many passes it took', () => {
  // Aura on an Aura's host, and a player who dies when the dust settles.
  let state = table([
    { id: 'bear', name: 'Bear', toughness: '1', damage: 1 },
    {
      id: 'aura',
      name: 'Pacifism',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature',
      attachedTo: 'bear',
    },
  ]);
  state = { ...state, players: state.players.map(p => (p.id === 'p2' ? { ...p, life: 0 } : p)) };

  const run = runStateBasedActions(state, (current, finding) => {
    // A deliberately minimal applier: it proves the loop, not the game rules.
    if (finding.kind === 'player-loses') {
      return {
        ...current,
        players: current.players.map(p =>
          p.id === finding.playerId ? { ...p, hasLost: true } : p
        ),
      };
    }
    const id = finding.instanceId!;
    const card = current.cards[id];
    return {
      ...current,
      cards: { ...current.cards, [id]: { ...card, zone: 'graveyard' as Zone } },
      players: current.players.map(p => ({
        ...p,
        zones: { ...p.zones, battlefield: p.zones.battlefield.filter(x => x !== id) },
      })),
    };
  });

  assert.equal(run.stable, true);
  assert.ok(run.iterations >= 2, 'a cascade needs more than one pass');
  assert.ok(run.findings.some(f => f.kind === 'creature-destroyed'));
  assert.ok(run.findings.some(f => f.kind === 'aura-illegal'));
  assert.ok(run.findings.some(f => f.kind === 'player-loses'));
});

test('an applier that never resolves anything is capped rather than hanging', () => {
  const state = table([{ id: 'bear', toughness: '2', damage: 5 }]);
  // An applier that changes nothing keeps the same finding true forever. Real
  // Magic calls that a draw (CR 704.4); we stop and say so.
  const run = runStateBasedActions(state, current => current);
  assert.equal(run.stable, false);
  assert.equal(run.iterations, MAX_SBA_ITERATIONS);
});

test('detection is pure — the same state twice gives the same answer', () => {
  const state = table([{ id: 'bear', toughness: '2', damage: 3 }]);
  assert.deepEqual(stateBasedActions(state), stateBasedActions(state));
});

/* ------------------------------------------------------------------ *
 * 704.5a / 704.5b / 704.5c / 704.6b — losing
 * ------------------------------------------------------------------ */

test('a player at 0 life loses, and the game ends', () => {
  let state = table([], 3);
  state = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 3 });
  assert.equal(state.players[1].hasLost, true);
  assert.deepEqual(state.players[1].lossReasons, ['life']);
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.winnerIds, ['p1']);
});

test('ten poison counters is lethal', () => {
  let state = table([], 40);
  state = applyAction(state, { type: 'POISON', playerId: 'p2', delta: 10 });
  assert.equal(state.players[1].hasLost, true);
  assert.deepEqual(state.players[1].lossReasons, ['poison']);
});

test('twenty-one damage from ONE commander is lethal and is never summed', () => {
  // Life is set high enough that the 40 total damage below is survivable, so
  // the only thing under test is the commander-damage rule itself.
  const state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 60,
    players: [
      { id: 'p1', name: 'One', commanders: [{ id: 'c1', name: 'First' }] },
      { id: 'p2', name: 'Two', commanders: [{ id: 'c2', name: 'Second' }] },
    ],
  });

  // 20 from each of two commanders is 40 damage and not a loss: the rule is per
  // commander. This is the assertion that catches a summing bug.
  let split = applyAction(state, {
    type: 'COMMANDER_DAMAGE',
    targetPlayerId: 'p2',
    commanderId: 'c1',
    amount: 20,
  });
  split = applyAction(split, {
    type: 'COMMANDER_DAMAGE',
    targetPlayerId: 'p2',
    commanderId: 'c2',
    amount: 20,
  });
  assert.equal(split.players[1].life, 20);
  assert.equal(split.players[1].hasLost, false, '40 across two commanders is not 21 from one');

  const single = applyAction(state, {
    type: 'COMMANDER_DAMAGE',
    targetPlayerId: 'p2',
    commanderId: 'c1',
    amount: 21,
  });
  assert.equal(single.players[1].hasLost, true);
  assert.ok(single.players[1].lossReasons.includes('commander_damage'));
});

test('drawing from an empty library loses the game when SBAs next check', () => {
  let state = table([], 20);
  state = applyAction(state, { type: 'DRAW', playerId: 'p2', count: 1 });
  assert.equal(state.players[1].hasLost, true);
  assert.ok(state.players[1].lossReasons.includes('empty_library'));
});

test('a life counter cannot be decked — it has no library to run out of', () => {
  const state = createGame({
    mode: 'life-counter',
    format: 'commander',
    players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
  });
  const player = { ...state.players[1], drewFromEmptyLibrary: true };
  assert.deepEqual(lossReasonsFor(state, player), []);
});

/* ------------------------------------------------------------------ *
 * 704.5f / 704.5g / 704.5h — creatures
 * ------------------------------------------------------------------ */

test('lethal damage destroys a creature', () => {
  const state = checkStateBasedActions(table([{ id: 'bear', toughness: '2', damage: 2 }]), 0);
  assert.equal(zoneOf(state, 'bear'), 'graveyard');
});

test('damage below toughness does not', () => {
  const state = checkStateBasedActions(table([{ id: 'bear', toughness: '3', damage: 2 }]), 0);
  assert.equal(zoneOf(state, 'bear'), 'battlefield');
});

test('indestructible survives lethal damage', () => {
  const state = checkStateBasedActions(
    table([{ id: 'wall', toughness: '2', damage: 9, keywords: ['indestructible'] }]),
    0
  );
  assert.equal(zoneOf(state, 'wall'), 'battlefield');
});

test('one point of deathtouch damage is lethal', () => {
  const state = table([{ id: 'giant', toughness: '9', damage: 1, damagedByDeathtouch: true }]);
  assert.deepEqual(kinds(state), ['creature-destroyed']);
  assert.equal(stateBasedActions(state)[0].rule, '704.5h');
  assert.equal(zoneOf(checkStateBasedActions(state, 0), 'giant'), 'graveyard');
});

test('indestructible survives deathtouch too', () => {
  const state = table([
    { id: 'giant', toughness: '9', damage: 1, damagedByDeathtouch: true, keywords: ['indestructible'] },
  ]);
  assert.deepEqual(kinds(state), []);
});

test('toughness 0 puts a creature in the graveyard, and indestructible does NOT save it', () => {
  // CR 704.5f is not destruction, so indestructible is no help. Getting this
  // backwards is a common bug and it is silent — the creature just never dies.
  const state = table([
    { id: 'shrunk', toughness: '1', counters: { '-1/-1': 1 }, keywords: ['indestructible'] },
  ]);
  assert.deepEqual(kinds(state), ['creature-zero-toughness']);
  assert.equal(zoneOf(checkStateBasedActions(state, 0), 'shrunk'), 'graveyard');
});

test('a */* creature is NOT killed for having no printed number', () => {
  // `combat.ts` reads a variable toughness as 0 so damage maths has something to
  // work with. Reusing that here would kill every Tarmogoyf on arrival.
  const state = table([{ id: 'goyf', power: '*', toughness: '1+*' }]);
  assert.equal(knownToughness(state.cards.goyf), null);
  assert.deepEqual(kinds(state), []);
});

test('…but a hand-set override gives the engine a number it may act on', () => {
  let state = table([{ id: 'goyf', power: '*', toughness: '*' }]);
  state = applyAction(state, {
    type: 'SET_CARD_STAT',
    instanceId: 'goyf',
    power: 3,
    toughness: 3,
  });
  assert.equal(knownToughness(state.cards.goyf), 3);
  state = applyAction(state, {
    type: 'CARD_COUNTER',
    instanceId: 'goyf',
    counter: '-1/-1',
    delta: 3,
  });
  assert.equal(zoneOf(state, 'goyf'), 'graveyard');
});

test('a noncreature permanent with damage on it is left alone', () => {
  const state = table([
    { id: 'rock', typeLine: 'Artifact', power: undefined, toughness: undefined, damage: 5 },
  ]);
  assert.deepEqual(kinds(state), []);
});

/* ------------------------------------------------------------------ *
 * 704.5i — planeswalkers
 * ------------------------------------------------------------------ */

test('a planeswalker enters with its printed loyalty and does not immediately die', () => {
  let state = table([
    { id: 'jace', typeLine: 'Legendary Planeswalker — Jace', loyalty: '3', zone: 'hand' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'jace', to: 'battlefield' });
  assert.equal(state.cards.jace.counters.loyalty, 3);
  assert.equal(zoneOf(state, 'jace'), 'battlefield');
});

test('a planeswalker at zero loyalty is put into its graveyard', () => {
  let state = table([
    { id: 'jace', typeLine: 'Legendary Planeswalker — Jace', loyalty: '3', counters: { loyalty: 3 } },
  ]);
  state = applyAction(state, {
    type: 'CARD_COUNTER',
    instanceId: 'jace',
    counter: 'loyalty',
    delta: -3,
  });
  assert.equal(zoneOf(state, 'jace'), 'graveyard');
});

test('a planeswalker whose printed loyalty was never loaded is never destroyed', () => {
  // The honest pairing with the seeding above: no number, no ruling.
  const state = table([{ id: 'mystery', typeLine: 'Legendary Planeswalker — Mystery' }]);
  assert.deepEqual(kinds(state), []);
});

/* ------------------------------------------------------------------ *
 * 704.5j — the legend rule
 * ------------------------------------------------------------------ */

test('a second copy of a legend goes to the graveyard, and the older one stays', () => {
  const state = table([
    { id: 'old', name: 'Kenrith', typeLine: 'Legendary Creature — Human Noble' },
    { id: 'new', name: 'Kenrith', typeLine: 'Legendary Creature — Human Noble' },
  ]);

  const findings = stateBasedActions(state);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'legend-rule');
  assert.equal(findings[0].instanceId, 'new');
  assert.equal(findings[0].keptInstanceId, 'old', 'the copy in play longest is kept');

  const settled = checkStateBasedActions(state, 0);
  assert.equal(zoneOf(settled, 'old'), 'battlefield');
  assert.equal(zoneOf(settled, 'new'), 'graveyard');
  // The log says which was kept, because the rules give the player that choice
  // and a pure reducer had to make it for them.
  assert.ok(settled.log.some(event => /legend rule/i.test(event.message)));
});

test('three copies leave exactly one', () => {
  const state = checkStateBasedActions(
    table([
      { id: 'a', name: 'Kenrith', typeLine: 'Legendary Creature — Human' },
      { id: 'b', name: 'Kenrith', typeLine: 'Legendary Creature — Human' },
      { id: 'c', name: 'Kenrith', typeLine: 'Legendary Creature — Human' },
    ]),
    0
  );
  const alive = ['a', 'b', 'c'].filter(id => zoneOf(state, id) === 'battlefield');
  assert.deepEqual(alive, ['a']);
});

test('the legend rule is per player, not per table', () => {
  const state = table([
    { id: 'mine', owner: 'p1', name: 'Kenrith', typeLine: 'Legendary Creature — Human' },
    { id: 'theirs', owner: 'p2', name: 'Kenrith', typeLine: 'Legendary Creature — Human' },
  ]);
  assert.deepEqual(kinds(state), []);
});

test('two nonlegendary permanents with the same name are fine', () => {
  const state = table([
    { id: 'a', name: 'Grizzly Bears', typeLine: 'Creature — Bear' },
    { id: 'b', name: 'Grizzly Bears', typeLine: 'Creature — Bear' },
  ]);
  assert.deepEqual(kinds(state), []);
});

/* ------------------------------------------------------------------ *
 * 704.5m / 704.5n — Auras and Equipment
 * ------------------------------------------------------------------ */

test('an Aura attached to nothing goes to the graveyard', () => {
  const state = table([
    { id: 'aura', typeLine: 'Enchantment — Aura', oracleText: 'Enchant creature' },
  ]);
  assert.deepEqual(kinds(state), ['aura-illegal']);
});

test('an Aura that enchants creatures cannot stay on a land', () => {
  const state = table([
    { id: 'forest', typeLine: 'Basic Land — Forest' },
    {
      id: 'aura',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature',
      attachedTo: 'forest',
    },
  ]);
  assert.deepEqual(kinds(state), ['aura-illegal']);
});

test('an Aura that enchants a PLAYER is left alone — it has no permanent to point at', () => {
  // A false positive here would bin a perfectly legal card, which is exactly
  // the silent corruption this engine refuses to commit.
  const state = table([
    { id: 'curse', typeLine: 'Enchantment — Aura Curse', oracleText: 'Enchant player' },
  ]);
  assert.deepEqual(kinds(state), []);
});

test('an Aura with no readable Enchant line is left alone', () => {
  const state = table([{ id: 'aura', typeLine: 'Enchantment — Aura', oracleText: '' }]);
  assert.deepEqual(kinds(state), []);
});

test('an Equipment on a dead creature comes unattached rather than dying', () => {
  let state = table([
    { id: 'bear', toughness: '2', damage: 2 },
    { id: 'sword', typeLine: 'Artifact — Equipment', attachedTo: 'bear' },
  ]);
  state = checkStateBasedActions(state, 0);
  assert.equal(zoneOf(state, 'bear'), 'graveyard');
  assert.equal(zoneOf(state, 'sword'), 'battlefield', 'Equipment survives its wearer');
  assert.equal(state.cards.sword.attachedTo, undefined);
});

test('an Equipment attached to something that is not a creature comes off', () => {
  const state = table([
    { id: 'forest', typeLine: 'Basic Land — Forest' },
    { id: 'sword', typeLine: 'Artifact — Equipment', attachedTo: 'forest' },
  ]);
  assert.deepEqual(kinds(state), ['equipment-unattached']);
});

/* ------------------------------------------------------------------ *
 * 704.5q — counters that cancel
 * ------------------------------------------------------------------ */

test('+1/+1 and -1/-1 counters annihilate in pairs', () => {
  let state = table([{ id: 'bear', toughness: '2', counters: { '+1/+1': 3, '-1/-1': 1 } }]);
  state = checkStateBasedActions(state, 0);
  assert.equal(state.cards.bear.counters['+1/+1'], 2);
  assert.equal(state.cards.bear.counters['-1/-1'], undefined);
  assert.deepEqual(stateBasedActions(state), []);
});

test('equal numbers of both leave neither', () => {
  let state = table([{ id: 'bear', toughness: '4', counters: { '+1/+1': 2, '-1/-1': 2 } }]);
  state = checkStateBasedActions(state, 0);
  assert.deepEqual(state.cards.bear.counters, {});
  assert.equal(zoneOf(state, 'bear'), 'battlefield');
});

test('annihilation happens before the creature is judged dead', () => {
  // 1/1 with two +1/+1 and two -1/-1 is a 1/1, not a corpse. If the counters
  // were not cancelled first, toughness would read 1 and it would survive by
  // accident; if they cancelled wrongly it would die. Both are caught here.
  let state = table([{ id: 'bear', power: '1', toughness: '1', counters: { '+1/+1': 2, '-1/-1': 2 } }]);
  state = checkStateBasedActions(state, 0);
  assert.equal(zoneOf(state, 'bear'), 'battlefield');
  assert.deepEqual(state.cards.bear.counters, {});
});

/* ------------------------------------------------------------------ *
 * 704.5d — tokens
 * ------------------------------------------------------------------ */

test('a token that has left the battlefield ceases to exist', () => {
  const state = table([{ id: 'tk', isToken: true, zone: 'graveyard' }]);
  assert.deepEqual(kinds(state), ['token-ceases']);

  const settled = checkStateBasedActions(state, 0);
  assert.equal(settled.cards.tk.removedFromGame, true);
  assert.equal(settled.players[0].zones.graveyard.includes('tk'), false);
  assert.deepEqual(stateBasedActions(settled), []);
});

test('a token on the battlefield is left alone', () => {
  const state = table([{ id: 'tk', isToken: true }]);
  assert.deepEqual(kinds(state), []);
});

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

test('findings come back in a deterministic, seat-ordered sequence', () => {
  const state = table(
    [
      { id: 'z-bear', owner: 'p2', toughness: '1', damage: 1 },
      { id: 'a-bear', owner: 'p1', toughness: '1', damage: 1 },
    ],
    20
  );
  const first = stateBasedActions(state).map(f => f.instanceId);
  const second = stateBasedActions(state).map(f => f.instanceId);
  assert.deepEqual(first, second);
  // Seat order, not id order and not object key order.
  assert.deepEqual(first, ['a-bear', 'z-bear']);
});

test('a completed game runs no state-based actions at all', () => {
  const state = { ...table([{ id: 'bear', toughness: '2', damage: 5 }]), status: 'complete' as const };
  assert.deepEqual(stateBasedActions(state), []);
});
