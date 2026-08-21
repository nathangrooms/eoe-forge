import { Link2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  actionForTable,
  actionLabel,
  isGoingStale,
  seatsLine,
  waitedFor,
  type OpenTable,
} from '@/lib/lobby';
import { CommanderFace } from './CommanderFace';

/**
 * Every table waiting for players.
 *
 * One row per table, and the row answers the four questions somebody scanning a
 * lobby is actually asking: who is hosting, what are they playing, how many
 * seats are left, and how long has it been sitting there. The decks already at
 * the table are drawn as their commanders, because "Ali, Bo and a Krenko deck"
 * tells a player more about whether they want that game than any amount of
 * text would.
 *
 * ONE READ FEEDS THIS. `open_game_tables()` returns the seats aggregated into
 * each row, so nothing in here fetches anything. If a field is missing it goes
 * into that function, never into a lookup per row: this project has taken the
 * database down with a query inside a loop and will not do it again.
 *
 * There are no borders between rows. The separation is surface tint and space,
 * which is the standing rule.
 */

export interface OpenTablesProps {
  tables: OpenTable[];
  loading: boolean;
  /** Off while the entry rule is unmet, so nothing offers a door that is shut. */
  canJoin: boolean;
  busyTableId?: string | null;
  onOpen: (table: OpenTable) => void;
}

export function OpenTables({ tables, loading, canJoin, busyTableId, onOpen }: OpenTablesProps) {
  if (loading && tables.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-muted/30 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Looking for tables
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 p-8">
        <p className="text-sm font-medium text-foreground">Nobody is waiting right now.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a table and send the link to a friend. It shows up here for everyone else too.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-3">
      {tables.map(table => (
        <TableRow
          key={table.id}
          table={table}
          canJoin={canJoin}
          busy={busyTableId === table.id}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

function TableRow({
  table,
  canJoin,
  busy,
  onOpen,
}: {
  table: OpenTable;
  canJoin: boolean;
  busy: boolean;
  onOpen: (table: OpenTable) => void;
}) {
  const action = actionForTable(table);
  const stale = isGoingStale(table.lastActivityAt);
  // Your own seat is always reachable, even when the entry rule would stop a
  // fresh join: standing you up because a deck changed is a worse failure.
  const disabled = busy || action === 'full' || (!canJoin && action !== 'rejoin');

  return (
    <li
      className={cn(
        'rounded-xl bg-card p-4 transition-transform duration-200 md:p-5',
        'motion-safe:hover:-translate-y-0.5',
        table.seated && 'bg-muted/50'
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* Who is at it, as cards. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
          {table.seats.map(seat => (
            <div key={seat.seat} className="min-w-0">
              <CommanderFace
                commanders={seat.commanders}
                size="md"
                emptyLabel="Choosing a deck"
              />
              <p className="mt-2 max-w-[180px] truncate text-sm font-medium text-foreground">
                {seat.name}
                {seat.isHost && <span className="ml-1 text-muted-foreground">host</span>}
              </p>
              <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                {seat.deckName ?? 'No deck yet'}
              </p>
            </div>
          ))}
        </div>

        {/* What it is, and the way in. */}
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <p className="text-base font-semibold capitalize text-foreground">{table.format}</p>

          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {seatsLine(table)}
          </p>

          <p className="text-sm text-muted-foreground">
            Waiting {waitedFor(table.lastActivityAt)}
            {table.visibility === 'link' && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                link only
              </span>
            )}
          </p>

          {stale && (
            <p className="text-xs text-muted-foreground">
              Quiet for a while. Tables close after 30 minutes of nothing happening.
            </p>
          )}

          <Button
            className="mt-1 w-full lg:w-auto"
            disabled={disabled}
            onClick={() => onOpen(table)}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Sitting down
              </>
            ) : (
              actionLabel(action)
            )}
          </Button>
        </div>
      </div>
    </li>
  );
}
