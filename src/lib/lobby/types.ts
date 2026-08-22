/**
 * The shapes the lobby moves around.
 *
 * These are the JSON the two lobby reads return, named in the words the
 * interface uses rather than the words Postgres uses. `open_game_tables()`
 * hands back one row per table with its seats already aggregated, and
 * `online_table_room()` hands back one table with its seats. Nothing here is
 * assembled client-side out of several reads, because assembling it client-side
 * is what turns a lobby into a query per row.
 *
 * A commander travels as the same `CardIdentity` the game core uses, so the
 * lobby can draw real art for what somebody brought without a second lookup.
 */

/** A card, in the words `src/lib/game/net` already uses. */
export interface LobbyCommander {
  cardId: string;
  name: string;
  imageUrl?: string;
  colorIdentity?: string[];
  typeLine?: string;
}

/** One seat, as everyone in the lobby can see it. */
export interface LobbySeatSummary {
  seat: number;
  name: string;
  deckName: string | null;
  deckSize: number;
  commanders: LobbyCommander[];
  ready: boolean;
  isHost: boolean;
}

/** One row of the open tables list. */
export interface OpenTable {
  id: string;
  code: string;
  format: string;
  visibility: 'public' | 'link';
  maxSeats: number;
  seatsTaken: number;
  hostName: string | null;
  /** True when you are already sitting at it, so the button says Rejoin. */
  seated: boolean;
  createdAt: string;
  lastActivityAt: string;
  seats: LobbySeatSummary[];
}

/** One seat inside the room you are actually sitting in. */
export interface RoomSeat {
  userId: string;
  seat: number;
  /** The seat id inside GameState. Derived from the seat number, never chosen. */
  playerId: string;
  name: string;
  deckId: string | null;
  deckName: string | null;
  deckSize: number;
  commanders: LobbyCommander[];
  /**
   * Whether this seat has published a shuffle commitment. Not the commitment
   * itself: that is nobody's business until the disclosure step exists.
   */
  committed: boolean;
  ready: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

export type TableStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

/** One table and everyone at it. The seat screen redraws from this. */
export interface TableRoom {
  id: string;
  code: string;
  format: string;
  status: TableStatus;
  visibility: 'public' | 'link';
  maxSeats: number;
  hostUser: string;
  publicSeed: number;
  createdAt: string;
  startedAt: string | null;
  lastActivityAt: string;
  seats: RoomSeat[];
}

/** What somebody typing a code sees before they commit to joining. */
export interface TablePeek {
  id: string;
  code: string;
  format: string;
  status: TableStatus;
  maxSeats: number;
  seatsTaken: number;
  hostName: string | null;
}

/* -------------------------------------------------------------------------- */
/* The discussion                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Where a conversation lives.
 *
 * `board` is the open discussion, which anybody can read including somebody
 * with no account. `table` is one table's own talk, which only the people
 * sitting at it can read. Same rows, same components, different policy.
 */
export type DiscussionScope = 'board' | 'table';

/** One conversation, as the board list draws it. */
export interface ForumTopic {
  id: number;
  scope: DiscussionScope;
  /** Set for a table's talk, null on the board. */
  tableId: string | null;
  /** A board conversation has a title. A table's talk does not need one. */
  title: string | null;
  authorId: string | null;
  authorName: string;
  /** Carried up from the first post, so the board can offer the way in. */
  tableCode: string | null;
  createdAt: string;
  lastPostAt: string;
  lastPostName: string | null;
  postCount: number;
  pinned: boolean;
  locked: boolean;
  removed: boolean;
  /**
   * Only its members may read a word of it, or post in it, or see that it is
   * there. Always false on a thread: the database carries a check constraint
   * saying a private topic has to be a room.
   */
  private: boolean;
}

/** One message. */
export interface ForumPost {
  id: number;
  topicId: number;
  scope: DiscussionScope;
  tableId: string | null;
  userId: string | null;
  name: string;
  /**
   * Null when the post has been taken down. The words are deleted from the
   * database rather than hidden, so there is nothing here to leak, and the row
   * stays only so the reply written underneath it still makes sense.
   */
  body: string | null;
  /** Set when the post is about a table, so the message carries a way in. */
  tableCode: string | null;
  createdAt: string;
  removed: boolean;
  /** Only meaningful to somebody who moderates. Everyone else ignores it. */
  reportCount: number;
}

/**
 * A chat room.
 *
 * The same row as a `ForumTopic`, with `kind = 'room'` in the database and a
 * slug so a link can name it. It is a separate TYPE and not a separate table,
 * because the two are read and drawn differently — a thread from its first post
 * and a room from its last — while everything about writing, removing, blocking
 * and reporting is shared code operating on the same rows.
 */
export interface ChatRoom extends Omit<ForumTopic, 'title'> {
  /** Always set on a room, and unique. `general`, `deck-help`. */
  slug: string;
  /** Always set on a room. `General`, `Deck help`. */
  title: string;
}

/** Somebody who is in a private channel. */
export interface ChatRoomMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  addedAt: string;
  /** The person who made the channel. They cannot be removed from it. */
  isOwner: boolean;
}

/** A conversation and what has been said in it, as one read returns them. */
export interface ForumThread {
  topic: ForumTopic;
  posts: ForumPost[];
}
