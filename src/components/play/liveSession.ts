/**
 * The action channel of the one live table, published for the board itself.
 *
 * ## Why this exists
 *
 * Combat is direct manipulation of a card: you press the sword on the creature
 * and it swings. That means the thing that draws the creature — `SeatMat`,
 * inside `PlayTable` — has to be able to dispatch a `GameAction`. Every other
 * board interaction is handed down as a prop from `/play`, and combat cannot
 * be, because `src/pages/Play.tsx` is owned by another workstream and is not
 * ours to edit. Threading a new prop through it is exactly the change that is
 * not available.
 *
 * So the dispatcher is published sideways instead. `usePlayGame` — the one
 * place a local table's transport lives — announces itself here when it mounts
 * and withdraws when it unmounts, and `PlayTable` picks it up.
 *
 * ## Why a module singleton is sound here
 *
 * A document holds at most one local table: `usePlayGame` is called once, by
 * `/play`, and the surface is a fixed full-viewport board. There is no second
 * game to confuse this one with.
 *
 * It is still guarded rather than trusted. `useLiveSession` is asked for the
 * table id and seat it expects and returns `null` on any mismatch, so:
 *
 *   - `/simulate`, which renders the same `PlayTable` over `useWatchedGame` and
 *     has no human seat, gets `null` and draws no combat controls — correct,
 *     because nobody is playing that game;
 *   - a stale publication left by a table that has gone away cannot drive a
 *     new one, because the table id will not match;
 *   - an opponent's quadrant cannot be operated, because the seat will not
 *     match.
 *
 * Withdrawal is identity-checked for the same reason. Two tables overlapping
 * for a frame during a remount would otherwise have the outgoing one clear the
 * incoming one's channel, and the board would go inert until something else
 * re-rendered it.
 */

import { useSyncExternalStore } from 'react';
import type { GameAction, PlayerId } from '@/lib/game';

export interface LiveSession {
  /** `GameState.id` of the table this channel belongs to. */
  tableId: string;
  /** The seat this device controls. Nothing else may be operated. */
  seatId: PlayerId;
  /** The same dispatcher `/play`'s own controls use: broadcast, echo, apply. */
  dispatch: (actions: GameAction | GameAction[]) => void;
}

let current: LiveSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Announce (or, with `null`, withdraw) the live table's action channel. */
export function publishLiveSession(session: LiveSession | null): void {
  if (current === session) return;
  current = session;
  emit();
}

/**
 * Withdraw a specific publication.
 *
 * Called from a cleanup, where "clear whatever is there" is the wrong verb: a
 * table that has already been replaced must not clear its successor.
 */
export function withdrawLiveSession(session: LiveSession): void {
  if (current !== session) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): LiveSession | null {
  return current;
}

/**
 * The action channel for this table and this seat, or `null` when the board on
 * screen is not one this device is playing.
 *
 * Pass what you expect. A caller that does not check is a caller that will one
 * day operate somebody else's game.
 */
export function useLiveSession(
  tableId: string | null | undefined,
  seatId: PlayerId | null | undefined
): LiveSession | null {
  // `snapshot` is stable and returns the same object until something publishes,
  // so this neither tears nor re-renders on unrelated state changes.
  const session = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!session) return null;
  if (!tableId || session.tableId !== tableId) return null;
  if (!seatId || session.seatId !== seatId) return null;
  return session;
}
