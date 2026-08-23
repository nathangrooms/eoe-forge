/**
 * Unit tests for trigger detection and the honesty marker.
 *
 *   node --test --experimental-strip-types src/lib/game/effects.test.ts
 *
 * The bug being fixed, in the owner's words: *"Had a card that is +1 life when
 * it gets played, but nothing happened."* The first test is that case, end to
 * end through `applyAction`.
 *
 * Oracle text below uses the post-2024 templating our own `cards` rows carry
 * ("When this creature enters", not "When CARDNAME enters the battlefield"),
 * plus the older wording where a real card still uses it, because a detector
 * validated against remembered phrasing is validated against a catalogue we do
 * not have.
 *
 * Half of these tests assert that something is NOT automated. That half is the
 * important one: the design rule is that the engine never silently does
 * nothing, so anything it declines has to show up as a manual note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import { automationFor, detectTriggers } from './effects.ts';
import type { CardInstance, GameState, PlayerId, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner?: PlayerId;
  name: string;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
  power?: string;
  toughness?: string;
  zone?: Zone;
}

function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
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
        name: spec.name,
        ownerId: spec.owner ?? 'p1',
        controllerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Test',
        oracleText: spec.oracleText ?? '',
        keywords: spec.keywords ?? [],
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
      },
      spec.zone ?? 'hand'
    );
  }

  return state;
}

function card(name: string, oracleText: string, extra: Partial<Spec> = {}): CardInstance {
  const state = game([{ id: 'c', name, oracleText, ...extra }]);
  return state.cards.c;
}

function lifeOf(state: GameState, playerId: PlayerId): number {
  return state.players.find(p => p.id === playerId)!.life;
}

function logText(state: GameState): string {
  return state.log.map(event => event.message).join('\n');
}

/* ------------------------------------------------------------------ *
 * The reported bug
 * ------------------------------------------------------------------ */

test('a creature that gains life on entry actually gains the life', () => {
  const state = game([
    {
      id: 'c',
      name: "Angel of Vitality",
      oracleText: 'When this creature enters, you gain 3 life.',
    },
  ]);

  const before = lifeOf(state, 'p1');
  const next = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });

  assert.equal(lifeOf(next, 'p1'), before + 3);
  assert.match(logText(next), /gained 3 life/);
  // The log names the cause, not just the consequence.
  assert.match(logText(next), /Angel of Vitality/);
});

test('the old "enters the battlefield" wording works too', () => {
  const state = game([
    { id: 'c', name: 'Old Templating', oracleText: 'When Old Templating enters the battlefield, you gain 2 life.' },
  ]);
  const next = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(lifeOf(next, 'p1'), lifeOf(state, 'p1') + 2);
});

test('an ETB draw draws', () => {
  let state = game([
    { id: 'c', name: 'Elvish Visionary', oracleText: 'When this creature enters, draw a card.' },
    { id: 'lib1', name: 'Forest', typeLine: 'Basic Land — Forest', zone: 'library' },
  ]);
  const handBefore = state.players[0].zones.hand.length;
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  // One card left the hand to the battlefield, one was drawn back into it.
  assert.equal(state.players[0].zones.hand.length, handBefore);
  assert.equal(state.players[0].zones.library.length, 0);
});

test('an ETB token maker puts a real token on the battlefield', () => {
  let state = game([
    {
      id: 'c',
      name: 'Token Maker',
      oracleText: 'When this creature enters, create a 1/1 white Soldier creature token.',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });

  const tokens = Object.values(state.cards).filter(instance => instance.isToken);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].name, 'Soldier');
  assert.equal(tokens[0].power, '1');
  assert.equal(tokens[0].toughness, '1');
  assert.equal(tokens[0].zone, 'battlefield');
  assert.ok(state.players[0].zones.battlefield.includes(tokens[0].instanceId));
});

test('a token that leaves the battlefield ceases to exist', () => {
  let state = game([
    { id: 'c', name: 'Token Maker', oracleText: 'When this creature enters, create a 1/1 white Soldier creature token.' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  const token = Object.values(state.cards).find(instance => instance.isToken)!;

  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: token.instanceId, to: 'graveyard' });
  assert.equal(state.players[0].zones.graveyard.includes(token.instanceId), false);
  assert.equal(state.cards[token.instanceId].removedFromGame, true);
});

test('an attack trigger fires when attackers are declared', () => {
  let state = game([
    {
      id: 'c',
      name: 'Marauder',
      oracleText: 'Whenever this creature attacks, you gain 1 life.',
      zone: 'battlefield',
    },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, {
    type: 'ATTACK',
    attackers: [{ attackerId: 'c', defenderPlayerId: 'p2' }],
  });
  assert.equal(lifeOf(state, 'p1'), before + 1);
});

test('"enters or attacks" registers both timings', () => {
  const triggers = detectTriggers(
    card('Adanto Vanguard', 'Whenever this creature enters or attacks, you gain 1 life.')
  );
  const timings = triggers.map(trigger => trigger.timing).sort();
  assert.deepEqual(timings, ['attack', 'etb']);
});

test('an upkeep trigger fires when the step is entered', () => {
  let state = game([
    {
      id: 'c',
      name: 'Font of Life',
      oracleText: 'At the beginning of your upkeep, you gain 1 life.',
      zone: 'battlefield',
    },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'upkeep' });
  assert.equal(lifeOf(state, 'p1'), before + 1);
});

test('each opponent losing life is applied to every living opponent', () => {
  let state = game([
    {
      id: 'c',
      name: 'Drainer',
      oracleText: 'When this creature enters, each opponent loses 2 life and you gain 2 life.',
    },
  ]);
  const mine = lifeOf(state, 'p1');
  const theirs = lifeOf(state, 'p2');
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(lifeOf(state, 'p2'), theirs - 2);
  assert.equal(lifeOf(state, 'p1'), mine + 2);
});

/* ------------------------------------------------------------------ *
 * The half that matters more: what is NOT automated
 * ------------------------------------------------------------------ */

test('anything with a target is left to the player, and said out loud', () => {
  const instance = card('Flametongue Kavu', 'When this creature enters, it deals 4 damage to target creature.');
  const automation = automationFor(instance);
  assert.equal(automation.triggers.length, 1);
  assert.equal(automation.triggers[0].automated, false);
  assert.equal(automation.level, 'manual');
  assert.equal(automation.needsManual, true);
  assert.equal(automation.manualNotes.length, 1);
});

/*
 * FLAMETONGUE KAVU WAS THE EXAMPLE OF A TRIGGER THE ENGINE WOULD NOT RUN, and
 * on 23 Aug 2026 it stopped being one: a triggered ability can be pointed at
 * something now, so this ETB aims itself and deals its four damage.
 *
 * The assertion is inverted rather than deleted, and the honesty rule moved to
 * a card the engine still genuinely will not run. A test that only ever
 * asserted "we cannot do this yet" has to change when we can. A test asserting
 * "and it says so when we cannot" must not, so there is still one below.
 */
test('a targeted ETB is aimed and resolves', () => {
  let state = game([
    { id: 'c', name: 'Flametongue Kavu', oracleText: 'When this creature enters, it deals 4 damage to target creature.' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  // The Kavu is the only creature on the board, so it is the only legal target,
  // and a forced choice is not a choice: nobody is asked and it kills itself.
  // That is the card played correctly, and it is the answer a judge gives.
  assert.match(logText(state), /dealt 4 damage/i);
  assert.equal(state.cards.c.zone, 'graveyard');
  assert.doesNotMatch(logText(state), /by hand/i, 'nothing was left over, so nothing claims to be');
});

test('a trigger the engine still will not run says so rather than going quiet', () => {
  let state = game([
    {
      id: 'c',
      name: 'Careful Thing',
      // "You may" is the player's word, so `unrunnableReasons` refuses it and
      // the card stays with the old detector, which asks for it by hand.
      oracleText: 'When this creature enters, you may return a land you control to its owner\'s hand.',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.match(logText(state), /by hand/i);
  assert.ok(state.log.some(event => event.type === 'NOTE'));
});

test('a permanent whose unimplemented text did NOT trigger stays out of the log', () => {
  // 93% of real cards carry text the engine will not run. A line in the feed
  // for every one of them would bury the ones that matter, so the marker on the
  // card carries that case and the log stays quiet.
  let state = game([
    { id: 'c', name: 'Silent Statue', oracleText: 'Creatures you control get +1/+1.' },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(state.log.some(event => event.type === 'NOTE'), false);
  // …but the card itself still says so.
  assert.equal(automationFor(state.cards.c).needsManual, true);
});

test('a half-resolved trigger says which half is still outstanding', () => {
  let state = game([
    {
      id: 'c',
      name: 'Half Measure',
      oracleText: 'When this creature enters, you gain 2 life and you take the initiative.',
    },
  ]);
  const before = lifeOf(state, 'p1');
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  assert.equal(lifeOf(state, 'p1'), before + 2);
  assert.match(logText(state), /partly resolved/);
  assert.match(logText(state), /initiative/);
});

test('an instant resolving to the graveyard never passes for resolved', () => {
  let state = game([{ id: 'c', name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.' }]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'graveyard' });
  assert.match(logText(state), /resolve by hand/i);
});

test('a "you may" trigger is not automated even though it also gains life', () => {
  const automation = automationFor(
    card('Optional', 'When this creature enters, you may gain 3 life.')
  );
  assert.equal(automation.triggers[0].automated, false);
  assert.equal(automation.needsManual, true);
});

test('a variable amount is not guessed at', () => {
  const automation = automationFor(
    card('Variable', 'When this creature enters, you gain life equal to the number of creatures you control.')
  );
  assert.equal(automation.triggers[0].automated, false);
});

test('an unresolved half of a partly-automated trigger is reported', () => {
  const automation = automationFor(
    card('Half', 'When this creature enters, you gain 2 life and scry 1.')
  );
  // "scry" needs a decision, so the whole clause is left to the player.
  assert.equal(automation.triggers[0].automated, false);
  assert.equal(automation.needsManual, true);
});

test('a vanilla creature is vanilla, and carries no marker', () => {
  const automation = automationFor(card('Grizzly Bears', ''));
  assert.equal(automation.level, 'vanilla');
  assert.equal(automation.needsManual, false);
});

test('a keyword-only creature reads as keywords, not as manual', () => {
  const automation = automationFor(
    card('Serra Angel', 'Flying, vigilance', { keywords: ['flying', 'vigilance'] })
  );
  assert.equal(automation.level, 'keywords');
  assert.equal(automation.needsManual, false);
  assert.deepEqual(automation.engineKeywords.sort(), ['flying', 'vigilance']);
});

test('a keyword the engine does not enforce is admitted rather than badged as working', () => {
  const automation = automationFor(
    card('Warded', 'Ward {2}', { keywords: ['ward'] })
  );
  assert.deepEqual(automation.advisoryKeywords, ['ward']);
  assert.equal(automation.needsManual, true);
  assert.ok(automation.manualNotes.some(note => note.includes('ward')));
});

test('missing oracle text reads as unknown, never as vanilla', () => {
  const state = game([{ id: 'c', name: 'Mystery', oracleText: '' }]);
  const stripped: CardInstance = { ...state.cards.c, oracleText: undefined };
  const automation = automationFor(stripped);
  assert.equal(automation.level, 'unknown');
  assert.equal(automation.needsManual, true);
  assert.match(automation.summary, /not loaded/i);
});

test('a mana ability is not reported as unresolved — mana.ts already approximates it', () => {
  const automation = automationFor(
    card('Llanowar Elves', '{T}: Add {G}.', { typeLine: 'Creature — Elf Druid' })
  );
  assert.deepEqual(automation.manualNotes, []);
  assert.equal(automation.needsManual, false);
});

test('the marker can be dismissed once the player has resolved it', () => {
  let state = game([
    { id: 'c', name: 'Flametongue Kavu', oracleText: 'When this creature enters, it deals 4 damage to target creature.', zone: 'battlefield' },
  ]);
  assert.equal(automationFor(state.cards.c).needsManual, true);
  state = applyAction(state, { type: 'MARK_MANUAL_RESOLVED', instanceId: 'c' });
  assert.equal(automationFor(state.cards.c).needsManual, false);
});

/* ------------------------------------------------------------------ *
 * Manual intervention
 * ------------------------------------------------------------------ */

test('a hand-flagged keyword is indistinguishable from a printed one', () => {
  let state = game([{ id: 'c', name: 'Grounded', oracleText: '', zone: 'battlefield' }]);
  state = applyAction(state, { type: 'SET_KEYWORD', instanceId: 'c', keyword: 'flying', on: true });
  assert.equal(automationFor(state.cards.c).engineKeywords.includes('flying'), true);

  state = applyAction(state, { type: 'SET_KEYWORD', instanceId: 'c', keyword: 'flying', on: false });
  assert.equal(automationFor(state.cards.c).engineKeywords.includes('flying'), false);
});

test('a printed keyword can be switched off without rewriting the card', () => {
  let state = game([
    { id: 'c', name: 'Flier', oracleText: 'Flying', keywords: ['flying'], zone: 'battlefield' },
  ]);
  state = applyAction(state, { type: 'SET_KEYWORD', instanceId: 'c', keyword: 'flying', on: false });
  assert.deepEqual(state.cards.c.keywords, ['flying']);
  assert.deepEqual(state.cards.c.suppressedKeywords, ['flying']);
  assert.equal(automationFor(state.cards.c).engineKeywords.includes('flying'), false);
});

test('stats can be set and adjusted, and reset back to printed', () => {
  let state = game([
    { id: 'c', name: 'Shifter', power: '2', toughness: '2', zone: 'battlefield' },
  ]);
  state = applyAction(state, { type: 'SET_CARD_STAT', instanceId: 'c', power: 5, toughness: 5 });
  assert.equal(state.cards.c.powerOverride, 5);

  state = applyAction(state, {
    type: 'SET_CARD_STAT',
    instanceId: 'c',
    power: 1,
    toughness: -1,
    mode: 'adjust',
  });
  assert.equal(state.cards.c.powerOverride, 6);
  assert.equal(state.cards.c.toughnessOverride, 4);

  state = applyAction(state, {
    type: 'SET_CARD_STAT',
    instanceId: 'c',
    power: null,
    toughness: null,
  });
  assert.equal(state.cards.c.powerOverride, undefined);
  assert.equal(state.cards.c.toughnessOverride, undefined);
});

test('overrides and flags are dropped when a permanent leaves the battlefield', () => {
  let state = game([{ id: 'c', name: 'Shifter', zone: 'battlefield' }]);
  state = applyAction(state, { type: 'SET_CARD_STAT', instanceId: 'c', power: 7, toughness: 7 });
  state = applyAction(state, { type: 'SET_KEYWORD', instanceId: 'c', keyword: 'flying', on: true });
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'c', to: 'graveyard' });

  assert.equal(state.cards.c.powerOverride, undefined);
  assert.deepEqual(state.cards.c.grantedKeywords, undefined);
});

test('a token can be minted at a caller-supplied id', () => {
  let state = game([]);
  state = applyAction(state, {
    type: 'CREATE_TOKEN',
    playerId: 'p1',
    instanceId: 'my-token',
    token: { name: 'Treasure', typeLine: 'Token Artifact — Treasure' },
  });
  assert.equal(state.cards['my-token']?.name, 'Treasure');
  assert.equal(state.cards['my-token']?.isToken, true);
});

test('a note about a token that has already ceased to exist is still logged', () => {
  let state = game([]);
  state = applyAction(state, {
    type: 'CREATE_TOKEN',
    playerId: 'p1',
    instanceId: 'ghost',
    token: { name: 'Zombie', typeLine: 'Token Creature — Zombie', power: '2', toughness: '2' },
  });
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'ghost', to: 'graveyard' });
  assert.equal(state.cards.ghost.removedFromGame, true);

  const next = applyAction(state, {
    type: 'NOTE',
    instanceId: 'ghost',
    message: 'The Zombie died; resolve its death trigger.',
  });
  assert.match(logText(next), /resolve its death trigger/);
});

test('a note changes nothing but is logged', () => {
  const state = game([]);
  const next = applyAction(state, { type: 'NOTE', message: 'Resolved the storm count by hand.' });
  assert.notEqual(next, state);
  assert.match(logText(next), /storm count/);
  assert.deepEqual(next.players, state.players);
});

test('a trigger chain cannot run away', () => {
  // A token maker whose token also makes a token would loop forever in real
  // Magic. The engine caps the chain instead of hanging.
  let state = game([
    {
      id: 'c',
      name: 'Loop',
      oracleText: 'When this creature enters, create a 1/1 green Loop creature token.',
    },
  ]);
  state = applyAction(state, { type: 'PLAY', instanceId: 'c', to: 'battlefield' });
  const tokens = Object.values(state.cards).filter(instance => instance.isToken);
  assert.ok(tokens.length >= 1 && tokens.length < 20);
});
