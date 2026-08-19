/**
 * DeckMatrix playtest harness — proof that the harness itself works.
 *
 *   node --experimental-strip-types scripts/playtest/selftest.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The harness's most important property is that it always stops, and says why.
 * Ten clean games prove the happy path and prove NOTHING about the stall
 * detectors, because none of them fired. A safety net nobody has ever fallen
 * into is not a safety net — that is the exact mistake this project keeps
 * paying for, where 1,367 green tests sat over ten actions no code path built.
 *
 * So every detector is made to fire here, deliberately, and the run is a
 * failure if any of them does not. The fake bots below are the only fake bots
 * in the harness; every reported game uses the real `nextBotMove`.
 *
 * Deterministic, offline, and about two seconds.
 */

import assert from 'node:assert/strict';
import type { BotMove } from '../../src/lib/game/bot.ts';
import type { GameAction, GameState, PlayerId } from '../../src/lib/game/types.ts';
import { loadPool } from './pool.ts';
import { runGame, replayGame, type EndKind, type RunGameOptions } from './runner.ts';
import { buildDeck } from './deck.ts';
import { diffState, fingerprint, movedOnly } from './fingerprint.ts';
import { makeRng } from './rng.ts';

const pool = await loadPool();
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

async function check(name: string, run: () => Promise<string>): Promise<void> {
  try {
    const detail = await run();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name} — ${detail}`);
  }
}

const seed = 4242;

/* -------------------------------------------------------------------------- */
/* 1. The detectors                                                           */
/* -------------------------------------------------------------------------- */

console.log('Stall detectors — each one is made to fire on purpose:');

/** A bot whose every action the reducer will refuse. Nothing ever changes. */
const frozenBot = (): BotMove => ({
  actions: [{ type: 'DRAW', playerId: 'nobody-at-this-table' as PlayerId, count: 1 }],
  note: 'Proposes an action for a player who is not here.',
});

/** A bot that gains a life and then loses it, forever. State changes; nothing progresses. */
const cyclingBot = (state: GameState, _seat: PlayerId, options: { at: number }): BotMove => {
  const delta = options.at % 2 === 0 ? 1 : -1;
  return {
    actions: [{ type: 'LIFE_CHANGE', playerId: state.activePlayerId, delta }],
    note: `Life ${delta > 0 ? 'up' : 'down'} one, forever.`,
  };
};

async function expectEnd(
  name: string,
  expected: EndKind,
  options: Omit<RunGameOptions, 'seed'>
): Promise<string> {
  const record = await runGame({ pool, seed, ...options });
  assert.equal(
    record.end,
    expected,
    `${name}: expected ${expected}, got ${record.end}${record.stall ? ` (${record.stall.why})` : ''}`
  );
  assert.equal(record.ended, false, `${name}: a stall must never be reported as a clean finish`);
  assert.ok(record.stall, `${name}: a stall must carry a report`);
  assert.ok(record.stall.why.length > 20, `${name}: the report must say why in prose`);
  assert.ok(record.stall.state, `${name}: the report must carry the full state`);
  return record.stall.why.split('.')[0];
}

await check('no-progress fires on a bot whose batch changes nothing', () =>
  expectEnd('no-progress', 'no-progress', { decide: frozenBot })
);

await check('state-loop fires on a cycle that keeps returning to the same state', () =>
  expectEnd('state-loop', 'state-loop', { decide: cyclingBot })
);

await check('no-legal-move fires when every seat returns null', () =>
  expectEnd('no-legal-move', 'no-legal-move', { decide: () => null })
);

await check('engine-error fires when the move source throws', () =>
  expectEnd('engine-error', 'engine-error', {
    decide: () => {
      throw new Error('deliberate: the bot threw');
    },
  })
);

await check('engine-error fires when the reducer throws', () =>
  expectEnd('engine-error', 'engine-error', {
    apply: () => {
      throw new Error('deliberate: the reducer threw');
    },
  })
);

await check('turn-cap fires on a real game with a two turn budget', () =>
  expectEnd('turn-cap', 'turn-cap', { limits: { maxTurns: 2 } })
);

await check('step-stuck fires when one step outruns its budget', () =>
  expectEnd('step-stuck', 'step-stuck', { limits: { maxActionsPerStep: 2 } })
);

await check('action-cap fires when one turn outruns its budget', () =>
  expectEnd('action-cap', 'action-cap', {
    limits: { maxActionsPerTurn: 4, maxActionsPerStep: 100000 },
  })
);

await check('time-cap fires as the last-resort backstop', () =>
  expectEnd('time-cap', 'time-cap', { limits: { maxMillis: 0 } })
);

await check('a stall records what each seat wanted to do', async () => {
  const record = await runGame({ pool, seed, decide: frozenBot });
  const intent = record.stall?.botIntent ?? [];
  assert.ok(intent.length >= 2, 'every living seat must be asked');
  assert.ok(
    intent.some(entry => entry.actionTypes.includes('DRAW')),
    'the intent must name the actions the bot wanted to take'
  );
  return `${intent.length} seats, first wanted "${intent[0].note}"`;
});

/* -------------------------------------------------------------------------- */
/* 2. Determinism                                                             */
/* -------------------------------------------------------------------------- */

console.log('');
console.log('Determinism — the same seed is the same game:');

await check('the same seed produces a byte-identical game', async () => {
  const a = await runGame({ pool, seed: 11 });
  const b = await runGame({ pool, seed: 11 });
  assert.equal(a.finalHash, b.finalHash, 'final state differed');
  assert.equal(a.actions.length, b.actions.length, 'action count differed');
  assert.deepEqual(a.deckHashes, b.deckHashes, 'decks differed');
  for (let i = 0; i < a.actions.length; i++) {
    assert.equal(a.actions[i].hash, b.actions[i].hash, `state diverged at action ${i}`);
  }
  return `${a.actions.length} actions, every hash matched`;
});

await check('a different seed produces a different game', async () => {
  const a = await runGame({ pool, seed: 11 });
  const b = await runGame({ pool, seed: 12 });
  assert.notEqual(a.finalHash, b.finalHash, 'two seeds produced the same final state');
  assert.notDeepEqual(a.deckHashes, b.deckHashes, 'two seeds produced the same decks');
  return `seed 11 ${a.deckHashes[0]}, seed 12 ${b.deckHashes[0]}`;
});

await check('a recorded game replays from its log and every hash matches', async () => {
  const record = await runGame({ pool, seed: 13 });
  const replay = await replayGame(record, pool);
  assert.ok(replay.ok, replay.reason);
  assert.equal(replay.checked, record.actions.length);
  return `${replay.checked} actions replayed`;
});

await check('one seat\'s deck does not move when another seat is added', async () => {
  const two = await runGame({ pool, seed: 21, players: 2 });
  const three = await runGame({ pool, seed: 21, players: 3 });
  assert.equal(two.deckHashes[0], three.deckHashes[0], 'seat 1 changed when seat 3 arrived');
  assert.equal(two.deckHashes[1], three.deckHashes[1], 'seat 2 changed when seat 3 arrived');
  return `seat 1 ${two.deckHashes[0]} in both`;
});

/* -------------------------------------------------------------------------- */
/* 3. The decks are playable                                                  */
/* -------------------------------------------------------------------------- */

console.log('');
console.log('Decks — random, but not random rubbish:');

await check('a commander deck is 100 cards with a mana base and a commander', async () => {
  const built = await buildDeck({ seed: 31, kind: 'commander', pool });
  assert.equal(built.deck.cards.length, 99, 'not 99 cards');
  assert.equal(built.deck.commanders.length, 1, 'no commander');
  const lands = built.deck.cards.filter(c => (c.typeLine ?? '').includes('Land'));
  assert.ok(lands.length >= 30, `only ${lands.length} lands`);
  const producing = lands.filter(c => (c.colorIdentity ?? []).length > 0);
  assert.ok(
    producing.length >= lands.length * 0.7,
    `${lands.length - producing.length} of ${lands.length} lands tap for no colour`
  );
  const names = new Set(built.deck.cards.map(c => c.name));
  const nonLandNames = new Set(
    built.deck.cards.filter(c => !(c.typeLine ?? '').includes('Land')).map(c => c.name)
  );
  const nonLands = built.deck.cards.filter(c => !(c.typeLine ?? '').includes('Land'));
  assert.equal(nonLandNames.size, nonLands.length, 'singleton was broken');
  return `${names.size} distinct names, ${lands.length} lands, commander ${built.deck.commanders[0].name}`;
});

await check('a 60 card deck is 60 cards and plays multiples', async () => {
  const built = await buildDeck({ seed: 32, kind: 'sixty', pool });
  assert.equal(built.deck.cards.length, 60, 'not 60 cards');
  assert.equal(built.deck.commanders.length, 0, 'a 60 card deck has no commander');
  const counts = new Map<string, number>();
  for (const card of built.deck.cards) counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  const multiples = [...counts.values()].filter(n => n > 1).length;
  assert.ok(multiples > 0, 'no card appeared more than once');
  return `${counts.size} distinct names, ${multiples} of them as multiples`;
});

await check('every deck carries oracle text, which the engine cannot work without', async () => {
  const built = await buildDeck({ seed: 33, kind: 'commander', pool });
  const missing = [...built.deck.cards, ...built.deck.commanders].filter(
    c => typeof c.oracleText !== 'string'
  );
  assert.equal(missing.length, 0, `${missing.length} cards had no oracle text loaded`);
  return 'all 100 cards';
});

await check('the behaviour buckets are actually filled', async () => {
  const wanted = ['equipment', 'counters', 'tokens', 'flier', 'instant'];
  const seen = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    const built = await buildDeck({ seed: 40 + i, kind: 'commander', pool });
    for (const key of wanted) {
      seen.set(key, (seen.get(key) ?? 0) + (built.buckets[key] ?? 0));
    }
  }
  for (const key of wanted) {
    assert.ok((seen.get(key) ?? 0) > 0, `no ${key} in five decks`);
  }
  return wanted.map(key => `${key} ${seen.get(key)}`).join(', ');
});

/* -------------------------------------------------------------------------- */
/* 4. The differ                                                              */
/* -------------------------------------------------------------------------- */

console.log('');
console.log('The differ — what the harness can see from outside the engine:');

await check('the fingerprint ignores the log and the version counter', async () => {
  const record = await runGame({ pool, seed: 51, limits: { maxTurns: 3 } });
  const state = record.stall!.state;
  const noisy = {
    ...state,
    version: state.version + 100,
    updatedAt: state.updatedAt + 9999,
    log: [],
  } as GameState;
  assert.equal(fingerprint(state), fingerprint(noisy), 'noise fields reached the fingerprint');
  return 'log, version and updatedAt excluded';
});

await check('the fingerprint notices a single tapped permanent', async () => {
  const record = await runGame({ pool, seed: 52, limits: { maxTurns: 6 } });
  const state = record.stall!.state;
  const id = Object.keys(state.cards).find(key => state.cards[key].zone === 'battlefield');
  assert.ok(id, 'no permanent on the battlefield to test with');
  const changed = {
    ...state,
    cards: { ...state.cards, [id]: { ...state.cards[id], tapped: !state.cards[id].tapped } },
  } as GameState;
  assert.notEqual(fingerprint(state), fingerprint(changed), 'a tapped permanent went unnoticed');
  const diff = diffState(state, changed);
  assert.equal(diff.changes.length, 1, 'the differ reported the wrong number of changes');
  assert.ok(diff.changes[0].path.endsWith('.tapped'), diff.changes[0].path);
  assert.equal(movedOnly(diff), false, 'a tap is not a zone move');
  return diff.changes[0].path;
});

await check('the differ sees a card that only moved zones', async () => {
  const record = await runGame({ pool, seed: 53, limits: { maxTurns: 6 } });
  const state = record.stall!.state;
  const id = Object.keys(state.cards).find(key => state.cards[key].zone === 'hand');
  assert.ok(id, 'no card in hand to test with');
  const owner = state.cards[id].ownerId;
  const player = state.players.find(p => p.id === owner)!;
  const moved = {
    ...state,
    cards: { ...state.cards, [id]: { ...state.cards[id], zone: 'graveyard' as const } },
    players: state.players.map(p =>
      p.id !== owner
        ? p
        : {
            ...p,
            zones: {
              ...p.zones,
              hand: p.zones.hand.filter(x => x !== id),
              graveyard: [...p.zones.graveyard, id],
            },
          }
    ),
  } as GameState;
  const diff = diffState(state, moved);
  assert.equal(movedOnly(diff), true, 'a pure zone move was not recognised as one');
  assert.equal(diff.zoneMoves.length, 1, 'the move was not reported');
  assert.equal(diff.zoneMoves[0].from, 'hand');
  assert.equal(diff.zoneMoves[0].to, 'graveyard');
  void player;
  return `${diff.zoneMoves[0].name}: hand to graveyard`;
});

await check('the differ sees a card that appeared out of nowhere', async () => {
  const record = await runGame({ pool, seed: 54, limits: { maxTurns: 4 } });
  const state = record.stall!.state;
  const sample = state.cards[Object.keys(state.cards)[0]];
  const spawned = {
    ...state,
    cards: { ...state.cards, 'token-1': { ...sample, instanceId: 'token-1', isToken: true } },
  } as GameState;
  const diff = diffState(state, spawned);
  assert.deepEqual(diff.added, ['token-1'], 'a spawned card went unseen');
  assert.equal(movedOnly(diff), false, 'a spawned card is not a zone move');
  return 'token-1 reported as added';
});

/* -------------------------------------------------------------------------- */
/* 5. The RNG                                                                 */
/* -------------------------------------------------------------------------- */

console.log('');
console.log('The RNG — seeded, and no shared counters:');

await check('two labels off one seed are independent streams', async () => {
  const a = makeRng(9, 'one');
  const b = makeRng(9, 'two');
  const first = [a.next(), a.next(), a.next()];
  const second = [b.next(), b.next(), b.next()];
  assert.notDeepEqual(first, second, 'two labels produced the same stream');
  const again = makeRng(9, 'one');
  assert.deepEqual([again.next(), again.next(), again.next()], first, 'a stream did not repeat');
  return 'independent and repeatable';
});

/* -------------------------------------------------------------------------- */

console.log('');
const failed = results.filter(r => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  for (const failure of failed) console.log(`  FAILED: ${failure.name} — ${failure.detail}`);
  process.exit(1);
}

void (null as unknown as GameAction);
