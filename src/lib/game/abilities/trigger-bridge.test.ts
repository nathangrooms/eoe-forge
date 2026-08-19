/**
 * DeckMatrix — the ability engine is wired in, and nothing fires twice.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/trigger-bridge.test.ts
 *
 * ## The bug this file exists to disprove
 *
 * Two trigger systems can read the same card: the older regex detector in
 * `effects.ts`, and the oracle-text compiler behind `to-actions.ts`. If both
 * enumerated one card's triggers, every enters-the-battlefield trigger in the
 * game would fire twice.
 *
 * The first test below proves the hazard is real — the old detector genuinely
 * does find an ETB on the very card the new engine now owns — and then proves
 * it is neutralised: one pending trigger, one life change, life moves by
 * exactly the printed amount.
 *
 * Both directions matter. The owner's original report was *"Had a card that is
 * +1 life when it gets played, but nothing happened."* So it must fire, and it
 * must fire once. A test that only checked "not doubled" would pass just as
 * happily if the ability had stopped working altogether.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from '../rules.ts';
import type { GameState, PlayerId, Zone } from '../types.ts';
import { collectTriggers } from '../triggers.ts';
import { detectTriggers } from '../effects.ts';
import {
  abilityEngineOwns,
  gameEventKindFor,
  ownedTriggersOf,
  unrunnableReason,
} from './trigger-bridge.ts';
import { abilitiesFor, resetAbilityCache, triggeredAbilitiesOf } from './card-abilities.ts';

/* ------------------------------------------------------------------ *
 * Table building
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  owner?: PlayerId;
  typeLine?: string;
  oracleText?: string;
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
        typeLine: spec.typeLine ?? 'Creature — Human Cleric',
        oracleText: spec.oracleText ?? '',
        keywords: [],
        power: '2',
        toughness: '2',
        damage: 0,
      },
      spec.zone ?? 'hand'
    );
  }

  return state;
}

const lifeOf = (state: GameState, playerId: PlayerId): number =>
  state.players.find(p => p.id === playerId)!.life;

/** Every log entry of one action type — how we count "fired once". */
const logTypes = (state: GameState, type: string): number =>
  state.log.filter(event => event.type === type).length;

const logText = (state: GameState): string =>
  state.log.map(event => event.message).join('\n');

/** "When this creature enters, you gain 2 life." — the owner's exact case. */
const HEALER: Spec = {
  id: 'healer',
  name: 'Kindly Healer',
  oracleText: 'When this creature enters, you gain 2 life.',
};

/* ------------------------------------------------------------------ *
 * The doubling test — the whole point of the ownership fork
 * ------------------------------------------------------------------ */

test('an ETB life gain fires exactly once, for exactly the printed amount', () => {
  resetAbilityCache();
  const state = game([HEALER]);
  const card = state.cards.healer;

  // 1. The hazard is real, not hypothetical. BOTH systems understand this card:
  //    if both were allowed to enumerate it, the ability would resolve twice.
  const old = detectTriggers(card);
  assert.ok(
    old.some(trigger => trigger.timing === 'etb'),
    'precondition: the old detector really does find this ETB — the overlap exists'
  );
  assert.equal(triggeredAbilitiesOf(card).length, 1, 'and so does the compiler');

  // 2. Ownership resolves it to exactly one system.
  assert.equal(abilityEngineOwns(card), true, 'the compiler understands the whole card');

  // 3. Play it for real, through the real reducer.
  const before = lifeOf(state, 'p1');
  assert.equal(before, STARTING_LIFE);

  const next = applyAction(state, { type: 'PLAY', instanceId: 'healer', to: 'battlefield', at: 1 });
  assert.notEqual(next, state, 'the play was legal');

  // 4. It fired — the original bug was that nothing happened at all.
  const after = lifeOf(next, 'p1');
  assert.notEqual(after, before, 'the ETB must actually do something');

  // 5. It fired ONCE, for the printed amount. Doubling would read 44.
  assert.equal(after, STARTING_LIFE + 2, `life must move by exactly 2, got ${after - before}`);

  // 6. Once at the action level too, not merely a net total that happens to add
  //    up. Two +2 gains and one -2 would also land on 42.
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 1, 'exactly one life change was logged');

  // 7. Nobody else gained life.
  assert.equal(lifeOf(next, 'p2'), STARTING_LIFE, 'the opponent is untouched');
});

test('only one system enumerates an owned card — one pending trigger, never two', () => {
  resetAbilityCache();
  const state = game([HEALER]);
  const play = { type: 'PLAY' as const, instanceId: 'healer', to: 'battlefield' as const, at: 1 };

  // `collectTriggers` is the single chokepoint where a card's triggers are
  // enumerated. Two entries here IS the doubling bug, one level below the life
  // total — so this asserts the structure, not just the symptom.
  const applied = applyAction(state, play);
  const pending = collectTriggers(state, play, applied);

  assert.equal(pending.length, 1, 'one ETB event produced exactly one trigger');
  assert.ok(pending[0].dsl, 'and it was routed to the ability engine');
  assert.equal(pending[0].dsl.text, HEALER.oracleText, 'carrying the verbatim clause');
  assert.equal(pending[0].sourceInstanceId, 'healer');
});

test('the ability engine resolving a trigger is still one replayable log', () => {
  // The engine's core promise: two clients folding the same action list land on
  // the same state. A trigger resolving through the new runtime must not break
  // that — nothing in `to-actions.ts` may read a clock or a random source.
  resetAbilityCache();
  const state = game([HEALER]);
  const play = { type: 'PLAY' as const, instanceId: 'healer', to: 'battlefield' as const, at: 1 };

  const a = applyAction(state, play);
  const b = applyAction(state, play);

  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(lifeOf(a, 'p1'), STARTING_LIFE + 2);
});

test('a pending trigger survives serialisation with its compiled ability', () => {
  // `GameState` goes over a wire and into a Supabase column. If the compiled
  // ability did not round-trip, a client resuming a game would resolve the
  // trigger down the old path instead — silently, and differently.
  resetAbilityCache();
  const state = game([HEALER]);
  const play = { type: 'PLAY' as const, instanceId: 'healer', to: 'battlefield' as const, at: 1 };
  const pending = collectTriggers(state, play, applyAction(state, play));

  const round = JSON.parse(JSON.stringify(pending));
  assert.deepEqual(round, pending, 'plain JSON — no closures, no class instances');
  assert.ok(round[0].dsl.effects.length > 0);
});

/* ------------------------------------------------------------------ *
 * The other direction — cards the engine must NOT claim
 * ------------------------------------------------------------------ */

test('a card the engine does not fully understand stays with the old detector', () => {
  resetAbilityCache();
  // "Whenever ANOTHER creature enters" is a battlefield-wide event this engine
  // never derives. Claiming the card would silence its triggers entirely.
  const state = game([
    { id: 'warden', name: 'Soul Warden', oracleText: 'Whenever another creature enters, you gain 1 life.' },
  ]);

  const card = state.cards.warden;
  assert.equal(abilityEngineOwns(card), false);
  assert.deepEqual(ownedTriggersOf(card), [], 'and it offers no triggers to run');

  const [ability] = triggeredAbilitiesOf(card);
  assert.ok(ability, 'the compiler did model it — it is the game that has no such event');
  assert.equal(gameEventKindFor(ability.event), null);
});

test('an unowned ETB still fires — the old detector was not switched off', () => {
  resetAbilityCache();
  // A card with one clause the compiler models and one it does not. Coverage is
  // 'partial', so the engine declines it and the old path must still work.
  const state = game([
    {
      id: 'mixed',
      name: 'Mixed Signals',
      oracleText:
        'When this creature enters, you gain 3 life.\nPlayers may cast spells from their libraries as though those cards were in their hands.',
    },
  ]);

  assert.equal(abilityEngineOwns(state.cards.mixed), false, 'partial coverage is not ownership');

  const next = applyAction(state, {
    type: 'PLAY',
    instanceId: 'mixed',
    to: 'battlefield',
    at: 1,
  });

  assert.equal(lifeOf(next, 'p1'), STARTING_LIFE + 3, 'the old detector still resolves it');
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 1, 'and still exactly once');
});

test('a card with no triggers is never claimed, so nothing is silenced', () => {
  resetAbilityCache();
  const state = game([
    { id: 'anthem', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
    { id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear' },
  ]);

  assert.equal(abilityEngineOwns(state.cards.anthem), false, 'a static is not a trigger');
  assert.equal(abilityEngineOwns(state.cards.bear), false, 'no rules text at all');
});

test('"return a creature you control" never wipes the board it was meant to bounce one of', () => {
  resetAbilityCache();
  // A real regression, found by playing all eleven cards the bridge claimed out
  // of the project's own card export rather than by reading the predicate.
  //
  // `Selector` cannot say "one of these, chosen on resolution", so the compiler
  // used to read "a creature you control" as `{sel:'all'}` — every creature.
  // Coverage still said 'full' (every clause WAS accounted for), so the bridge
  // claimed the card, and playing Whitemane Lion returned the player's whole
  // board to hand, itself included. Before the runtime was wired this was
  // inert; wiring it made it a board wipe on a two-mana cat.
  //
  // The lesson the assertion pins: coverage measures whether the compiler read
  // every clause, NOT whether it read them correctly, and ownership must not
  // treat the first as the second.
  const state = game([
    {
      id: 'lion',
      name: 'Whitemane Lion',
      typeLine: 'Creature — Cat',
      oracleText: "Flash\nWhen this creature enters, return a creature you control to its owner's hand.",
    },
    { id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear', zone: 'battlefield' },
  ]);

  assert.equal(abilityEngineOwns(state.cards.lion), false, 'an unchosen choice is not understood');

  const next = applyAction(state, { type: 'PLAY', instanceId: 'lion', to: 'battlefield', at: 1 });
  const battlefield = next.players.find(p => p.id === 'p1')!.zones.battlefield;

  assert.deepEqual(battlefield, ['bear', 'lion'], 'both creatures are still on the battlefield');
  assert.equal(logTypes(next, 'MOVE_ZONE'), 0, 'nothing was bounced by guesswork');
  assert.match(logText(next), /by hand/i, 'the choice is asked for instead');
});

test('a land that bounces "a land you control" does not bounce itself back to hand', () => {
  resetAbilityCache();
  // The same defect on a land, where it is even easier to miss: the land
  // entered, its own ETB matched `{sel:'all'}` lands you control, and the land
  // went straight back to hand. A land drop that undoes itself.
  const state = game([
    {
      id: 'commons',
      name: 'Guildless Commons',
      typeLine: 'Land',
      oracleText:
        "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {C}{C}.",
    },
  ]);

  const next = applyAction(state, { type: 'PLAY', instanceId: 'commons', to: 'battlefield', at: 1 });
  const p1 = next.players.find(p => p.id === 'p1')!;

  assert.deepEqual(p1.zones.battlefield, ['commons'], 'the land stayed where it was played');
  assert.deepEqual(p1.zones.hand, [], 'and did not return itself to hand');
});

/* ------------------------------------------------------------------ *
 * Runnability — why a trigger is declined, stated rather than implied
 * ------------------------------------------------------------------ */

test('a "you may" trigger is never taken automatically, and says so', () => {
  resetAbilityCache();
  // Auto-taking an optional trigger is the same class of bug as ignoring it:
  // the board changed and the player never agreed to it.
  //
  // This compiler expresses "you may" as a `{do:'may'}` EFFECT rather than the
  // `optional` flag on the ability, so the card is genuinely owned by the
  // ability engine and the refusal happens inside the effect runtime, where
  // `to-actions.ts` defers the choice instead of taking it. `unrunnableReason`
  // still guards the `optional` flag for the day the compiler sets it; this
  // test pins the path that is actually live.
  const state = game([
    { id: 'may', name: 'Optional Healer', oracleText: 'When this creature enters, you may gain 2 life.' },
  ]);

  const [ability] = triggeredAbilitiesOf(state.cards.may);
  assert.ok(ability, 'the compiler modelled the trigger');
  assert.equal(ability.optional, undefined, 'as an effect, not an ability flag');
  assert.equal(ability.effects[0].do, 'may', 'the choice is the outermost effect');
  assert.equal(abilityEngineOwns(state.cards.may), true, 'so the engine does own this card');

  const next = applyAction(state, { type: 'PLAY', instanceId: 'may', to: 'battlefield', at: 1 });

  assert.equal(
    lifeOf(next, 'p1'),
    STARTING_LIFE,
    'an optional trigger must not resolve itself'
  );
  assert.equal(logTypes(next, 'LIFE_CHANGE'), 0, 'no life change was even attempted');
  assert.match(
    logText(next),
    /not resolved automatically/i,
    'and the engine says out loud that it declined'
  );
  assert.match(logText(next), /gain 2 life/i, 'quoting the choice that is waiting');
});

test('every declined trigger says why, in words', () => {
  resetAbilityCache();
  // `unrunnableReason` returning prose rather than `false` is what makes
  // ownership diagnosable instead of an opaque no.
  const state = game([
    { id: 'warden', name: 'Soul Warden', oracleText: 'Whenever another creature enters, you gain 1 life.' },
  ]);

  const [ability] = triggeredAbilitiesOf(state.cards.warden);
  const reason = unrunnableReason(ability);
  assert.ok(typeof reason === 'string' && reason.length > 0, 'a reason, not just false');
  assert.match(reason, /no event/i);
});

test('ownership is all-or-nothing: one unrunnable trigger disqualifies the card', () => {
  resetAbilityCache();
  // The partial-ownership bug in one test. A card whose triggers the engine
  // only half-understands must stay entirely with the old detector, or the
  // half it did not model stops firing.
  const state = game([
    {
      id: 'split',
      name: 'Split Brain',
      oracleText:
        'When this creature enters, you gain 2 life.\nWhenever another creature enters, you gain 1 life.',
    },
  ]);

  const card = state.cards.split;
  const abilities = triggeredAbilitiesOf(card);
  // Asserted, never skipped: if the compiler stopped modelling both clauses
  // this test would quietly stop testing anything.
  assert.equal(abilities.length, 2, 'the compiler models both clauses');

  const runnable = abilities.filter(a => unrunnableReason(a) === null);
  assert.ok(runnable.length > 0, 'the self ETB is runnable on its own');
  assert.ok(runnable.length < abilities.length, 'the other-creature clause is not');
  assert.equal(abilityEngineOwns(card), false, 'so the engine claims neither');
});

/* ------------------------------------------------------------------ *
 * The four DSL extensions and ownership
 *
 * Raising what the DSL can REPRESENT raises how many cards reach
 * `coverage: 'full'`, and `abilityEngineOwns` keys off exactly that. So every
 * extension that adds a construct the resolution context cannot bind has to
 * add a matching refusal, or the new expressiveness would take cards away from
 * the old detector and hand them to an engine that resolves them to nothing.
 *
 * These are the tests that keep the two in step.
 * ------------------------------------------------------------------ */

test('E9: a computed count is fully bindable, so the engine DOES own Dockside Extortionist', () => {
  // The positive case, first, so the refusals below read as deliberate rather
  // than as blanket caution. `{v:'count'}` resolves against the battlefield the
  // trigger already has; nothing is missing, so the card is owned and really
  // resolves.
  resetAbilityCache();
  const state = game([
    {
      id: 'dockside',
      name: 'Dockside Extortionist',
      typeLine: 'Creature — Goblin Pirate',
      oracleText:
        'When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.',
    },
  ]);

  const triggers = triggeredAbilitiesOf(state.cards.dockside);
  assert.equal(triggers.length, 1);
  assert.equal(unrunnableReason(triggers[0]), null, 'nothing about it is unbindable');
  assert.equal(abilityEngineOwns(state.cards.dockside), true);
});

test('E6: a card needing turn history is representable and NOT owned', () => {
  resetAbilityCache();
  const state = game([
    {
      id: 'tally',
      name: 'Graveyard Tally',
      typeLine: 'Creature — Spirit',
      oracleText: 'When this creature enters, you gain 1 life for each creature that died this turn.',
    },
  ]);

  const record = abilitiesFor(state.cards.tally);
  assert.equal(record.coverage, 'full', 'the DSL expresses it completely');

  const triggers = triggeredAbilitiesOf(state.cards.tally);
  assert.match(
    String(unrunnableReason(triggers[0])),
    /turn history/,
    'and the engine says why it will not run it'
  );
  assert.equal(abilityEngineOwns(state.cards.tally), false, 'so the old detector keeps the card');
});

test('E4: an opponent-facing cost is representable and NOT owned', () => {
  resetAbilityCache();
  const state = game([
    {
      id: 'tithe',
      name: 'Smothering Tithe',
      typeLine: 'Enchantment',
      oracleText:
        "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
    },
  ]);

  assert.equal(abilitiesFor(state.cards.tithe).coverage, 'full');
  const triggers = triggeredAbilitiesOf(state.cards.tithe);
  // Two independent reasons hold this card back, and either alone is enough:
  // the engine derives no "an opponent drew" event, and it cannot offer a
  // player an optional cost. The assertion is on the fact of refusal.
  assert.notEqual(unrunnableReason(triggers[0]), null);
  assert.equal(abilityEngineOwns(state.cards.tithe), false);
});

test('the refusal is on the EFFECTS, not just the event — a self-ETB history card is caught too', () => {
  // Without an effect-level check this card would slip through: its event is
  // `enters` on `{sel:'self'}`, which the engine derives, and every other
  // ownership condition passes. Only walking the effect tree catches it.
  resetAbilityCache();
  const state = game([
    {
      id: 'sneaky',
      name: 'Sneaky Tally',
      typeLine: 'Creature — Spirit',
      oracleText: 'When this creature enters, draw a card for each creature that died this turn.',
    },
  ]);

  const record = abilitiesFor(state.cards.sneaky);
  assert.equal(record.coverage, 'full');
  assert.equal(gameEventKindFor(triggeredAbilitiesOf(state.cards.sneaky)[0].event), 'enters');
  assert.equal(abilityEngineOwns(state.cards.sneaky), false, 'and it is still refused');
});
