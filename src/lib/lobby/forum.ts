/**
 * The discussion: every call it makes to the database, in one file.
 *
 * ---------------------------------------------------------------------------
 * ONE SET OF CALLS FOR BOTH PLACES
 * ---------------------------------------------------------------------------
 * There are two places people talk. The open board, which anybody can read, and
 * a table's own talk, which only the people sitting at it can read. They are
 * NOT two features. They are the same topic-and-replies with a different scope,
 * so they share these functions, they share `DiscussionThread`, and they share
 * the renderer that makes a stranger's words safe.
 *
 * The only two differences are in the database, where they belong: who the
 * policy lets read, and which Realtime topic the nudge goes out on.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH SCREEN COSTS
 * ---------------------------------------------------------------------------
 *   the board list   one indexed select on `forum_topics`, no joins at all
 *   a thread         one call to `read_forum_thread`, topic and posts together
 *   a table's talk   the same call, by table id
 *
 * The reply count and the name of whoever spoke last are kept on the topic row
 * by a trigger, so the list never asks a question per row. CLAUDE.md records
 * two outages and a disk IO warning from exactly that mistake, one of them 421
 * requests on a single page visit.
 *
 * ---------------------------------------------------------------------------
 * NOTHING WRITES DIRECTLY
 * ---------------------------------------------------------------------------
 * `authenticated` holds no INSERT, UPDATE or DELETE on either table. Every
 * write here is an RPC that checks who you are, whether you are blocked, and
 * how fast you are going, before it writes anything. A client that could insert
 * could post under somebody else's name and walk past the rate limit doing it.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ForumPost, ForumThread, ForumTopic } from './types.ts';

/** How many topics the board shows before somebody asks for more. */
export const BOARD_PAGE = 30;

/** How many posts a thread draws. Long threads are rare and this is generous. */
export const THREAD_LIMIT = 200;

/*
 * `as never` on a table or RPC name is this project's existing pattern for
 * something `src/integrations/supabase/types.ts` has not been regenerated for.
 * `src/lib/play/playmats.ts` and `src/lib/lobby/tables.ts` both do it.
 */

/* -------------------------------------------------------------------------- */
/* Shapes as Postgres hands them over                                         */
/* -------------------------------------------------------------------------- */

interface TopicRow {
  id: number;
  scope: 'board' | 'table';
  table_id: string | null;
  title: string | null;
  author_id: string | null;
  author_name: string;
  table_code: string | null;
  created_at: string;
  last_post_at: string;
  last_post_name: string | null;
  post_count: number;
  pinned: boolean;
  locked: boolean;
  removed_at: string | null;
  private: boolean | null;
}

interface PostRow {
  id: number;
  topic_id: number;
  scope: 'board' | 'table';
  table_id: string | null;
  user_id: string | null;
  display_name: string;
  body: string | null;
  table_code: string | null;
  created_at: string;
  removed_at: string | null;
  report_count: number;
}

function toTopic(row: TopicRow): ForumTopic {
  return {
    id: row.id,
    scope: row.scope,
    tableId: row.table_id,
    title: row.title,
    authorId: row.author_id,
    authorName: row.author_name,
    tableCode: row.table_code,
    createdAt: row.created_at,
    lastPostAt: row.last_post_at,
    lastPostName: row.last_post_name,
    postCount: row.post_count,
    pinned: row.pinned,
    locked: row.locked,
    removed: row.removed_at !== null,
    /* A thread is never private: the check constraint on `forum_topics` says a
       private topic has to be a room. It travels anyway, so nothing downstream
       has to know which kind of topic it is holding. */
    private: row.private === true,
  };
}

function toPost(row: PostRow): ForumPost {
  return {
    id: row.id,
    topicId: row.topic_id,
    scope: row.scope,
    tableId: row.table_id,
    userId: row.user_id,
    name: row.display_name,
    /* A removed post has no words. The database nulls the column rather than
       hiding it behind a policy, so there is nothing here to leak. */
    body: row.body,
    tableCode: row.table_code,
    createdAt: row.created_at,
    removed: row.removed_at !== null,
    reportCount: row.report_count,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The board, newest conversation first, pinned ones above it.
 *
 * A plain select, not an RPC, because the two SELECT policies on the table are
 * already the whole answer to "what may this person see" and a function would
 * be a second answer that could come to disagree with the first. A signed-out
 * visitor runs the identical query and the policy hands them the board.
 */
export async function readBoard(limit = BOARD_PAGE): Promise<ForumTopic[]> {
  const { data, error } = await supabase
    .from('forum_topics' as never)
    .select(
      'id, scope, table_id, title, author_id, author_name, table_code, created_at, last_post_at, last_post_name, post_count, pinned, locked, removed_at, private'
    )
    .eq('scope', 'board')
    /* Threads only. A room is a topic too, but it is a PLACE rather than a
       conversation somebody started, and a list sorted by who spoke last is
       not where it belongs. `chat.ts` reads those. */
    .eq('kind', 'thread')
    .is('removed_at', null)
    .order('pinned', { ascending: false })
    .order('last_post_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as TopicRow[]).map(toTopic);
}

/**
 * One conversation, whole, in one round trip.
 *
 * Ask by `topicId` for a board thread, or by `tableId` for a table's talk. The
 * seat screen uses the second and never has to learn that a topic id exists.
 * Null means there is nothing there, or nothing there FOR YOU, and the two are
 * deliberately the same answer: a private table does not confirm its own
 * existence to somebody who is not sitting at it.
 */
export async function readThread(
  where: { topicId?: number | null; tableId?: string | null },
  limit = THREAD_LIMIT
): Promise<ForumThread | null> {
  const { data, error } = await supabase.rpc('read_forum_thread' as never, {
    p_topic: where.topicId ?? null,
    p_table: where.tableId ?? null,
    p_limit: limit,
  } as never);

  if (error) throw error;
  if (!data) return null;

  const payload = data as unknown as { topic: TopicRow; posts: PostRow[] };
  return {
    topic: toTopic(payload.topic),
    posts: (payload.posts ?? []).map(toPost),
  };
}

/* -------------------------------------------------------------------------- */
/* Saying something                                                           */
/* -------------------------------------------------------------------------- */

/** Start a conversation on the open board. */
export async function startTopic(
  title: string,
  body: string,
  displayName?: string | null,
  tableCode?: string | null
): Promise<ForumThread> {
  const { data, error } = await supabase.rpc('start_forum_topic' as never, {
    p_title: title,
    p_body: body,
    p_display_name: displayName ?? null,
    p_table_code: tableCode ?? null,
  } as never);

  if (error) throw error;
  const payload = data as unknown as { topic: TopicRow; post: PostRow };
  return { topic: toTopic(payload.topic), posts: [toPost(payload.post)] };
}

/** Reply, on the board or at a table. Same call, the topic knows which. */
export async function replyToTopic(
  topicId: number,
  body: string,
  displayName?: string | null,
  tableCode?: string | null
): Promise<ForumPost> {
  const { data, error } = await supabase.rpc('post_forum_reply' as never, {
    p_topic: topicId,
    p_body: body,
    p_display_name: displayName ?? null,
    p_table_code: tableCode ?? null,
  } as never);

  if (error) throw error;
  return toPost(data as unknown as PostRow);
}

/**
 * Say something at the table you are sitting at.
 *
 * Makes the conversation on the first message, so nothing has to create a room
 * before there is anything to say in it, and so the seat screen never holds a
 * topic id it did not need.
 */
export async function sayAtTable(
  tableId: string,
  body: string,
  displayName?: string | null
): Promise<ForumPost> {
  const { data, error } = await supabase.rpc('post_table_message' as never, {
    p_table: tableId,
    p_body: body,
    p_display_name: displayName ?? null,
  } as never);

  if (error) throw error;
  return toPost(data as unknown as PostRow);
}

/* -------------------------------------------------------------------------- */
/* Taking things down                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Remove a post. Yours, or anybody's if you moderate.
 *
 * The words are deleted, not hidden. The row stays so the reply written
 * underneath it still makes sense, and the space says "removed".
 */
export async function removePost(id: number): Promise<void> {
  const { error } = await supabase.rpc('remove_forum_post' as never, { p_post: id } as never);
  if (error) throw error;
}

/** Remove a whole conversation. Yours while it is still only yours. */
export async function removeTopic(id: number): Promise<void> {
  const { error } = await supabase.rpc('remove_forum_topic' as never, { p_topic: id } as never);
  if (error) throw error;
}

/** Tell the owner about something. One report per person per post. */
export async function reportPost(id: number, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc('report_forum_post' as never, {
    p_post: id,
    p_reason: reason ?? null,
  } as never);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Moderating                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Stop somebody posting, and optionally clear what they already wrote.
 *
 * Returns how many posts were cleared, so the person doing it is told what
 * happened rather than having to go and look.
 */
export async function blockPoster(
  userId: string,
  reason?: string | null,
  wipe = false
): Promise<number> {
  const { data, error } = await supabase.rpc('block_forum_poster' as never, {
    p_user: userId,
    p_reason: reason ?? null,
    p_wipe: wipe,
  } as never);
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function unblockPoster(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_forum_poster' as never, {
    p_user: userId,
  } as never);
  if (error) throw error;
}

/** Pin something worth keeping at the top, or close a conversation. */
export async function setTopicFlags(
  topicId: number,
  flags: { pinned?: boolean; locked?: boolean }
): Promise<void> {
  const { error } = await supabase.rpc('set_forum_topic_flags' as never, {
    p_topic: topicId,
    p_pinned: flags.pinned ?? null,
    p_locked: flags.locked ?? null,
  } as never);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* What arrives over the channel                                              */
/* -------------------------------------------------------------------------- */

/**
 * A post as the database pushed it, turned into the shape the screen uses.
 *
 * A reply carries its whole self on the channel, because a message is complete
 * in itself and re-reading a two hundred post thread to learn one new line is
 * waste. Everything else on the channel is a nudge with an id, and the client
 * re-reads, because a list's ORDER is not complete in itself.
 *
 * Returns null on anything that does not look like a post, so a malformed or
 * forged payload lands nowhere. Nothing on the `lobby` topic can be spoken by a
 * client, but a check here costs nothing and the alternative is trusting the
 * transport.
 */
export function postFromPayload(value: unknown): ForumPost | null {
  const row = value as PostRow | null | undefined;
  if (!row || typeof row.id !== 'number' || typeof row.topic_id !== 'number') return null;
  if (typeof row.display_name !== 'string' || typeof row.created_at !== 'string') return null;
  return toPost(row);
}
