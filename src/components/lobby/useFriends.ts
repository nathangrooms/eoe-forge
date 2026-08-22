/**
 * What the friends list knows, and how it finds out something changed.
 *
 * ---------------------------------------------------------------------------
 * ONE QUERY, ONE SUBSCRIPTION, HOWEVER MANY THINGS ARE ASKING
 * ---------------------------------------------------------------------------
 * The strip at the top of the play page and the panel on the lobby are the same
 * list about the same account, so they share one React Query key and one
 * reference-counted Realtime channel. Two mounts is one read and one connection.
 *
 * The read is `my_friends()`, which is a single statement returning everything
 * the panel draws: who they are, whether they are around, what they play, and
 * whether they have a table invitation waiting for you. There is no second
 * query per friend anywhere in this file, and there must never be one.
 * CLAUDE.md records two outages from that shape.
 *
 * ---------------------------------------------------------------------------
 * A NUDGE CARRIES NOTHING
 * ---------------------------------------------------------------------------
 * `user:<your id>` says "something about your friends changed" and no more, and
 * this re-reads. A message carrying the changed row would let the list drift
 * from the database and never notice, and the list is one query, so re-reading
 * costs one query. That is the same decision the tables list already made.
 *
 * ---------------------------------------------------------------------------
 * COMING BACK TO THE TAB
 * ---------------------------------------------------------------------------
 * A machine that slept missed every push it was sent, and Realtime will report
 * itself connected on a socket that stopped delivering. So becoming visible is
 * a re-read, the same way the chat room already handles it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  listFriends,
  readSharing,
  subscribeToMe,
  writeSharing,
  type Friend,
  type LobbyChannelStatus,
  type Sharing,
} from '@/lib/lobby';

/** One stable empty list, so "no friends yet" is not a new value every render. */
const NO_FRIENDS: Friend[] = [];

export function friendsKey(userId: string | null | undefined): unknown[] {
  return ['friends', userId ?? null];
}

export function sharingKey(userId: string | null | undefined): unknown[] {
  return ['friend-sharing', userId ?? null];
}

export interface FriendsFeed {
  friends: Friend[];
  loading: boolean;
  live: LobbyChannelStatus;
  refresh: () => void;
}

export function useFriends(userId: string | null | undefined): FriendsFeed {
  const client = useQueryClient();
  const [live, setLive] = useState<LobbyChannelStatus>('connecting');

  const query = useQuery({
    queryKey: friendsKey(userId),
    queryFn: listFriends,
    enabled: Boolean(userId),
    /* Long enough that walking between the play flow and the lobby re-reads
       nothing, short enough that a stale list self-corrects if a push is lost.
       Nothing polls: this is a staleness rule, not a timer. */
    staleTime: 30_000,
  });

  const refresh = useCallback(() => {
    if (!userId) return;
    void client.invalidateQueries({ queryKey: friendsKey(userId) });
  }, [client, userId]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToMe(userId, {
      onFriends: refresh,
      onStatus: setLive,
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refresh]);

  return {
    friends: query.data ?? NO_FRIENDS,
    loading: Boolean(userId) && query.isLoading,
    live,
    refresh,
  };
}

/* -------------------------------------------------------------------------- */
/* Your own three switches                                                    */
/* -------------------------------------------------------------------------- */

export interface SharingFeed {
  sharing: Sharing;
  loading: boolean;
  saving: boolean;
  error: string | null;
  set: (next: Sharing) => Promise<void>;
}

/**
 * What you share, read once.
 *
 * `my_sharing()` never writes. An account that has never touched the switches
 * has no row, and it gets the defaults rather than one being created for it,
 * so opening the play page is not a write.
 */
export function useSharing(userId: string | null | undefined): SharingFeed {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query: UseQueryResult<Sharing> = useQuery({
    queryKey: sharingKey(userId),
    queryFn: readSharing,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });

  const set = useCallback(
    async (next: Sharing) => {
      setSaving(true);
      setError(null);
      try {
        const saved = await writeSharing(next);
        client.setQueryData(sharingKey(userId), saved);
        /* Turning a switch changes what YOUR friends see about you, and it also
           changes what this screen may show about them if they did the same, so
           the list is re-read rather than left carrying the old answer. */
        void client.invalidateQueries({ queryKey: friendsKey(userId) });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That did not save.');
      } finally {
        setSaving(false);
      }
    },
    [client, userId]
  );

  return {
    sharing: query.data ?? { decks: true, collection: false, activity: true },
    loading: Boolean(userId) && query.isLoading,
    saving,
    error,
    set,
  };
}
