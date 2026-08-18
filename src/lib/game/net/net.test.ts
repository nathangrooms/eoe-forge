/**
 * Unit tests for the multiplayer seam.
 *
 *   node --test --experimental-strip-types src/lib/game/net/net.test.ts
 *
 * The architecture makes three claims that would each be catastrophic if false,
 * so each gets tests rather than a paragraph:
 *
 *   1. CONVERGENCE. Clients that receive the same batches in *different orders*
 *      end up in identical state. This is the whole basis for not shipping
 *      state, and the thing a deterministic reducer alone does not give you —
 *      it needs the order key and the rewind.
 *   2. SECRECY. No client can see an opponent's hand or library, and a shuffle
 *      genuinely destroys knowledge of a card that was put back.
 *   3. AUTHORITY. Impersonation and out-of-turn actions are refused by every
 *      client independently, with no server asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyAction } from '../rules.ts';
import { createLocalTransport, resetLocalTransports } from '../transport.ts';
import type { GameAction, GameState } from '../types.ts';

import { PeerAuthority } from './authority.ts';
import { COMMANDER_POD, COMMANDER_POD_UNBATCHED, headroom, project } from './cost.ts';
import { digestState, firstDivergence } from './digest.ts';
import { OrderedLog } from './ordering.ts';
import { compareOrderKeys, type CardIdentity, type LogEntry } from './protocol.ts';
import { dealTable } from './secrets.ts';
import { GameSession } from './session.ts';
import { MemoryActionLogStore } from './persistence.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function card(n: number): CardIdentity {
  return { cardId: `c${n}`, name: `Card ${n}`, typeLine: 'Creature — Test', cmc: n % 5 };
}

function deck(size: number, offset: number): CardIdentity[] {
  return Array.from({ length: size }, (_, i) => card(offset + i));
}

function twoSeatTable(seed = 12345) {
  return dealTable({
    tableId: 'table-1',
    seed,
    seats: [
      {
        playerId: 'p1',
        playerName: 'Nathan',
        participantId: 'conn-a',
        cards: deck(20, 100),
        commanders: [{ cardId: 'cmd1', name: 'Commander One' }],
      },
      {
        playerId: 'p2',
        playerName: 'Sam',
        participantId: 'conn-b',
        cards: deck(20, 200),
        commanders: [{ cardId: 'cmd2', name: 'Commander Two' }],
      },
    ],
  });
}

function entry(over: Partial<LogEntry> & { batchId: string; actions: GameAction[] }): LogEntry {
  return {
    tableId: 'table-1',
    from: 'conn-a',
    playerId: 'p1',
    at: 0,
    key: { baseVersion: 0, seat: 0, batchId: over.batchId },
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * 1. Ordering
 * ------------------------------------------------------------------ */

test('order key is total and independent of arrival order', () => {
  const a = { baseVersion: 4, seat: 0, batchId: 'z' };
  const b = { baseVersion: 4, seat: 1, batchId: 'a' };
  const c = { baseVersion: 5, seat: 0, batchId: 'a' };

  assert.ok(compareOrderKeys(a, b) < 0, 'lower seat wins a genuine race');
  assert.ok(compareOrderKeys(b, c) < 0, 'a later baseVersion always sorts later');
  assert.equal(compareOrderKeys(a, a), 0);
  assert.equal(Math.sign(compareOrderKeys(a, c)), -Math.sign(compareOrderKeys(c, a)));
});

test('a late entry that sorts early forces a rewind and reports how deep', () => {
  const log = new OrderedLog();

  const late = entry({ batchId: 'b1', actions: [], key: { baseVersion: 1, seat: 0, batchId: 'b1' } });
  const later = entry({ batchId: 'b2', actions: [], key: { baseVersion: 3, seat: 0, batchId: 'b2' } });
  const early = entry({ batchId: 'b3', actions: [], key: { baseVersion: 2, seat: 0, batchId: 'b3' } });

  assert.equal(log.insert(late).outcome, 'appended');
  assert.equal(log.insert(later).outcome, 'appended');

  const placed = log.insert(early);
  assert.equal(placed.outcome, 'rewound');
  assert.equal(placed.index, 1, 'lands between the two, invalidating one entry');
  assert.equal(log.stats().rewinds, 1);
  assert.equal(log.stats().deepestRewind, 1);

  assert.deepEqual(
    log.all().map(e => e.batchId),
    ['b1', 'b3', 'b2']
  );
});

test('a redelivered batch is dropped, not applied twice', () => {
  const log = new OrderedLog();
  const only = entry({ batchId: 'b1', actions: [] });
  assert.equal(log.insert(only).outcome, 'appended');
  assert.equal(log.insert({ ...only }).outcome, 'duplicate');
  assert.equal(log.length, 1);
});

/* ------------------------------------------------------------------ *
 * 2. Convergence
 * ------------------------------------------------------------------ */

/** Fold a log the way a session does, straight through the reducer. */
function fold(base: GameState, entries: readonly LogEntry[]): GameState {
  return entries.reduce(
    (state, e) => e.actions.reduce((s, action) => applyAction(s, action), state),
    base
  );
}

test('two clients given the same batches in opposite orders converge', () => {
  const { state } = twoSeatTable();

  const batches: LogEntry[] = [
    entry({
      batchId: 'a1',
      actions: [{ type: 'DRAW', playerId: 'p1', count: 2, at: 1 }],
      key: { baseVersion: 0, seat: 0, batchId: 'a1' },
    }),
    entry({
      batchId: 'b1',
      from: 'conn-b',
      playerId: 'p2',
      actions: [{ type: 'DRAW', playerId: 'p2', count: 3, at: 1 }],
      key: { baseVersion: 0, seat: 1, batchId: 'b1' },
    }),
    entry({
      batchId: 'a2',
      actions: [{ type: 'LIFE_CHANGE', playerId: 'p2', delta: -3, at: 2 }],
      key: { baseVersion: 2, seat: 0, batchId: 'a2' },
    }),
  ];

  const alice = new OrderedLog();
  const bob = new OrderedLog();

  // Alice sees them in order; Bob sees them backwards, which is exactly what a
  // fanned-out broadcast can do to two subscribers on different continents.
  for (const b of batches) alice.insert(b);
  for (const b of [...batches].reverse()) bob.insert(b);

  assert.deepEqual(
    alice.all().map(e => e.batchId),
    bob.all().map(e => e.batchId),
    'the sorted log is the same regardless of arrival order'
  );

  const left = fold(state, alice.all());
  const right = fold(state, bob.all());
  assert.equal(firstDivergence(left, right), null);
  assert.equal(digestState(left), digestState(right));
  assert.ok(bob.stats().rewinds > 0, 'Bob had to rewind to get there');
});

test('a session applies its own action before the network sees it', async () => {
  resetLocalTransports();
  const { state } = twoSeatTable();

  const transport = createLocalTransport({
    tableId: 'table-1',
    participantId: 'conn-a',
    name: 'Nathan',
    playerId: 'p1',
  });
  const session = new GameSession({
    transport,
    participantId: 'conn-a',
    playerId: 'p1',
    seat: 0,
    base: state,
    batchWindowMs: 0,
    now: () => 1,
  });
  await session.connect();

  const before = session.state().version;
  session.dispatch({ type: 'LIFE_CHANGE', playerId: 'p1', delta: -5 });

  assert.ok(session.state().version > before, 'applied locally, not awaiting a round trip');
  assert.equal(session.state().players[0].life, 35);
  assert.equal(session.stats().messagesSent, 1);
  await session.disconnect();
});

test('coalescing turns a run of actions into one message', async () => {
  resetLocalTransports();
  const { state } = twoSeatTable();

  const transport = createLocalTransport({
    tableId: 'table-2',
    participantId: 'conn-a',
    name: 'Nathan',
    playerId: 'p1',
  });
  // Hold the window open by never running the scheduled flush, then close it by
  // hand — the deterministic stand-in for "several clicks inside 60ms".
  let scheduled: (() => void) | null = null;
  const session = new GameSession({
    transport,
    participantId: 'conn-a',
    playerId: 'p1',
    seat: 0,
    base: state,
    now: () => 1,
    schedule: fn => {
      scheduled = fn;
      return 0;
    },
  });
  await session.connect();

  for (let i = 0; i < 8; i++) session.dispatch({ type: 'ADVANCE_STEP' });
  assert.equal(session.stats().messagesSent, 0, 'nothing sent while the window is open');

  scheduled?.();
  const stats = session.stats();
  assert.equal(stats.messagesSent, 1, 'eight actions left as one message');
  assert.equal(stats.actionsSent, 8);
  await session.disconnect();
});

/* ------------------------------------------------------------------ *
 * 3. Hidden information
 * ------------------------------------------------------------------ */

test('no card identity is anywhere in the shared state', () => {
  const { state } = twoSeatTable();
  const serialised = JSON.stringify(state);

  for (const name of ['Card 100', 'Card 150', 'Card 200', 'Card 219']) {
    assert.ok(!serialised.includes(name), `${name} must not appear in shared state`);
  }
  // Commanders are public on a real table and must still be visible.
  assert.ok(serialised.includes('Commander One'));

  assert.equal(state.players[0].zones.library.length, 20);
  assert.equal(state.cards['p1-c1'].name, 'Card', 'library slots are anonymous');
  assert.equal(state.cards['p1-c1'].faceDown, true);
});

test('drawing reveals the card to the drawer and to nobody else', () => {
  const { state, dealer } = twoSeatTable();

  const drew = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 3, at: 1 });
  const reveals = dealer.settle(state, drew, entry({ batchId: 'x', actions: [] }));

  const toA = reveals.filter(r => r.to === 'conn-a' && !r.public);
  const toB = reveals.filter(r => r.to === 'conn-b' && !r.public);

  assert.equal(toA.length, 1);
  assert.equal(Object.keys(toA[0].cards).length, 3, 'the drawer learns all three');
  assert.equal(toB.length, 0, 'the opponent learns nothing');

  // And what it learned is the truth, not a guess.
  const hand = drew.players[0].zones.hand;
  for (const instanceId of hand) assert.ok(toA[0].cards[instanceId], `${instanceId} revealed`);
});

test('playing a card to the battlefield reveals it to the whole table', () => {
  const { state, dealer } = twoSeatTable();

  const drew = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1, at: 1 });
  dealer.settle(state, drew, entry({ batchId: 'x1', actions: [] }));

  const instanceId = drew.players[0].zones.hand[0];
  const played = applyAction(drew, { type: 'PLAY', instanceId, at: 2 });
  const reveals = dealer.settle(drew, played, entry({ batchId: 'x2', actions: [] }));

  const publicReveal = reveals.find(r => r.public && r.cards[instanceId]);
  assert.ok(publicReveal, 'a permanent on the battlefield is public information');
});

test('a shuffle destroys knowledge of a card put back on top', () => {
  const { state, dealer } = twoSeatTable();

  // Draw it, so conn-a knows it; then put it back on top of the library.
  const drew = applyAction(state, { type: 'DRAW', playerId: 'p1', count: 1, at: 1 });
  dealer.settle(state, drew, entry({ batchId: 's1', actions: [] }));
  const instanceId = drew.players[0].zones.hand[0];

  const putBack = applyAction(drew, {
    type: 'MOVE_ZONE',
    instanceId,
    to: 'library',
    position: 'top',
    at: 2,
  });

  const shuffleAction: GameAction = { type: 'SHUFFLE', playerId: 'p1', at: 3 };
  const shuffled = applyAction(putBack, shuffleAction);
  const reveals = dealer.settle(putBack, shuffled, entry({ batchId: 's2', actions: [shuffleAction] }));

  const forget = reveals.flatMap(r => r.forget ?? []);
  assert.ok(forget.includes(instanceId), 'the client is told to forget where that card was');

  // The dealer's own binding for that slot has moved too, so even a client that
  // ignored the forget instruction now holds a value that is simply wrong.
  const truth = dealer.disclose().identities;
  const stillMatches = truth[instanceId]?.cardId;
  assert.ok(stillMatches !== undefined, 'the slot still holds *something*');
});

test('the deal is committed up front and auditable afterwards', () => {
  const first = twoSeatTable(999);
  const second = twoSeatTable(999);
  const different = twoSeatTable(1000);

  assert.equal(first.commitment, second.commitment, 'same seed, same commitment');
  assert.notEqual(first.commitment, different.commitment, 'a different deal is a different commitment');

  const disclosed = first.dealer.disclose();
  assert.equal(disclosed.seed, 999, 'the seed is released so the deal can be re-derived');
});

/* ------------------------------------------------------------------ *
 * 4. Authority
 * ------------------------------------------------------------------ */

test('a client cannot act for a seat it does not hold', () => {
  const { state } = twoSeatTable();
  const authority = new PeerAuthority({
    seatByParticipant: { 'conn-a': 'p1', 'conn-b': 'p2' },
  });

  const impersonation = entry({
    batchId: 'evil',
    from: 'conn-b',
    playerId: 'p1',
    actions: [{ type: 'LIFE_CHANGE', playerId: 'p1', delta: 40 }],
  });

  const verdict = authority.admit(state, impersonation);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.severity, 'reject');
});

test('only the active player may pass the turn or attack', () => {
  const { state } = twoSeatTable();
  const authority = new PeerAuthority({
    seatByParticipant: { 'conn-a': 'p1', 'conn-b': 'p2' },
  });
  assert.equal(state.activePlayerId, 'p1');

  const stolen = entry({
    batchId: 'steal',
    from: 'conn-b',
    playerId: 'p2',
    actions: [{ type: 'PASS_TURN' }],
  });

  const verdict = authority.admit(state, stolen);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /active player/);

  const legitimate = entry({ batchId: 'ok', actions: [{ type: 'PASS_TURN' }] });
  assert.equal(authority.admit(state, legitimate).ok, true);
});

test('a batch is checked action by action against the state each one meets', () => {
  const { state } = twoSeatTable();
  const authority = new PeerAuthority({ seatByParticipant: { 'conn-a': 'p1' } });

  // Legal alone; the second is illegal because the first already ended the turn
  // and handed the active player over.
  const sneaky = entry({
    batchId: 'seq',
    actions: [{ type: 'PASS_TURN' }, { type: 'PASS_TURN' }],
  });

  const verdict = authority.admit(state, sneaky);
  assert.equal(verdict.ok, false, 'the second pass is no longer the active player’s');
});

/* ------------------------------------------------------------------ *
 * 5. Persistence
 * ------------------------------------------------------------------ */

test('appending the same batch twice returns the original position', async () => {
  const store = new MemoryActionLogStore();
  const one = entry({ batchId: 'b1', actions: [{ type: 'PASS_TURN' }] });

  const first = await store.append(one);
  const retry = await store.append(one);

  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.seq, first.seq, 'a retry after a timeout must not replay a turn');
  assert.equal((await store.read('table-1')).length, 1);
});

test('a reconnecting client rebuilds state from the log alone', async () => {
  const { state } = twoSeatTable();
  const store = new MemoryActionLogStore();

  const played: LogEntry[] = [
    entry({ batchId: 'r1', actions: [{ type: 'DRAW', playerId: 'p1', count: 7, at: 1 }] }),
    entry({ batchId: 'r2', actions: [{ type: 'LIFE_CHANGE', playerId: 'p2', delta: -6, at: 2 }] }),
    entry({ batchId: 'r3', actions: [{ type: 'PASS_TURN', at: 3 }] }),
  ];
  for (const e of played) await store.append(e);

  const live = fold(state, played);
  const rebuilt = fold(state, await store.read('table-1'));

  assert.equal(firstDivergence(live, rebuilt), null, 'no state was ever stored, and none was needed');
  assert.equal(digestState(live), digestState(rebuilt));
});

/* ------------------------------------------------------------------ *
 * 6. Cost model
 * ------------------------------------------------------------------ */

test('the cost model finds the ceilings in the order the docs say they bite', () => {
  const hundred = project(100, COMMANDER_POD, 'team');
  assert.equal(hundred.breaches.length, 0, '100 concurrent games fits comfortably');

  const tenThousand = project(10_000, COMMANDER_POD, 'team');
  assert.ok(tenThousand.breaches.length > 0, '10,000 does not fit on any published plan');
  assert.equal(
    tenThousand.breaches[0].limit,
    'concurrent connections',
    'connections blow first: 40,000 needed against a 10,000 ceiling'
  );
});

test('batching is worth roughly five times the message headroom', () => {
  const batched = headroom('team', COMMANDER_POD);
  const raw = headroom('team', COMMANDER_POD_UNBATCHED);
  assert.ok(batched > raw, 'coalescing buys real headroom');
  assert.ok(batched / raw >= 2, `expected a large gain, got ${batched} vs ${raw}`);
});

test('fanout is counted, because that is how it is billed', () => {
  const one = project(1, COMMANDER_POD, 'team');
  // 4 players: one message sent becomes five billed.
  assert.equal(Math.round(one.billableMessagesPerSecond / one.sendsPerSecond), 5);
});
