/**
 * DeckMatrix — a permanent watching an event that happened to something else.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/trigger-subject.test.ts
 *
 * ## What changed, and why it needed its own file
 *
 * Until this tranche `gameEventKindFor` answered `null` for any trigger whose
 * subject was not the source itself, so "whenever ANOTHER creature enters" was
 * treated as an event the engine could not observe. It was never a different
 * event. It is the same enters event, watched by a different permanent, and the
 * two questions had been folded into one:
 *
 *   1. WHICH event fired            -> `gameEventKindFor`
 *   2. WHICH object it happened to  -> `triggerSubjectMatches`
 *
 * Splitting them is the whole change. Widening (1) alone would make every
 * "whenever a creature you control enters" on the board fire for an opponent's
 * land, so most of the tests below are about (2) refusing.
 *
 * ## Every card here is real, and so is its text
 *
 * Each `oracleText` string was copied out of `scratch/scryfall/oracle-cards.jsonl`,
 * the cached bulk file the coverage script reads. An invented sentence would
 * test a shape nobody printed, and the subject of this file is exactly which
 * printed sentences the compiler produces which selector for.
 *
 * ## And every test plays the game
 *
 * `collectTriggers` is asserted in a few places where the count is the point,
 * but the life totals and counters below come from `applyAction` on the real
 * reducer. This project has been caught before proving an engine capability no
 * player could reach.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../rules.ts';
import type { CardInstance, GameAction, GameState, PlayerId, Zone } from '../types.ts';
import { collectTriggers } from '../triggers.ts';
import { abilityEngineOwns } from './trigger-bridge.ts';
import { resetAbilityCache } from './card-abilities.ts';

/* ------------------------------------------------------------------ *
 * Table building
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  owner?: PlayerId;
  typeLine?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  zone?: Zone;
}

const STARTING_LIFE = 40;

function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: STARTING_LIFE,
    players: [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
    ],
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
        controllerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Bear',
        oracleText: spec.oracleText ?? '',
        keywords: spec.keywords ?? [],
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        damage: 0,
      },
      spec.zone ?? 'hand'
    );
  }

  return state;
}

const lifeOf = (state: GameState, playerId: PlayerId): number =>
  state.players.find(p => p.id === playerId)!.life;

const countersOn = (state: GameState, id: string, kind: string): number =>
  state.cards[id]?.counters?.[kind] ?? 0;

const zoneOf = (state: GameState, id: string): Zone | undefined => state.cards[id]?.zone;

const logTypes = (state: GameState, type: string): number =>
  state.log.filter(event => event.type === type).length;

const play = (id: string, at = 1): GameAction =>
  ({ type: 'PLAY', instanceId: id, to: 'battlefield', at }) as GameAction;

/* ------------------------------------------------------------------ *
 * The cards. Verbatim oracle text, one place, so a test that names a
 * card and a test that plays it can never drift apart.
 * ------------------------------------------------------------------ */

/** "Whenever another creature enters, you gain 1 life." No controller clause. */
const SOUL_WARDEN: Spec = {
  id: 'warden',
  name: 'Soul Warden',
  typeLine: 'Creature — Human Cleric',
  oracleText: 'Whenever another creature enters, you gain 1 life.',
  power: '1',
  toughness: '1',
};

/** The controller clause. "another creature YOU CONTROL enters". */
const CORPSE_KNIGHT: Spec = {
  id: 'knight',
  name: 'Corpse Knight',
  typeLine: 'Creature — Zombie Knight',
  oracleText: 'Whenever another creature you control enters, each opponent loses 1 life.',
};

/** No "another": the source is a member of the group it names. */
const BOGWATER_LUMARET: Spec = {
  id: 'lumaret',
  name: 'Bogwater Lumaret',
  typeLine: 'Creature — Spirit Frog',
  oracleText: 'Whenever this creature or another creature you control enters, you gain 1 life.',
};

const UNRULY_MOB: Spec = {
  id: 'mob',
  name: 'Unruly Mob',
  typeLine: 'Creature — Human',
  oracleText: 'Whenever another creature you control dies, put a +1/+1 counter on this creature.',
  power: '1',
  toughness: '1',
};

const BLIND_CREEPER: Spec = {
  id: 'creeper',
  name: 'Blind Creeper',
  typeLine: 'Creature — Zombie Beast',
  oracleText: 'Whenever a player casts a spell, this creature gets -1/-1 until end of turn.',
  power: '3',
  toughness: '3',
};

const GLITTERFANG: Spec = {
  id: 'glitterfang',
  name: 'Glitterfang',
  typeLine: 'Creature — Spirit',
  oracleText: "Haste\nAt the beginning of the end step, return this creature to its owner's hand.",
  power: '1',
  toughness: '1',
  keywords: ['Haste'],
};

/** A vanilla body to be the thing that enters, or dies. */
const BEARS: Spec = { id: 'bears', name: 'Grizzly Bears', typeLine: 'Creature — Bear' };

/* ------------------------------------------------------------------ *
 * enters — the subject is another permanent
 * ------------------------------------------------------------------ */

test('Soul Warden gains life when a DIFFERENT creature enters', () => {
  resetAbilityCache();
  const state = game([{ ...SOUL_WARDEN, zone: 'battlefield' }, BEARS]);

  assert.equal(
    abilityEngineOwns(state.cards.warden),
    true,
    'precondition: the engine claims the card at all'
  );

  const action = play('bears');
  const next = applyAction(state, action);

  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 1, 'exactly the printed 1 life');
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 1, 'and exactly one life change was logged');

  const pending = collectTriggers(state, action, next);
  assert.equal(pending.length, 1, 'one enters event, one watcher, one trigger');
  assert.equal(pending[0].sourceInstanceId, 'warden', 'sourced on the WATCHER, not on what entered');
  assert.equal(pending[0].event.instanceId, 'bears', 'carrying the object it happened to');
});

test('Soul Warden does not gain life when SOUL WARDEN enters — "another" is read', () => {
  resetAbilityCache();
  // The filter is {is:'other'}, evaluated against the watcher. If the subject
  // check were skipped this reads 41 and the card is wrong on the one case its
  // own wording exists to exclude.
  const state = game([SOUL_WARDEN]);
  const next = applyAction(state, play('warden'));

  assert.equal(zoneOf(next, 'warden'), 'battlefield', 'it did enter');
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE, 'and gained nothing for itself');
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 0);
});

test('Bogwater Lumaret DOES gain for itself — it does not say "another"', () => {
  resetAbilityCache();
  // Same event, same machinery, opposite answer, and the only difference is the
  // printed word. That is the pair that proves the filter is being read rather
  // than a rule about entering being applied.
  const state = game([BOGWATER_LUMARET]);
  const next = applyAction(state, play('lumaret'));

  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 1);
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 1);
});

test("Corpse Knight ignores an OPPONENT's creature entering", () => {
  resetAbilityCache();
  // "another creature you control". `controller:{who:'you'}` is resolved in the
  // watcher's context, so "you" is Corpse Knight's controller and not the
  // player whose creature entered.
  const state = game([
    { ...CORPSE_KNIGHT, zone: 'battlefield' },
    { ...BEARS, owner: 'p2' },
  ]);

  const next = applyAction(state, play('bears'));

  assert.equal(zoneOf(next, 'bears'), 'battlefield', 'the opponent really did play it');
  assert.equal(lifeOf(next, 'p2'), STARTING_LIFE, 'and lost no life to it');
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 0, 'nothing fired at all');
});

test('Corpse Knight fires for a creature its own controller plays', () => {
  resetAbilityCache();
  const state = game([{ ...CORPSE_KNIGHT, zone: 'battlefield' }, BEARS]);
  const next = applyAction(state, play('bears'));

  assert.equal(lifeOf(next, 'p2'), STARTING_LIFE - 1, 'the opponent loses the printed 1');
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE, 'and the controller does not');
});

test('two Soul Wardens each see the other creature enter, and neither sees itself twice', () => {
  resetAbilityCache();
  // The count is the assertion. A watcher list that included the entering card
  // itself, or that visited a permanent twice, both land on the wrong number
  // here and on a wrong life total below.
  const state = game([
    { ...SOUL_WARDEN, id: 'w1', zone: 'battlefield' },
    { ...SOUL_WARDEN, id: 'w2', zone: 'battlefield' },
    BEARS,
  ]);

  const action = play('bears');
  const next = applyAction(state, action);

  const pending = collectTriggers(state, action, next);
  assert.equal(pending.length, 2, 'two watchers, two triggers');
  assert.deepEqual(
    pending.map(t => t.sourceInstanceId).sort(),
    ['w1', 'w2'],
    'one each, and the entering creature is not among them'
  );
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 2);
});

test('a Soul Warden already in play sees the second one arrive', () => {
  resetAbilityCache();
  // The newcomer is "another creature" to the incumbent, and the incumbent is
  // not "another creature" to itself. One life, not two, not zero.
  const state = game([{ ...SOUL_WARDEN, id: 'w1', zone: 'battlefield' }, { ...SOUL_WARDEN, id: 'w2' }]);
  const next = applyAction(state, play('w2'));

  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 1);
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 1);
});

/* ------------------------------------------------------------------ *
 * The regression this widening could have caused
 * ------------------------------------------------------------------ */

test('the OLD detector is never shown an event that happened to something else', () => {
  resetAbilityCache();
  // Marsh Flitter is partial coverage, so `effects.ts`'s regex detector owns
  // it, and that detector has no notion of a subject: every pattern it knows is
  // "when THIS creature enters". Showing it another creature's enters event
  // would fire every detected ETB in play for one creature entering.
  //
  // This is the reason `triggersForEvents` keeps the old detector on
  // `sourcesFor` while the ability engine reads the wider `watchersFor`.
  const state = game([
    {
      id: 'flitter',
      name: 'Marsh Flitter',
      typeLine: 'Creature — Faerie Rogue',
      oracleText:
        'Flying\nWhen this creature enters, create two 1/1 black Goblin Rogue creature tokens.\nSacrifice a Goblin: This creature has base power and toughness 3/3 until end of turn.',
      power: '1',
      toughness: '1',
      keywords: ['Flying'],
      zone: 'battlefield',
    },
    BEARS,
  ]);

  assert.equal(
    abilityEngineOwns(state.cards.flitter),
    false,
    'precondition: this card really is on the old path'
  );

  const action = play('bears');
  const next = applyAction(state, action);
  const pending = collectTriggers(state, action, next);

  assert.deepEqual(
    pending.filter(t => t.sourceInstanceId === 'flitter'),
    [],
    'Marsh Flitter did not trigger off somebody else entering'
  );
});

/* ------------------------------------------------------------------ *
 * dies — the subject has already left the battlefield
 * ------------------------------------------------------------------ */

test('Unruly Mob counts another creature dying, from the graveyard side of the event', () => {
  resetAbilityCache();
  // The subject filter says `zone:'battlefield'` and by now the creature is in
  // a graveyard. `objectMatches` deliberately ignores the selector's zone,
  // because the EVENT already fixed it: that is what makes this a dies event.
  const state = game([
    { ...UNRULY_MOB, zone: 'battlefield' },
    { ...BEARS, zone: 'battlefield' },
  ]);

  const action = { type: 'MOVE_ZONE', instanceId: 'bears', to: 'graveyard', at: 1 } as GameAction;
  const next = applyAction(state, action);

  assert.equal(zoneOf(next, 'bears'), 'graveyard', 'precondition: it died');
  assert.equal(countersOn(next, 'mob', '+1/+1'), 1, 'one counter, from the printed clause');
});

test('Unruly Mob does not count ITSELF dying', () => {
  resetAbilityCache();
  const state = game([{ ...UNRULY_MOB, zone: 'battlefield' }]);
  const next = applyAction(
    state,
    { type: 'MOVE_ZONE', instanceId: 'mob', to: 'graveyard', at: 1 } as GameAction
  );

  assert.equal(countersOn(next, 'mob', '+1/+1'), 0, '"another" excludes the watcher');
});

/* ------------------------------------------------------------------ *
 * cast — the subject is a spell, and the player is somebody else
 * ------------------------------------------------------------------ */

test('Blind Creeper shrinks when an OPPONENT casts a spell', () => {
  resetAbilityCache();
  // "Whenever a player casts a spell" compiles to `by:{who:'each-player'}`, so
  // the watcher's own controller is not the test. Before this tranche the cast
  // event was refused unless the spell WAS the watcher, which no card means.
  const state = game([
    { ...BLIND_CREEPER, zone: 'battlefield' },
    { id: 'bolt', name: 'Lightning Bolt', owner: 'p2', typeLine: 'Instant', oracleText: '' },
  ]);

  const action = { type: 'CAST_SPELL', instanceId: 'bolt', controllerId: 'p2', at: 1 } as GameAction;
  const next = applyAction(state, action);
  const pending = collectTriggers(state, action, next);

  assert.equal(pending.length, 1, 'one cast, one watcher');
  assert.equal(pending[0].sourceInstanceId, 'creeper');
  assert.equal(pending[0].event.playerId, 'p2', 'and the event names the caster, not the watcher');
});

/* ------------------------------------------------------------------ *
 * cast — the subject is a spell, described by what it TARGETS
 * ------------------------------------------------------------------ */

/** Heroic. "a spell that targets this creature" is a filter on the spell. */
const AKROAN_SKYGUARD: Spec = {
  id: 'skyguard',
  name: 'Akroan Skyguard',
  typeLine: 'Creature — Human Soldier',
  oracleText: 'Flying\nHeroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.',
  power: '1',
  toughness: '1',
};

test('heroic fires for a spell announced against the watcher, and for nothing else', () => {
  resetAbilityCache();
  // The relative clause "that targets this creature" used to refuse the whole
  // trigger, so every heroic creature was a card the engine could not run.
  // Read as `{is:'targets', of:{sel:'self'}}`, the subject check asks the
  // stack object what it was announced against, which `CAST_SPELL` carries.
  const state = game([
    { ...AKROAN_SKYGUARD, zone: 'battlefield' },
    { id: 'bear', name: 'Bear', zone: 'battlefield' },
    { id: 'growth', name: 'Titanic Growth', typeLine: 'Instant', oracleText: '' },
    { id: 'growth2', name: 'Titanic Growth', typeLine: 'Instant', oracleText: '' },
    { id: 'growth3', name: 'Titanic Growth', typeLine: 'Instant', oracleText: '' },
  ]);
  assert.equal(abilityEngineOwns(state.cards.skyguard), true, 'precondition: the engine owns the heroic trigger');

  const cast = (instanceId: string, targets: string[]): GameAction =>
    ({
      type: 'CAST_SPELL',
      instanceId,
      controllerId: 'p1',
      targets: targets.map(id => ({ kind: 'card', instanceId: id, zone: 'battlefield' })),
      at: 1,
    }) as GameAction;

  const onMe = cast('growth', ['skyguard']);
  const fired = collectTriggers(state, onMe, applyAction(state, onMe));
  assert.equal(fired.length, 1, 'aimed at the Skyguard: heroic fires');
  assert.equal(fired[0].sourceInstanceId, 'skyguard');

  const onBear = cast('growth2', ['bear']);
  assert.equal(collectTriggers(state, onBear, applyAction(state, onBear)).length, 0, 'aimed at the Bear: it does not');

  const unaimed = cast('growth3', []);
  assert.equal(collectTriggers(state, unaimed, applyAction(state, unaimed)).length, 0, 'a spell with no targets targets nothing');
});

/* ------------------------------------------------------------------ *
 * step — "the end step", not "your end step"
 * ------------------------------------------------------------------ */

test("Glitterfang returns at the ACTIVE player's end step, even when that is not its controller", () => {
  resetAbilityCache();
  // `whose:{who:'active'}` used to be refused outright, because only
  // `{who:'you'}` was accepted and the step event only walked the active
  // player's own battlefield. A Glitterfang the opponent controls is exactly
  // the case both restrictions hid.
  const state = game([{ ...GLITTERFANG, owner: 'p2', zone: 'battlefield' }]);
  assert.equal(state.activePlayerId, 'p1', 'precondition: it is not its controller who is active');

  const next = applyAction(state, { type: 'PHASE_CHANGE', step: 'end', at: 1 } as GameAction);

  assert.equal(zoneOf(next, 'glitterfang'), 'hand', 'it went back to its owner');
});

/* ------------------------------------------------------------------ *
 * The subjects that are still refused, and say so
 * ------------------------------------------------------------------ */

test("Ajani's Pridemate is still refused, because the life-gain event is not derived", () => {
  resetAbilityCache();
  // The point of the pair: widening the SUBJECT did not quietly widen the EVENT
  // list. An ability waiting on an event `deriveTriggerEvents` never emits must
  // still stay with the old detector rather than sit silent inside the engine.
  const state = game([
    {
      id: 'pridemate',
      name: "Ajani's Pridemate",
      typeLine: 'Creature — Cat Soldier',
      oracleText: 'Whenever you gain life, put a +1/+1 counter on this creature.',
    },
  ]);

  assert.equal(abilityEngineOwns(state.cards.pridemate), false);
});

/* ------------------------------------------------------------------ *
 * Determinism, since the watcher list is now much longer
 * ------------------------------------------------------------------ */

test('two folds of the same action produce byte-identical states', () => {
  resetAbilityCache();
  // The watcher walk is seat order then battlefield arrival order, never object
  // key order and never a clock. With one watcher this was hard to get wrong;
  // with a board full of them it is not.
  const state = game([
    { ...SOUL_WARDEN, id: 'w1', zone: 'battlefield' },
    { ...CORPSE_KNIGHT, zone: 'battlefield' },
    { ...SOUL_WARDEN, id: 'w2', owner: 'p2', zone: 'battlefield' },
    { ...BOGWATER_LUMARET, zone: 'battlefield' },
    BEARS,
  ]);

  const action = play('bears');
  const a = applyAction(state, action);
  const b = applyAction(state, action);

  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('a watcher that is not on the battlefield does not watch', () => {
  resetAbilityCache();
  // Soul Warden in hand. Nothing in the widened walk may reach a card outside
  // the battlefield, or every trigger in a library would start firing.
  const state = game([SOUL_WARDEN, BEARS]);
  const next = applyAction(state, play('bears'));

  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE, 'a card in hand triggers nothing');
});

/* ------------------------------------------------------------------ *
 * The watcher list is a walk over the board, so it has to stay honest
 * about cards that are no longer really there.
 * ------------------------------------------------------------------ */

test('a removed permanent is not a watcher', () => {
  resetAbilityCache();
  const state = game([{ ...SOUL_WARDEN, zone: 'battlefield' }, BEARS]);
  const removed: GameState = {
    ...state,
    cards: {
      ...state.cards,
      warden: { ...(state.cards.warden as CardInstance), removedFromGame: true },
    },
  };

  const next = applyAction(removed, play('bears'));
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE);
});

/* ------------------------------------------------------------------ *
 * "defending player" — found while widening the walk, and older than it
 * ------------------------------------------------------------------ */

/**
 * `{who:'defending'}` resolves to NOBODY unless something bound the defender,
 * and until now nothing did. The three tests below are one fix and two
 * different reasons to care about it:
 *
 *   - Leeching Sliver is newly owned by this tranche ("a Sliver YOU CONTROL
 *     attacks" is a non-self subject), so without the binding this tranche
 *     would have shipped a card that resolves into no actions at all.
 *   - Agate-Blade Assassin is self-subject and has been owned all along, so it
 *     has been resolving into nothing for as long as it has been owned. Eleven
 *     fully-covered cards name a defending player; eight are in its position.
 *   - `deriveTriggerEvents` has been putting the declared defender in the
 *     attacks event's `targetPlayerId` the entire time.
 */

const LEECHING_SLIVER: Spec = {
  id: 'sliver',
  name: 'Leeching Sliver',
  typeLine: 'Creature — Sliver',
  oracleText: 'Whenever a Sliver you control attacks, defending player loses 1 life.',
  power: '1',
  toughness: '1',
};

test('Leeching Sliver drains the player its OTHER Sliver attacked', () => {
  resetAbilityCache();
  const state = game([
    { ...LEECHING_SLIVER, zone: 'battlefield' },
    { id: 'other', name: 'Leeching Sliver', typeLine: 'Creature — Sliver', oracleText: '', zone: 'battlefield' },
  ]);

  const next = applyAction(state, {
    type: 'ATTACK',
    attackers: [{ attackerId: 'other', defenderPlayerId: 'p2' }],
    at: 1,
  } as GameAction);

  assert.equal(lifeOf(next, 'p2'), STARTING_LIFE - 1, 'the defender lost the printed 1');
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE, 'and the attacker did not');
});

test('Agate-Blade Assassin, self-subject and owned all along, was resolving into nothing', () => {
  resetAbilityCache();
  const state = game([
    {
      id: 'assassin',
      name: 'Agate-Blade Assassin',
      typeLine: 'Creature — Lizard Assassin',
      oracleText: 'Whenever this creature attacks, defending player loses 1 life and you gain 1 life.',
      power: '1',
      toughness: '3',
      zone: 'battlefield',
    },
  ]);

  const next = applyAction(state, {
    type: 'ATTACK',
    attackers: [{ attackerId: 'assassin', defenderPlayerId: 'p2' }],
    at: 1,
  } as GameAction);

  assert.equal(lifeOf(next, 'p2'), STARTING_LIFE - 1, 'both halves of the clause, not just the easy one');
  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 1);
});

test('the defender is bound from the attacks event only, never from a damage event', () => {
  resetAbilityCache();
  // On an attacks event `targetPlayerId` is the declared defender. On a
  // deals-damage event the same field is whoever took the damage, which is a
  // different seat the moment the damage is not combat damage. Binding it there
  // would point "defending player loses 1 life" at a bystander.
  const state = game([
    {
      id: 'assassin',
      name: 'Agate-Blade Assassin',
      typeLine: 'Creature — Lizard Assassin',
      oracleText: 'Whenever this creature attacks, defending player loses 1 life and you gain 1 life.',
      power: '1',
      toughness: '3',
      zone: 'battlefield',
    },
  ]);

  const next = applyAction(state, {
    type: 'DAMAGE',
    sourceInstanceId: 'assassin',
    sourcePlayerId: 'p1',
    targetPlayerId: 'p2',
    amount: 2,
    at: 1,
  } as GameAction);

  assert.equal(
    lifeOf(next, 'p2'),
    STARTING_LIFE - 2,
    'only the damage itself — the attacks trigger did not fire on a damage event'
  );
});
