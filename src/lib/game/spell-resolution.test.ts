/**
 * Real cards, cast from a hand, resolved off a stack, board checked afterwards.
 *
 *   node --test --experimental-strip-types src/lib/game/spell-resolution.test.ts
 *
 * ## Why this file exists rather than more cases in `stack.test.ts`
 *
 * `stack.test.ts` builds its cards with `oracleText: ''` and describes what they
 * do with the eleven-member `StackEffect` vocabulary, by hand. That is the right
 * way to test the stack, and it is also why the stack could be completely green
 * while every instant and sorcery in the game resolved into nothing:
 * `compiledAbilityActions` returned an empty list for any stack object without
 * an `abilityId`, and a spell cast from hand has none. Lightning Bolt went to
 * the graveyard having dealt no damage. Nothing was broken. Nothing was called.
 *
 * So every card below carries its REAL name and its REAL oracle text, and every
 * assertion is about the board after the spell resolved, not about the actions
 * that were produced. A test built from invented text would prove that the
 * compiler and the engine agree with each other, which is not the question.
 *
 * The oracle text is typed into the fixtures here because these are the cards a
 * Magic player would name first, and a compiler regression on any of them is
 * worth failing the build for. It is not extracted from a catalogue file and
 * nothing here is written back out to one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import { castSpellAction, stackHeight, stackOf, targetCard, targetPlayer, targetStackObject } from './stack.ts';
import { combatPowerIn, combatToughnessIn, hasKeywordIn, controllerIn } from './characteristics.ts';
import type { GameState, InstanceId, PlayerId, StackTarget, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  typeLine: string;
  oracleText: string;
  owner?: PlayerId;
  zone?: Zone;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    seed: 11,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
  state = { ...state, status: 'playing' };

  // Deep enough that nothing decks out, and every third card is a Forest so a
  // "search your library for a basic land" has something real to find.
  for (const owner of ['p1', 'p2'] as const) {
    for (let i = 0; i < 12; i++) {
      const forest = i % 3 === 0;
      state = addCard(
        state,
        {
          instanceId: `${owner}-lib${i}`,
          cardId: forest ? 'forest' : 'filler',
          name: forest ? 'Forest' : `Filler ${i}`,
          ownerId: owner,
          typeLine: forest ? 'Basic Land — Forest' : 'Creature — Human',
          oracleText: '',
          ...(forest ? {} : { power: '1', toughness: '1' }),
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
        typeLine: spec.typeLine,
        oracleText: spec.oracleText,
        power: spec.power,
        toughness: spec.toughness,
        keywords: spec.keywords,
      },
      spec.zone ?? 'hand'
    );
  }

  return state;
}

/** A vanilla 2/2 to point spells at. No text, so it contributes nothing itself. */
function bear(id: string, owner: PlayerId = 'p1'): Spec {
  return {
    id,
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    oracleText: '',
    owner,
    zone: 'battlefield',
    power: '2',
    toughness: '2',
  };
}

/** Cast it and let it resolve. One helper, so every test drives the same path. */
function castAndResolve(
  state: GameState,
  controllerId: PlayerId,
  instanceId: InstanceId,
  targets: StackTarget[] = []
): GameState {
  return applyActions(state, [
    castSpellAction(controllerId, instanceId, {
      resolvesTo: 'graveyard',
      ...(targets.length > 0 ? { targets } : {}),
    }),
    { type: 'RESOLVE_STACK' },
  ]);
}

const zoneOf = (state: GameState, id: InstanceId): Zone | undefined => state.cards[id]?.zone;
const lifeOf = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.life ?? 0;
const handSize = (state: GameState, id: PlayerId): number =>
  state.players.find(p => p.id === id)?.zones.hand.length ?? 0;
const log = (state: GameState): string => state.log.map(entry => entry.message).join('\n');

/* ------------------------------------------------------------------ *
 * The pump family — the largest group in the build order
 * ------------------------------------------------------------------ */

test('Giant Growth makes a 2/2 into a 5/5', () => {
  let state = game([
    bear('bears'),
    {
      id: 'growth',
      name: 'Giant Growth',
      typeLine: 'Instant',
      oracleText: 'Target creature gets +3/+3 until end of turn.',
    },
  ]);

  assert.equal(combatPowerIn(state, 'bears'), 2, 'printed, before anything resolves');

  state = castAndResolve(state, 'p1', 'growth', [targetCard(state, 'bears')]);

  assert.equal(combatPowerIn(state, 'bears'), 5);
  assert.equal(combatToughnessIn(state, 'bears'), 5);
  assert.equal(zoneOf(state, 'growth'), 'graveyard', 'CR 608.2m, after its own effects');
});

test('Giant Growth wears off, and the creature is a 2/2 again', () => {
  /*
   * The reason `to-actions.ts` refused to fake a pump with a permanent stat
   * change. "Until end of turn" that never ends is a wrong board that nobody
   * ever notices, which is worse than a card that visibly did nothing.
   */
  let state = game([
    bear('bears'),
    {
      id: 'growth',
      name: 'Giant Growth',
      typeLine: 'Instant',
      oracleText: 'Target creature gets +3/+3 until end of turn.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'growth', [targetCard(state, 'bears')]);
  assert.equal(combatPowerIn(state, 'bears'), 5);

  state = applyAction(state, { type: 'PASS_TURN' });

  assert.equal(combatPowerIn(state, 'bears'), 2);
  assert.equal(combatToughnessIn(state, 'bears'), 2);
});

test('Overrun pumps every creature you control and grants trample to each', () => {
  let state = game([
    bear('mine-a'),
    bear('mine-b'),
    bear('theirs', 'p2'),
    {
      id: 'overrun',
      name: 'Overrun',
      typeLine: 'Sorcery',
      oracleText: 'Creatures you control get +3/+3 and gain trample until end of turn.',
      keywords: ['Trample'],
    },
  ]);

  state = castAndResolve(state, 'p1', 'overrun');

  assert.equal(combatPowerIn(state, 'mine-a'), 5);
  assert.equal(combatPowerIn(state, 'mine-b'), 5);
  assert.equal(hasKeywordIn(state, 'mine-a', 'trample'), true);
  assert.equal(combatPowerIn(state, 'theirs'), 2, 'not yours, not pumped');
  assert.equal(hasKeywordIn(state, 'theirs', 'trample'), false);
});

/* ------------------------------------------------------------------ *
 * Damage is marked, and state-based actions decide what that kills
 * ------------------------------------------------------------------ */

test('Lightning Bolt at a player takes them to 37', () => {
  let state = game([
    {
      id: 'bolt',
      name: 'Lightning Bolt',
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'bolt', [targetPlayer('p2')]);

  assert.equal(lifeOf(state, 'p2'), 37);
});

test('Lightning Bolt at a 2/2 marks 3 damage, and CR 704.5g puts it in the graveyard', () => {
  let state = game([
    bear('victim', 'p2'),
    {
      id: 'bolt',
      name: 'Lightning Bolt',
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'bolt', [targetCard(state, 'victim')]);

  assert.equal(zoneOf(state, 'victim'), 'graveyard');
});

test('two Shocks kill a 4/4, which is the whole reason damage accumulates', () => {
  /*
   * The defect this replaced computed lethality inside the effect: it compared
   * the incoming amount against remaining toughness and emitted a `MOVE_ZONE`
   * only when one hit was lethal on its own. Under that rule this test's 4/4
   * survives both Shocks and walks away, because nothing added the first 2 to
   * the second.
   */
  const shock = (id: string) => ({
    id,
    name: 'Shock',
    typeLine: 'Instant',
    oracleText: 'Shock deals 2 damage to any target.',
  });

  let state = game([
    { ...bear('ox', 'p2'), name: 'Ox of Agonas', power: '4', toughness: '4' },
    shock('shock-a'),
    shock('shock-b'),
  ]);

  state = castAndResolve(state, 'p1', 'shock-a', [targetCard(state, 'ox')]);
  assert.equal(zoneOf(state, 'ox'), 'battlefield', 'two is not four');
  assert.equal(state.cards['ox'].damage, 2, 'CR 119.3 — marked, not resolved');

  state = castAndResolve(state, 'p1', 'shock-b', [targetCard(state, 'ox')]);
  assert.equal(zoneOf(state, 'ox'), 'graveyard');
});

/* ------------------------------------------------------------------ *
 * Sweepers, draw, and the spells with no target at all
 * ------------------------------------------------------------------ */

test('Wrath of God destroys every creature on the table', () => {
  let state = game([
    bear('mine'),
    bear('theirs', 'p2'),
    {
      id: 'wrath',
      name: 'Wrath of God',
      typeLine: 'Sorcery',
      oracleText: "Destroy all creatures. They can't be regenerated.",
    },
  ]);

  state = castAndResolve(state, 'p1', 'wrath');

  assert.equal(zoneOf(state, 'mine'), 'graveyard');
  assert.equal(zoneOf(state, 'theirs'), 'graveyard');
});

test('Divination draws two cards', () => {
  let state = game([
    { id: 'div', name: 'Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.' },
  ]);

  const before = handSize(state, 'p1');
  state = castAndResolve(state, 'p1', 'div');

  // The spell itself left hand for the stack and then the graveyard, so the net
  // change is two drawn minus the one that was cast.
  assert.equal(handSize(state, 'p1'), before + 1);
  assert.equal(zoneOf(state, 'div'), 'graveyard');
});

test('Rampant Growth shuffles the library whether or not the search was a choice', () => {
  // CR 701.19 — the shuffle is part of the effect, not a consequence of finding
  // something. A search whose choice is deferred still owes the table a shuffle.
  let state = game([
    {
      id: 'ramp',
      name: 'Rampant Growth',
      typeLine: 'Sorcery',
      oracleText:
        'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'ramp');

  assert.match(log(state), /shuffle/i);
});

/* ------------------------------------------------------------------ *
 * Zones and the stack
 * ------------------------------------------------------------------ */

test('Raise Dead returns the creature card it was cast at', () => {
  let state = game([
    { ...bear('corpse'), zone: 'graveyard' },
    {
      id: 'raise',
      name: 'Raise Dead',
      typeLine: 'Sorcery',
      oracleText: 'Return target creature card from your graveyard to your hand.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'raise', [targetCard(state, 'corpse')]);

  assert.equal(zoneOf(state, 'corpse'), 'hand');
});

test('Counterspell counters the spell it was cast at', () => {
  let state = game([
    bear('bears'),
    {
      id: 'growth',
      name: 'Giant Growth',
      typeLine: 'Instant',
      oracleText: 'Target creature gets +3/+3 until end of turn.',
      owner: 'p1',
    },
    {
      id: 'counter',
      name: 'Counterspell',
      typeLine: 'Instant',
      oracleText: 'Counter target spell.',
      owner: 'p2',
    },
  ]);

  state = applyAction(
    state,
    castSpellAction('p1', 'growth', {
      resolvesTo: 'graveyard',
      targets: [targetCard(state, 'bears')],
    })
  );
  const growthOnStack = stackOf(state)[0];

  state = applyActions(state, [
    castSpellAction('p2', 'counter', {
      resolvesTo: 'graveyard',
      targets: [targetStackObject(growthOnStack.stackId)],
    }),
    { type: 'RESOLVE_STACK' },
  ]);

  assert.equal(stackHeight(state), 0, 'the counter resolved and took Giant Growth with it');
  assert.equal(combatPowerIn(state, 'bears'), 2, 'so nothing was ever pumped');
});

test('Act of Treason moves control of the creature and gives it back next turn', () => {
  let state = game([
    bear('theirs', 'p2'),
    {
      id: 'treason',
      name: 'Act of Treason',
      typeLine: 'Sorcery',
      oracleText:
        'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.',
      keywords: ['Haste'],
    },
  ]);

  state = castAndResolve(state, 'p1', 'treason', [targetCard(state, 'theirs')]);
  assert.equal(controllerIn(state, 'theirs'), 'p1');

  state = applyAction(state, { type: 'PASS_TURN' });
  assert.equal(controllerIn(state, 'theirs'), 'p2', 'until end of turn means until end of turn');
});

/* ------------------------------------------------------------------ *
 * Honesty
 * ------------------------------------------------------------------ */

test('a targeted spell cast with no target says exactly that, not "nothing to do"', () => {
  /*
   * No surface fills `CastOptions.targets` for a spell yet: picking a target for
   * a spell needs a picker and a legality check that only exist for activated
   * abilities today. Until they do, Lightning Bolt cast from the app arrives
   * here unaimed, and the log has to distinguish "this spell is pointless" from
   * "nobody aimed it".
   */
  let state = game([
    bear('bears'),
    {
      id: 'bolt',
      name: 'Lightning Bolt',
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
    },
  ]);

  state = castAndResolve(state, 'p1', 'bolt');

  assert.match(log(state), /no target was chosen/i);
  assert.equal(lifeOf(state, 'p2'), 40);
  assert.equal(zoneOf(state, 'bears'), 'battlefield');
});

test('a pump that finds nobody to pump is reported, not swallowed', () => {
  let state = game([
    {
      id: 'overrun',
      name: 'Overrun',
      typeLine: 'Sorcery',
      oracleText: 'Creatures you control get +3/+3 and gain trample until end of turn.',
      keywords: ['Trample'],
    },
  ]);

  state = castAndResolve(state, 'p1', 'overrun');

  assert.match(log(state), /not resolved automatically|nothing for it to do/i);
});

/* ------------------------------------------------------------------ *
 * Replay
 * ------------------------------------------------------------------ */

test('replaying the same actions lands on the same pump, id and timestamp included', () => {
  /*
   * The property that makes this engine usable over a network: a game IS its
   * action log. A continuous effect that travelled outside the log would exist
   * on the screen that cast it and nowhere else, so `ADD_CONTINUOUS` is an
   * ordinary action.
   *
   * The risk this checks is narrower than "does the reducer replay", which
   * `integration.test.ts` already covers. It is that the effect's id and its CR
   * 613 timestamp are DERIVED — from the stack id and `state.version` — rather
   * than minted from a clock or a uuid. A random id here would replay to a board
   * that looked right and hashed differently, and a desync check would start
   * failing on a card nobody changed.
   */
  const fresh = game([
    bear('bears'),
    {
      id: 'growth',
      name: 'Giant Growth',
      typeLine: 'Instant',
      oracleText: 'Target creature gets +3/+3 until end of turn.',
    },
  ]);

  const actions = [
    castSpellAction('p1', 'growth', {
      resolvesTo: 'graveyard' as const,
      targets: [targetCard(fresh, 'bears')],
    }),
    { type: 'RESOLVE_STACK' as const },
  ];

  const first = applyActions(fresh, actions);
  const second = applyActions(fresh, actions);

  assert.equal(combatPowerIn(first, 'bears'), 5);
  assert.equal(combatPowerIn(second, 'bears'), 5);
  assert.equal((first.timedEffects ?? []).length, 1);
  assert.equal(
    JSON.stringify(second.timedEffects),
    JSON.stringify(first.timedEffects),
    'the same effect, with the same derived id and the same CR 613 timestamp'
  );
});

/* ------------------------------------------------------------------ *
 * Expiry, checked directly
 * ------------------------------------------------------------------ */

test('a "while the source is on the battlefield" effect ends when the source dies', () => {
  /*
   * The trap this covers: `state.cards` keeps a card object after every zone
   * change, because CR 608.2 resolves abilities from last known information and
   * something has to still be readable. So "is the id in `state.cards`" is true
   * forever, and an expiry written that way means "never" while looking like it
   * means something.
   */
  const state = game([bear('anthem'), bear('friend')]);
  const effect = {
    id: 'ce-test',
    timestamp: 1,
    sourceId: 'anthem',
    controllerId: 'p1' as PlayerId,
    affects: { kind: 'ids' as const, ids: ['friend'] },
    parts: [{ sublayer: '7c' as const, modification: { kind: 'modify-pt' as const, power: 1, toughness: 1 } }],
    expiry: { kind: 'while-source' as const },
  };

  const withEffect = applyAction(state, { type: 'ADD_CONTINUOUS', effect, at: 0 });
  assert.equal(combatPowerIn(withEffect, 'friend'), 3);

  const sourceDead = applyAction(withEffect, {
    type: 'MOVE_ZONE',
    instanceId: 'anthem',
    to: 'graveyard',
    at: 0,
  });
  assert.equal(combatPowerIn(sourceDead, 'friend'), 2);
});

test('the reducer refuses a stored continuous effect with no expiry', () => {
  // Absent means "for as long as it is in the list", which is right for a
  // statics-derived effect that is rebuilt every read and wrong for a stored one
  // that nothing will ever take out again.
  const state = game([bear('bears')]);
  const next = applyAction(state, {
    type: 'ADD_CONTINUOUS',
    at: 0,
    effect: {
      id: 'no-expiry',
      timestamp: 1,
      affects: { kind: 'ids', ids: ['bears'] },
      parts: [{ sublayer: '7c', modification: { kind: 'modify-pt', power: 9, toughness: 9 } }],
    },
  } as never);

  assert.equal(combatPowerIn(next, 'bears'), 2);
  assert.equal((next.timedEffects ?? []).length, 0);
});
