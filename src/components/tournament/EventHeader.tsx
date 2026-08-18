/**
 * DeckMatrix — the event header.
 *
 * What a TO glances at between calls: what this event is, where it is up to,
 * and how long is left in the round. Everything on it is counted from the event
 * itself — there is no decorative figure here.
 *
 * The round clock is part of the header rather than a separate panel because it
 * is the one number that changes while nobody is touching the screen.
 */

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Trash2,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Standing, Tournament } from './scoring';

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface EventHeaderProps {
  tournament: Tournament;
  standings: Standing[];
  totalRounds: number;
  timerRemaining: number;
  onStartClock: () => void;
  onPauseClock: () => void;
  onResetClock: () => void;
  onStart: () => void;
  onAdvance: () => void;
  onDelete: () => void;
  /** True when the live round has every result in. */
  roundComplete: boolean;
}

const STRUCTURE_LABEL: Record<Tournament['format'], string> = {
  swiss: 'Swiss',
  'single-elimination': 'Single elimination',
};

export function EventHeader({
  tournament,
  standings,
  totalRounds,
  timerRemaining,
  onStartClock,
  onPauseClock,
  onResetClock,
  onStart,
  onAdvance,
  onDelete,
  roundComplete,
}: EventHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = tournament.players.length - tournament.dropped.length;
  const registered = tournament.players.filter(p => tournament.decks[p]).length;
  const currentRound = tournament.rounds.find(r => r.number === tournament.currentRound);
  const decided = currentRound?.matches.filter(m => m.status === 'completed').length ?? 0;
  const tables = currentRound?.matches.length ?? 0;
  const leader = standings.find(s => !s.dropped);
  const isLastScheduled = tournament.currentRound >= totalRounds;

  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
            {tournament.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>{tournament.gameFormat}</Chip>
            <Chip>{STRUCTURE_LABEL[tournament.format]}</Chip>
            <StatusChip status={tournament.status} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {tournament.status === 'setup' && (
            <Button onClick={onStart} className="gap-2">
              <Play className="h-4 w-4" />
              Start event
            </Button>
          )}

          {tournament.status === 'in-progress' && roundComplete && (
            <Button onClick={onAdvance} className="gap-2">
              {isLastScheduled ? (
                <>
                  <Trophy className="h-4 w-4" />
                  Finish event
                </>
              ) : (
                <>
                  Pair round {tournament.currentRound + 1}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {/* Destructive confirmation happens in place — no dialog. */}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 p-1">
              <span className="px-2 text-xs text-muted-foreground">Delete this event?</span>
              <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={onDelete}>
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete event"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Counted facts */}
      <div className="grid grid-cols-2 gap-px bg-muted/20 sm:grid-cols-4">
        <Stat label="Players" value={String(active)} hint={
          tournament.dropped.length > 0 ? `${tournament.dropped.length} dropped` : `${registered} decks registered`
        } />
        <Stat
          label="Round"
          value={
            tournament.status === 'setup'
              ? `0 / ${totalRounds}`
              : `${tournament.currentRound} / ${totalRounds}`
          }
          hint={tournament.format === 'swiss' ? 'Swiss' : 'Bracket'}
        />
        <Stat
          label="Results in"
          value={tables === 0 ? '—' : `${decided} / ${tables}`}
          hint={tables === 0 ? 'Not started' : `${tables} table${tables === 1 ? '' : 's'}`}
        />
        <Stat
          label={tournament.status === 'completed' ? 'Champion' : 'Leader'}
          value={leader ? leader.player : '—'}
          hint={leader ? `${leader.points} pts · ${leader.wins}–${leader.losses}–${leader.draws}` : 'No results yet'}
          truncate
        />
      </div>

      {/* Round clock */}
      {tournament.status === 'in-progress' && (
        <div className="flex flex-wrap items-center gap-3 bg-muted/30 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Timer aria-hidden="true" className="h-3.5 w-3.5" />
            Round clock
          </span>

          <span
            className={cn(
              'font-mono text-2xl font-semibold tabular-nums',
              timerRemaining <= 0 ? 'text-destructive' : 'text-foreground'
            )}
          >
            {formatClock(timerRemaining)}
          </span>

          {timerRemaining <= 0 && (
            <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-destructive">
              Time called
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {tournament.timer.running ? (
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={onPauseClock}>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            ) : (
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={onStartClock}>
                <Play className="h-3.5 w-3.5" />
                Start
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onResetClock}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {tournament.roundLengthMinutes} min
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function StatusChip({ status }: { status: Tournament['status'] }) {
  const config = {
    setup: { label: 'Not started', icon: Clock },
    'in-progress': { label: 'In progress', icon: Circle },
    completed: { label: 'Complete', icon: CheckCircle2 },
  }[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        status === 'in-progress' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'in-progress' && 'fill-current')} />
      {config.label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  truncate = false,
}: {
  label: string;
  value: string;
  hint?: string;
  truncate?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold text-foreground',
          truncate && 'truncate',
          !truncate && 'tabular-nums'
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
