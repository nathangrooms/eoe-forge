/**
 * Every lobby call to the database, in one file.
 *
 * ---------------------------------------------------------------------------
 * EIGHT RPCs EXISTED AND NOTHING CALLED THEM
 * ---------------------------------------------------------------------------
 * `create_online_table`, `join_online_table`, `peek_online_table`,
 * `set_online_seat`, `leave_online_table`, `start_online_table`,
 * `finish_online_table` and `append_online_action` were written, granted and
 * tested against real user ids, and had zero callers anywhere in the app. This
 * file is where seven of them get one. The eighth, `append_online_action`, is
 * the game's own sequencer and belongs to the table surface, not the lobby.
 *
 * ---------------------------------------------------------------------------
 * ONE QUERY PER SCREEN
 * ---------------------------------------------------------------------------
 * CLAUDE.md records two outages and a disk IO warning caused by per-row
 * queries, one of them a lookup inside a loop over every card of every deck at
 * 421 requests a page. So:
 *
 *   the lobby list   `open_game_tables()`     one grouped query, seats included
 *   the seat screen  `online_table_room(id)`  one row, seats included
 *
 * Neither of them loops, and neither of them is followed by a second read to
 * fill anything in. If a field is missing from a screen, it gets added to the
 * function, not fetched separately.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE POLLS
 * ---------------------------------------------------------------------------
 * A lobby that refreshes on a timer is a write to the database every few
 * seconds per open tab forever, including the tabs nobody is looking at. Both
 * reads are instead re-run when the `lobby` Realtime channel says something
 * changed. See `channel.ts` for the one exception and why it is bounded.
 */

import { supabase } from '@/integrations/supabase/client';
import type { OpenTable, TablePeek, TableRoom } from './types.ts';

/*
 * `as never` on the RPC name is this project's existing pattern for a function
 * the generated `Database` type does not know about — `src/lib/play/playmats.ts`
 * does the same for `record_playmat` and `playmats_at_table`. The online tables
 * were added by migration and `src/integrations/supabase/types.ts` has not been
 * regenerated since, so every name in this file is in that position.
 */

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

interface OpenTableRow {
  id: string;
  code: string;
  format: string;
  visibility: 'public' | 'link';
  max_seats: number;
  seats_taken: number;
  host_name: string | null;
  seated: boolean;
  created_at: string;
  last_activity_at: string;
  seats: unknown;
}

function toOpenTable(row: OpenTableRow): OpenTable {
  return {
    id: row.id,
    code: row.code,
    format: row.format,
    visibility: row.visibility,
    maxSeats: row.max_seats,
    seatsTaken: row.seats_taken,
    hostName: row.host_name,
    seated: row.seated,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    seats: Array.isArray(row.seats) ? (row.seats as OpenTable['seats']) : [],
  };
}

/** Every table you may see, newest activity first. One round trip. */
export async function listOpenTables(): Promise<OpenTable[]> {
  const { data, error } = await supabase.rpc('open_game_tables' as never);
  if (error) throw error;
  return ((data ?? []) as unknown as OpenTableRow[]).map(toOpenTable);
}

/**
 * One table and its seats, for the room you are in.
 *
 * Returns null when you are not at that table, which is the same answer the
 * database gives and is not an error: it is what happens between pressing
 * Leave and the screen catching up.
 */
export async function readRoom(tableId: string): Promise<TableRoom | null> {
  const { data, error } = await supabase.rpc('online_table_room' as never, {
    p_table: tableId,
  } as never);
  if (error) throw error;
  return (data as unknown as TableRoom | null) ?? null;
}

/** What somebody holding a link sees before they commit to sitting down. */
export async function peekTable(code: string): Promise<TablePeek | null> {
  const { data, error } = await supabase.rpc('peek_online_table' as never, {
    p_code: code,
  } as never);
  if (error) throw error;

  const row = (data as unknown as Array<{
    id: string;
    code: string;
    format: string;
    status: TablePeek['status'];
    max_seats: number;
    seats_taken: number;
    host_name: string | null;
  }> | null)?.[0];

  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    format: row.format,
    status: row.status,
    maxSeats: row.max_seats,
    seatsTaken: row.seats_taken,
    hostName: row.host_name,
  };
}

/* -------------------------------------------------------------------------- */
/* Sitting down                                                               */
/* -------------------------------------------------------------------------- */

export interface SeatDetails {
  displayName: string;
  deckId?: string | null;
  deckName?: string | null;
  deckSize?: number;
  commanders?: unknown[];
  /** Published before the first draw so the shuffle can be audited afterwards. */
  seedCommitment?: string | null;
  /**
   * This seat's private half. Written to `game_seat_secrets`, whose RLS is
   * `user_id = auth.uid()` on every command, so no other player at the table
   * can read it by any route. Never sent anywhere else.
   */
  secretSeed?: number | null;
  deck?: unknown[] | null;
}

/** Open a table. You take seat 0 and you are the host. */
export async function createTable(
  details: SeatDetails,
  options: { format?: string; maxSeats?: number } = {}
): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('create_online_table' as never, {
    p_display_name: details.displayName,
    p_format: options.format ?? 'commander',
    p_deck_id: details.deckId ?? null,
    p_deck_name: details.deckName ?? null,
    p_deck_size: details.deckSize ?? 0,
    p_commanders: details.commanders ?? [],
    p_seed_commitment: details.seedCommitment ?? null,
    p_secret_seed: details.secretSeed ?? null,
    p_deck: details.deck ?? null,
    p_max_seats: options.maxSeats ?? 4,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string; code: string };
}

/**
 * Sit down at somebody else's table.
 *
 * Also the rejoin path, and deliberately so: `join_online_table` updates the
 * seat rather than failing when you are already at the table, which is what a
 * reconnect and a deck change both look like from the database's side. One
 * call, one behaviour, whichever of those it turns out to be.
 */
export async function joinTable(
  code: string,
  details: SeatDetails
): Promise<{ id: string; code: string; status: string }> {
  const { data, error } = await supabase.rpc('join_online_table' as never, {
    p_code: code,
    p_display_name: details.displayName,
    p_deck_id: details.deckId ?? null,
    p_deck_name: details.deckName ?? null,
    p_deck_size: details.deckSize ?? 0,
    p_commanders: details.commanders ?? [],
    p_seed_commitment: details.seedCommitment ?? null,
    p_secret_seed: details.secretSeed ?? null,
    p_deck: details.deck ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string; code: string; status: string };
}

/** Change what your seat is bringing, or say you are ready. */
export async function setSeat(
  tableId: string,
  details: Partial<SeatDetails> & { ready?: boolean }
): Promise<void> {
  const { error } = await supabase.rpc('set_online_seat' as never, {
    p_table: tableId,
    p_display_name: details.displayName ?? null,
    p_deck_id: details.deckId ?? null,
    p_deck_name: details.deckName ?? null,
    p_deck_size: details.deckSize ?? null,
    p_commanders: details.commanders ?? null,
    p_seed_commitment: details.seedCommitment ?? null,
    p_secret_seed: details.secretSeed ?? null,
    p_deck: details.deck ?? null,
    p_ready: details.ready ?? null,
  } as never);
  if (error) throw error;
}

/**
 * Stand up.
 *
 * In a lobby this removes the seat and the seat's secrets, and deletes the
 * table outright if you were the last one at it. In a game already running it
 * only marks you away, because the log contains that seat's turns and a seat
 * that vanished would make the log unfoldable. Both behaviours live in
 * `leave_online_table`; this is one call either way.
 */
export async function leaveTable(tableId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_online_table' as never, {
    p_table: tableId,
  } as never);
  if (error) throw error;
}

/** Listed in the lobby, or reachable only by link. Host only, lobby only. */
export async function setVisibility(
  tableId: string,
  visibility: 'public' | 'link'
): Promise<void> {
  const { error } = await supabase.rpc('set_online_table_visibility' as never, {
    p_table: tableId,
    p_visibility: visibility,
  } as never);
  if (error) throw error;
}

/**
 * Start the game. Host only.
 *
 * `p_public_seed` permutes anonymous slots only, so publishing it reveals
 * nothing; it is the table's seed, not anybody's deal. Every seat's real
 * shuffle came from its own secret seed and was committed to before this point.
 */
export async function startTable(tableId: string, publicSeed: number): Promise<void> {
  const { error } = await supabase.rpc('start_online_table' as never, {
    p_table: tableId,
    p_public_seed: publicSeed,
  } as never);
  if (error) throw error;
}
