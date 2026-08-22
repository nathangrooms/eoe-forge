/**
 * One table's room, kept up to date.
 *
 * `online_table_room(id)` returns the table and every seat at it as ONE row,
 * so a person sitting down, picking a deck and readying up costs one read each
 * time and never one read per chair.
 *
 * The push comes from `nudge_the_room`, a row-level trigger on
 * `game_participants` that sends on the table's own topic, `game:<id>`. That is
 * the same topic the game itself runs on, deliberately: the room and the table
 * are the same conversation at two moments.
 *
 * Two things this hook has to get right.
 *
 * NULL IS NOT AN ERROR. `online_table_room` returns nothing at all when you
 * are not seated at that table, because its RLS is membership. That is the
 * normal state for somebody who just followed a link, and it is also the state
 * for the half second between pressing Leave and the screen catching up. It is
 * reported as `room: null`, never as a failure.
 *
 * A NON MEMBER CANNOT SUBSCRIBE. The Realtime policy on `game:<id>` is the same
 * membership check, so opening the channel before you have a seat is a join
 * that will be refused. The subscription is therefore held back until there is
 * a room to listen about.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { readRoom, subscribeToTable, type LobbyChannelStatus, type TableRoom } from '@/lib/lobby';
import { NUDGE_COALESCE_MS } from './useLobbyFeed';

export interface RoomFeed {
  room: TableRoom | null;
  /** True only before the first answer. A refresh does not blank the screen. */
  loading: boolean;
  error: string | null;
  live: LobbyChannelStatus;
  refresh: () => void;
}

export function useTableRoom(tableId: string | null): RoomFeed {
  const [room, setRoom] = useState<TableRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LobbyChannelStatus>('connecting');

  const alive = useRef(true);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
    };
  }, []);

  const read = useCallback(async () => {
    if (!tableId) {
      setRoom(null);
      setLoading(false);
      return;
    }
    try {
      const next = await readRoom(tableId);
      if (!alive.current) return;
      setRoom(next);
      setError(null);
    } catch (caught) {
      if (alive.current) setError((caught as { message?: string })?.message ?? 'unknown');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [tableId]);

  /* Same reasoning as the lobby list: one seat change fires several triggers. */
  const scheduleRead = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void read();
    }, NUDGE_COALESCE_MS);
  }, [read]);

  useEffect(() => {
    setLoading(true);
    void read();
  }, [read]);

  /* A boolean, not the room object. Depending on `room` itself would tear the
     channel down and open a new one on every seat change, which is a join and a
     metered connection for each of them. */
  const seated = room !== null;

  useEffect(() => {
    // No seat, no channel. The Realtime policy on `game:<id>` is the same
    // membership check, so joining before there is a seat is a refusal.
    if (!tableId || !seated) return;

    return subscribeToTable(tableId, {
      onSeats: scheduleRead,
      // The status change is on the table, not on a seat, so the room has to be
      // re-read rather than assumed. The page decides what to do about it.
      onStart: () => void read(),
      onStatus: setLive,
    });
  }, [tableId, seated, scheduleRead, read]);

  const refresh = useCallback(() => {
    void read();
  }, [read]);

  return { room, loading, error, live, refresh };
}
