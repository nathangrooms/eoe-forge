/**
 * Unit tests for the seam: a card in play → its abilities → the layer engine.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/statics.test.ts
 *
 * The oracle text below is written the way our own `cards` rows carry it,
 * including the post-2024 templating ("When this creature enters", not "When
 * CARDNAME enters the battlefield"). Testing against remembered wordings would
 * validate the bridge against a catalogue we do not have.
 *
 * What is being defended:
 *
 *  - a static ability compiled from oracle text reaches `computeLayers` and
 *    actually changes a creature's power on the board;
 *  - it changes the RIGHT creatures — the negative assertions are the ones that
 *    catch an anthem pumping the opponent;
 *  - nothing is written into a `CardInstance`, so the effect disappears the
 *    instant its source does, with nothing to unwind;
 *  - `coverage` is derived, so no card can claim to be fully automated while
 *    text went unmodelled.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from '../rules.ts';
import type { GameState, Zone } from '../types.ts';
import {
  abilitiesFor,
  abilityNeedsManual,
  coverageSummary,
  resetAbilityCache,
  staticAbilitiesOf,
  triggeredAbilitiesOf,
} from './card-abilities.ts';
import { abilityEngineOwns } from './trigger-bridge.ts';
import {
  characteristicView,
  continuousEffectsFor,
  costAdjustmentFor,
  layeredContext,
  layeredState,
  scanStatics,
} from './statics.ts';
import { evalValue, makeContext, matchesFilter, resolveSelector } from './context.ts';
import { compileCardAbilities } from '../../cards/abilities/compiler.ts';
import { stateBasedActions } from '../sba.ts';

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
  zone?: Zone;
}

function game(specs: Spec[], playerCount = 2): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: Array.from({ length: playerCount }, (_, index) => ({ name: `P${index + 1}` })),
    seed: 11,
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
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

const powerOnBoard = (state: GameState, id: string) => layeredState(state).objects[id]?.power;
const keywordsOnBoard = (state: GameState, id: string) => layeredState(state).objects[id]?.abilities ?? [];

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

test('a card in play resolves to the abilities its oracle text compiles to', () => {
  const state = game([
    {
      id: 'anthem',
      name: 'Glorious Anthem',
      typeLine: 'Enchantment',
      oracleText: 'Creatures you control get +1/+1.',
    },
  ]);

  const record = abilitiesFor(state.cards.anthem);
  assert.equal(record.abilities.length, 1);
  assert.equal(record.abilities[0].kind, 'static');
  assert.equal(record.coverage, 'full');
});

test('a vanilla creature has no abilities and coverage "none"', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear' }]);
  const record = abilitiesFor(state.cards.bear);

  assert.deepEqual(record.abilities, []);
  assert.deepEqual(record.unparsed, []);
  assert.equal(record.coverage, 'none');
  assert.match(coverageSummary(record), /nothing to resolve/i);
});

test('coverage is derived: a card with unmodelled text can never read "full"', () => {
  // The rule the whole honesty contract rests on. There is no way to spell
  // "fully automated" while a clause was dropped, because nothing spells it —
  // it is computed from `unparsed` and the manual markers.
  const state = game([
    {
      id: 'weird',
      name: 'Weird Card',
      typeLine: 'Enchantment',
      oracleText:
        'Creatures you control get +1/+1.\nPlayers may cast spells from their libraries as though those cards were in their hands.',
    },
  ]);

  const record = abilitiesFor(state.cards.weird);
  assert.ok(record.unparsed.length > 0, 'the second clause is not modelled');
  assert.notEqual(record.coverage, 'full');
  assert.equal(record.coverage, 'partial');
  assert.match(coverageSummary(record), /Resolve the rest by hand/);
});

test('the memo returns the same record for the same card, and survives a reset', () => {
  const state = game([
    { id: 'a', name: 'Soul Warden', oracleText: 'Whenever another creature enters, you gain 1 life.' },
  ]);

  const first = abilitiesFor(state.cards.a);
  assert.equal(abilitiesFor(state.cards.a), first, 'memoised on identical inputs');

  resetAbilityCache();
  const afterReset = abilitiesFor(state.cards.a);
  assert.notEqual(afterReset, first, 'a fresh object');
  assert.deepEqual(afterReset, first, 'but an identical one — the compiler is pure');
});

test('abilityEngineOwns claims a card only when the engine understands all of it', () => {
  // This is the predicate that stops effects.ts and this bridge both firing for
  // one card and doubling every enters-the-battlefield trigger in the game.
  //
  // It is deliberately stricter than "has a triggered ability". Ownership is
  // all-or-nothing per card, because a card split across the two systems is the
  // partial-ownership bug: the half the compiler did not model would stop
  // firing, since the old detector no longer looks at an owned card at all.
  const state = game([
    {
      id: 'self',
      name: 'Kindly Healer',
      oracleText: 'When this creature enters, you gain 2 life.',
    },
    {
      id: 'other',
      name: 'Soul Warden',
      oracleText: 'Whenever another creature enters, you gain 1 life.',
    },
    {
      id: 'anthem',
      name: 'Glorious Anthem',
      typeLine: 'Enchantment',
      oracleText: 'Creatures you control get +1/+1.',
    },
    { id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear' },
  ]);

  assert.equal(
    abilityEngineOwns(state.cards.self),
    true,
    'a self-referential ETB the compiler fully understood'
  );
  assert.equal(
    abilityEngineOwns(state.cards.other),
    false,
    '"another creature enters" is a battlefield-wide event the engine does not derive'
  );
  assert.equal(abilityEngineOwns(state.cards.anthem), false, 'a static is not a trigger');
  assert.equal(abilityEngineOwns(state.cards.bear), false, 'no rules text at all');
  assert.equal(abilityEngineOwns(undefined), false);
});

test('the narrowing helpers separate the ability kinds', () => {
  const state = game([
    { id: 'warden', name: 'Soul Warden', oracleText: 'Whenever another creature enters, you gain 1 life.' },
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
  ]);

  assert.equal(triggeredAbilitiesOf(state.cards.warden).length, 1);
  assert.equal(staticAbilitiesOf(state.cards.warden).length, 0);
  assert.equal(staticAbilitiesOf(state.cards.anthem).length, 1);
});

/* ------------------------------------------------------------------ *
 * Statics into the layer engine
 * ------------------------------------------------------------------ */

test('an anthem compiled from oracle text actually changes power on the board', () => {
  const state = game([
    {
      id: 'anthem',
      name: 'Glorious Anthem',
      typeLine: 'Enchantment',
      oracleText: 'Creatures you control get +1/+1.',
    },
    { id: 'mine', name: 'Bear', owner: 'p1', power: '2', toughness: '2' },
  ]);

  assert.equal(powerOnBoard(state, 'mine'), 3);
});

test('an anthem does NOT pump the opponent', () => {
  // The negative half. An over-broad selector here is invisible until someone
  // loses a game to it.
  const state = game([
    {
      id: 'anthem',
      name: 'Glorious Anthem',
      typeLine: 'Enchantment',
      owner: 'p1',
      oracleText: 'Creatures you control get +1/+1.',
    },
    { id: 'mine', name: 'Mine', owner: 'p1', power: '2', toughness: '2' },
    { id: 'theirs', name: 'Theirs', owner: 'p2', power: '2', toughness: '2' },
  ]);

  assert.equal(powerOnBoard(state, 'mine'), 3);
  assert.equal(powerOnBoard(state, 'theirs'), 2);
});

test('a lord grants a keyword and a pump to its own subtype only', () => {
  const state = game([
    {
      id: 'king',
      name: 'Goblin King',
      typeLine: 'Creature — Goblin',
      oracleText: 'Other Goblins get +1/+1 and have mountainwalk.',
      power: '2',
      toughness: '2',
    },
    { id: 'gob', name: 'Goblin Piker', typeLine: 'Creature — Goblin', power: '2', toughness: '1' },
    { id: 'elf', name: 'Llanowar Elves', typeLine: 'Creature — Elf Druid', power: '1', toughness: '1' },
  ]);

  assert.equal(powerOnBoard(state, 'gob'), 3, 'the other Goblin is pumped');
  assert.equal(powerOnBoard(state, 'king'), 2, '"other" excludes the lord itself');
  assert.equal(powerOnBoard(state, 'elf'), 1, 'and an Elf is untouched');
  assert.ok(keywordsOnBoard(state, 'gob').includes('mountainwalk'));
  assert.ok(!keywordsOnBoard(state, 'elf').includes('mountainwalk'));
});

test('two anthems stack', () => {
  const state = game([
    { id: 'a1', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'a2', name: 'Gaeas Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear', power: '2', toughness: '2' },
  ]);

  assert.equal(powerOnBoard(state, 'mine'), 4);
});

test('an anthem leaves no residue: remove the source and the pump is gone', () => {
  // Continuous effects are DERIVED, never written. Nothing has to remember to
  // unwind them, which is what makes replay byte-identical by construction.
  const withAnthem = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear', power: '2', toughness: '2' },
  ]);
  assert.equal(powerOnBoard(withAnthem, 'mine'), 3);

  const without: GameState = {
    ...withAnthem,
    players: withAnthem.players.map(player =>
      player.id === 'p1'
        ? { ...player, zones: { ...player.zones, battlefield: ['mine'] } }
        : player
    ),
  };

  assert.equal(powerOnBoard(without, 'mine'), 2, 'and the raw card was never touched');
  assert.equal(without.cards.mine.powerOverride, undefined);
});

test('counters and an anthem compose — 7c then 7d', () => {
  let state = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear', power: '2', toughness: '2' },
  ]);
  state = {
    ...state,
    cards: { ...state.cards, mine: { ...state.cards.mine, counters: { '+1/+1': 2 } } },
  };

  assert.equal(powerOnBoard(state, 'mine'), 5);
});

test('the layered board is what a power filter reads, so anthems are visible to it', () => {
  const state = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear', power: '3', toughness: '3' },
  ]);

  const ctx = layeredContext(state, 'anthem', 'p1');
  assert.ok(
    matchesFilter({ is: 'power', cmp: 'gte', value: 4 }, 'mine', ctx),
    'a 3/3 under an anthem satisfies "power 4 or greater"'
  );
});

/* ------------------------------------------------------------------ *
 * The scan itself
 * ------------------------------------------------------------------ */

test('the scan produces one continuous effect per static ability, with a stable id', () => {
  const state = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear' },
  ]);

  const effects = continuousEffectsFor(state);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].id, 'anthem:a0');
  assert.equal(effects[0].sourceId, 'anthem');
  assert.deepEqual(effects[0].affects, { kind: 'ids', ids: ['mine'] });
  assert.deepEqual(effects[0].parts[0].sublayer, '7c');
});

test('timestamps come from the board scan, not a clock, so two clients agree', () => {
  const state = game([
    { id: 'a1', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'a2', name: 'Gaeas Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
  ]);

  assert.deepEqual(
    continuousEffectsFor(state).map(effect => effect.timestamp),
    continuousEffectsFor(state).map(effect => effect.timestamp)
  );
  assert.deepEqual(continuousEffectsFor(state).map(effect => effect.timestamp), [0, 1]);
});

test('a static ability on a card in hand does not apply from there', () => {
  const state = game([
    {
      id: 'anthem',
      name: 'Glorious Anthem',
      typeLine: 'Enchantment',
      oracleText: 'Creatures you control get +1/+1.',
      zone: 'hand',
    },
    { id: 'mine', name: 'Bear', power: '2', toughness: '2' },
  ]);

  assert.deepEqual(continuousEffectsFor(state), []);
  assert.equal(powerOnBoard(state, 'mine'), 2);
});

test('scanStatics separates restrictions and cost modifiers from characteristics', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears' }]);
  const scan = scanStatics(state);

  assert.deepEqual(scan.effects, []);
  assert.deepEqual(scan.restrictions, []);
  assert.deepEqual(scan.costMods, []);
  assert.equal(costAdjustmentFor(state, 'bear', 'p1'), 0);
});

test('costAdjustmentFor now sees a spell being cast from hand — E4', () => {
  // This test used to pin the OPPOSITE as a known gap, and the gap was real:
  // the modifier's selector carries `zone: 'stack'` because the object being
  // discounted is a spell, while a cost is computed while the card is still in
  // HAND. `ActiveCostMod.appliesTo` was resolved at scan time against that
  // zone, so it never contained the card anybody asked about and the adjustment
  // was always 0 — cost reduction that read as wired and changed nothing.
  //
  // `ActiveCostMod` now carries the selector rather than a resolved id list,
  // and `costAdjustmentFor` matches the FILTER and the CONTROLLER against the
  // card wherever it actually is. The zone is ignored deliberately; everything
  // else about the selector is still enforced, which the two negative cases
  // below hold to.
  const state = game([
    {
      id: 'reducer',
      name: 'Cost Reducer',
      oracleText: 'Creature spells you cast cost {1} less to cast.',
    },
    { id: 'giant', name: 'Big Guy', typeLine: 'Creature — Giant', zone: 'hand' },
    { id: 'rock', name: 'A Rock', typeLine: 'Artifact', zone: 'hand' },
  ]);

  const scan = scanStatics(state);
  assert.equal(scan.costMods.length, 1, 'the modifier IS found — the compiler works');
  assert.equal(scan.costMods[0].delta, -1);
  assert.equal(scan.costMods[0].applies.sel, 'all');

  assert.equal(costAdjustmentFor(state, 'giant', 'p1'), -1, 'a creature spell in hand IS discounted');
  assert.equal(costAdjustmentFor(state, 'rock', 'p1'), 0, 'an artifact spell is not — the filter still applies');
  assert.equal(costAdjustmentFor(state, 'giant', 'p2'), 0, '"you cast" still means the controller only');
});

test('a whole-table tax applies to its own controller too', () => {
  // "Spells cost {1} more to cast" has no "you cast" in it, so it taxes every
  // player including the one who played it. The old rule hardcoded
  // `forWhom: you`, which made Sphere of Resistance a one-sided tax the caster
  // silently never paid.
  const state = game([
    { id: 'sphere', name: 'Sphere of Resistance', oracleText: 'Spells cost {1} more to cast.' },
    { id: 'giant', name: 'Big Guy', typeLine: 'Creature — Giant', zone: 'hand' },
  ]);

  assert.equal(costAdjustmentFor(state, 'giant', 'p1'), 1, 'the controller pays it');
  assert.equal(costAdjustmentFor(state, 'giant', 'p2'), 1, 'and so does everybody else');
});

test('a computed cost reduction is a ValueExpr, evaluated against the board — E4 x E9', () => {
  // "This spell costs {1} less to cast for each artifact you control" is the
  // most common cost-modifying clause in the catalogue. `Modification.delta`
  // has always been a `ValueExpr`; nothing but a front end was missing.
  const state = game([
    {
      id: 'affinity',
      name: 'Cheap Thing',
      oracleText: 'This spell costs {1} less to cast for each artifact you control.',
      zone: 'hand',
    },
    { id: 'rock1', name: 'Rock One', typeLine: 'Artifact' },
    { id: 'rock2', name: 'Rock Two', typeLine: 'Artifact' },
  ]);

  // The source is in hand, so it is not on the battlefield for `scanStatics` to
  // find — which is correct for a static ability, and is exactly why this one
  // is asserted through the compiler rather than the scan.
  const compiled = compileCardAbilities({
    id: 'affinity',
    oracle_id: 'affinity',
    name: 'Cheap Thing',
    type_line: 'Artifact',
    oracle_text: 'This spell costs {1} less to cast for each artifact you control.',
  });
  const modification = (compiled.abilities[0] as { modifications: Array<{ layer: string; delta: unknown }> })
    .modifications[0];
  assert.equal(modification.layer, 'cost-modify');
  assert.deepEqual(modification.delta, {
    v: 'mul',
    of: [-1, { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'artifact' }, controller: { who: 'you' }, zone: 'battlefield' } }],
  });

  // And the value evaluates against a real board: two artifacts, so -2.
  assert.equal(evalValue(modification.delta as never, makeContext(state, 'affinity', 'p1')), -2);
});

/* ------------------------------------------------------------------ *
 * Purity
 * ------------------------------------------------------------------ */

test('deriving the board twice gives an identical answer and mutates nothing', () => {
  const state = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'mine', name: 'Bear', power: '2', toughness: '2' },
  ]);

  const before = JSON.stringify(state);
  const first = JSON.stringify(characteristicView(state));
  const second = JSON.stringify(characteristicView(state));

  assert.equal(first, second);
  assert.equal(JSON.stringify(state), before, 'deriving must never write to state');
});

test('the derived view is memoised per state object, so it is exact and never stale', () => {
  const state = game([{ id: 'mine', name: 'Bear' }]);
  assert.equal(layeredState(state), layeredState(state));

  const next: GameState = { ...state, version: state.version + 1 };
  assert.notEqual(layeredState(next), layeredState(state), 'a new state object recomputes');
});

test('a selector over the layered board is stable across calls', () => {
  const state = game([
    { id: 'a', name: 'A', owner: 'p1' },
    { id: 'b', name: 'B', owner: 'p1' },
    { id: 'c', name: 'C', owner: 'p2' },
  ]);
  const ctx = layeredContext(state, 'a', 'p1');
  const selector = { sel: 'all', where: { is: 'any' }, controller: { who: 'you' } } as const;

  assert.deepEqual(resolveSelector(selector, ctx), ['a', 'b']);
  assert.deepEqual(resolveSelector(selector, ctx), resolveSelector(selector, ctx));
});

/* ------------------------------------------------------------------ *
 * Honesty
 * ------------------------------------------------------------------ */

test('abilityNeedsManual finds a manual clause nested inside control flow', () => {
  const state = game([
    {
      id: 'warden',
      name: 'Soul Warden',
      oracleText: 'Whenever another creature enters, you gain 1 life.',
    },
  ]);

  const [ability] = triggeredAbilitiesOf(state.cards.warden);
  assert.equal(abilityNeedsManual(ability), false, 'this one is fully modelled');

  const withManual = {
    ...ability,
    effects: [
      { do: 'if', condition: { if: 'your-turn' }, then: [{ do: 'manual', text: 'do the rest' }] },
    ],
  } as never;
  assert.equal(abilityNeedsManual(withManual), true, 'and a nested one is still found');
});

test('a cost reduction computed from turn history is SKIPPED, not applied as zero', () => {
  // "This spell costs {1} less to cast for each creature that attacked this
  // turn" compiles exactly — E4 for the cost modifier, E6 for the count. But
  // nothing folds an action log, so `evalValue` answers 0 for the count, and a
  // reduction of 0 is a WRONG reduction rather than a small one.
  //
  // `costAdjustmentFor` skips it entirely, leaving the spell at its printed
  // cost. That is the direction this folder takes on costs everywhere else — a
  // spell cast too cheaply is the failure with no safe marker — and the
  // `needsHistory` flag is on the record so a caller can say the reduction is
  // not being applied rather than leaving a player to wonder.
  const state = game([
    {
      id: 'frenzy',
      name: 'Witchstalker Frenzy',
      oracleText: 'This spell costs {1} less to cast for each creature that attacked this turn.',
    },
  ]);

  const scan = scanStatics(state);
  assert.equal(scan.costMods.length, 1, 'the modifier is found and recorded');
  assert.equal(scan.costMods[0].needsHistory, true, 'and flagged as unanswerable');
  assert.equal(scan.costMods[0].delta, 0, 'its delta really did evaluate to zero');

  assert.equal(
    costAdjustmentFor(state, 'frenzy', 'p1'),
    0,
    'skipped rather than applied — the printed cost stands'
  );
});

test('an ordinary computed reduction is NOT flagged and IS applied', () => {
  // The control for the test above: a board count is answerable, so nothing is
  // skipped and the reduction is real.
  const state = game([
    {
      id: 'cheap',
      name: 'Cheap Thing',
      typeLine: 'Artifact',
      oracleText: 'This spell costs {1} less to cast for each artifact you control.',
    },
    { id: 'r1', name: 'Rock One', typeLine: 'Artifact' },
    { id: 'r2', name: 'Rock Two', typeLine: 'Artifact' },
  ]);

  const scan = scanStatics(state);
  assert.equal(scan.costMods[0].needsHistory, false);
  // Three artifacts on the battlefield, the source included.
  assert.equal(scan.costMods[0].delta, -3);
  assert.equal(costAdjustmentFor(state, 'cheap', 'p1'), -3);
});

/* ------------------------------------------------------------------ *
 * A drawback the engine ignores plays STRONGER than printed
 * ------------------------------------------------------------------ */

/**
 * The whole path, end to end, because "the engine supports it" and "a card
 * behaves correctly in a game" are different claims and only the second one was
 * asked for.
 *
 * Oracle text → `compileCardAbilities` → `scanStatics` → `computeLayers` →
 * `stateBasedActions`. Every link is the real one. A unit test on
 * `computeLayers` proves the layer maths; it cannot prove a player ever reaches
 * it, and for months this card did not.
 */
function withLife(state: GameState, life: number): GameState {
  return { ...state, players: state.players.map(p => ({ ...p, life })) };
}

function shadowBoard(life: number): GameState {
  return withLife(
    game([
      {
        id: 'shadow',
        name: "Death's Shadow",
        typeLine: 'Creature — Avatar',
        oracleText: 'This creature gets -X/-X, where X is your life total.',
        power: '13',
        toughness: '13',
      },
    ]),
    life
  );
}

test("Death's Shadow compiles its drawback rather than dropping it", () => {
  const state = shadowBoard(20);
  const record = abilitiesFor(state.cards.shadow);

  assert.equal(record.coverage, 'full', 'the card used to compile to nothing at all');
  assert.equal(record.abilities.length, 1);
  assert.equal(record.abilities[0].kind, 'static');
});

test("Death's Shadow is a -7/-7 at 20 life and the rules bin it", () => {
  const state = shadowBoard(20);

  assert.equal(powerOnBoard(state, 'shadow'), -7);
  assert.equal(layeredState(state).objects.shadow?.toughness, -7);
  assert.equal(layeredState(state).unsupported.length, 0);

  const findings = stateBasedActions(state);
  const dead = findings.find(f => f.instanceId === 'shadow');
  assert.ok(dead, 'a creature with toughness 0 or less is put into its graveyard (CR 704.5f)');
  assert.equal(dead?.kind, 'creature-zero-toughness');
});

test("Death's Shadow at 3 life is the 10/10 the card is actually played for", () => {
  const state = shadowBoard(3);

  assert.equal(powerOnBoard(state, 'shadow'), 10);
  assert.equal(stateBasedActions(state).some(f => f.instanceId === 'shadow'), false);
});

test('a life total is read on every scan, so paying life resizes the creature', () => {
  // The property that makes this a continuous effect rather than a number
  // written into the card: nothing is stored, so nothing has to be unstored.
  const twenty = shadowBoard(20);
  const six = withLife(twenty, 6);

  assert.equal(powerOnBoard(twenty, 'shadow'), -7);
  assert.equal(powerOnBoard(six, 'shadow'), 7);
  assert.equal(
    twenty.cards.shadow.powerOverride,
    undefined,
    'nothing was written into the CardInstance'
  );
});
