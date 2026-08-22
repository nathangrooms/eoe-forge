/**
 * What the discussion knows, and how it finds out it changed.
 *
 * ---------------------------------------------------------------------------
 * ONE READ PER SCREEN, AND NO QUERY PER MESSAGE
 * ---------------------------------------------------------------------------
 *   the board       one indexed select on `forum_topics`, no joins
 *   a thread        one call to `read_forum_thread`, topic and posts together
 *   a table's talk  the same call, by table id
 *
 * Nothing in here loops over topics to fill a field in. The reply count and the
 * name of whoever spoke last live on the topic row, put there by a trigger at
 * write time. CLAUDE.md records two outages and a disk IO warning from per-row
 * reads, one of them 421 requests on a single page visit, and a discussion is
 * the surface most likely to repeat it.
 *
 * ---------------------------------------------------------------------------
 * A REPLY COSTS NOTHING TO RECEIVE
 * ---------------------------------------------------------------------------
 * A new reply arrives on the channel WITH THE POST IN IT and is appended. No
 * read. Ten people talking in a room is then ten pushes and zero queries, which
 * is the whole reason this is not polling.
 *
 * Everything else is a nudge with an id, because everything else changes the
 * ORDER or the membership of a list, and a list is not complete in itself.
 * Those re-read, and the re-reads are coalesced on the same 300 ms window the
 * table list uses, because one moderator action fires several.
 *
 * ---------------------------------------------------------------------------
 * NOTHING POLLS
 * ---------------------------------------------------------------------------
 * There is no timer in this file. The board shares the lobby's one channel and
 * a table's talk shares that table's one channel, both reference counted, so a
 * page listening for seats and messages holds one connection and not two.
 *
 * ---------------------------------------------------------------------------
 * A SIGNED-OUT READER OPENS NO CHANNEL AT ALL
 * ---------------------------------------------------------------------------
 * Reading the board needs no account. LISTENING to it does: the policy on the
 * `lobby` topic is `to authenticated`, so a signed-out client joining it is a
 * refusal, and one refused join per anonymous visitor is a socket, a round trip
 * and an error in the console for nothing.
 *
 * So `listen` is separate from `enabled`. A visitor with no account gets the
 * conversation, one read when they come back to the tab, and a line on screen
 * saying plainly that it will not move on its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readBoard,
  readThread,
  subscribeToLobby,
  subscribeToTable,
  type ForumEvent,
  type ForumPost,
  type ForumTopic,
  type LobbyChannelStatus,
} from '@/lib/lobby';
import { NUDGE_COALESCE_MS } from './useLobbyFeed';

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

export interface BoardFeed {
  topics: ForumTopic[];
  loading: boolean;
  live: LobbyChannelStatus;
  refresh: () => void;
}

export function useBoard(enabled: boolean, listen: boolean): BoardFeed {
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const rows = await readBoard();
      if (alive.current) setTopics(rows);
    } catch (error) {
      /* A failed refresh keeps what is already on screen. Blanking it turns one
         dropped request into an empty board. */
      console.warn('[discussion] could not read the board:', error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  const scheduleRead = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void read();
    }, NUDGE_COALESCE_MS);
  }, [read]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void read();
  }, [enabled, read]);

  useEffect(() => {
    if (!enabled || !listen) return;
    return subscribeToLobby({
      /* Every kind of event reorders the board, including a reply, because the
         board is sorted by when somebody last spoke. */
      onForum: scheduleRead,
      onStatus: setLive,
    });
  }, [enabled, listen, scheduleRead]);

  /*
   * Coming back to the tab. A machine that slept missed every nudge it was
   * sent, and Realtime will happily report itself connected on a socket that
   * stopped delivering.
   */
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, read]);

  return { topics, loading, live, refresh: () => void read() };
}

/* -------------------------------------------------------------------------- */
/* One conversation                                                           */
/* -------------------------------------------------------------------------- */

export interface ThreadWhere {
  /** A conversation on the open board. */
  topicId?: number | null;
  /** A table's own talk. The seat screen never learns the topic id. */
  tableId?: string | null;
}

export interface ThreadFeed {
  topic: ForumTopic | null;
  posts: ForumPost[];
  loading: boolean;
  /** True when the read came back with nothing, which includes "not for you". */
  missing: boolean;
  live: LobbyChannelStatus;
  refresh: () => void;
  /** Put a post on screen without waiting for the echo. Duplicates are dropped. */
  remember: (post: ForumPost) => void;
  /** Mark a post as taken down straight away, so Remove feels like removing. */
  forget: (id: number) => void;
}

export function useThread(where: ThreadWhere, enabled: boolean, listen = true): ThreadFeed {
  const { topicId = null, tableId = null } = where;

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
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
    if (!enabled || (topicId === null && tableId === null)) {
      setLoading(false);
      return;
    }
    try {
      const thread = await readThread({ topicId, tableId });
      if (!alive.current) return;
      setTopic(thread?.topic ?? null);
      setPosts(thread?.posts ?? []);
      setMissing(thread === null);
    } catch (error) {
      console.warn('[discussion] could not read the conversation:', error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [enabled, topicId, tableId]);

  const scheduleRead = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void read();
    }, NUDGE_COALESCE_MS);
  }, [read]);

  const remember = useCallback((post: ForumPost) => {
    setPosts(current =>
      current.some(existing => existing.id === post.id) ? current : [...current, post]
    );
  }, []);

  const forget = useCallback((id: number) => {
    setPosts(current =>
      current.map(post => (post.id === id ? { ...post, body: null, removed: true } : post))
    );
  }, []);

  /* The first read, and a fresh one whenever the conversation changes. */
  useEffect(() => {
    setLoading(true);
    setMissing(false);
    setPosts([]);
    setTopic(null);
    void read();
  }, [read]);

  /**
   * What a pushed event means here.
   *
   * A reply carries its post and is appended, which is the case that has to be
   * free. A removal is applied in place. Anything else re-reads, because it
   * changed something about the conversation rather than adding to it.
   */
  const apply = useCallback(
    (event: ForumEvent, mine: number | null) => {
      if (event.kind === 'reply' && event.post) {
        if (mine !== null && event.post.topicId !== mine) return;
        remember(event.post);
        return;
      }
      if (event.kind === 'removed' && typeof event.postId === 'number') {
        if (mine !== null && event.topicId !== undefined && event.topicId !== mine) return;
        forget(event.postId);
        return;
      }
      if (mine !== null && event.topicId !== undefined && event.topicId !== mine) return;
      scheduleRead();
    },
    [remember, forget, scheduleRead]
  );

  /* A board conversation listens on the lobby's one channel, and only when
     there is an account to listen with. See the note at the top. */
  useEffect(() => {
    if (!enabled || !listen || topicId === null) return;
    return subscribeToLobby({
      onForum: event => apply(event, topicId),
      onStatus: setLive,
    });
  }, [enabled, listen, topicId, apply]);

  /*
   * A table's talk listens on that table's one channel, the same one the seats
   * use. The Realtime policy on `game:<id>` is membership, so joining before
   * there is a seat is a refusal, which is why the seat screen only enables
   * this once somebody is sitting down.
   */
  useEffect(() => {
    if (!enabled || !listen || !tableId) return;
    return subscribeToTable(tableId, {
      onChat: event => apply(event, null),
      onStatus: setLive,
    });
  }, [enabled, listen, tableId, apply]);

  return {
    topic,
    posts,
    loading,
    missing,
    live,
    refresh: () => void read(),
    remember,
    forget,
  };
}
