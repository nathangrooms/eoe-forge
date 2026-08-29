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
 *   **The table settings moved into the board's right-hand rail.** Card size
 *   for the board and the hand, auto-advance, paused bots and free cast all
 *   live in the game menu now, because a slider belongs where there is room for
 *   it rather than squeezed into a 32px HUD button.
 *
 *   **END TURN is the loudest thing on screen.** It is red, it is on the right,
 *   it is one press, and when it is not your turn it stops being a button and
 *   becomes the label that tells you whose turn it is. Red on a game control is
 *   not decoration; it is the single most consequential press in Magic.
 */

import {
  ChevronRight,
  Eye,
  Hand as HandIcon,
  LayoutGrid,
  Loader2,
  LogOut,
  SlidersHorizontal,
  Swords,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PHASE_OF_STEP, STEP_LABELS, type GameState, type Phase, type PlayerId } from '@/lib/game';
import {
  DECISION_ACTION,
  DECISION_LABEL,
  OPENING_ACTION,
  OPENING_LABEL,
  decisionOwnsTheButton,
  waitingLine,
  type OpeningStop,
  type PlayDecision,
} from './turnFlow';

export type PlayViewId = 'table' | 'hand' | 'view';

export interface PlayHUDProps {
  state: GameState;
  view: PlayViewId;
  onViewChange: (view: PlayViewId) => void;
  viewerPlayerId: PlayerId;
  /** True when combat exists — puts a marker on the combat tab. */
  combatLive: boolean;
  botThinking: boolean;
  /** Opens the right-hand rail: card size sliders and the table settings. */
  onOpenMenu: () => void;
  menuOpen: boolean;
  /** Which opponent "View" is focused on, and the seats it can choose from. */
  viewSeatId: PlayerId | null;
  onViewSeat: (playerId: PlayerId) => void;
  /** The decision this seat owes the table, or null while the game is flowing. */
  decision: PlayDecision | null;
  /**
   * Go to where that decision is made. Pressed from the big control when the
   * game is waiting for this seat and END TURN is not the answer.
   */
  onDecision?: () => void;
  /**
   * Why the owed decision cannot be committed yet, or ''. Today that is one
   * thing: a block group the rules refuse, usually menace with one blocker.
   *
   * It is handed in rather than derived here because the combat bar's own
   * confirm refuses for exactly the same reason, and the two controls commit
   * the same decision. `combatUi.illegalBlockReason` is the single answer both
   * of them ask for. A pressable button that silently does nothing is the
   * defect this whole prop exists to stop.
   */
  decisionBlocked?: string;
  /**
   * The owed decision worded with its own numbers, when it has any.
   *
   * `DECISION_ACTION` gives the generic word ("Declare blockers"). Combat can
   * say more than that and used to say it on a SECOND control: the strip under
   * this bar carried "No blocks" and "Confirm 2 blocks" while this button said
   * "Declare blockers", so one decision was offered twice, worded differently,
   * seventy pixels apart. The owner has that on the defect list by name, and
   * the mulligan was fixed the same way — the numbers come up here and the
   * strip goes back to saying what is being decided.
   *
   * Empty or absent falls back to the generic word, so every decision that has
   * no count to report is untouched.
   */
  decisionAction?: string;
  /**
   * The opening hand, while it is still unanswered.
   *
   * Handed in rather than read off the state, because the mulligan is `/play`'s
   * own step and the reducer has already started turn one underneath it. Set,
   * it outranks everything: the game genuinely cannot move, so END TURN must
   * neither be offered nor be pressable. See `turnFlow.ts` for what pressing it
   * used to do.
   */
  opening?: OpeningStop | null;
  /** Answer the opening hand from the HUD: keep, or put the owed cards back. */
  onOpening?: () => void;
  /**
   * Shuffle the opening hand back and draw seven more.
   *
   * The other half of the same decision, and it belongs beside the first half.
   * Keep sat here, in the top bar, while Mulligan sat in a bar over the
   * opponent's seat: one question with its two answers in two places, which is
   * the split the owner called out about combat. Absent once the player has
   * kept, because the bottoming step has no mulligan in it.
   */
  onMulligan?: () => void;
  /** True while a mulligan is still allowed, so the control is real. */
  canMulligan?: boolean;
  /** False while a bottoming step is still short of, or over, its count. */
  openingReady?: boolean;
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

/**
 * The places you can be. Combat is deliberately not one of them.
 *
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens"*. Attackers and blockers are
 * declared on the table — swords on the creatures, `CombatBar` for the confirm
 * — so offering Combat here as a fourth destination would advertise a takeover
 * that no longer happens. The `'combat'` view id is gone from the union too:
 * while it existed, `/play` still switched to it and still rendered a second
 * copy of the board. There are three places, and combat is on all of them.
 */
const VIEWS: Array<{ id: PlayViewId; label: string; icon: typeof LayoutGrid; hint: string }> = [
  { id: 'table', label: 'Table', icon: LayoutGrid, hint: 'All four quadrants, everything upright' },
  { id: 'hand', label: 'Hand', icon: HandIcon, hint: 'The same table view, your seat alone' },
  { id: 'view', label: 'View', icon: Eye, hint: "An opponent's board, full screen" },
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
  icon: typeof Undo2;
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
  onOpenMenu,
  menuOpen,
  viewSeatId,
  onViewSeat,
  decision,
  onDecision,
  decisionBlocked = '',
  decisionAction = '',
  opening = null,
  onOpening,
  onMulligan,
  canMulligan = false,
  openingReady = true,
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

  /* The opening hand outranks every other reading of the board. The reducer has
     already started turn one, so `myTurn` is true and `decision` is null, and
     without this the button would offer END TURN over a hand nobody has kept
     yet. `turnFlow.ts` records what that press did. */
  const waitingOnOpening = !over && opening !== null;

  /* The game is waiting for this seat, and END TURN is not what it wants. This
     is true on somebody else's turn when you are the one blocking, which is
     exactly where the old `myTurn` question gave the wrong answer. */
  const owed = !over && !waitingOnOpening && decisionOwnsTheButton(decision);

  const status = over
    ? state.winnerIds.length > 0
      ? `${state.players.find(p => p.id === state.winnerIds[0])?.name ?? 'Someone'} wins`
      : 'A draw'
    : waitingOnOpening
      ? OPENING_LABEL[opening as OpeningStop]
      : decision
        ? DECISION_LABEL[decision]
        : botThinking
          ? /* The viewer's own seat is named "You", so `${name} is thinking`
               printed "You is thinking…". Measured off a 1920 screenshot of a
               real game rather than deduced. It happens whenever the seat this
               device is watching through is being played for you, which is
               every turn of `/simulate` and any table where the viewer's own
               seat is a bot. */
            myTurn
            ? 'Thinking…'
            : `${active?.name ?? 'Opponent'} is thinking…`
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
                {/* Somebody is swinging. It is marked on the tab that shows the
                    whole pod, because that is where you go to see it. */}
                {entry.id === 'table' && combatLive && (
                  <span
                    aria-label="combat in progress"
                    className="h-1.5 w-1.5 rounded-full bg-destructive"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* View mode needs a seat. The pod is small, so the seats are chips
            rather than a select — one press to look at somebody's board. */}
        {view === 'view' && (
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            {state.players
              .filter(player => player.id !== viewerPlayerId)
              .map(player => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onViewSeat(player.id)}
                  aria-pressed={viewSeatId === player.id}
                  title={`Look at ${player.name}'s board`}
                  className={cn(
                    'h-8 max-w-[8rem] truncate rounded-md px-2 text-xs font-medium transition-colors',
                    viewSeatId === player.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {player.name}
                </button>
              ))}
          </div>
        )}
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
          aria-label={`Turn structure, currently ${STEP_LABELS[state.step]}`}
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
        {/* `xl:flex` before this, so the one line saying whether the game was
            waiting for you vanished entirely below 1280px wide. */}
        <div className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
          <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-foreground">
            {botThinking && !myTurn && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-foreground" />
            )}
            {status}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {waitingLine({
              over,
              decision,
              myTurn,
              activeName: active?.name ?? null,
              opening,
            })}
          </span>
        </div>

        {/* Table utilities. Small, quiet, never in the way of the two big presses. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          <HudToggle label="Undo the last action" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
          <HudToggle
            label="Advance one step"
            icon={ChevronRight}
            disabled={over || ending}
            onClick={onAdvance}
          />
          <HudToggle
            label="Game menu: card size and table settings"
            icon={SlidersHorizontal}
            active={menuOpen}
            onClick={onOpenMenu}
          />
        </div>

        {/*
          The second answer to the opening hand, next to the first.

          Drawn quieter than the primary because keeping is the common answer,
          and drawn at all only while the mulligan is still on offer.
        */}
        {canMulligan && onMulligan && (
          <button
            type="button"
            onClick={onMulligan}
            title="Shuffle this hand back and draw seven more"
            className="flex h-10 shrink-0 items-center rounded-lg bg-muted/70 px-3 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Mulligan
          </button>
        )}

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
          onClick={waitingOnOpening ? onOpening : owed ? onDecision : onEndTurn}
          disabled={
            over ||
            ending ||
            (waitingOnOpening ? !openingReady : !owed && !myTurn) ||
            (owed && !!decisionBlocked)
          }
          title={
            waitingOnOpening
              ? OPENING_LABEL[opening as OpeningStop]
              : owed && decisionBlocked
                ? decisionBlocked
                : owed && decision
                  ? DECISION_LABEL[decision]
                  : myTurn
                    ? 'End your turn'
                    : `Waiting on ${active?.name ?? 'another seat'}`
          }
          className={cn(
            // A fixed floor on the width so the label changing from END TURN to
            // a player's name does not resize the loudest control on screen.
            'flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors md:min-w-[9.5rem] md:px-5 md:text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !over && (waitingOnOpening || owed || myTurn)
              ? 'bg-destructive text-destructive-foreground shadow-lg shadow-black/50 hover:bg-destructive/90 disabled:opacity-70'
              : 'bg-muted/70 text-muted-foreground'
          )}
        >
          {ending && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="truncate">
            {over
              ? 'Game over'
              : waitingOnOpening
                ? OPENING_ACTION[opening as OpeningStop]
                : owed && decision
                  ? decisionAction || DECISION_ACTION[decision]
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
