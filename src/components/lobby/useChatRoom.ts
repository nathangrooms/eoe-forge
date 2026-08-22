/**
 * What a chat room knows, and how it finds out somebody said something.
 *
 * ---------------------------------------------------------------------------
 * A MESSAGE COSTS NOTHING TO RECEIVE
 * ---------------------------------------------------------------------------
 * A message arrives on the lobby's one channel WITH THE POST IN IT and is
 * appended. No read. Ten people talking is ten pushes and zero queries, which
 * is the whole reason this is not a timer. `post_chat_message` sends the same
 * `kind: 'reply'` event on the same `lobby` topic the board already uses, so
 * this listener is the board's listener with a different filter on it.
 *
 * Everything else on that channel changes the ORDER of a list rather than
 * adding to this room, and is ignored here.
 *
 * ---------------------------------------------------------------------------
 * ONE CHANNEL, HOWEVER MANY THINGS ARE LISTENING
 * ---------------------------------------------------------------------------
 * `subscribeToLobby` is reference counted, so the tables list, the header count
 * and this room share one connection. Switching rooms does not open a second
 * one: the channel is per page, the filter is per room.
 *
 * ---------------------------------------------------------------------------
 * A SIGNED-OUT READER OPENS NO CHANNEL AT ALL
 * ---------------------------------------------------------------------------
 * Reading a room needs no account. LISTENING does: the policy on the `lobby`
 * topic is `to authenticated`, so a signed-out client joining it is a refusal,
 * a socket and an error in the console for nothing. A visitor gets the
 * conversation, a fresh read when they come back to the tab, and a line saying
 * plainly that it will not move on its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listChatRooms,
  readChatRoom,
  ROOM_PAGE,
  subscribeToLobby,
  subscribeToRoom,
  type ChatRoom,
  type ForumEvent,
  type ForumPost,
  type LobbyChannelStatus,
} from '@/lib/lobby';

export interface RoomListFeed {
  rooms: ChatRoom[];
  loading: boolean;
  /** Re-read after making a channel or leaving one. Nothing else re-reads it. */
  refresh: () => void;
}

/**
 * Every channel you may see. One query, and only when something changed.
 *
 * The three community rooms come first, then channels people made, and a
 * private channel you are not in is not in the answer at all: the policy on
 * `forum_topics` decides that, not this call, so there is no second rule here
 * that could come to disagree with it.
 */
export function useRooms(enabled = true): RoomListFeed {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    listChatRooms()
      .then(found => {
        if (alive) setRooms(found);
      })
      .catch(error => {
        console.warn('[chat] could not list the rooms:', error);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enabled, round]);

  return { rooms, loading, refresh: () => setRound(count => count + 1) };
}

export interface RoomFeed {
  room: ChatRoom | null;
  /** Oldest first. The column draws them in this order and scrolls to the end. */
  posts: ForumPost[];
  loading: boolean;
  missing: boolean;
  live: LobbyChannelStatus;
  /** True while there may be older messages above the ones on screen. */
  hasEarlier: boolean;
  loadingEarlier: boolean;
  loadEarlier: () => void;
  refresh: () => void;
  /** Put a message on screen now. The echo arrives later and is dropped. */
  remember: (post: ForumPost) => void;
  forget: (id: number) => void;
}

export function useChatRoom(slug: string | null, listen: boolean): RoomFeed {
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [live, setLive] = useState<LobbyChannelStatus>('connecting');
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    try {
      const found = await readChatRoom(slug);
      if (!alive.current) return;
      setRoom(found?.room ?? null);
      setPosts(found?.posts ?? []);
      setMissing(found === null);
      /* A full page back means there is probably more above it. One boolean
         rather than a count, because the count would be a second query to
         answer a question the reader has not asked yet. */
      setHasEarlier((found?.posts.length ?? 0) >= ROOM_PAGE);
    } catch (error) {
      console.warn('[chat] could not read the room:', error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [slug]);

  /* A fresh read on arrival and whenever the room changes. The previous room's
     messages are cleared first, so a slow read never shows one room's
     conversation under another room's name. */
  useEffect(() => {
    setLoading(true);
    setMissing(false);
    setPosts([]);
    setRoom(null);
    setHasEarlier(false);
    void read();
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

  const loadEarlier = useCallback(() => {
    if (!slug || loadingEarlier || posts.length === 0) return;
    setLoadingEarlier(true);
    void readChatRoom(slug, ROOM_PAGE, posts[0].id)
      .then(older => {
        if (!alive.current || !older) return;
        setHasEarlier(older.posts.length >= ROOM_PAGE);
        setPosts(current => {
          const known = new Set(current.map(post => post.id));
          return [...older.posts.filter(post => !known.has(post.id)), ...current];
        });
      })
      .catch(error => console.warn('[chat] could not read earlier messages:', error))
      .finally(() => {
        if (alive.current) setLoadingEarlier(false);
      });
  }, [slug, loadingEarlier, posts]);

  /*
   * ONE subscription for the room that is open, and which one depends on
   * whether it is private.
   *
   * An OPEN channel's messages ride the lobby's single reference-counted
   * channel, which is why the whole page is one connection. A PRIVATE one
   * cannot: the policy on the `lobby` topic is `to authenticated`, so every
   * signed-in account can listen to it, and putting a private message on it
   * would hand the words to everybody while the door stayed locked. So a
   * private channel gets `room:<id>`, which `may_use_room_topic` grants to
   * exactly its members.
   *
   * Either way it is one subscription, and only for the channel on screen.
   */
  useEffect(() => {
    if (!listen || !slug || !room) return;

    const heard = (event: ForumEvent) => {
      if (event.kind === 'reply' && event.post) {
        if (event.post.topicId !== room.id) return;
        remember(event.post);
        return;
      }
      if (event.kind === 'removed' && typeof event.postId === 'number') {
        forget(event.postId);
      }
      /* A new topic or a moderator's decision reorders the BOARD. It does not
         change what was said in this room, so it is not a reason to re-read
         sixty messages. */
    };

    if (room.private) {
      return subscribeToRoom(room.id, { onChat: heard, onStatus: setLive });
    }
    return subscribeToLobby({ onForum: heard, onStatus: setLive });
  }, [listen, slug, room, remember, forget]);

  /* Coming back to the tab. A machine that slept missed every push it was sent,
     and Realtime will happily report itself connected on a socket that stopped
     delivering. */
  useEffect(() => {
    if (!slug) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [slug, read]);

  return {
    room,
    posts,
    loading,
    missing,
    live,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
    refresh: () => void read(),
    remember,
    forget,
  };
}
