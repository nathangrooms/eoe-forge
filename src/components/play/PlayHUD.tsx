/**
 * The game HUD.
 *
 * Not a control bar and not a toolbar — a heads-up display that floats over the
 * table the way Arena's does, because the thing being played is underneath it.
 * It answers, left to right, the four questions a player asks between actions:
 *
 *   where am I     the view switch, and the way back out of the table
 *   when am I      turn, round, and the phase strip
 *   who is acting  the active seat, and whether it is thinking
 *   what now       Attack, and END TURN
 *
 * Two deliberate departures from what was here before:
 *
 *   **The twelve-step rail is gone as a control.** It is still the real turn
 *   structure and it is still shown — the active phase pill names the exact
 *   step you are in — but a player never clicks through it. `turnFlow.ts`
 *   decides which steps hold a decision and the page walks the rest.
 *
 *   **END TURN is the loudest thing on screen.** It is red, it is on the right,
 *   it is one press, and when it is not your turn it stops being a button and
 *   becomes the label that tells you whose turn it is. Red on a game control is
 *   not decoration; it is the single most consequential press in Magic.
 */

import {
  ChevronRight,
  Hand as HandIcon,
  LayoutGrid,
  Loader2,
  LogOut,
  Pause,
  Play as PlayIcon,
  Sparkles,
  Swords,
  Undo2,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PHASE_OF_STEP, STEP_LABELS, type GameState, type Phase, type PlayerId } from '@/lib/game';
import { DECISION_LABEL, type PlayDecision } from './turnFlow';

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
  /** Auto-advance through steps that hold no decision. */
  autoAdvance: boolean;
  onToggleAuto: () => void;
  /** The decision this seat owes the table, or null while the game is flowing. */
  decision: PlayDecision | null;
  /** Manual escape hatch — one step, for when auto-advance is off. */
  onAdvance: () => void;
  /** One press: run the rest of the turn and pass it on. */
  onEndTurn: () => void;
  /** True while that press is still sweeping through the remaining steps. */
  ending: boolean;
  /** Jump from the main phase to declare attackers. */
  onAttack?: () => void;
  canAttack: boolean;
  onUndo: () => void;
  canUndo: boolean;
  /** Leave the table and go back to the lobby. */
  onLeave: () => void;
  className?: string;
}

const VIEWS: Array<{ id: PlayViewId; label: string; icon: typeof LayoutGrid; hint: string }> = [
  { id: 'table', label: 'Table', icon: LayoutGrid, hint: 'Every seat, where they sit' },
  { id: 'hand', label: 'Hand', icon: HandIcon, hint: 'Your cards, big enough to read' },
  { id: 'combat', label: 'Combat', icon: Swords, hint: 'Attackers, blockers and the defender' },
];

/**
 * The five phases, in order. The engine's twelve steps map onto these through
 * `PHASE_OF_STEP`, so this list cannot drift out of step with the rules.
 */
const PHASES: Array<{ id: Phase; label: string }> = [
  { id: 'beginning', label: 'Beginning' },
  { id: 'precombat_main', label: 'Main 1' },
  { id: 'combat', label: 'Combat' },
  { id: 'postcombat_main', label: 'Main 2' },
  { id: 'ending', label: 'End' },
];

/** A HUD toggle. Surface tint when armed, nothing at all when it is not. */
function HudToggle({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Zap;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-35',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

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
  autoAdvance,
  onToggleAuto,
  decision,
  onAdvance,
  onEndTurn,
  ending,
  onAttack,
  canAttack,
  onUndo,
  canUndo,
  onLeave,
  className,
}: PlayHUDProps) {
  const active = state.players.find(p => p.id === state.activePlayerId);
  const myTurn = state.activePlayerId === viewerPlayerId;
  const over = state.status === 'complete';
  const currentPhase = PHASE_OF_STEP[state.step];
  const phaseIndex = PHASES.findIndex(entry => entry.id === currentPhase);

  const status = over
    ? state.winnerIds.length > 0
      ? `${state.players.find(p => p.id === state.winnerIds[0])?.name ?? 'Someone'} wins`
      : 'A draw'
    : decision
      ? DECISION_LABEL[decision]
      : botThinking
        ? `${active?.name ?? 'Opponent'} is thinking…`
        : myTurn
          ? STEP_LABELS[state.step]
          : `${active?.name ?? 'Opponent'}'s turn`;

  return (
    <div
      className={cn(
        'pointer-events-auto flex h-14 w-full items-center gap-3 bg-background/70 px-2 shadow-lg shadow-black/40 backdrop-blur-xl md:px-3',
        className
      )}
    >
      {/* Out of the table, and which of the three jobs you are doing. */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onLeave}
          title="Leave the table"
          aria-label="Leave the table"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-4 w-4" />
        </button>

        <div
          role="tablist"
          aria-label="Table view"
          className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5"
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
                  'relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <entry.icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{entry.label}</span>
                {entry.id === 'combat' && combatLive && (
                  <span
                    aria-label="combat in progress"
                    className="h-1.5 w-1.5 rounded-full bg-destructive"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* When am I. Turn count, then the real turn structure as an indicator. */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <div className="hidden shrink-0 flex-col leading-none sm:flex">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Turn
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {state.turn}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              R{state.round}
            </span>
          </span>
        </div>

        <ol
          aria-label={`Turn structure — ${STEP_LABELS[state.step]}`}
          className="hidden min-w-0 items-center gap-0.5 rounded-lg bg-muted/40 p-0.5 md:flex"
        >
          {PHASES.map((entry, index) => {
            const current = index === phaseIndex;
            const done = index < phaseIndex;
            return (
              <li key={entry.id}>
                <span
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'block whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium leading-4 transition-colors',
                    current
                      ? 'bg-foreground text-background'
                      : done
                        ? 'text-foreground/70'
                        : 'text-muted-foreground/60'
                  )}
                >
                  {current ? STEP_LABELS[state.step] : entry.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Who is acting, and on what. */}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 flex-col items-end leading-tight xl:flex">
          <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-foreground">
            {botThinking && !myTurn && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-foreground" />
            )}
            {status}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {over
              ? 'Game over'
              : myTurn
                ? 'You have priority'
                : `${active?.name ?? 'Opponent'} has priority`}
          </span>
        </div>

        {/* Table utilities. Small, quiet, never in the way of the two big presses. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          <HudToggle
            label={autoAdvance ? 'Auto-advance on' : 'Auto-advance off'}
            icon={Zap}
            active={autoAdvance}
            onClick={onToggleAuto}
          />
          <HudToggle
            label={botsPaused ? 'Resume the opponents' : 'Pause the opponents'}
            icon={botsPaused ? PlayIcon : Pause}
            active={botsPaused}
            onClick={onToggleBots}
          />
          <HudToggle
            label="Free cast — ignore mana"
            icon={Sparkles}
            active={freeCast}
            onClick={onToggleFreeCast}
          />
          <HudToggle label="Undo the last action" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
          <HudToggle
            label="Advance one step"
            icon={ChevronRight}
            disabled={over || ending}
            onClick={onAdvance}
          />
        </div>

        {/* Attack is the other press that matters, and only when it is real. */}
        {canAttack && onAttack && (
          <button
            type="button"
            onClick={onAttack}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold uppercase tracking-wide text-background shadow-md shadow-black/40 transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Swords className="h-4 w-4" />
            <span className="hidden sm:inline">Attack</span>
          </button>
        )}

        {/* The one press. */}
        <button
          type="button"
          onClick={onEndTurn}
          disabled={!myTurn || over || ending}
          title={myTurn ? 'End your turn' : `Waiting on ${active?.name ?? 'another seat'}`}
          className={cn(
            // A fixed floor on the width so the label changing from END TURN to
            // a player's name does not resize the loudest control on screen.
            'flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors md:min-w-[9.5rem] md:px-5 md:text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            myTurn && !over
              ? 'bg-destructive text-destructive-foreground shadow-lg shadow-black/50 hover:bg-destructive/90 disabled:opacity-70'
              : 'bg-muted/70 text-muted-foreground'
          )}
        >
          {ending && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="truncate">
            {over
              ? 'Game over'
              : myTurn
                ? ending
                  ? 'Ending…'
                  : 'End turn'
                : `${active?.name ?? 'Opponent'}'s turn`}
          </span>
        </button>
      </div>
    </div>
  );
}

export default PlayHUD;
