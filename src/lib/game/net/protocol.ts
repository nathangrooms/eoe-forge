/**
 * DeckMatrix — networked play: the wire protocol.
 *
 * The whole multiplayer design rests on one property of `rules.ts`: it is a
 * pure, seeded reducer. A game therefore *is* its ordered action log. Two
 * clients holding the same log hold the same `GameState`, byte for byte, with
 * nothing diffed and no state shipped. This file is the vocabulary for moving
 * that log between machines.
 *
 * Three ideas, and everything else follows from them.
 *
 * 1. ORDER IS A VALUE, NOT AN ARRIVAL TIME.
 *    A broadcast channel does not promise that two senders' messages reach
 *    every receiver in the same sequence, so "apply in the order it arrived"
 *    forks the game. Instead every entry carries an `OrderKey` and clients sort
 *    by it. The key is derived, total, and identical everywhere, so all clients
 *    agree on the order without anyone being asked.
 *
 * 2. BATCHES, NOT ACTIONS.
 *    The reducer is deliberately fine-grained — a single turn is a dozen
 *    `ADVANCE_STEP`s before anybody does anything interesting. Billing and the
 *    per-project messages/second quota both count *messages*, not actions, so
 *    the wire unit is a batch. This is worth roughly a 5x reduction in messages
 *    and is the difference between 1,000 and 5,000 concurrent games fitting
 *    inside the same quota.
 *
 * 3. STATE IS PUBLIC; KNOWLEDGE IS AN OVERLAY.
 *    `GameState` stays identical on every client — including the contents of
 *    libraries and hands, which are arrays of *anonymous instance ids*. What
 *    differs per client is `Knowledge`: the private map of which instance is
 *    actually which card. Hidden information is therefore not a hole in the
 *    determinism argument; it lives strictly outside `GameState`, so the
 *    convergence check can still compare whole states rather than projections.
 *    See `secrets.ts` for who assigns identity, and when.
 */

import type { GameAction, InstanceId, PlayerId } from '../types.ts';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** A connection. One human reconnecting is a new participant on the same seat. */
export type ParticipantId = string;

/** Position in the durable log. Absent until the log store has accepted the entry. */
export type LogSeq = number;

/* -------------------------------------------------------------------------- */
/* Deterministic total order                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The sort key that gives every client the same log without a coordinator.
 *
 *   `baseVersion` — `GameState.version` the sender had applied when it acted.
 *                   Because `version` increments once per accepted action it is
 *                   a logical clock: a higher value means the sender had already
 *                   seen strictly more of the game, so it sorts later.
 *   `seat`        — breaks a genuine race. Two players who act without having
 *                   seen each other share a `baseVersion`; lower seat wins.
 *                   Arbitrary, but *identically* arbitrary on every client.
 *   `batchId`     — breaks the remaining tie if one seat emits twice at one
 *                   version. Lexicographic on an opaque id, so ordering never
 *                   depends on clock skew between players.
 *
 * Note what is deliberately *not* in here: `at`. Timestamps are stamped by
 * whichever machine sent the message, and trusting them would let a player with
 * a wrong clock reorder the game.
 */
export interface OrderKey {
  baseVersion: number;
  seat: number;
  batchId: string;
}

/** Total order. Never returns 0 for two distinct batches, because `batchId` is unique. */
export function compareOrderKeys(a: OrderKey, b: OrderKey): number {
  if (a.baseVersion !== b.baseVersion) return a.baseVersion - b.baseVersion;
  if (a.seat !== b.seat) return a.seat - b.seat;
  return a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* The log entry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One wire message carrying one or more actions, applied as an indivisible run.
 *
 * A batch is atomic in *ordering* only, not in validity: if the third of five
 * actions is rejected by the reducer the rest still apply, exactly as they
 * would have if sent one at a time. Batching is a transport optimisation and
 * must never change the outcome of a game.
 */
export interface LogEntry {
  tableId: string;
  /** Unique per batch. Also the idempotency key — a redelivered batch is dropped. */
  batchId: string;
  from: ParticipantId;
  /** The seat these actions claim to come from. Verified by `authority.ts`. */
  playerId: PlayerId;
  key: OrderKey;
  /** Epoch ms from the sender. Display and lag metrics only — never ordering. */
  at: number;
  actions: GameAction[];
  /** Assigned by the durable log. Present on replay, absent on the live hot path. */
  seq?: LogSeq;
}

/* -------------------------------------------------------------------------- */
/* Convergence check                                                          */
/* -------------------------------------------------------------------------- */

/**
 * "I have folded N entries and my state hashes to H."
 *
 * Broadcast every `checkpointEvery` entries. Two clients reporting different
 * digests at the same `version` have forked — from a reducer bug, a dropped
 * message, or a tampered client — and the cure is the same in all three cases:
 * refetch the durable log and re-fold it. Costs one small message per N
 * actions, which is why divergence detection is affordable at every table
 * rather than only in ranked play.
 */
export interface Checkpoint {
  tableId: string;
  from: ParticipantId;
  /** Number of log entries folded in. */
  entries: number;
  version: number;
  digest: string;
}

/* -------------------------------------------------------------------------- */
/* Hidden information                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What one card actually is. Sent only to a client entitled to know it, and
 * never over the table channel — see `SecretDealer`.
 *
 * Structural rather than an import of `PlayCard` so the wire shape is stated
 * in exactly one place and can be trimmed without touching `setup.ts`.
 */
export interface CardIdentity {
  cardId: string;
  name: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: string[];
  imageUrl?: string;
  keywords?: string[];
  oracleText?: string;
}

/**
 * Everything this client is entitled to see, keyed by instance id.
 *
 * Deliberately *not* part of `GameState`: it differs per client, and anything
 * that differs per client cannot live inside the thing whose whole job is to be
 * the same everywhere.
 */
export type Knowledge = Record<InstanceId, CardIdentity>;

/** A private message from the dealer: "these instances are these cards". */
export interface Reveal {
  tableId: string;
  /** The only participant this may be delivered to, unless `public` is set. */
  to: ParticipantId;
  /** Ties the reveal to the batch that caused it, so a replay can re-request it. */
  causeBatchId?: string;
  cards: Record<InstanceId, CardIdentity>;
  /**
   * Set when the information is public anyway — a creature entering the
   * battlefield, a card revealed to the table. The dealer sends these to
   * everyone and clients may cache them without leaking anything.
   */
  public?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Resync                                                                     */
/* -------------------------------------------------------------------------- */

/** "I am missing entries; send me the log from here." */
export interface ResyncRequest {
  tableId: string;
  from: ParticipantId;
  /** Entries already held. Asks for everything at or after this index. */
  haveEntries: number;
}

export interface ResyncResponse {
  tableId: string;
  from: ParticipantId;
  fromEntry: number;
  entries: LogEntry[];
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Wire budgets. The payload ceilings are Supabase's (Free 256 KB, Pro and above
 * 3,000 KB); these sit an order of magnitude under both, because a batch that
 * large means a bug and not a busy turn.
 */
export const NET_LIMITS = {
  /** Actions coalesced into one message before it is flushed early. */
  maxActionsPerBatch: 48,
  /** How long the coalescer holds an action hoping for a companion. */
  batchWindowMs: 60,
  /** Soft ceiling on one serialised batch. */
  maxBatchBytes: 64 * 1024,
  /** Entries between convergence checkpoints. */
  checkpointEvery: 25,
  /** Entries retained as rollback anchors. See `session.ts`. */
  anchorEvery: 20,
} as const;
