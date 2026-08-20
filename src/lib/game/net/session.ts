/**
 * DeckMatrix — networked play: the client's half of a table.
 *
 * One object owns the loop that everything else in `net/` exists to serve:
 *
 *   dispatch  -> apply locally at once, coalesce, broadcast
 *   receive   -> admit, place in sorted order, fold forward or rewind and refold
 *   checkpoint-> hash and publish, so a fork is noticed rather than played out
 *
 * ---------------------------------------------------------------------------
 * Why rewinding is affordable here and is not in most games
 * ---------------------------------------------------------------------------
 * Rollback netcode is normally expensive because it means re-simulating physics
 * at 60Hz. Here the "simulation" is `applyAction`, the actions arrive at maybe
 * one per second, and — the part that actually matters — the reducer never
 * mutates its input. A past state is therefore not a copy to be kept; it is a
 * reference that is still valid, sharing almost all of its structure with the
 * present. Keeping an anchor every 20 entries costs a pointer and a little
 * retained structure, and rewinding is a `slice` and a `reduce`.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, but honestly so
 * ---------------------------------------------------------------------------
 * A local action is applied before it is sent, so the interface responds at
 * pointer speed regardless of latency. It is applied *by being inserted into
 * the log*, not by a second private path, so there is exactly one way state
 * ever changes and the echo of our own broadcast is a duplicate to be dropped
 * rather than a second application to be guarded against. When a peer's action
 * turns out to sort earlier, our own move is rewound and replayed after it —
 * and may then be rejected by the reducer, because the board it was legal
 * against no longer exists. That is not a bug to paper over; it is what
 * happens at a real table when two people reach for the same trigger, and
 * `onRejected` exists so the surface can say so.
 */

import { applyAction } from '../rules.ts';
import type { GameAction, GameState, PlayerId } from '../types.ts';
import type { GameTransport, TransportEnvelope } from '../transport.ts';
import { envelopeActions } from '../transport.ts';
import { OpenAuthority, type Authority, type Verdict } from './authority.ts';
import { digestState } from './digest.ts';
import { installIdentities, projectForViewer, revealsFor } from './identity.ts';
import { OrderedLog } from './ordering.ts';
import {
  NET_LIMITS,
  type Checkpoint,
  type Knowledge,
  type LogEntry,
  type ParticipantId,
  type Reveal,
} from './protocol.ts';
import { applyReveal, type SecretDealer } from './secrets.ts';

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export interface GameSessionOptions {
  transport: GameTransport;
  participantId: ParticipantId;
  /** The seat this device drives. */
  playerId: PlayerId;
  /** Seat index. Part of the order key, so it must match every other client. */
  seat: number;
  /**
   * The dealt state, identical on every client. From `dealTable()` for a real
   * table, or `buildTable()` for solo play where there is nothing to hide.
   */
  base: GameState;

  authority?: Authority;
  /**
   * Present only on the machine holding the secrets — the server, or the single
   * client in a local pod. A remote player's session has none and receives
   * reveals over the wire instead.
   */
  dealer?: SecretDealer;

  /** Epoch ms. Injected so a replay can be run against a fixed clock. */
  now?: () => number;
  /** Deferred work. Injected so tests can run the coalescer synchronously. */
  schedule?: (fn: () => void, ms: number) => unknown;
  /** 0 disables coalescing and sends every dispatch immediately. */
  batchWindowMs?: number;

  /**
   * Put the whole `LogEntry` on the wire instead of a bare action envelope.
   *
   * The envelope path predates hidden information. It carries actions and asks
   * the receiver to rebuild the order key from the sender's seat and version,
   * and it has nowhere to put the card identities a batch reveals. An online
   * table needs both, so it sends the entry itself through `broadcastMeta` —
   * the key that was actually used, and the reveals that have to be installed
   * before the actions run, in one indivisible message.
   *
   * Off by default so the existing local-transport path is untouched.
   */
  wireEntries?: boolean;

  /**
   * Send a batch somewhere durable and ordered, instead of broadcasting it.
   *
   * When this is set the session does not broadcast at all: it hands the entry
   * over and the store is responsible for both recording it and fanning it out.
   * That is how an online table works — one Postgres function assigns the
   * sequence number and broadcasts inside the same transaction, so the order
   * the database recorded and the order the other clients heard cannot
   * disagree. A rejection here is a real rejection: the move did not happen.
   */
  submit?: (entry: LogEntry) => Promise<void>;
  /** Told when `submit` throws, so the surface can say the move did not land. */
  onSubmitFailed?: (entry: LogEntry, error: unknown) => void;

  onChange?: (state: GameState, knowledge: Knowledge) => void;
  onRejected?: (entry: LogEntry, verdict: Verdict) => void;
  onDivergence?: (info: DivergenceReport) => void;
  /** Where the dealer's reveals go. Public ones to the table, private ones direct. */
  onReveal?: (reveal: Reveal) => void;
}

export interface DivergenceReport {
  peer: ParticipantId;
  entries: number;
  ours: string;
  theirs: string;
}

export interface SessionStats {
  entries: number;
  actionsApplied: number;
  actionsRejected: number;
  rewinds: number;
  deepestRewind: number;
  messagesSent: number;
  actionsSent: number;
  bytesSent: number;
}

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

export class GameSession {
  readonly participantId: ParticipantId;
  readonly playerId: PlayerId;
  readonly seat: number;

  private readonly options: GameSessionOptions;
  private readonly transport: GameTransport;
  private readonly authority: Authority;
  private readonly log = new OrderedLog();

  /** State after folding N entries. Always holds 0; then one every `anchorEvery`. */
  private readonly anchors = new Map<number, GameState>();
  /** Digest at each checkpoint boundary, so a late peer checkpoint can be judged. */
  private readonly digests = new Map<number, string>();

  private head: GameState;
  private knowledge: Knowledge = {};

  private pending: LogEntry | null = null;
  private pendingTimer: unknown = null;
  private batchCounter = 0;

  private actionsApplied = 0;
  private actionsRejected = 0;
  private messagesSent = 0;
  private actionsSent = 0;
  private bytesSent = 0;

  constructor(options: GameSessionOptions) {
    this.options = options;
    this.transport = options.transport;
    this.participantId = options.participantId;
    this.playerId = options.playerId;
    this.seat = options.seat;
    this.authority = options.authority ?? new OpenAuthority();
    this.head = options.base;
    this.anchors.set(0, options.base);
  }

  /* ---------------------------------------------------------------- read */

  state(): GameState {
    return this.head;
  }

  /** What this client is entitled to see. Never part of `GameState`. */
  known(): Knowledge {
    return this.knowledge;
  }

  /**
   * The state to DRAW and to DECIDE from: the shared state with this client's
   * own knowledge painted on.
   *
   * Never fold this, never hash it, never send it. It differs on every client
   * by construction, which is precisely the property `state()` exists not to
   * have. See `identity.ts`.
   */
  view(): GameState {
    return projectForViewer(this.head, this.knowledge);
  }

  entries(): readonly LogEntry[] {
    return this.log.all();
  }

  stats(): SessionStats {
    const log = this.log.stats();
    return {
      entries: log.entries,
      actionsApplied: this.actionsApplied,
      actionsRejected: this.actionsRejected,
      rewinds: log.rewinds,
      deepestRewind: log.deepestRewind,
      messagesSent: this.messagesSent,
      actionsSent: this.actionsSent,
      bytesSent: this.bytesSent,
    };
  }

  /* --------------------------------------------------------------- write */

  /** Join the transport and wire the receive path. */
  async connect(): Promise<void> {
    await this.transport.join({
      onAction: envelope => this.receive(envelope),
    });
    if (this.options.dealer) {
      for (const reveal of this.options.dealer.catchUp(this.head, this.participantId)) {
        this.route(reveal);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.flush();
    await this.transport.leave();
  }

  /**
   * Take a local action. Applied immediately; sent when the coalescing window
   * closes, or at once when `batchWindowMs` is 0.
   */
  dispatch(actions: GameAction | GameAction[]): void {
    const list = Array.isArray(actions) ? actions : [actions];
    if (list.length === 0) return;

    const at = (this.options.now ?? Date.now)();
    const stamped = list.map(action => ({ ...action, at: action.at ?? at }));

    // Extend the open batch only while it is still the tail of the log —
    // otherwise appending would rewrite history that peers have already sorted.
    const canExtend =
      this.pending !== null &&
      this.log.at(this.log.length - 1)?.batchId === this.pending.batchId &&
      this.pending.actions.length + stamped.length <= NET_LIMITS.maxActionsPerBatch;

    // What these actions are about to show the table. Computed against the
    // state they will actually meet, before anything is applied, because that
    // is the only moment the card is still hidden and therefore the only moment
    // the question "does this reveal it" has an answer.
    const reveals = this.revealsForLocal(stamped);

    if (canExtend && this.pending) {
      this.pending.actions.push(...stamped);
      if (Object.keys(reveals).length > 0) {
        this.pending.reveals = { ...this.pending.reveals, ...reveals };
      }
      this.applyEntry({ ...this.pending, actions: stamped, reveals });
      this.emitChange();
      return;
    }

    this.flush();

    const entry: LogEntry = {
      tableId: this.transport.tableId,
      batchId: this.nextBatchId(),
      from: this.participantId,
      playerId: this.playerId,
      key: { baseVersion: this.head.version, seat: this.seat, batchId: '' },
      at,
      actions: stamped,
      ...(Object.keys(reveals).length > 0 ? { reveals } : {}),
    };
    entry.key.batchId = entry.batchId;

    const placed = this.log.insert(entry);
    if (placed.outcome === 'rewound') {
      // Vanishingly rare — it means a peer entry landed between deciding to act
      // and inserting. Refolding is the same code path either way.
      this.refoldFrom(placed.index);
    } else {
      this.applyEntry(entry);
    }

    this.pending = entry;
    this.maybeCheckpoint();
    this.emitChange();
    this.scheduleFlush();
  }

  /** Send the open batch now. Idempotent. */
  flush(): void {
    const entry = this.pending;
    this.pending = null;
    if (this.pendingTimer !== null) {
      globalThis.clearTimeout?.(this.pendingTimer as never);
      this.pendingTimer = null;
    }
    if (!entry) return;

    const payload = JSON.stringify(entry.actions);
    this.messagesSent += 1;
    this.actionsSent += entry.actions.length;
    this.bytesSent += payload.length;

    // A durable, ordering store takes precedence over broadcasting: it does
    // both jobs, and doing them separately is how a sequence number and a
    // broadcast end up disagreeing about the order of a turn.
    if (this.options.submit) {
      void this.options.submit(entry).catch(error => {
        this.options.onSubmitFailed?.(entry, error);
      });
      return;
    }

    if (this.options.wireEntries && this.transport.broadcastMeta) {
      void this.transport.broadcastMeta('entry', entry);
      return;
    }

    if (this.transport.broadcastBatch) {
      void this.transport.broadcastBatch(entry.actions, entry.key.baseVersion, entry.at);
    } else {
      for (const action of entry.actions) {
        void this.transport.broadcast(action, entry.key.baseVersion, entry.at);
      }
    }
  }

  /* ------------------------------------------------------------- receive */

  /** One envelope off the transport. The only entry point for remote state. */
  receive(envelope: TransportEnvelope): void {
    if (envelope.meta) {
      this.receiveMeta(envelope.meta.kind, envelope.meta.body);
      return;
    }
    if (envelope.from === this.participantId) return; // our own echo

    const actions = envelopeActions(envelope);
    if (actions.length === 0) return;

    // The seat comes off the wire, never from local presence: presence is
    // eventually consistent, so a receiver that has not yet seen the sender
    // join would compute a different key for the same message and sort the game
    // differently. Falling back to a lookup keeps an older sender working, and
    // an unknown seat sorts last — identically on every client.
    const batchId = `${envelope.from}:${envelope.seq}`;
    const entry: LogEntry = {
      tableId: envelope.tableId,
      batchId,
      from: envelope.from,
      playerId: this.seatOf(envelope.from) ?? envelope.from,
      key: {
        baseVersion: envelope.baseVersion,
        seat: envelope.seat ?? this.seatIndexOf(envelope.from),
        batchId,
      },
      at: envelope.at,
      actions,
    };

    this.ingest(entry);
  }

  /**
   * Place one entry and fold. Split out from `receive` so the durable log and a
   * resync can push entries in without inventing an envelope.
   */
  ingest(entry: LogEntry): void {
    if (this.log.has(entry.batchId)) return;

    // Close our own batch first: an incoming entry may sort before it, and the
    // ordering has to be settled against a batch that will not grow again.
    this.flush();

    const target = this.stateForChecking(entry);
    const verdict = this.authority.admit(target, entry);
    if (verdict.ok !== true) {
      this.options.onRejected?.(entry, verdict);
      // 'suspect' is reported and then applied: refusing a legal action because
      // it looked odd is a worse failure than logging a false positive.
      if (verdict.severity === 'reject') return;
    }

    const placed = this.log.insert(entry);
    if (placed.outcome === 'duplicate') return;

    if (placed.outcome === 'appended') {
      this.applyEntry(entry);
    } else {
      this.refoldFrom(placed.index);
    }

    this.maybeCheckpoint();
    this.emitChange();
  }

  /** Replace the log wholesale, as after refetching the durable store. */
  resync(entries: readonly LogEntry[]): void {
    this.flush();
    const firstChanged = this.log.replaceAll(entries);
    this.refoldFrom(firstChanged);
    this.emitChange();
  }

  /** Fold a reveal into this client's overlay. */
  ingestReveal(reveal: Reveal): void {
    if (!reveal.public && reveal.to !== this.participantId && reveal.to !== '*') return;
    this.knowledge = applyReveal(this.knowledge, reveal);
    this.emitChange();
  }

  /** Compare a peer's checkpoint against ours at the same entry count. */
  ingestCheckpoint(checkpoint: Checkpoint): void {
    if (checkpoint.from === this.participantId) return;
    const ours = this.digests.get(checkpoint.entries);
    if (!ours || ours === checkpoint.digest) return;
    this.options.onDivergence?.({
      peer: checkpoint.from,
      entries: checkpoint.entries,
      ours,
      theirs: checkpoint.digest,
    });
  }

  /* -------------------------------------------------------------- internals */

  private receiveMeta(kind: string, body: unknown): void {
    if (kind === 'reveal') this.ingestReveal(body as Reveal);
    else if (kind === 'checkpoint') this.ingestCheckpoint(body as Checkpoint);
    else if (kind === 'entry') this.ingest(body as LogEntry);
  }

  /**
   * The identities this client's own actions are about to make public.
   *
   * Only ever this client's own cards, and only ever ones the batch takes out
   * of a hidden zone into a visible one. `revealsFor` states each condition and
   * why dropping any of them leaks something.
   */
  private revealsForLocal(actions: readonly GameAction[]): Record<string, never> | Knowledge {
    if (Object.keys(this.knowledge).length === 0) return {};
    return revealsFor(this.head, this.knowledge, actions, applyAction);
  }

  private applyRun(actions: readonly GameAction[]): void {
    for (const action of actions) {
      const next = applyAction(this.head, action);
      // The reducer returns its input by reference when it rejects.
      if (next === this.head) this.actionsRejected += 1;
      else this.actionsApplied += 1;
      this.head = next;
    }
  }

  /**
   * Apply one entry and let the dealer settle what it revealed.
   *
   * The dealer works from the states either side of the entry, which is why
   * `before` is captured here rather than reconstructed: it is the only place
   * that reliably has both.
   */
  private applyEntry(entry: LogEntry): void {
    const before = this.head;
    // Reveal, then act. The identities a batch makes public are installed
    // before its actions run, because the reducer cannot check the cost of a
    // card it has not been told the name of. The order is fixed and identical
    // on every client, so the states stay identical too. See `identity.ts`.
    if (entry.reveals) this.head = installIdentities(this.head, entry.reveals);
    this.applyRun(entry.actions);
    this.settle(before, this.head, entry);
  }

  /**
   * Rebuild from the newest anchor at or before `index`, then re-fold every
   * entry from there. Anchors past the rewind point are invalid and dropped.
   */
  private refoldFrom(index: number): void {
    for (const anchor of Array.from(this.anchors.keys())) {
      if (anchor > index) this.anchors.delete(anchor);
    }
    for (const at of Array.from(this.digests.keys())) {
      if (at > index) this.digests.delete(at);
    }

    let from = 0;
    for (const anchor of this.anchors.keys()) {
      if (anchor <= index && anchor > from) from = anchor;
    }

    this.head = this.anchors.get(from) ?? this.options.base;

    const all = this.log.all();
    for (let i = from; i < all.length; i++) {
      this.applyEntry(all[i]);
      const count = i + 1;
      if (count % NET_LIMITS.anchorEvery === 0) this.anchors.set(count, this.head);
    }
  }

  /**
   * State to judge an entry against.
   *
   * When the entry appends, that is the head. When it sorts earlier, the honest
   * answer is the state it will actually meet after the refold — which we do
   * not have yet. Judging it against the head is the pragmatic approximation:
   * it catches impersonation and turn-structure violations exactly, and can
   * mis-call a legality check during the narrow window a rewind covers. Those
   * are caught anyway when the refold re-runs the reducer, which rejects the
   * action for real.
   *
   * The entry's own reveals are installed first. Without that, every cast from
   * a hidden zone would be judged against a card with no name and no cost, and
   * the authority would reject every real move in the game as illegal.
   */
  private stateForChecking(entry: LogEntry): GameState {
    return entry.reveals ? installIdentities(this.head, entry.reveals) : this.head;
  }

  /**
   * Ask the dealer what this entry revealed.
   *
   * Runs on refold too, which means the dealer sees the same entry more than
   * once. That is why its reveals are idempotent — it tracks what it has
   * already told whom — rather than the session trying to remember which
   * entries it has already settled across a rewind.
   */
  private settle(before: GameState, after: GameState, entry: LogEntry): void {
    const dealer = this.options.dealer;
    if (!dealer) return;
    for (const reveal of dealer.settle(before, after, entry)) this.route(reveal);
  }

  private route(reveal: Reveal): void {
    this.ingestReveal(reveal);
    this.options.onReveal?.(reveal);
  }

  private maybeCheckpoint(): void {
    const count = this.log.length;
    if (count === 0 || count % NET_LIMITS.checkpointEvery !== 0) return;
    const digest = digestState(this.head);
    this.digests.set(count, digest);
    void this.transport.broadcastMeta?.('checkpoint', {
      tableId: this.transport.tableId,
      from: this.participantId,
      entries: count,
      version: this.head.version,
      digest,
    } satisfies Checkpoint);
  }

  private scheduleFlush(): void {
    const window = this.options.batchWindowMs ?? NET_LIMITS.batchWindowMs;
    if (window <= 0) {
      this.flush();
      return;
    }
    const schedule = this.options.schedule ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.pendingTimer = schedule(() => this.flush(), window);
  }

  private nextBatchId(): string {
    this.batchCounter += 1;
    return `${this.participantId}:${this.batchCounter}`;
  }

  private seatOf(participantId: ParticipantId): PlayerId | undefined {
    return this.transport.presence().find(p => p.participantId === participantId)?.playerId;
  }

  private seatIndexOf(participantId: ParticipantId): number {
    const playerId = this.seatOf(participantId);
    const seat = this.head.players.find(p => p.id === playerId)?.seat;
    // An unseated participant sorts last, deterministically, on every client.
    return seat ?? Number.MAX_SAFE_INTEGER;
  }

  private emitChange(): void {
    this.options.onChange?.(this.head, this.knowledge);
  }
}
