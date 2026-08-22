/**
 * Everything the lobby page knows, and how it finds out it changed.
 *
 * ---------------------------------------------------------------------------
 * ONE READ. NOT ONE READ PER TABLE.
 * ---------------------------------------------------------------------------
 * `open_game_tables()` returns every table with its seats already aggregated.
 * That is the whole tables half of the page, and the discussion below it is one
 * more indexed select in `useDiscussion`. Nothing in here loops over tables, and
 * nothing fetches a second time to fill a field in.
 * CLAUDE.md records two outages and a disk IO warning from per-row queries, one
 * of them 421 requests on a single page visit, so this is a rule and not a
 * preference.
 *
 * ---------------------------------------------------------------------------
 * NOTHING POLLS WHILE REALTIME IS UP
 * ---------------------------------------------------------------------------
 * The database nudges the `lobby` topic from the same transaction that changed
 * something, so a nudge cannot disagree with what a re-read will find. This
 * hook re-reads on the nudge and never on a timer.
 *
 * The one timer is the fallback in `channel.ts`, and it runs ONLY while the
 * channel reports itself down, and only while the tab is visible. A lobby that
 * silently stops updating is worse than one that is slow, but paying for that
 * insurance while the channel is healthy is exactly the traffic this project
 * has already been hurt by.
 *
 * ---------------------------------------------------------------------------
 * NUDGES ARRIVE IN BURSTS. READS MUST NOT.
 * ---------------------------------------------------------------------------
 * Six triggers can fire for one person sitting down with a deck: the seat is
 * inserted, then updated with a name, a deck and a commitment. Re-reading on
 * each of those is five wasted round trips for every player who joins, on every
 * open tab. So a nudge schedules a read a short time later and any nudge
 * arriving inside that window joins the one already scheduled.
 *
 * 300 ms is a judgement, not a measurement: below the point a person reads it
 * as lag, above the width of a burst of triggers from one statement.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FALLBACK_POLL_MS,
  listOpenTables,
  subscribeToLobby,
  type LobbyChannelStatus,
  type OpenTable,
} from '@/lib/lobby';

/** How long a nudge waits for its companions before it costs a read. */
export const NUDGE_COALESCE_MS = 300;

export interface LobbyFeed {
  tables: OpenTable[];
  loadingTables: boolean;
  /** What the push channel is doing. 'down' is when the fallback read runs. */
  live: LobbyChannelStatus;
  /** Read the tables again now. The join and leave paths use it. */
  refreshTables: () => void;
}

export function useLobbyFeed(enabled: boolean): LobbyFeed {
  const [tables, setTables] = useState<OpenTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
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

  const readTables = useCallback(async () => {
    try {
      const rows = await listOpenTables();
      if (alive.current) setTables(rows);
    } catch (error) {
      // A failed refresh keeps the list that is already on screen. Blanking it
      // would turn one dropped request into an empty lobby.
      console.warn('[lobby] could not read the open tables:', error);
    } finally {
      if (alive.current) setLoadingTables(false);
    }
  }, []);

  /** Coalesce a burst of nudges into one read. See the note at the top. */
  const scheduleRead = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void readTables();
    }, NUDGE_COALESCE_MS);
  }, [readTables]);

  const refreshTables = useCallback(() => {
    void readTables();
  }, [readTables]);

  /* The first read. */
  useEffect(() => {
    if (!enabled) {
      setLoadingTables(false);
      return;
    }
    void readTables();
  }, [enabled, readTables]);

  /* The push. The same one channel the discussion listens on, shared. */
  useEffect(() => {
    if (!enabled) return;

    return subscribeToLobby({
      onTables: scheduleRead,
      onStatus: setLive,
    });
  }, [enabled, scheduleRead]);

  /* The fallback. Only while the channel is down, only while anyone is looking. */
  useEffect(() => {
    if (!enabled || live !== 'down') return;

    const tick = () => {
      if (document.visibilityState === 'visible') void readTables();
    };

    const timer = setInterval(tick, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, live, readTables]);

  /*
   * Coming back to the tab.
   *
   * A machine that slept missed every nudge it was sent, and Realtime will
   * happily report itself connected on a socket that stopped delivering. One
   * read on the way back costs nothing and is the difference between a lobby
   * that is right and one that is quietly an hour old.
   */
  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void readTables();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, readTables]);

  return { tables, loadingTables, live, refreshTables };
}
