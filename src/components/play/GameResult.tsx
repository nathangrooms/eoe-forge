/**
 * How a game ends on screen.
 *
 * What this replaces, measured on 29 Aug 2026 at the end of a real game
 * (`.shots/mat-geometry/before-end.png`): a 380 x 50 bar holding one sentence
 * and one button, floating across the winner's creature row, while 76.7% of the
 * window was bare mat. The last thing a player sees was the smallest thing on
 * the screen, and it was drawn over the only cards still worth looking at.
 *
 * A game ending is the one moment a play surface is allowed to be a
 * presentation. So it is:
 *
 *   - **the winner's commander, whole.** It is the card that won, and this
 *     project's own law says show a card wherever a card could be shown instead
 *     of a name. Drawn through `GameCardView` at full size, never cropped,
 *     never desaturated.
 *   - **the final standing.** Every seat, its life, and how the ones that went
 *     out went out — `lossReasonLabel` is the engine's own wording, so nothing
 *     here invents a reason.
 *   - **a way back to the board.** The old banner was permanent and
 *     `pointer-events-auto`, so the final position could never be studied
 *     without leaving. Dismissing puts a small press back where the banner was.
 *
 * Made of `Playmat` material like the combat strip, so it is part of the table:
 * no dim, no backdrop blur over the board, no border, no centred modal. It sits
 * in the same band under the HUD every other strip uses, which is the band no
 * seat's board is drawn in.
 */

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Playmat } from './Playmat';
import { GameCardView } from './GameCardView';
import { lossReasonLabel, type GameState, type PlayerId } from '@/lib/game';

export interface GameResultProps {
  state: GameState;
  /** The seat this device plays, so the winner line can say "You win." */
  viewerPlayerId: PlayerId;
  /** False in a playtest, where nobody at the table is the reader. */
  viewerOwnsSeat?: boolean;
  /** Leave the table and set up another game. */
  onLeave: () => void;
  /** Wording for that press. A playtest goes back to the decks, not to a mode. */
  leaveLabel?: string;
  /**
   * Why the game stopped short, when it did not finish.
   *
   * A playtest can halt without a winner. The band then reports the stop rather
   * than naming a winner, because saying nothing won is different from saying
   * the game was a draw, and the engine knows which.
   */
  halted?: string | null;
  /** Deal the same table again. Playtest and goldfish have this; a bot game does not. */
  onRestart?: () => void;
  className?: string;
}

/** The card in the middle of the band. Big enough to read the name and the art. */
const RESULT_CARD_WIDTH = 118;

export function GameResult({
  state,
  viewerPlayerId,
  viewerOwnsSeat = true,
  onLeave,
  leaveLabel = 'Set up another game',
  halted = null,
  onRestart,
  className,
}: GameResultProps) {
  const [dismissed, setDismissed] = useState(false);

  const finished = state.status === 'complete';
  const winnerId = finished ? state.winnerIds[0] : undefined;
  const winner = state.players.find(p => p.id === winnerId);
  const draw = finished && state.winnerIds.length === 0;
  const mine = viewerOwnsSeat && winnerId === viewerPlayerId;

  /*
   * The commander that won, wherever it ended up.
   *
   * `player.commanders` carries the ref; the card itself may be in the command
   * zone, on the battlefield, or in a graveyard by the time the game is over,
   * so this reads `state.cards` by instance rather than looking in one zone.
   * Absent in life-counter mode, where a ref has no `instanceId` at all — the
   * band then simply has no card in it rather than a placeholder, because a
   * placeholder where a card should be is the thing this file exists to remove.
   */
  const commanderId = winner?.commanders.find(ref => ref.instanceId)?.instanceId;
  const commanderCard = commanderId ? state.cards[commanderId] : undefined;

  const headline = !finished
    ? 'The game stopped'
    : draw
      ? 'A draw'
      : mine
        ? 'You win'
        : `${winner?.name ?? 'Nobody'} wins`;

  if (dismissed) {
    return (
      <div className={cn('pointer-events-auto', className)}>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="flex items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground shadow-lg shadow-black/50 backdrop-blur-sm transition-colors hover:bg-background"
        >
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          {headline}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-[min(94vw,46rem)] items-stretch gap-4 overflow-hidden rounded-2xl p-4 shadow-[0_22px_60px_rgba(0,0,0,0.72)]',
        className
      )}
      role="status"
      aria-label={`${headline}. Turn ${state.turn}.`}
    >
      <Playmat tone="board" rounded="rounded-2xl" className="absolute inset-0 h-full w-full" />
      {/* A scrim so the standing below never depends on which part of the mat's
          weave happened to land behind a given letter. Tint, never a border. */}
      <span aria-hidden="true" className="absolute inset-0 bg-background/55" />

      {commanderCard && (
        <span className="relative shrink-0">
          <GameCardView card={commanderCard} width={RESULT_CARD_WIDTH} ignoreTapped />
        </span>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-muted-foreground">
            {finished ? 'Game over' : 'Stopped'} · Turn {state.turn} · Round {state.round}
          </p>
          <p className="truncate text-3xl font-semibold leading-tight text-foreground">
            {headline}
          </p>
          {halted && <p className="mt-0.5 text-xs text-muted-foreground">{halted}</p>}
        </div>

        {/* THE FINAL STANDING. Every seat, not just the winner: knowing you went
            out to commander damage on turn 14 is the part of a result a player
            actually talks about afterwards. */}
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {state.players.map(seat => {
            const isWinner = state.winnerIds.includes(seat.id);
            const you = viewerOwnsSeat && seat.id === viewerPlayerId;
            return (
              <li key={seat.id} className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    isWinner ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {you ? 'You' : seat.name}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    isWinner ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {seat.life}
                </span>
                {seat.lossReasons[0] && (
                  <span className="truncate text-[11px] text-muted-foreground/80">
                    {lossReasonLabel(seat.lossReasons[0])}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative flex shrink-0 flex-col justify-end gap-2">
        {onRestart && (
          <Button size="sm" className="h-9 px-4 text-xs" onClick={onRestart}>
            Play it again
          </Button>
        )}
        <Button
          size="sm"
          variant={onRestart ? 'secondary' : 'default'}
          className="h-9 px-4 text-xs"
          onClick={onLeave}
        >
          {leaveLabel}
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Look at the board
        </button>
      </div>
    </div>
  );
}

export default GameResult;
