/**
 * The chat rooms: three calls, and no new table behind any of them.
 *
 * ---------------------------------------------------------------------------
 * A ROOM IS A TOPIC. A MESSAGE IS A POST.
 * ---------------------------------------------------------------------------
 * Owner: *"conversation lobby should be more like chat box"*. A chat box is
 * newest at the bottom, one column, type at the bottom, enter sends, and
 * messages arriving without a refresh.
 *
 * None of that needed a second messages table, and adding one was ruled out
 * before this was written. A room is a row in `forum_topics` with
 * `kind = 'room'` and a slug. Its messages are ordinary `forum_posts`. So
 * removal, blocking, reporting, the read policies, the Realtime topic, the
 * event shape and the counters on the topic row are all the same code they were
 * yesterday, with nothing to keep in step.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH CALL COSTS
 * ---------------------------------------------------------------------------
 *   the channel list   one indexed select, no joins, three rows or thirty
 *   a room             one call to `read_chat_room`, the room and its tail
 *   saying something   one call, one insert, one push
 *
 * Nothing here loops and nothing asks a question per message. CLAUDE.md records
 * two outages from exactly that, one of them 421 requests on a single page.
 *
 * ---------------------------------------------------------------------------
 * READING THE TAIL, NOT THE START
 * ---------------------------------------------------------------------------
 * `readThread` returns a conversation from its FIRST post, which is right for a
 * thread somebody opened on purpose. A room is read from its LAST, because the
 * thing you want when you walk into a room is what was just said. So this has
 * its own read, and `before` walks backwards for "load earlier" so a busy room
 * is never fetched whole.
 *
 * ---------------------------------------------------------------------------
 * NOTHING WRITES DIRECTLY
 * ---------------------------------------------------------------------------
 * `authenticated` holds no INSERT on `forum_posts`. Sending a message is an RPC
 * that checks who you are, whether you are blocked and how fast you are going
 * before it writes. The rate limit is in the database, not on the button.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ChatRoom, ChatRoomMember, ForumPost } from './types.ts';

/** How many messages a room opens with. Enough to see a conversation. */
export const ROOM_PAGE = 60;

/*
 * `as never` on an RPC name is this project's existing pattern for something
 * `src/integrations/supabase/types.ts` has not been regenerated for.
 * `src/lib/lobby/forum.ts` and `src/lib/lobby/tables.ts` both do it.
 */

interface RoomRow {
  id: number;
  kind: string;
  slug: string | null;
  scope: 'board' | 'table';
  title: string | null;
  author_id: string | null;
  author_name: string;
  table_id: string | null;
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

function toRoom(row: RoomRow): ChatRoom {
  return {
    id: row.id,
    slug: row.slug ?? '',
    title: row.title ?? '',
    scope: row.scope,
    tableId: row.table_id,
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
    body: row.body,
    tableCode: row.table_code,
    createdAt: row.created_at,
    removed: row.removed_at !== null,
    reportCount: row.report_count,
  };
}

/** Every open room, in the order they were made. One query. */
export async function listChatRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase.rpc('list_chat_rooms' as never);
  if (error) throw error;
  return ((data ?? []) as unknown as RoomRow[]).map(toRoom);
}

export interface ChatWindow {
  room: ChatRoom;
  /** Oldest first, which is the order they are drawn in. */
  posts: ForumPost[];
}

/**
 * One room and the last `limit` things said in it.
 *
 * `before` is a message id: everything older than it, for walking back up.
 * Null means there is no such room, which for a signed-out reader is the same
 * answer as "not for you" on purpose.
 */
export async function readChatRoom(
  slug: string,
  limit = ROOM_PAGE,
  before?: number | null
): Promise<ChatWindow | null> {
  const { data, error } = await supabase.rpc('read_chat_room' as never, {
    p_slug: slug,
    p_limit: limit,
    p_before: before ?? null,
  } as never);

  if (error) throw error;
  if (!data) return null;

  const payload = data as unknown as { topic: RoomRow; posts: PostRow[] };
  return { room: toRoom(payload.topic), posts: (payload.posts ?? []).map(toPost) };
}

/** Say something in a room. The room must already exist. */
export async function sayInRoom(
  slug: string,
  body: string,
  displayName?: string | null,
  tableCode?: string | null
): Promise<ForumPost> {
  const { data, error } = await supabase.rpc('post_chat_message' as never, {
    p_slug: slug,
    p_body: body,
    p_display_name: displayName ?? null,
    p_table_code: tableCode ?? null,
  } as never);

  if (error) throw error;
  return toPost(data as unknown as PostRow);
}

/* -------------------------------------------------------------------------- */
/* Channels people make                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Make a channel.
 *
 * OPEN means anybody can read it, signed out included, and an account can post
 * in it. That is the same rule the three community rooms carry, because a
 * community channel behind a sign-up is not a community.
 *
 * PRIVATE means only its members can read a word of it, post in it, or see that
 * it is there at all. Its maker adds people, and may only add people who are
 * already their friends, so a private channel cannot be used to put words in
 * front of a stranger who never agreed to hear them.
 *
 * The name becomes the address: "Deck help" is `deck-help`, and the database
 * refuses a name that is already taken. Five a day per account.
 */
export async function createRoom(title: string, isPrivate: boolean): Promise<ChatRoom> {
  const { data, error } = await supabase.rpc('create_chat_room' as never, {
    p_title: title,
    p_private: isPrivate,
  } as never);
  if (error) throw error;
  return toRoom(data as unknown as RoomRow);
}

/**
 * Join an open channel.
 *
 * Reading an open channel needs nothing, so this is about it appearing in your
 * list rather than about being let in. A private channel cannot be joined this
 * way at all: getting in is somebody else's decision, and the database answers
 * "that channel is not there" rather than "no", because a private channel does
 * not confirm its own existence to somebody who is not in it.
 */
export async function joinRoom(slug: string): Promise<ChatRoom> {
  const { data, error } = await supabase.rpc('join_chat_room' as never, {
    p_slug: slug,
  } as never);
  if (error) throw error;
  return toRoom(data as unknown as RoomRow);
}

/** Who is in a channel. One query, and only for somebody who can read it. */
export async function roomMembers(topicId: number): Promise<ChatRoomMember[]> {
  const { data, error } = await supabase.rpc('chat_room_members' as never, {
    p_topic: topicId,
  } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    added_at: string;
    is_owner: boolean;
  }>).map(row => ({
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    addedAt: row.added_at,
    isOwner: row.is_owner,
  }));
}

/** Add a friend to a channel you made. Only a friend, and only your channel. */
export async function addToRoom(topicId: number, userId: string): Promise<void> {
  const { error } = await supabase.rpc('add_to_chat_room' as never, {
    p_topic: topicId,
    p_user: userId,
  } as never);
  if (error) throw error;
}

/** Take somebody out, or leave yourself. The maker cannot be removed. */
export async function removeFromRoom(topicId: number, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_from_chat_room' as never, {
    p_topic: topicId,
    p_user: userId,
  } as never);
  if (error) throw error;
}
