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
 * `lobby`, and the three discussion writers do the same for the board. So a
 * nudge is emitted by the transaction that made the change, which means it
 * cannot disagree with what a re-read will find.
 *
 * The table nudge carries NO payload worth trusting: it says "tables changed"
 * and the client re-reads `open_game_tables()`. Putting the changed row in the
 * message would let a client's list drift from the database and never notice.
 * A REPLY is the exception and carries the whole post, because a message is
 * complete in itself and re-reading a whole thread to learn one new line is
 * waste. A new topic, a removal and a moderator's decision all change a list's
 * ORDER, which is not complete in itself, so those stay nudges.
 *
 * ---------------------------------------------------------------------------
 * ONE CHANNEL, HOWEVER MANY LISTENERS
 * ---------------------------------------------------------------------------
 * The tables list, the discussion and the header count all want the same
 * nudges. They share one subscription, reference counted, so the page opens one
 * channel rather than three. The same is true of a table: its seats and its talk
 * are one channel, not two. Realtime connections are a metered resource and three
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
import { broadcastBody } from './broadcast.ts';
import { postFromPayload } from './forum.ts';
import type { ForumPost } from './types.ts';

export type LobbyChannelStatus = 'connecting' | 'live' | 'down';

/** How often to re-read while Realtime is not live. Nothing polls when it is. */
export const FALLBACK_POLL_MS = 25_000;

/**
 * Something happened in the discussion.
 *
 * A REPLY carries its whole post, because a message is complete in itself and
 * re-reading a thread to learn one new line is waste. Everything else is a
 * nudge with an id: a new topic, a removal and a moderator's decision all
 * change the ORDER or the contents of a list, and a list is not complete in
 * itself, so the client re-reads rather than patching what it has.
 */
export interface ForumEvent {
  kind: 'topic' | 'reply' | 'removed' | 'topicRemoved' | 'moderated';
  topicId?: number;
  postId?: number;
  post?: ForumPost;
}

/**
 * A broadcast, turned into something the discussion understands.
 *
 * The unwrapping is in `broadcast.ts` and tested there. It is not inlined here
 * because this file opens a Supabase client at import time and so cannot be
 * loaded by a test, and this is the step that decides whether a message is seen
 * at all. It was wrong until 22 Aug 2026 for exactly that reason.
 */
export function toForumEvent(message: unknown): ForumEvent | null {
  const body = broadcastBody(message);
  if (!body) return null;

  const kind = body.kind;
  if (
    kind !== 'topic' &&
    kind !== 'reply' &&
    kind !== 'removed' &&
    kind !== 'topicRemoved' &&
    kind !== 'moderated'
  ) {
    return null;
  }

  return {
    kind,
    topicId: typeof body.topicId === 'number' ? body.topicId : undefined,
    postId: typeof body.postId === 'number' ? body.postId : undefined,
    post: postFromPayload(body.post) ?? undefined,
  };
}

export interface LobbyListener {
  /** Something about the open tables changed. Re-read the list. */
  onTables?: () => void;
  /** Something happened in the open discussion. */
  onForum?: (event: ForumEvent) => void;
  onStatus?: (status: LobbyChannelStatus) => void;
}

/* -------------------------------------------------------------------------- */
/* The shared lobby channel                                                   */
/* -------------------------------------------------------------------------- */

let channel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<LobbyListener>();
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
    .on('broadcast', { event: 'forum' }, message => {
      const event = toForumEvent(message);
      if (!event) return;
      for (const listener of listeners) listener.onForum?.(event);
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
  /**
   * Somebody at the table said something.
   *
   * The same event shape the open board uses, on the table's own topic instead
   * of the lobby's. `may_use_game_topic` grants that topic to exactly the
   * people sitting at the table, so a table's talk is private by the same
   * check that makes its seats private.
   */
  onChat?: (event: ForumEvent) => void;
  onStatus?: (status: LobbyChannelStatus) => void;
}

/**
 * Listen to one table.
 *
 * The topic is `game:<table id>`, which is the same topic the game itself will
 * run on. That is deliberate: the room, the talk and the table are the same
 * conversation at three moments, and `may_use_game_topic` grants exactly that
 * topic to exactly that table's players and nothing else. A table's chat is
 * therefore private by the same check that makes its seats private, with no
 * second rule to keep in step.
 *
 * REFERENCE COUNTED, like the lobby channel and for the same reason. The seat
 * screen listens for seats and the talk beside it listens for messages, and
 * they are the same table. Two subscriptions would be two joins and two metered
 * connections carrying the same events.
 */
const tables = new Map<
  string,
  { channel: ReturnType<typeof supabase.channel>; listeners: Set<TableListener> }
>();

export function subscribeToTable(tableId: string, listener: TableListener): () => void {
  let entry = tables.get(tableId);

  if (!entry) {
    const listeners = new Set<TableListener>();
    const live = supabase.channel(`game:${tableId}`, { config: { private: true } });

    live
      .on('broadcast', { event: 'lobby' }, () => {
        for (const each of listeners) each.onSeats?.();
      })
      .on('broadcast', { event: 'start' }, () => {
        for (const each of listeners) each.onStart?.();
      })
      .on('broadcast', { event: 'chat' }, message => {
        const event = toForumEvent(message);
        if (!event) return;
        for (const each of listeners) each.onChat?.(event);
      })
      .subscribe(state => {
        const next: LobbyChannelStatus =
          state === 'SUBSCRIBED'
            ? 'live'
            : state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED'
              ? 'down'
              : 'connecting';
        if (state === 'SUBSCRIBED' || next === 'down') {
          for (const each of listeners) each.onStatus?.(next);
        }
      });

    entry = { channel: live, listeners };
    tables.set(tableId, entry);
  }

  entry.listeners.add(listener);

  return () => {
    const held = tables.get(tableId);
    if (!held) return;
    held.listeners.delete(listener);
    if (held.listeners.size === 0) {
      tables.delete(tableId);
      void supabase.removeChannel(held.channel);
    }
  };
}
