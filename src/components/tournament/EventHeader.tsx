/**
 * DeckMatrix — the event header.
 *
 * What a TO glances at between calls: what this event is, where it is up to,
 * and how long is left in the round. Everything on it is counted from the event
 * itself — there is no decorative figure here.
 *
 * The round clock is part of the header rather than a separate panel because it
 * is the one number that changes while nobody is touching the screen.
 *
 * The blurred ground is the approved identity pattern, and it earns its place
 * the way that pattern requires: the art is the commander of the deck belonging
 * to the player this header already names as leading the event. It is art OF
 * something on this screen, not wallpaper. Before any result is in there is no
 * leader, so the ground is simply absent rather than filled with a generic
 * picture, and it is the only one on the page.
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
import { MetricRow, type Metric } from '@/components/listing';
import { viewFor, type PlayerView } from './playerViews';
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
  /** The render models the rest of the event already built; used for the ground. */
  views: Map<string, PlayerView>;
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
  views,
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

  /* Only once a result is in. Before that there is no leader and therefore no
     subject, and a ground with no subject is wallpaper. */
  const leaderCard =
    leader && tournament.rounds.length > 0 ? viewFor(views, leader.player).card : null;
  const ground = leaderCard?.image_uris.art_crop ?? leaderCard?.image_uris.normal ?? null;

  const headerMetrics: Metric[] = [
    {
      id: 'players',
      label: 'Players',
      value: active.toLocaleString(),
      raw: active,
      subtext:
        tournament.dropped.length > 0
          ? `${tournament.dropped.length} dropped`
          : `${registered} decks registered`,
    },
    {
      id: 'round',
      label: 'Round',
      value:
        tournament.status === 'setup'
          ? String(tournament.currentRound > 0 ? tournament.currentRound : 0)
          : String(tournament.currentRound),
      suffix: `/ ${totalRounds}`,
      raw: tournament.status === 'setup' ? 0 : tournament.currentRound,
      subtext: STRUCTURE_LABEL[tournament.format],
    },
    {
      id: 'results',
      label: 'Results in',
      /* A dash rather than 0 / 0 before the first round is paired. There are no
         tables yet, so there is nothing to be none of. */
      value: tables === 0 ? '—' : String(decided),
      suffix: tables === 0 ? undefined : `/ ${tables}`,
      raw: decided,
      subtext:
        tables === 0 ? 'Not started' : `${tables} table${tables === 1 ? '' : 's'}`,
    },
    {
      id: 'leader',
      label: tournament.status === 'completed' ? 'Champion' : 'Leader',
      value: leader ? leader.player : '—',
      subtext: leader
        ? `${leader.points} pts · ${leader.wins}–${leader.losses}–${leader.draws}`
        : 'No results yet',
    },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-card shadow-sm">
      {ground && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <img
            src={ground}
            alt=""
            draggable={false}
            decoding="async"
            className="h-full w-full scale-125 object-cover opacity-90 blur-2xl"
          />
          {/*
            One scrim, not three.

            This was `opacity-60` artwork under `bg-card/80` under a gradient
            that was full `card` at one edge and `card/70` at the other.
            Multiplied out, that left single-digit percentages of the art
            visible: the approved pattern was implemented and then cancelled,
            and the header still rendered as the flat charcoal slab the pattern
            exists to prevent. The whole point of it, in the owner's words, is
            that it "adds beautiful colour".

            So one flat scrim at the strength contrast actually needs, then one
            vertical fade so the band resolves into the counted facts below
            instead of stopping on a line. Nothing horizontal: the title sits at
            one end and the controls at the other, so a left-to-right fade was
            dimming precisely the middle, which is where the colour was.
          */}
          <div className="absolute inset-0 bg-card/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-card/40 via-transparent to-card" />
        </div>
      )}

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

      {/* Counted facts, in the tiles every other figure in the product wears.

          These were four 18px numbers with 10px labels above them, which is one
          of the metric rows the audit counted and the smallest of them. They
          are `MetricRow` now, so a figure a tournament organiser glances at
          between calls is the same size as a figure on My Decks.

          `on="card"` because this row sits inside a card that is already
          raised. Depth here comes from surface tint, so a `bg-card` tile on a
          `bg-card` panel is not a subtle tile, it is no tile at all. */}
      <div className="px-4 py-3">
        <MetricRow metrics={headerMetrics} columns={4} on="card" />
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
