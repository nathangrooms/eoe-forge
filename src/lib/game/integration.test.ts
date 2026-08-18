/**
 * Integration guarantees for the whole game core.
 *
 *   node --test --experimental-strip-types src/lib/game/integration.test.ts
 *
 * `combat.test.ts` and `effects.test.ts` assert that individual rules are
 * right. This file asserts the two properties the *product* depends on, which
 * no single-rule test can see:
 *
 *  1. **Determinism.** The owner's requirement is "hundreds or thousands of
 *     players playing live". That is only reachable if a game IS its action log
 *     — clients apply locally for instant feedback, the server validates and
 *     relays actions and never state, and every client replaying the same log
 *     lands on byte-identical state. Every test under "Determinism" below is a
 *     direct check on that: purity, repeatability, replay equality, JSON
 *     serialisability, and a source-level scan for the three things that would
 *     silently break it (`Date.now`, `Math.random`, `crypto.randomUUID`).
 *
 *  2. **Honesty.** The bug that started this work was a card that appeared to
 *     resolve and did nothing. The tests under "The manual path" walk that case
 *     end to end through the real reducer: unimplemented text is detected,
 *     marked on the card, said out loud in the log, dismissable in one action,
 *     and — because the dismissal is an ordinary logged action — survives a
 *     replay.
 *
 * These are deliberately written as *negative* assertions where possible, in
 * the same spirit as `tagger.test.ts`: they are here to fail when a future
 * change quietly removes a guarantee, not to confirm today's behaviour.
 *
 * ## Adding modules to this folder
 *
 * `every module in this folder is re-exported from index.ts` is a real test.
 * The layer system, stack, replacement effects, state-based actions and trigger
 * collector each arrive as new files; a file that typechecks but is not wired
 * into the barrel is invisible to every consumer, which is the integration
 * failure mode most likely to go unnoticed. That test picks up new files by
 * itself — no list to maintain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import { automationFor } from './effects.ts';
import { manualControlsFor, markManualResolved } from './manual.ts';
import { buildTable, type PlayCard, type PlayDeck } from './setup.ts';
import type { GameAction, GameState, PlayerId } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Deep-freeze, so any in-place mutation by the reducer throws in strict mode. */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      freeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function snapshot(state: GameState): string {
  return JSON.stringify(state);
}

function twoPlayerGame(): GameState {
  return createGame({
    mode: 'full',
    format: 'commander',
    seed: 7,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
}

interface CardSpec {
  id: string;
  name: string;
  oracleText?: string;
  typeLine?: string;
  owner?: PlayerId;
  zone?: 'hand' | 'battlefield' | 'library' | 'graveyard';
}

function withCards(state: GameState, specs: CardSpec[]): GameState {
  let next = state;
  for (const spec of specs) {
    next = addCard(
      next,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Test',
        oracleText: spec.oracleText ?? '',
        power: '2',
        toughness: '2',
      },
      spec.zone ?? 'hand'
    );
  }
  return next;
}

function logText(state: GameState): string {
  return state.log.map(event => event.message).join('\n');
}

/** A small but non-trivial deck, so `buildTable` has something to shuffle. */
function deck(name: string, size = 20): PlayDeck {
  const cards: PlayCard[] = Array.from({ length: size }, (_, i) => ({
    cardId: `${name}-${i}`,
    name: i % 3 === 0 ? 'Forest' : `${name} Creature ${i}`,
    typeLine: i % 3 === 0 ? 'Basic Land — Forest' : 'Creature — Test',
    manaCost: i % 3 === 0 ? undefined : '{1}{G}',
    cmc: i % 3 === 0 ? 0 : 2,
    power: i % 3 === 0 ? undefined : '2',
    toughness: i % 3 === 0 ? undefined : '2',
    oracleText: i % 3 === 0 ? '' : 'When this creature enters, you gain 1 life.',
  }));

  return {
    id: `deck-${name}`,
    name,
    format: 'commander',
    cards,
    commanders: [
      {
        cardId: `${name}-cmd`,
        name: `${name} Commander`,
        typeLine: 'Legendary Creature — Test',
        manaCost: '{2}{G}',
        cmc: 3,
        power: '3',
        toughness: '3',
        oracleText: '',
      },
    ],
    source: 'seeded',
  };
}

/* ================================================================== *
 * Determinism — the property that makes thousands of live games possible
 * ================================================================== */

test('applyAction does not mutate the state it is given', () => {
  const state = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Test Bear', oracleText: 'When this creature enters, you gain 3 life.' },
  ]);
  const before = snapshot(state);
  freeze(state);

  // Would throw on any in-place write, because node runs modules in strict mode.
  const next = applyAction(state, { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 });

  assert.notEqual(next, state, 'a legal action must produce a new state object');
  assert.equal(snapshot(state), before, 'the input state must be untouched');
});

test('the same action applied to the same state twice gives the same result', () => {
  const state = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Test Bear', oracleText: 'When this creature enters, you gain 3 life.' },
  ]);
  const action: GameAction = { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 };

  assert.equal(snapshot(applyAction(state, action)), snapshot(applyAction(state, action)));
});

test('an illegal action returns the identical reference, so callers can detect a rejection', () => {
  const state = twoPlayerGame();
  const next = applyAction(state, { type: 'PLAY', instanceId: 'does-not-exist', at: 0 });
  assert.equal(next, state);
});

test('replaying the whole action log reaches byte-identical state', () => {
  // This is the networked-play guarantee stated as a test: a client that
  // receives only actions, and replays them from the same starting state,
  // must land exactly where the originating client landed.
  const start = withCards(twoPlayerGame(), [
    { id: 'a1', name: 'Gainer', oracleText: 'When this creature enters, you gain 3 life.' },
    { id: 'a2', name: 'Drawer', oracleText: 'When this creature enters, draw a card.' },
    { id: 'a3', name: 'Complex', oracleText: 'When this creature enters, destroy target creature.' },
    { id: 'lib1', name: 'Library Card', zone: 'library' },
    { id: 'lib2', name: 'Library Card Two', zone: 'library' },
    { id: 'b1', name: 'Blocker', owner: 'p2', zone: 'battlefield' },
  ]);

  const script: GameAction[] = [
    { type: 'SHUFFLE', playerId: 'p1', at: 100 },
    { type: 'PLAY', instanceId: 'a1', to: 'battlefield', at: 101 },
    { type: 'PLAY', instanceId: 'a2', to: 'battlefield', at: 102 },
    { type: 'PLAY', instanceId: 'a3', to: 'battlefield', at: 103 },
    { type: 'CARD_COUNTER', instanceId: 'a1', counter: '+1/+1', delta: 2, at: 104 },
    { type: 'DAMAGE', targetPlayerId: 'p2', amount: 5, sourcePlayerId: 'p1', at: 105 },
    { type: 'ADVANCE_STEP', at: 106 },
    { type: 'ADVANCE_STEP', at: 107 },
    { type: 'MARK_MANUAL_RESOLVED', instanceId: 'a3', resolved: true, at: 108 },
    { type: 'PASS_TURN', at: 109 },
  ];

  const played = applyActions(start, script);
  const replayed = applyActions(start, script);

  assert.equal(snapshot(replayed), snapshot(played));
  assert.ok(played.version > 0, 'the script must actually have done something');

  // Replay is driven by the *action stream*, not by `GameState.log`.
  //
  // `GameEvent` deliberately carries prose and a type, not the action that
  // produced it: the log is the human-readable record shown in the feed, and
  // duplicating every action into it would double the size of a state that
  // already goes over a wire. The consequence is worth stating out loud, since
  // "a game IS its action log" is easy to over-read — the replayable artefact
  // is the ordered list of `GameAction`s the transport relayed, which a client
  // must retain separately if it wants to reconstruct a game from scratch.
  assert.ok(
    played.log.every(event => !('action' in event)),
    'if GameEvent grows an `action` field, state.log becomes self-sufficient for replay — ' +
      'update the transport and this test together'
  );

  // Triggered follow-ups are logged as their own events, so the record explains
  // the life change rather than leaving it unattributed.
  assert.ok(played.log.length > script.length, 'triggers must appear in the log too');
});

test('the same seed and the same decks deal the identical table on every client', () => {
  const seats = [
    { deck: deck('alpha'), playerName: 'One' },
    { deck: deck('beta'), playerName: 'Two', isBot: true },
  ];

  const a = buildTable({ seats, seed: 42, now: 0 });
  const b = buildTable({ seats, seed: 42, now: 0 });
  const different = buildTable({ seats, seed: 43, now: 0 });

  assert.equal(snapshot(a.state), snapshot(b.state), 'same seed must deal the same game');
  assert.notEqual(
    snapshot(a.state),
    snapshot(different.state),
    'a different seed must deal a different game, or the RNG is not being consulted'
  );
});

test('GameState survives a JSON round trip unchanged', () => {
  // No Date, no Map, no Set, no class instances, no functions — the state has
  // to go down a wire and into a Supabase column and come back the same.
  const table = buildTable({
    seats: [
      { deck: deck('alpha'), playerName: 'One' },
      { deck: deck('beta'), playerName: 'Two' },
    ],
    seed: 11,
    now: 0,
  });

  const played = applyActions(table.state, [
    { type: 'ADVANCE_STEP', at: 1 },
    { type: 'ADVANCE_STEP', at: 2 },
    { type: 'ADVANCE_STEP', at: 3 },
  ]);

  const round = JSON.parse(JSON.stringify(played)) as GameState;

  // Not `deepStrictEqual`: the state carries a handful of explicitly-undefined
  // optional properties (`manualResolved`, `powerOverride`, …) which JSON drops
  // and which `deepStrictEqual` therefore reports as a difference. That is
  // cosmetic — reading a dropped key and reading an undefined one both give
  // `undefined`. The guarantee that actually matters is that the serialised
  // form is stable and that the state still reduces identically afterwards.
  assert.equal(snapshot(round), snapshot(played), 'the wire form must be stable');

  // structuredClone is stricter than JSON: it throws on functions and class
  // instances rather than silently dropping them.
  assert.doesNotThrow(() => structuredClone(played));

  // JSON and structuredClone both survive a Date, a Map or a Set — and all
  // three would break replay. Walk the state and assert none are there.
  const exotic: string[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 12 || value === null || typeof value !== 'object') {
      if (typeof value === 'function') exotic.push(`${path}: function`);
      return;
    }
    if (value instanceof Date) return void exotic.push(`${path}: Date`);
    if (value instanceof Map) return void exotic.push(`${path}: Map`);
    if (value instanceof Set) return void exotic.push(`${path}: Set`);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
      return void exotic.push(`${path}: ${value.constructor?.name ?? 'class instance'}`);
    }
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, depth + 1);
  };
  walk(played, 'state', 0);
  assert.deepEqual(exotic, [], 'state must be plain JSON — no Date, Map, Set or class instances');

  // And a state that has been through the wire still reduces identically.
  assert.equal(
    snapshot(applyAction(round, { type: 'ADVANCE_STEP', at: 4 })),
    snapshot(applyAction(played, { type: 'ADVANCE_STEP', at: 4 }))
  );
});

test('no module in the game core reads a clock or unseeded randomness', () => {
  // A source-level negative assertion, because this is the failure that does
  // not show up as a failing test — it shows up as two clients disagreeing in
  // production. `transport.ts` is the documented exception: it stamps a wire
  // envelope, not game state, and the stamp travels with the action so every
  // peer sees the same value.
  const EXEMPT = new Set(['transport.ts']);
  const banned = [/\bDate\.now\s*\(/, /\bMath\.random\s*\(/, /\bcrypto\.randomUUID\s*\(/, /\bnew Date\s*\(/, /\bperformance\.now\s*\(/];

  const offenders: string[] = [];
  for (const file of readdirSync(HERE)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || EXEMPT.has(file)) continue;
    const source = readFileSync(join(HERE, file), 'utf8');
    // Strip comments — every one of these names is discussed in prose here.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const pattern of banned) {
      if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
  }

  assert.deepEqual(offenders, [], 'the reducer must stay pure — timestamps arrive on action.at');
});

test('every module in this folder is re-exported from index.ts', () => {
  // The integration failure that typechecks and builds and is still broken: a
  // new module (layers, stack, replacement, sba, triggers) lands beside the
  // reducer but never reaches a consumer, because nothing exports it.
  const index = readFileSync(join(HERE, 'index.ts'), 'utf8');
  const missing = readdirSync(HERE)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'index.ts')
    .filter(file => !index.includes(`./${file}`));

  assert.deepEqual(missing, [], 'add these to src/lib/game/index.ts');
});

/* ================================================================== *
 * The manual path — the difference between a usable engine and a liar
 * ================================================================== */

test('a card whose text the engine does not implement is marked, not silently ignored', () => {
  const state = withCards(twoPlayerGame(), [
    {
      id: 'c1',
      name: 'Complicated Thing',
      oracleText: 'When this creature enters, destroy target creature an opponent controls.',
    },
  ]);

  const next = applyAction(state, { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 });
  const automation = automationFor(next.cards.c1);

  assert.equal(automation.needsManual, true, 'the card must carry a manual marker');
  assert.ok(automation.manualNotes.length > 0, 'and say what is unresolved');
  assert.ok(automation.summary.length > 0, 'and always have a line for a badge');
  assert.match(logText(next), /resolve/i, 'and the log must say it out loud');
});

test('an instant that resolves to the graveyard never looks like it did something', () => {
  // The owner's original complaint, generalised: the loudest silent no-op is a
  // spell that "resolved" and changed nothing.
  const state = withCards(twoPlayerGame(), [
    {
      id: 's1',
      name: 'Some Instant',
      typeLine: 'Instant',
      oracleText: 'Target creature gets +3/+3 until end of turn.',
    },
  ]);

  const next = applyAction(state, { type: 'PLAY', instanceId: 's1', to: 'graveyard', at: 0 });

  assert.equal(next.cards.s1.zone, 'graveyard');
  assert.match(logText(next), /Some Instant/);
  assert.match(logText(next), /by hand|resolve/i);
});

test('a spell with no oracle text at all still admits it resolved nothing', () => {
  const state = withCards(twoPlayerGame(), [
    { id: 's1', name: 'Unknown Card', typeLine: 'Sorcery', oracleText: '' },
  ]);
  const next = applyAction(state, { type: 'PLAY', instanceId: 's1', to: 'graveyard', at: 0 });
  assert.match(logText(next), /resolve it by hand|resolve by hand/i);
});

test('marking a card resolved by hand clears the marker and stops the nagging', () => {
  const state = withCards(twoPlayerGame(), [
    {
      id: 'c1',
      name: 'Complicated Thing',
      oracleText: 'At the beginning of your upkeep, choose one — draw a card; or destroy target artifact.',
    },
  ]);

  const played = applyAction(state, { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 });
  assert.equal(automationFor(played.cards.c1).needsManual, true);

  const [dismiss] = markManualResolved('c1', true, 1);
  const dismissed = applyAction(played, dismiss);

  assert.equal(dismissed.cards.c1.manualResolved, true);
  assert.equal(automationFor(dismissed.cards.c1).needsManual, false, 'the marker must clear');

  // And it is restorable, because "I resolved this" is a claim a player can retract.
  const restored = applyAction(dismissed, markManualResolved('c1', false, 2)[0]);
  assert.equal(automationFor(restored.cards.c1).needsManual, true);
});

test('the manual marker is an ordinary logged action, so a replay reproduces it', () => {
  const start = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Complicated Thing', oracleText: 'When this creature enters, exile target permanent.' },
  ]);

  const script: GameAction[] = [
    { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 },
    { type: 'MARK_MANUAL_RESOLVED', instanceId: 'c1', resolved: true, at: 1 },
  ];

  const played = applyActions(start, script);
  assert.equal(played.cards.c1.manualResolved, true);
  assert.equal(snapshot(applyActions(start, script)), snapshot(played));
});

test('the manual menu always offers the marker, whatever the card is', () => {
  const state = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Vanilla Bear', oracleText: '', zone: 'battlefield' },
    { id: 'c2', name: 'Land', typeLine: 'Basic Land — Forest', zone: 'battlefield' },
  ]);

  for (const id of ['c1', 'c2']) {
    const controls = manualControlsFor(state, state.cards[id], 0);
    const marker = controls.find(control => control.group === 'marker');
    assert.ok(marker, `${id} must offer the manual marker`);
    assert.ok(marker!.actions.length > 0, 'and it must be bound to an action');

    // Every control is dispatchable and every control is honest about whether
    // the engine backs it.
    for (const control of controls) {
      assert.ok(control.actions.length > 0, `${control.id} must produce actions`);
      if (control.group === 'keywords') {
        assert.ok(
          control.support === 'engine' || control.support === 'advisory',
          `${control.id} must declare whether the engine enforces it`
        );
      }
    }
  }
});

test('a keyword the engine does not enforce is never reported as enforced', () => {
  const state = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Warded Thing', oracleText: 'Ward {2}', zone: 'battlefield' },
  ]);
  const controls = manualControlsFor(state, state.cards.c1, 0);

  const ward = controls.find(control => control.id === 'kw:ward');
  const flying = controls.find(control => control.id === 'kw:flying');

  assert.equal(ward?.support, 'advisory', 'ward is a badge, and must say so');
  assert.equal(flying?.support, 'engine', 'flying changes what combat does');
});

test('an automated trigger and a manual note can coexist on the same card', () => {
  // The half-resolved case, which is the dangerous one: the player sees the
  // life total move and assumes the whole ability happened.
  const state = withCards(twoPlayerGame(), [
    {
      id: 'c1',
      name: 'Half Automatic',
      oracleText:
        'When this creature enters, you gain 2 life.\nWhenever this creature attacks, target opponent discards a card.',
    },
  ]);

  const before = state.players[0].life;
  const next = applyAction(state, { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 });

  assert.equal(next.players[0].life, before + 2, 'the automatable half must fire');
  assert.equal(
    automationFor(next.cards.c1).needsManual,
    true,
    'and the other half must still be marked'
  );
  assert.equal(automationFor(next.cards.c1).level, 'partial');
});

test('the trigger chain is capped, so a replay can never hang a client', () => {
  // Real Magic allows an infinite loop and calls it a draw. A shared reducer
  // that hangs is a denial of service on every client at the table.
  const state = withCards(twoPlayerGame(), [
    { id: 'c1', name: 'Token Maker', oracleText: 'When this creature enters, create a 1/1 white Soldier creature token.' },
  ]);

  const next = applyAction(state, { type: 'PLAY', instanceId: 'c1', to: 'battlefield', at: 0 });
  assert.ok(next.version > 0);
  assert.ok(Object.keys(next.cards).length < 100, 'the chain must not run away');
});
