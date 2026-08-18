/**
 * DeckMatrix — networked play: the Supabase Realtime transport.
 *
 * This is the real one. It implements `GameTransport` over a broadcast channel
 * and is what a live table runs on.
 *
 * ---------------------------------------------------------------------------
 * Why there is no `import { supabase }` in this file
 * ---------------------------------------------------------------------------
 * `src/lib/game/` does not touch Supabase, React or storage — that rule is what
 * lets the whole engine run in a test, in a worker, or server-side during a
 * replay. So the channel is injected: the caller (in `src/lib/api` or a hook)
 * passes something that quacks like a `RealtimeChannel`, and this module never
 * learns where it came from. The upside beyond purity is that the transport is
 * testable against a fake channel without a network.
 *
 * Wiring it up at the call site:
 *
 *   const transport = createRealtimeTransport({
 *     tableId, participantId, name, playerId, seat,
 *     open: () => supabase.channel(`table:${tableId}`, {
 *       config: { private: true, broadcast: { self: true } },
 *     }),
 *     close: channel => { void supabase.removeChannel(channel); },
 *   });
 *
 * ---------------------------------------------------------------------------
 * Channel settings that are not preferences
 * ---------------------------------------------------------------------------
 *   private: true      Gates the channel on RLS over `realtime.messages`, so a
 *                      stranger cannot subscribe to your table and watch your
 *                      opponents' reveals go past. Requires 'Allow public
 *                      access' to be off in Realtime settings — without that,
 *                      `private` is a request, not a guarantee. Keep the policy
 *                      cheap; Supabase warns that complex RLS here raises join
 *                      latency and lowers the achievable join rate.
 *   self: true         Echo our own broadcasts. Costs one extra billed message
 *                      per send, and buys a delivery receipt: hearing your own
 *                      batch come back is proof the channel accepted it.
 *                      `net/session.ts` drops the echo as a duplicate, since it
 *                      applied the batch optimistically before sending.
 *   ack: false         We do not wait for a server ack. The order key already
 *                      makes delivery order irrelevant, and the durable log is
 *                      what makes delivery itself recoverable.
 *
 * Presence is deliberately NOT used for seat tracking. It is a per-project
 * metered resource with its own separate quota (50 messages/second on Pro,
 * 1,000 on Team), Supabase's own guidance is to use it minimally because of the
 * computational overhead, and seats are already known from the durable
 * `game_participants` rows. Presence here answers only "is this person's tab
 * still open", and only in the lobby.
 */

import type {
  GameTransport,
  TransportEnvelope,
  TransportHandlers,
  TransportPresence,
  TransportStatus,
} from '../transport.ts';
import type { GameAction, PlayerId } from '../types.ts';
import { NET_LIMITS, type ParticipantId } from './protocol.ts';

/* -------------------------------------------------------------------------- */
/* The shape we need from a channel                                           */
/* -------------------------------------------------------------------------- */

/**
 * The subset of `RealtimeChannel` this transport uses. Structural, so a real
 * supabase-js channel satisfies it without an adapter and a fake satisfies it
 * without a network.
 */
export interface RealtimeChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (message: { payload: unknown }) => void
  ): RealtimeChannelLike;
  send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown> | unknown;
  subscribe(callback?: (status: string, error?: Error) => void): unknown;
}

export interface RealtimeTransportOptions {
  tableId: string;
  participantId: ParticipantId;
  name: string;
  playerId?: PlayerId;
  /** Seat index. Stamped on every envelope; the order key depends on it. */
  seat?: number;
  /** Build the channel. Called on `join`, so a rejoin gets a fresh one. */
  open: () => RealtimeChannelLike;
  /** Tear it down. `supabase.removeChannel(channel)`. */
  close?: (channel: RealtimeChannelLike) => void;
  /** Event name on the channel. One event for the whole protocol. */
  event?: string;
}

/** Supabase's subscribe statuses, mapped onto ours. */
function mapStatus(status: string): TransportStatus {
  switch (status) {
    case 'SUBSCRIBED':
      return 'connected';
    case 'CLOSED':
      return 'closed';
    case 'CHANNEL_ERROR':
    case 'TIMED_OUT':
      return 'error';
    default:
      return 'connecting';
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

class RealtimeTransport implements GameTransport {
  readonly kind = 'realtime' as const;
  readonly tableId: string;
  readonly participantId: ParticipantId;

  private readonly options: RealtimeTransportOptions;
  private readonly event: string;
  private channel: RealtimeChannelLike | null = null;
  private handlers: TransportHandlers | null = null;
  private state: TransportStatus = 'idle';
  private seq = 0;

  constructor(options: RealtimeTransportOptions) {
    this.options = options;
    this.tableId = options.tableId;
    this.participantId = options.participantId;
    this.event = options.event ?? 'batch';
  }

  async join(handlers: TransportHandlers): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.handlers = handlers;
    this.state = 'connecting';
    handlers.onStatus?.('connecting');

    const channel = this.options.open();
    this.channel = channel;

    channel.on('broadcast', { event: this.event }, message => {
      const envelope = message.payload as TransportEnvelope;
      // Anything malformed is dropped rather than fed to the reducer. A channel
      // is reachable by anyone RLS lets in, and one bad payload should not be
      // able to wedge four other players' tables.
      if (!envelope || typeof envelope !== 'object' || envelope.tableId !== this.tableId) return;
      handlers.onAction(envelope);
    });

    await new Promise<void>(resolve => {
      let settled = false;
      channel.subscribe((status, error) => {
        this.state = mapStatus(status);
        handlers.onStatus?.(this.state, error);
        if (!settled && (this.state === 'connected' || this.state === 'error')) {
          settled = true;
          resolve();
        }
      });
    });
  }

  async leave(): Promise<void> {
    if (this.channel) this.options.close?.(this.channel);
    this.channel = null;
    this.state = 'closed';
    this.handlers?.onStatus?.('closed');
  }

  async broadcast(action: GameAction, baseVersion: number, at?: number): Promise<void> {
    return this.publish({ action, baseVersion, at });
  }

  async broadcastBatch(actions: GameAction[], baseVersion: number, at?: number): Promise<void> {
    if (actions.length === 0) return;
    return this.publish({ action: actions[0], actions, baseVersion, at });
  }

  async broadcastMeta(kind: string, body: unknown): Promise<void> {
    return this.publish({ actions: [], baseVersion: -1, meta: { kind, body } });
  }

  status(): TransportStatus {
    return this.state;
  }

  /**
   * Empty. Seats come from the durable `game_participants` rows, not from
   * presence — see the note at the top of this file about why presence is not
   * the right tool for something the database already knows.
   */
  presence(): TransportPresence[] {
    return [];
  }

  private async publish(part: {
    action?: GameAction;
    actions?: GameAction[];
    baseVersion: number;
    at?: number;
    meta?: { kind: string; body: unknown };
  }): Promise<void> {
    const channel = this.channel;
    if (!channel || this.state !== 'connected') {
      throw new Error('RealtimeTransport: broadcast before the channel was joined');
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

    // A batch over the payload ceiling is a bug upstream, and finding out from
    // a silently dropped turn is the worst possible way to learn about it.
    const size = JSON.stringify(envelope).length;
    if (size > NET_LIMITS.maxBatchBytes) {
      throw new Error(
        `RealtimeTransport: batch of ${size} bytes exceeds the ${NET_LIMITS.maxBatchBytes} byte budget`
      );
    }

    await channel.send({ type: 'broadcast', event: this.event, payload: envelope });
  }
}

/**
 * A transport over one Supabase Realtime channel. Same interface as
 * `createLocalTransport`, so the play surface cannot tell them apart — which is
 * the whole reason solo play was written against a transport in the first place.
 */
export function createRealtimeTransport(options: RealtimeTransportOptions): GameTransport {
  return new RealtimeTransport(options);
}
