import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/**
 * Unread messages, per listing, read once for the whole page.
 *
 * ## The crash this replaces
 *
 * The badge used to do its own work: every mount ran a `count` query against
 * `messages` and opened a realtime channel, and **every one of them opened a
 * channel with the same name**, `messages-notifications`. Supabase hands back
 * the existing channel for a repeated name, so the second badge on the page
 * called `.on('postgres_changes', …)` on a channel that had already
 * subscribed, which throws:
 *
 * > cannot add `postgres_changes` callbacks for realtime:messages-notifications
 * > after `subscribe()`
 *
 * That exception escapes into render and the route's error boundary catches
 * it, so **My Listings showed "This page did not load" for anybody with two or
 * more listings for sale.** Observed on the built bundle with eleven listings.
 * It is not a styling problem and it was not introduced by the consistency
 * pass; it was simply never reachable in a fixture holding fewer than two
 * listings.
 *
 * ## And the shape underneath it
 *
 * One count query per badge is one request per listing, which is the per-row
 * pattern that has taken this database down twice. Eleven listings meant eleven
 * requests and eleven realtime channels for a figure that one grouped read
 * answers. `useUnreadByListing` is that one read, plus one channel, and the
 * badge itself is now only a badge.
 */

export interface MessageNotificationBadgeProps {
  /** Unread messages for this listing. Zero draws nothing. */
  count: number;
  className?: string;
}

export function MessageNotificationBadge({ count, className }: MessageNotificationBadgeProps) {
  if (!count) return null;

  return (
    <Badge variant="destructive" className={className}>
      <MessageCircle className="h-3 w-3 mr-1" />
      {count}
    </Badge>
  );
}

/**
 * How many unread messages each of your listings has.
 *
 * One request for all of them, and one realtime channel for the page. The
 * channel name carries the reader's id so two accounts in two tabs do not
 * collide on it, which is the same mistake the old fixed name made one level
 * down.
 *
 * Returns a plain object rather than a Map so a caller can write
 * `unread[listing.id] ?? 0` without a null dance.
 */
export function useUnreadByListing(): Record<string, number> {
  const { user } = useAuth();
  const [unread, setUnread] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user) {
      setUnread({});
      return;
    }
    /*
     * `listing_id` is selected and grouped here rather than asked for once per
     * listing. PostgREST has no GROUP BY, so the grouping happens in JS over
     * the reader's own unread rows, which is a small set by construction: they
     * are the messages nobody has opened yet.
     */
    const { data, error } = await supabase
      .from('messages')
      .select('listing_id')
      .eq('receiver_id', user.id)
      .eq('is_read', false);

    if (error) {
      // Logged rather than swallowed: a failed read and "no unread messages"
      // look identical on screen, and that is how a broken query stays broken.
      console.error('Error loading unread message counts:', error);
      return;
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const id = (row as { listing_id: string | null }).listing_id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    setUnread(counts);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();

    const channel = supabase
      .channel(`messages-unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  return unread;
}
