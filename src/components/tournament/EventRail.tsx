/**
 * DeckMatrix — switching between events.
 *
 * A select box hid the one thing a shop running two pods at once needs to see:
 * which event is live and how far through it is. Each event is a card carrying
 * its own state, and the whole strip scrolls sideways when there are more than
 * fit.
 */

import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { totalRoundsFor, type Tournament } from './scoring';

const STATUS_TEXT: Record<Tournament['status'], string> = {
  setup: 'Not started',
  'in-progress': 'In progress',
  completed: 'Complete',
};

export function EventRail({
  tournaments,
  selectedId,
  onSelect,
}: {
  tournaments: Tournament[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {tournaments.map(event => {
        const selected = event.id === selectedId;
        const rounds = totalRoundsFor(event);

        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event.id)}
            aria-current={selected ? 'true' : undefined}
            className={cn(
              'flex w-52 shrink-0 flex-col gap-1 rounded-xl p-3 text-left transition-colors motion-reduce:transition-none',
              selected ? 'bg-card shadow-sm' : 'bg-muted/30 hover:bg-muted/60'
            )}
          >
            <span className="flex items-center gap-1.5">
              {event.status === 'in-progress' && (
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
              )}
              <span
                className={cn(
                  'truncate text-sm font-semibold',
                  selected ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {event.name}
              </span>
            </span>

            <span className="truncate text-xs text-muted-foreground">
              {event.gameFormat} · {event.players.length} player
              {event.players.length === 1 ? '' : 's'}
            </span>

            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground/80">
              {event.status === 'in-progress'
                ? `Round ${event.currentRound} of ${rounds}`
                : STATUS_TEXT[event.status]}
            </span>
          </button>
        );
      })}

      <Link
        to="/tournament/new"
        className="flex w-40 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/30 p-3 text-center transition-colors hover:bg-muted/60 motion-reduce:transition-none"
      >
        <Plus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">New event</span>
      </Link>
    </div>
  );
}
