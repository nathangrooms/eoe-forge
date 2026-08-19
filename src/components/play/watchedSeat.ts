/**
 * Which seat a watched game is being seen through, and when that may change
 * out from under the reader.
 *
 * This is three lines of `if` that lived inside `WatchedTable.tsx`, and it was
 * wrong in a way no `.tsx` can be tested for. The rule was:
 *
 *   if the watched seat has lost, move to a living one
 *
 * applied on every render, unconditionally. Which means that the moment the
 * game ends, the seat picker stops working: you press "Watch the table from
 * Yeva 2's seat", the button takes the click, `watchedId` becomes `p2` for one
 * frame, and this effect immediately puts it back. Nothing on screen changes
 * and nothing says why.
 *
 * Measured, at the end of a real watched game:
 *
 *   pressed:            "Watch the table from Yeva 2's seat"
 *   seat buttons after: Yeva pressed=true, Yeva 2 pressed=false
 *
 * That is the "never silently do nothing" rule in the spec, broken at exactly
 * the moment a watcher wants it most: looking at what the losing deck had left
 * is the whole reason to watch a playtest rather than read the winner's name.
 *
 * The rule that is actually wanted has two halves:
 *
 *   **While the game is still being played**, a seat that has lost is not a
 *   seat to watch from: it will never take another decision, its hand will
 *   never change, and sitting there watching nothing happen looks like the
 *   screen has frozen. So the reader is moved to a living seat — and told,
 *   which is the caller's job and why `reason` comes back too.
 *
 *   **Once the game is over**, every seat is finished and none of them is more
 *   alive than any other. A losing board is a readable board: its graveyard is
 *   the interesting one. So the pick stands, whoever it is.
 *
 * `.ts` rather than `.tsx` on purpose: `node --test --experimental-strip-types`
 * cannot parse JSX, so a rule that lives in a component cannot have a test. The
 * playmat sizing arithmetic was split out of its component for this reason and
 * the reason is not weaker here.
 */

import type { PlayerId } from '../../lib/game/index.ts';

/** The little the rule needs to know about a seat. */
export interface WatchableSeat {
  id: PlayerId;
  name: string;
  hasLost: boolean;
}

export interface WatchedSeatChoice {
  /** The seat to draw the table through. */
  seatId: PlayerId | null;
  /**
   * Set only when the pick was overridden. A sentence for the reader, because
   * being moved somewhere without being told is its own silent failure.
   */
  reason: string | null;
}

/**
 * Resolve the seat a watched table should be seen through.
 *
 * @param seats     Every seat at the table, in seating order.
 * @param watchedId The seat the reader last chose.
 * @param gameOver  True once the game has a result, however it ended.
 */
export function resolveWatchedSeat(
  seats: readonly WatchableSeat[],
  watchedId: PlayerId | null,
  gameOver: boolean
): WatchedSeatChoice {
  if (seats.length === 0) return { seatId: null, reason: null };

  const chosen = seats.find(seat => seat.id === watchedId) ?? null;

  /* A seat that is not at this table at all: a restart with different decks,
     or a stale id held across a rebuild. Fall to the first seat, quietly —
     there is no reader decision to contradict. */
  if (!chosen) return { seatId: seats[0].id, reason: null };

  /* The game is finished. Nobody is taking another decision, so a losing seat
     is exactly as watchable as a winning one, and it is usually the one worth
     reading. The reader's pick stands. */
  if (gameOver) return { seatId: chosen.id, reason: null };

  if (!chosen.hasLost) return { seatId: chosen.id, reason: null };

  const living = seats.find(seat => !seat.hasLost);
  if (!living) return { seatId: chosen.id, reason: null };

  return {
    seatId: living.id,
    reason: `${chosen.name} is out of the game, so the table moved to ${living.name}.`,
  };
}
