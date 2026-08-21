/**
 * How the lobby finds out something changed.
 *
 * ---------------------------------------------------------------------------
 * REALTIME, NOT POLLING
 * ---------------------------------------------------------------------------
 * A lobby list that refreshes on a timer is a query per open tab per interval,
 * forever, including every tab nobody is looking at. This project has already
 * taken the database down twice with repeated reads, so the lobby is pushed to
 * instead of pulled from.
 *
 * The push comes from the database itself. Statement-level triggers on
 * `game_tables` and `game_participants` call `realtime.send` on the topic
 * `lobby`, and `post_lobby_message` does the same for chat. So a nudge is
 * emitted by the transaction that made the change, which means it cannot
 * disagree with what a re-read will find.
 *
 * The table nudge carries NO payload worth trusting: it says "tables changed"
 * and the client re-reads `open_game_tables()`. Putting the changed row in the
 * message would let a client's list drift from the database and never notice.
 * Chat is the exception and carries the whole post, because a message is
 * complete in itself and re-reading sixty rows to learn one new line is waste.
 *
 * ---------------------------------------------------------------------------
 * ONE CHANNEL, HOWEVER MANY LISTENERS
 * ---------------------------------------------------------------------------
 * The tables list, the chat and the header count all want the same nudges.
 * They share one subscription, reference counted, so the page opens one channel
 * rather than three. Realtime connections are a metered resource and three
 * channels for one page is three times the join cost for no extra information.
 *
 * ---------------------------------------------------------------------------
 * THE FALLBACK, AND ITS INTERVAL
 * ---------------------------------------------------------------------------
 * `private: true` gates the channel on RLS over `realtime.messages`, and that
 * requires "Allow public access" to be off in the project's Realtime settings.
 * If the join fails for that or any other reason, a lobby that silently stops
 * updating is worse than one that is slow, so the subscriber reports its state
 * and the page falls back to re-reading every 25 seconds while it is not live.
 *
 * 25 seconds is a judgement: long enough that a handful of stuck tabs is a
 * trickle rather than load, short enough that a table you can see is probably
 * still there. It runs ONLY while Realtime is down, and only while the tab is
 * visible.
 */

import { supabase } from '@/integrations/supabase/client';
import type { LobbyPost } from './types.ts';

export type LobbyChannelStatus = 'connecting' | 'live' | 'down';

/** How often to re-read while Realtime is not live. Nothing polls when it is. */
export const FALLBACK_POLL_MS = 25_000;

export interface LobbyListener {
  /** Something about the open tables changed. Re-read the list. */
  onTables?: () => void;
  /** Somebody said something. The whole post is here. */
  onChat?: (post: LobbyPost) => void;
  onStatus?: (status: LobbyChannelStatus) => void;
}

interface ChatPayload {
  id: number;
  userId: string;
  name: string;
  body: string;
  tableCode: string | null;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* The shared lobby channel                                                   */
/* -------------------------------------------------------------------------- */

let channel: ReturnType<typeof supabase.channel> | null = null;
let listeners = new Set<LobbyListener>();
let status: LobbyChannelStatus = 'connecting';

function announce(next: LobbyChannelStatus): void {
  status = next;
  for (const listener of listeners) listener.onStatus?.(next);
}

function open(): void {
  if (channel) return;

  const live = supabase.channel('lobby', { config: { private: true } });

  live
    .on('broadcast', { event: 'tables' }, () => {
      for (const listener of listeners) listener.onTables?.();
    })
    .on('broadcast', { event: 'chat' }, message => {
      const body = (message as { payload?: { payload?: ChatPayload } }).payload?.payload;
      if (!body || typeof body.id !== 'number') return;
      const post: LobbyPost = {
        id: body.id,
        userId: body.userId,
        name: body.name,
        body: body.body,
        tableCode: body.tableCode ?? null,
        createdAt: body.createdAt,
      };
      for (const listener of listeners) listener.onChat?.(post);
    })
    .subscribe(state => {
      if (state === 'SUBSCRIBED') announce('live');
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        announce('down');
      }
    });

  channel = live;
}

function close(): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
  channel = null;
  status = 'connecting';
}

/**
 * Listen to the lobby. Returns the function that stops listening.
 *
 * The channel opens on the first listener and closes on the last, so a page
 * that mounts three of these still holds one connection and leaves none behind.
 */
export function subscribeToLobby(listener: LobbyListener): () => void {
  listeners.add(listener);
  open();
  listener.onStatus?.(status);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) close();
  };
}

/* -------------------------------------------------------------------------- */
/* One table's channel                                                        */
/* -------------------------------------------------------------------------- */

export interface TableListener {
  /** A seat changed: somebody joined, left, picked a deck or readied up. */
  onSeats?: () => void;
  /** The host started the game. */
  onStart?: () => void;
  onStatus?: (status: LobbyChannelStatus) => void;
}

/**
 * Listen to one table's room.
 *
 * The topic is `game:<table id>`, which is the same topic the game itself will
 * run on. That is deliberate: the room and the table are the same conversation
 * at two moments, and `may_use_game_topic` grants exactly that topic to exactly
 * that table's players and nothing else.
 *
 * This one is not shared, because a page is only ever in one room.
 */
export function subscribeToTable(tableId: string, listener: TableListener): () => void {
  const live = supabase.channel(`game:${tableId}`, { config: { private: true } });

  live
    .on('broadcast', { event: 'lobby' }, () => listener.onSeats?.())
    .on('broadcast', { event: 'start' }, () => listener.onStart?.())
    .subscribe(state => {
      if (state === 'SUBSCRIBED') listener.onStatus?.('live');
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        listener.onStatus?.('down');
      }
    });

  return () => {
    void supabase.removeChannel(live);
  };
}
