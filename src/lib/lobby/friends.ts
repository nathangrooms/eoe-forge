/**
 * Friends: every call it makes, in one file.
 *
 * ---------------------------------------------------------------------------
 * THE FRIENDS LIST IS ONE QUERY
 * ---------------------------------------------------------------------------
 * `listFriends()` is a single call to `my_friends()`, and everything the panel
 * draws comes back in it: who they are, whether they are around, what they are
 * doing, how many decks they will show you, the commander of the deck they
 * touched last, and whether they have a table invitation waiting for you.
 *
 * There is deliberately no "and then read the presence for each one" and no
 * "and then count their decks". CLAUDE.md records two outages and a disk IO
 * warning from exactly that shape, one of them 421 requests on a single page.
 * If a field is missing from the panel it gets added to the function, not
 * fetched separately.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE WRITES A TABLE
 * ---------------------------------------------------------------------------
 * `authenticated` holds SELECT and nothing else on `friend_links`,
 * `friend_blocks`, `friend_sharing`, `friend_presence` and `table_invites`. Not
 * INSERT, not UPDATE, not DELETE. Every write below is an RPC that checks who
 * you are, whether either of you has blocked the other, and how fast you are
 * going, before it writes anything. A client that could insert into
 * `friend_links` could make itself somebody's friend.
 *
 * ---------------------------------------------------------------------------
 * WHAT A FRIEND CAN SEE
 * ---------------------------------------------------------------------------
 *   decks       on by default
 *   collection  OFF by default
 *   activity    on by default
 *
 * The reasons are written where the switches are, in `SharingPanel.tsx`, and
 * the rule is enforced by `may_see_friend()` in the database. `friendDecks()`
 * and `friendCollection()` below hand back an empty list and a null, and that
 * is the database refusing, not this file choosing.
 */

import { supabase } from '@/integrations/supabase/client';

/*
 * `as never` on an RPC name is this project's existing pattern for something
 * `src/integrations/supabase/types.ts` has not been regenerated for.
 * `src/lib/lobby/forum.ts`, `chat.ts` and `tables.ts` all do it.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where you and somebody else have got to.
 *
 * `they_asked` is the one that matters most on screen: it is the only state
 * that is waiting on YOU, so it sorts to the top of the list.
 */
export type FriendState = 'friend' | 'they_asked' | 'you_asked';

/** One row of the friends list. */
export interface Friend {
  userId: string;
  name: string;
  avatarUrl: string | null;
  state: FriendState;
  /** When you became friends, or when the request was made. */
  since: string;
  sharesDecks: boolean;
  sharesCollection: boolean;
  /** Seen inside the last three minutes, and sharing that they were. */
  around: boolean;
  /** Null when they do not share activity, or when they never have been on. */
  seenAt: string | null;
  /** A short phrase: "choosing a mode", "at a table". Null when not around. */
  doing: string | null;
  /** The table they are sitting at, so you can go and watch or join. */
  tableCode: string | null;
  deckCount: number;
  topDeck: string | null;
  commanderName: string | null;
  commanderImage: string | null;
  /** An invitation from them to you that is still open. */
  inviteId: number | null;
  inviteCode: string | null;
}

/** Somebody a search turned up, and where you stand with them. */
export interface FoundPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  state: FriendState | 'none';
}

/** The three switches. */
export interface Sharing {
  decks: boolean;
  collection: boolean;
  activity: boolean;
}

export interface FriendDeck {
  deckId: string;
  name: string;
  format: string;
  colors: string[];
  cardCount: number;
  commanderName: string | null;
  commanderImage: string | null;
  updatedAt: string;
}

/** One card in a friend's collection, as the summary lists it. */
export interface FriendCollectionCard {
  cardId: string;
  name: string;
  setCode: string | null;
  quantity: number;
  foil: number;
  /** Always a real price. A card with no USD quote is not in this list. */
  usd: number;
  image: string | null;
}

/**
 * What somebody's collection adds up to.
 *
 * `valueUsd` is null when nothing in it has a price, never 0. A rendered zero
 * is always invented: CLAUDE.md records a card with no USD quote showing as
 * $0.00 while carrying a Cardmarket price of €2,199.95. `unpriced` says how
 * many cards were left out, so the total can be read honestly.
 */
export interface FriendCollection {
  cards: number;
  copies: number;
  priced: number;
  unpriced: number;
  valueUsd: number | null;
  top: FriendCollectionCard[];
}

export interface BlockedPlayer {
  userId: string;
  name: string;
  since: string;
}

/* -------------------------------------------------------------------------- */
/* Rows as Postgres hands them over                                           */
/* -------------------------------------------------------------------------- */

interface FriendRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  state: FriendState;
  since: string;
  shares_decks: boolean;
  shares_collection: boolean;
  around: boolean | null;
  seen_at: string | null;
  doing: string | null;
  table_code: string | null;
  deck_count: number | null;
  top_deck: string | null;
  commander_name: string | null;
  commander_image: string | null;
  invite_id: number | null;
  invite_code: string | null;
}

function toFriend(row: FriendRow): Friend {
  return {
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    state: row.state,
    since: row.since,
    sharesDecks: row.shares_decks,
    sharesCollection: row.shares_collection,
    around: row.around === true,
    seenAt: row.seen_at,
    doing: row.doing,
    tableCode: row.table_code,
    deckCount: row.deck_count ?? 0,
    topDeck: row.top_deck,
    commanderName: row.commander_name,
    commanderImage: row.commander_image,
    inviteId: row.invite_id,
    inviteCode: row.invite_code,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** Everybody you know and everybody waiting on an answer. ONE query. */
export async function listFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('my_friends' as never);
  if (error) throw error;
  return ((data ?? []) as unknown as FriendRow[]).map(toFriend);
}

/**
 * Look somebody up by name.
 *
 * Two characters at least, twelve results at most, and anybody who has blocked
 * you is not in it. The state comes back with the row so the button can say
 * "Add", "Asked" or "Accept" without a second question.
 */
export async function findPlayers(query: string): Promise<FoundPlayer[]> {
  const text = query.trim();
  if (text.length < 2) return [];

  const { data, error } = await supabase.rpc('find_players' as never, {
    p_query: text,
  } as never);
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    state: FoundPlayer['state'];
  }>).map(row => ({
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    state: row.state,
  }));
}

/** Their decks, if they share them. An empty list is the database refusing. */
export async function friendDecks(userId: string): Promise<FriendDeck[]> {
  const { data, error } = await supabase.rpc('friend_decks' as never, {
    p_user: userId,
  } as never);
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    deck_id: string;
    name: string;
    format: string;
    colors: string[] | null;
    card_count: number;
    commander_name: string | null;
    commander_image: string | null;
    updated_at: string;
  }>).map(row => ({
    deckId: row.deck_id,
    name: row.name,
    format: row.format,
    colors: row.colors ?? [],
    cardCount: row.card_count ?? 0,
    commanderName: row.commander_name,
    commanderImage: row.commander_image,
    updatedAt: row.updated_at,
  }));
}

/** Their collection, if they share it. Null is the database refusing. */
export async function friendCollection(
  userId: string,
  limit = 24
): Promise<FriendCollection | null> {
  const { data, error } = await supabase.rpc('friend_collection' as never, {
    p_user: userId,
    p_limit: limit,
  } as never);
  if (error) throw error;
  if (!data) return null;

  const payload = data as unknown as {
    cards: number;
    copies: number;
    priced: number;
    unpriced: number;
    valueUsd: number | null;
    top: FriendCollectionCard[];
  };

  return {
    cards: payload.cards ?? 0,
    copies: payload.copies ?? 0,
    priced: payload.priced ?? 0,
    unpriced: payload.unpriced ?? 0,
    valueUsd: payload.valueUsd ?? null,
    top: Array.isArray(payload.top) ? payload.top : [],
  };
}

export async function listBlocked(): Promise<BlockedPlayer[]> {
  const { data, error } = await supabase.rpc('list_blocked_players' as never);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    user_id: string;
    name: string;
    since: string;
  }>).map(row => ({ userId: row.user_id, name: row.name, since: row.since }));
}

/* -------------------------------------------------------------------------- */
/* Asking, answering, refusing                                                */
/* -------------------------------------------------------------------------- */

/**
 * Ask somebody to be friends.
 *
 * Returns where you now stand. If they had already asked YOU, asking back is
 * saying yes and this returns `friend`, because two people who have both asked
 * are friends and making one of them press a second button is ceremony.
 */
export async function askToBeFriends(userId: string): Promise<FriendState> {
  const { data, error } = await supabase.rpc('ask_to_be_friends' as never, {
    p_user: userId,
  } as never);
  if (error) throw error;
  return (data as unknown as FriendState) ?? 'you_asked';
}

/** Say yes or no to a request. No is a real answer and it stops the asking. */
export async function answerFriendRequest(userId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('answer_friend_request' as never, {
    p_user: userId,
    p_accept: accept,
  } as never);
  if (error) throw error;
}

/** Stop being friends. Quiet on both sides, and reversible by asking again. */
export async function removeFriend(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend' as never, {
    p_user: userId,
  } as never);
  if (error) throw error;
}

/**
 * Block somebody.
 *
 * Ends the friendship, cancels anything in flight, takes them out of your
 * private channels, and stops them asking again. They are not told, which is
 * deliberate: being told you were blocked is an invitation to make a second
 * account.
 */
export async function blockPlayer(userId: string, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc('block_player' as never, {
    p_user: userId,
    p_reason: reason ?? null,
  } as never);
  if (error) throw error;
}

export async function unblockPlayer(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_player' as never, {
    p_user: userId,
  } as never);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* What you share                                                             */
/* -------------------------------------------------------------------------- */

interface SharingRow {
  share_decks: boolean;
  share_collection: boolean;
  share_activity: boolean;
}

function toSharing(row: SharingRow | null | undefined): Sharing {
  return {
    decks: row?.share_decks ?? true,
    collection: row?.share_collection ?? false,
    activity: row?.share_activity ?? true,
  };
}

/** Your three switches. Never writes: an unset account gets the defaults. */
export async function readSharing(): Promise<Sharing> {
  const { data, error } = await supabase.rpc('my_sharing' as never);
  if (error) throw error;
  return toSharing(data as unknown as SharingRow | null);
}

export async function writeSharing(next: Sharing): Promise<Sharing> {
  const { data, error } = await supabase.rpc('set_friend_sharing' as never, {
    p_decks: next.decks,
    p_collection: next.collection,
    p_activity: next.activity,
  } as never);
  if (error) throw error;
  return toSharing(data as unknown as SharingRow | null);
}

/* -------------------------------------------------------------------------- */
/* Inviting somebody to a table                                               */
/* -------------------------------------------------------------------------- */

/**
 * Invite a friend to the table you are sitting at.
 *
 * The table is one of the lobby's own `game_tables` and the way in is its
 * existing code and share link, so an invitation is a shortcut to the thing
 * that already worked rather than a second way to start a game. The database
 * refuses a table you are not at, a game that has already started, and anybody
 * who is not a friend.
 */
export async function inviteFriendToTable(
  userId: string,
  tableId: string
): Promise<{ id: number; code: string }> {
  const { data, error } = await supabase.rpc('invite_friend_to_table' as never, {
    p_user: userId,
    p_table: tableId,
  } as never);
  if (error) throw error;
  return data as unknown as { id: number; code: string };
}

/** Say no to an invitation. Sitting down is just following the link. */
export async function declineTableInvite(inviteId: number): Promise<void> {
  const { error } = await supabase.rpc('decline_table_invite' as never, {
    p_invite: inviteId,
  } as never);
  if (error) throw error;
}
