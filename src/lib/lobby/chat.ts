/**
 * The open discussion.
 *
 * One room, everyone in it, newest at the bottom. A forum thread, not a chat
 * product: no rooms, no threads, no direct messages, no typing indicators. The
 * job is to let somebody say "anyone up for a four player game" and let
 * somebody else answer.
 *
 * Reads come straight off `lobby_posts`, which is one query with an index on
 * `created_at desc`. Writes go through `post_lobby_message`, because a client
 * that could insert directly could post under any name it liked, including
 * somebody else's, and would sidestep the rate limit on the way past.
 *
 * Posts are kept for 24 hours and then swept. A lobby message is about right
 * now, and a permanent public record of them is a moderation job this project
 * has not signed up for.
 */

import { supabase } from '@/integrations/supabase/client';
import type { LobbyPost } from './types.ts';

/** How many messages the room shows. Older ones are gone rather than paged. */
export const LOBBY_HISTORY = 60;

interface PostRow {
  id: number;
  user_id: string;
  display_name: string;
  body: string;
  table_code: string | null;
  created_at: string;
}

function toPost(row: PostRow): LobbyPost {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.display_name,
    body: row.body,
    tableCode: row.table_code,
    createdAt: row.created_at,
  };
}

/** The last hour or so of the room, oldest first so it reads downwards. */
export async function readLobbyPosts(limit = LOBBY_HISTORY): Promise<LobbyPost[]> {
  const { data, error } = await supabase
    .from('lobby_posts' as never)
    .select('id, user_id, display_name, body, table_code, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as PostRow[]).map(toPost).reverse();
}

/**
 * Say something.
 *
 * `tableCode` attaches the message to a table, so "anyone want a fourth" can
 * carry the way in rather than asking somebody to go and find it.
 */
export async function postLobbyMessage(
  body: string,
  displayName?: string | null,
  tableCode?: string | null
): Promise<LobbyPost> {
  const { data, error } = await supabase.rpc('post_lobby_message' as any, {
    p_body: body,
    p_display_name: displayName ?? null,
    p_table_code: tableCode ?? null,
  });
  if (error) throw error;
  return toPost(data as unknown as PostRow);
}

/** Take back something you said. Scoped to your own posts by RLS. */
export async function deleteLobbyPost(id: number): Promise<void> {
  const { error } = await supabase
    .from('lobby_posts' as never)
    .delete()
    .eq('id', id);
  if (error) throw error;
}
