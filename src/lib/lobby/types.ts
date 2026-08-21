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

/** One message in the open discussion. */
export interface LobbyPost {
  id: number;
  userId: string;
  name: string;
  body: string;
  /** Set when the post is about a table, so the message carries a way in. */
  tableCode: string | null;
  createdAt: string;
}
