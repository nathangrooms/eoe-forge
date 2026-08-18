/**
 * DeckMatrix — shared game-state core: the transport seam.
 *
 * `rules.ts` is a pure reducer over a serialisable `GameAction`. That is the
 * whole reason a networked table is cheap: every client starts from the same
 * `GameState`, receives the same actions in the same order, and lands on
 * byte-identical state. Nothing has to be diffed and nothing has to be trusted.
 *
 * This file is the *only* place that talks about moving those actions between
 * participants, and it deliberately does not implement a network. It defines:
 *
 *   - `GameTransport` — join / leave / broadcast / receive, and nothing else;
 *   - `createLocalTransport()` — an in-memory hub, used by solo and bot play.
 *
 * ---------------------------------------------------------------------------
 * Where the rest of it lives
 * ---------------------------------------------------------------------------
 * This file stayed small. Everything a *networked* table needs beyond
 * join/leave/broadcast/receive is in `net/`, which imports this and not the
 * other way round:
 *
 *   - `net/realtime.ts`  the Supabase Realtime implementation of this
 *     interface. The channel is injected, so this folder still imports no
 *     Supabase and the transport can be tested without a socket.
 *   - `net/session.ts`   optimistic local application, coalescing, and the
 *     rewind that keeps clients converged when messages arrive out of order.
 *   - `net/secrets.ts`   hidden information. Worth reading before assuming a
 *     seeded reducer gives it to you for free: it does the opposite, because a
 *     replayable seed reproduces every library on every client.
 *   - `net/persistence.ts` the append-only action log and its RLS.
 *
 * Three things this interface carries so that layering stays honest:
 *
 *   1. `TransportEnvelope.baseVersion` — the `GameState.version` the sender
 *      applied on top of. It is a logical clock, and the first component of
 *      the deterministic order key in `net/protocol.ts`.
 *   2. `TransportEnvelope.seat` — the second component. On the wire rather
 *      than looked up locally, because presence is eventually consistent and
 *      ordering must not depend on what a receiver happens to know yet.
 *   3. `echoToSender` — a real channel echoes your own broadcast back, and the
 *      local hub does too, so there is one code path for applying an action.
 *      `net/session.ts` applies optimistically and drops the echo as a
 *      duplicate by `batchId`.
 *
 * Still deliberately absent from *this file*: persistence. No table is created
 * anywhere in this work; `net/persistence.ts` sketches the schema and the RLS
 * for review without applying a migration.
 */

import type { GameAction, PlayerId } from './types.ts';

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/** Identifies a connection, not a seat. One human may reconnect as a new participant. */
export type ParticipantId = string;

export interface TransportEnvelope {
  tableId: string;
  from: ParticipantId;
  /** Monotonic per sender. A gap means a message was lost. */
  seq: number;
  /** `GameState.version` the sender applied this action on top of. */
  baseVersion: number;
  /** Epoch ms stamped by the sender. The reducer never reads a clock itself. */
  at: number;
  /**
   * The first action. Always present, including on a batch, so a reader written
   * before batching existed still sees a well-formed envelope.
   */
  action: GameAction;
  /**
   * The whole run when this envelope carries a batch. Read it via
   * `envelopeActions()` rather than reaching for it directly.
   *
   * Batching exists because both Supabase's messages/second quota and its
   * billing count *messages*, not actions, and this reducer is deliberately
   * fine-grained — a quiet turn is a dozen `ADVANCE_STEP`s. Coalescing is worth
   * roughly 5x on both, which is the difference between one plan tier and the
   * next. See `net/protocol.ts`.
   */
  actions?: GameAction[];
  /**
   * The sender's seat index.
   *
   * Part of the deterministic order key in `net/protocol.ts`, and carried on
   * the wire rather than looked up locally because presence is eventually
   * consistent: a receiver that has not yet seen the sender join would
   * otherwise compute a different key for the same message and sort the game
   * differently. Ordering must never depend on what a receiver happens to know
   * about who is at the table.
   */
  seat?: number;
  /**
   * Opaque payload for messages that are not actions — reveals, checkpoints,
   * resync. Carried here so one channel serves the whole protocol rather than
   * one channel per concern; channels are a metered resource (100 per
   * connection) and joins are rate-limited per project.
   */
  meta?: { kind: string; body: unknown };
}

/** Every action in an envelope, batch or not. The one correct way to read one. */
export function envelopeActions(envelope: TransportEnvelope): GameAction[] {
  return envelope.actions ?? (envelope.action ? [envelope.action] : []);
}

export interface TransportPresence {
  participantId: ParticipantId;
  name: string;
  /** The seat this participant controls, once seated. */
  playerId?: PlayerId;
  /** True for a seat driven by the bot policy rather than a person. */
  isBot?: boolean;
}

export type TransportStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export interface TransportHandlers {
  /** Fired for every action on the table, including your own — see `echoToSender`. */
  onAction: (envelope: TransportEnvelope) => void;
  onPresence?: (participants: TransportPresence[]) => void;
  onStatus?: (status: TransportStatus, error?: Error) => void;
}

export interface GameTransport {
  /** Which implementation this is. Surfaced in the UI so "local" is never mistaken for "online". */
  readonly kind: 'local' | 'realtime';
  readonly tableId: string;
  readonly participantId: ParticipantId;

  join(handlers: TransportHandlers): Promise<void>;
  leave(): Promise<void>;
  /** Ship one action to the table. Resolves once handed to the channel, not once applied. */
  broadcast(action: GameAction, baseVersion: number, at?: number): Promise<void>;
  /**
   * Ship a run of actions as one message. Optional so an implementation may
   * omit it; `net/session.ts` falls back to `broadcast` when it is absent, at
   * the cost of the message saving.
   */
  broadcastBatch?(actions: GameAction[], baseVersion: number, at?: number): Promise<void>;
  /**
   * Ship a non-action protocol message — a reveal, a checkpoint, a resync.
   * Optional for the same reason.
   */
  broadcastMeta?(kind: string, body: unknown): Promise<void>;

  status(): TransportStatus;
  presence(): TransportPresence[];
}

export interface LocalTransportOptions {
  tableId: string;
  participantId: ParticipantId;
  name: string;
  playerId?: PlayerId;
  /** Seat index. Stamped onto every envelope so ordering never depends on presence. */
  seat?: number;
  isBot?: boolean;
  /**
   * Deliver a participant's own broadcast back to them. Default true, matching
   * how a real channel behaves, so the app has one path for applying actions.
   */
  echoToSender?: boolean;
  /**
   * Artificial delivery delay in ms, for eyeballing how the surface behaves
   * with latency. 0 delivers synchronously.
   */
  latencyMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Local in-memory hub                                                        */
/* -------------------------------------------------------------------------- */

interface HubMember {
  transport: LocalTransport;
  handlers: TransportHandlers;
  presence: TransportPresence;
}

interface Hub {
  tableId: string;
  members: HubMember[];
}

/**
 * Module-level so two transports created with the same `tableId` in the same
 * tab genuinely talk to each other — which is what makes this a transport and
 * not a callback. Cleared when the last member leaves.
 */
const hubs = new Map<string, Hub>();

function hubFor(tableId: string): Hub {
  const existing = hubs.get(tableId);
  if (existing) return existing;
  const created: Hub = { tableId, members: [] };
  hubs.set(tableId, created);
  return created;
}

function notifyPresence(hub: Hub): void {
  const list = hub.members.map(member => member.presence);
  for (const member of hub.members) {
    member.handlers.onPresence?.(list);
  }
}

class LocalTransport implements GameTransport {
  readonly kind = 'local' as const;
  readonly tableId: string;
  readonly participantId: ParticipantId;

  private readonly options: LocalTransportOptions;
  private state: TransportStatus = 'idle';
  private seq = 0;

  constructor(options: LocalTransportOptions) {
    this.options = options;
    this.tableId = options.tableId;
    this.participantId = options.participantId;
  }

  async join(handlers: TransportHandlers): Promise<void> {
    if (this.state === 'connected') return;
    this.state = 'connecting';
    handlers.onStatus?.('connecting');

    const hub = hubFor(this.tableId);
    hub.members = hub.members.filter(m => m.presence.participantId !== this.participantId);
    hub.members.push({
      transport: this,
      handlers,
      presence: {
        participantId: this.participantId,
        name: this.options.name,
        playerId: this.options.playerId,
        isBot: this.options.isBot,
      },
    });

    this.state = 'connected';
    handlers.onStatus?.('connected');
    notifyPresence(hub);
  }

  async leave(): Promise<void> {
    const hub = hubs.get(this.tableId);
    if (hub) {
      const departing = hub.members.find(m => m.presence.participantId === this.participantId);
      hub.members = hub.members.filter(m => m.presence.participantId !== this.participantId);
      departing?.handlers.onStatus?.('closed');
      if (hub.members.length === 0) hubs.delete(this.tableId);
      else notifyPresence(hub);
    }
    this.state = 'closed';
  }

  async broadcast(action: GameAction, baseVersion: number, at?: number): Promise<void> {
    return this.send({ action, baseVersion, at });
  }

  async broadcastBatch(actions: GameAction[], baseVersion: number, at?: number): Promise<void> {
    if (actions.length === 0) return;
    return this.send({ action: actions[0], actions, baseVersion, at });
  }

  async broadcastMeta(kind: string, body: unknown): Promise<void> {
    return this.send({ actions: [], baseVersion: -1, meta: { kind, body } });
  }

  private async send(part: {
    action?: GameAction;
    actions?: GameAction[];
    baseVersion: number;
    at?: number;
    meta?: { kind: string; body: unknown };
  }): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('LocalTransport: broadcast before join');
    }

    this.seq += 1;
    const envelope: TransportEnvelope = {
      tableId: this.tableId,
      from: this.participantId,
      seq: this.seq,
      baseVersion: part.baseVersion,
      seat: this.options.seat,
      at: part.at ?? Date.now(),
      action: part.action as GameAction,
      actions: part.actions,
      meta: part.meta,
    };

    const hub = hubs.get(this.tableId);
    if (!hub) return;

    const echo = this.options.echoToSender !== false;
    const targets = hub.members.filter(
      member => echo || member.presence.participantId !== this.participantId
    );

    const deliver = () => {
      for (const member of targets) member.handlers.onAction(envelope);
    };

    if (this.options.latencyMs && this.options.latencyMs > 0) {
      // `globalThis`, not `window`: this module is imported by node test runs
      // and by any future server-side replay, neither of which has a DOM.
      globalThis.setTimeout(deliver, this.options.latencyMs);
    } else {
      // Synchronous delivery keeps solo play ordered without a queue. A real
      // channel is async; the reducer's determinism is what makes both safe.
      deliver();
    }
  }

  status(): TransportStatus {
    return this.state;
  }

  presence(): TransportPresence[] {
    const hub = hubs.get(this.tableId);
    if (!hub) return [];
    return hub.members.map(member => member.presence);
  }
}

/**
 * A transport that never leaves the tab. Solo goldfishing and bot pods run on
 * it, which means those surfaces are already written against the networked
 * interface — the online version is a different constructor, not a rewrite.
 */
export function createLocalTransport(options: LocalTransportOptions): GameTransport {
  return new LocalTransport(options);
}

/** Test/HMR escape hatch: forget every in-memory table. */
export function resetLocalTransports(): void {
  hubs.clear();
}
