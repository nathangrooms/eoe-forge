/**
 * DeckMatrix — networked play: who is allowed to do what.
 *
 * `rules.ts::validateAction` answers "is this action well-formed and legal
 * against this state". It deliberately does not answer "is this person allowed
 * to send it", because the reducer has no idea people exist. That second
 * question is a networking concern and it lives here.
 *
 * ---------------------------------------------------------------------------
 * What is actually preventable
 * ---------------------------------------------------------------------------
 * Worth being blunt, because "the server validates" is usually said with more
 * confidence than it deserves.
 *
 *   Preventable, cheaply, by every client independently:
 *     - impersonation: acting for a seat you do not hold;
 *     - out-of-turn structure: passing someone else's turn, attacking on
 *       someone else's turn;
 *     - illegal actions: anything `validateAction` rejects;
 *     - divergence: a client whose state stops matching everyone else's.
 *   All four are caught by *every* participant running this check, so a
 *   tampered client is outvoted rather than trusted. Nothing needs to be
 *   round-tripped for these.
 *
 *   Preventable only by the dealer:
 *     - seeing hidden information. Not a validation problem at all — a client
 *       cannot be stopped from looking at data it holds, so it is never sent
 *       the data. See `secrets.ts`.
 *
 *   Not preventable by anyone, at any price:
 *     - collusion. Two players in a voice call sharing their hands defeats
 *       every mechanism in this file and every mechanism in any other
 *       architecture, server-authoritative ones included.
 *
 * ---------------------------------------------------------------------------
 * Two authority modes, one interface
 * ---------------------------------------------------------------------------
 * `PeerAuthority` runs the checks on every client. Cost: zero. Guarantee: a
 * lone cheat is detected by three honest peers and the table can eject them,
 * but the cheat's own screen did whatever it wanted in the meantime.
 *
 * `SequencedAuthority` (see `persistence.ts`) runs the same checks inside a
 * Postgres function that also assigns the durable sequence number, so a
 * rejected action never enters the log at all. Cost: one round trip per batch,
 * one row write per batch. That is the ranked-play setting, and it is the same
 * code path — the session does not know which one it has.
 *
 * ---------------------------------------------------------------------------
 * A rule this depends on: only decisions travel
 * ---------------------------------------------------------------------------
 * Triggered and derived actions — the ones `effects.ts` produces because a
 * creature entered, the ones that follow mechanically from a step change —
 * must NOT be broadcast. Every client derives them from the same state and
 * would otherwise apply them N times over. Put a player's *choices* on the
 * wire and let consequences fall out of the reducer. This halves message
 * volume and, more importantly, makes the authority question tractable: every
 * entry on the wire has exactly one person who is allowed to have sent it.
 */

import { applyAction, validateAction } from '../rules.ts';
import type { GameAction, GameActionType, GameState, PlayerId } from '../types.ts';
import type { LogEntry, ParticipantId } from './protocol.ts';

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 'reject'  — do not apply, do not forward. The sender is wrong or lying.
 * 'suspect' — apply, but flag. Used where a rule is *probably* being broken but
 *             a legitimate card effect could explain it, and silently dropping
 *             a legal action is worse than logging a false positive.
 */
export type Verdict = { ok: true } | { ok: false; severity: 'reject' | 'suspect'; reason: string };

export interface Authority {
  /** May this entry be applied to this state? */
  admit(state: GameState, entry: LogEntry): Verdict;
}

/* -------------------------------------------------------------------------- */
/* Ownership of the turn                                                      */
/* -------------------------------------------------------------------------- */

/** Actions only the active player may take. Everything else is open to responses. */
const ACTIVE_PLAYER_ONLY: ReadonlySet<GameActionType> = new Set<GameActionType>([
  'PASS_TURN',
  'ADVANCE_STEP',
  'PHASE_CHANGE',
  'ATTACK',
  'END_COMBAT',
]);

/**
 * Actions that must never arrive over the wire, because every client derives
 * them. Seeing one means either a bug in the dispatch layer or a client trying
 * to rewrite the table.
 */
const NEVER_ON_THE_WIRE: ReadonlySet<GameActionType> = new Set<GameActionType>(['RESET']);

/* -------------------------------------------------------------------------- */
/* Peer implementation                                                        */
/* -------------------------------------------------------------------------- */

export interface PeerAuthorityOptions {
  /** Connection -> the seat it holds. The lobby fills this in and it is public. */
  seatByParticipant: Record<ParticipantId, PlayerId>;
  /**
   * Let a seat act for another. True for bot pods and for the host driving
   * absent seats; false for a real table, where it is impersonation.
   */
  allowProxy?: boolean;
}

export class PeerAuthority implements Authority {
  private readonly seatByParticipant: Record<ParticipantId, PlayerId>;
  private readonly allowProxy: boolean;

  constructor(options: PeerAuthorityOptions) {
    this.seatByParticipant = { ...options.seatByParticipant };
    this.allowProxy = options.allowProxy ?? false;
  }

  /** Seats change as people join. Kept mutable so a join is not a reconstruction. */
  seat(participantId: ParticipantId, playerId: PlayerId): void {
    this.seatByParticipant[participantId] = playerId;
  }

  admit(state: GameState, entry: LogEntry): Verdict {
    const held = this.seatByParticipant[entry.from];

    if (!this.allowProxy) {
      if (!held) {
        return { ok: false, severity: 'reject', reason: `${entry.from} holds no seat at this table.` };
      }
      if (held !== entry.playerId) {
        return {
          ok: false,
          severity: 'reject',
          reason: `${entry.from} holds ${held} but sent as ${entry.playerId}.`,
        };
      }
    }

    if (entry.actions.length === 0) {
      return { ok: false, severity: 'reject', reason: 'Empty batch.' };
    }

    // Fold the batch, checking each action against the state it will actually
    // meet. Checking them all against the batch's first state would pass runs
    // that are individually legal and collectively impossible.
    let cursor = state;
    for (const action of entry.actions) {
      const verdict = this.admitOne(cursor, entry.playerId, action);
      if (!verdict.ok) return verdict;
      cursor = applyAction(cursor, action);
    }

    return { ok: true };
  }

  private admitOne(state: GameState, actor: PlayerId, action: GameAction): Verdict {
    if (NEVER_ON_THE_WIRE.has(action.type)) {
      return { ok: false, severity: 'reject', reason: `${action.type} is not a networked action.` };
    }

    if (action.actorId && action.actorId !== actor) {
      return {
        ok: false,
        severity: 'reject',
        reason: `Action claims actor ${action.actorId} in a batch from ${actor}.`,
      };
    }

    if (ACTIVE_PLAYER_ONLY.has(action.type) && state.activePlayerId !== actor) {
      return {
        ok: false,
        severity: 'reject',
        reason: `${action.type} is the active player's to take, and that is ${state.activePlayerId}.`,
      };
    }

    if (action.type === 'BLOCK' && state.activePlayerId === actor) {
      return { ok: false, severity: 'reject', reason: 'The attacking player cannot declare blocks.' };
    }

    // Drawing and shuffling another seat's library is legal — plenty of cards do
    // it — but it is also what a cheat would try, so it is flagged rather than
    // waved through or wrongly refused.
    if ((action.type === 'DRAW' || action.type === 'SHUFFLE') && action.playerId !== actor) {
      return {
        ok: false,
        severity: 'suspect',
        reason: `${actor} moved ${action.playerId}'s library. Legal for some cards; worth a look.`,
      };
    }

    const legal = validateAction(state, action);
    if (!legal.ok) {
      return { ok: false, severity: 'reject', reason: legal.reason ?? 'Rejected by the rules.' };
    }

    return { ok: true };
  }
}

/* -------------------------------------------------------------------------- */
/* Permissive authority                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Admits everything. Solo play, goldfishing and bot pods, where the only
 * participant is the person who would be cheating themselves.
 */
export class OpenAuthority implements Authority {
  admit(): Verdict {
    return { ok: true };
  }
}
