/**
 * The control bar for a table.
 *
 * The view switch is the first thing in it and it is a plain, always-visible
 * segmented control. That is deliberate: a hidden gesture for changing view is
 * a feature only its author can find, and the three views here are not modes a
 * player drifts between — they are three different jobs (see the pod, read your
 * hand, resolve combat) that need to be one click apart.
 *
 * Everything else in the bar is state you cannot infer from the board: whose
 * turn it is, which step, and the fact that this table is running on the local
 * transport rather than a network.
 */

import {
  ChevronRight,
  Hand as HandIcon,
  LayoutGrid,
  Pause,
  Play as PlayIcon,
  RotateCcw,
  Sparkles,
  Swords,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { STEP_LABELS, TURN_STEPS, type GameState, type PlayerId } from '@/lib/game';

export type PlayViewId = 'table' | 'hand' | 'combat';

export interface PlayHUDProps {
  state: GameState;
  view: PlayViewId;
  onViewChange: (view: PlayViewId) => void;
  viewerPlayerId: PlayerId;
  /** True when combat exists — puts a marker on the combat tab. */
  combatLive: boolean;
  botThinking: boolean;
  botsPaused: boolean;
  onToggleBots: () => void;
  freeCast: boolean;
  onToggleFreeCast: () => void;
  onAdvance: () => void;
  onPassTurn: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onNewGame: () => void;
  transportLabel: string;
  className?: string;
}

const VIEWS: Array<{ id: PlayViewId; label: string; icon: typeof LayoutGrid; hint: string }> = [
  { id: 'table', label: 'Table', icon: LayoutGrid, hint: 'Every seat, where they sit' },
  { id: 'hand', label: 'Hand', icon: HandIcon, hint: 'Your cards, big enough to read' },
  { id: 'combat', label: 'Combat', icon: Swords, hint: 'Attackers, blockers and the defender' },
];

export function PlayHUD({
  state,
  view,
  onViewChange,
  viewerPlayerId,
  combatLive,
  botThinking,
  botsPaused,
  onToggleBots,
  freeCast,
  onToggleFreeCast,
  onAdvance,
  onPassTurn,
  onUndo,
  canUndo,
  onNewGame,
  transportLabel,
  className,
}: PlayHUDProps) {
  const active = state.players.find(p => p.id === state.activePlayerId);
  const myTurn = state.activePlayerId === viewerPlayerId;
  const stepIndex = TURN_STEPS.indexOf(state.step);
  const over = state.status === 'complete';

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl bg-card p-3 shadow-sm', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {/* The one obvious control. */}
        <div
          role="tablist"
          aria-label="Table view"
          className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5"
        >
          {VIEWS.map(entry => {
            const selected = view === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={selected}
                title={entry.hint}
                onClick={() => onViewChange(entry.id)}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <entry.icon className="h-3.5 w-3.5" />
                <span>{entry.label}</span>
                {entry.id === 'combat' && combatLive && (
                  <span
                    aria-label="combat in progress"
                    className="ml-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Turn state */}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {over
              ? state.winnerIds.length > 0
                ? `${state.players.find(p => p.id === state.winnerIds[0])?.name ?? 'Someone'} wins`
                : 'Game over — a draw'
              : `${active?.name ?? 'Nobody'}'s turn`}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            Turn {state.turn} · Round {state.round} · {STEP_LABELS[state.step]}
            {botThinking ? ' · bot thinking…' : ''}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={onToggleBots}
            title={botsPaused ? 'Resume the bot' : 'Pause the bot'}
          >
            {botsPaused ? <PlayIcon className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">{botsPaused ? 'Resume' : 'Pause'}</span>
          </Button>

          <Button
            size="sm"
            variant={freeCast ? 'default' : 'secondary'}
            className="h-8 text-xs"
            onClick={onToggleFreeCast}
            title="Goldfish mode: cast without paying mana"
            aria-pressed={freeCast}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">Free cast</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo the last action on this device"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">Undo</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={onNewGame}
            title="Shuffle up and start again"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">New game</span>
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={onAdvance}
            disabled={over || !myTurn}
            title={myTurn ? 'Move to the next step' : 'Waiting on another seat'}
          >
            Next step
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={onPassTurn}
            disabled={over || !myTurn}
          >
            Pass turn
          </Button>
        </div>
      </div>

      {/* Step rail — the real twelve-step turn, not a four-phase cartoon. */}
      <ol className="flex flex-wrap items-center gap-0.5" aria-label="Turn structure">
        {TURN_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li key={step}>
              <button
                type="button"
                title={STEP_LABELS[step]}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  current
                    ? 'bg-foreground text-background'
                    : done
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                )}
                disabled
              >
                {STEP_LABELS[step]}
              </button>
            </li>
          );
        })}
        <li className="ml-auto">
          <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {transportLabel}
          </span>
        </li>
      </ol>
    </div>
  );
}
