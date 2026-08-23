/**
 * WHAT IS BEING AIMED, AND WHAT IT SAYS, WHILE YOU PICK.
 *
 * The board answers "which one" (see `aiming.ts`). This is everything the board
 * cannot answer, in one strip, in the table's own material:
 *
 *   - the card that is asking, drawn as a card, with its clause verbatim, so a
 *     player can check the engine against the printed text rather than against
 *     a paraphrase of it. `TriggerTargetBar` did this and it was the one part
 *     of the old row worth keeping;
 *   - a control for every legal target that is NOT a card on a mat. A player is
 *     the common one. A card in a graveyard or an exile is the other: those
 *     piles are drawn as a single tile, so there is no card on screen to press;
 *   - a way out. Escape, and a button that says so, because a prompt that stops
 *     the game with no exit traps whoever is sitting at it.
 *
 * Escape cancels the WHOLE announcement rather than the last press of it. A
 * spell that wants two targets and has been given one comes back to zero
 * answers, because coming back to one would leave the next press meaning
 * something nobody asked for. The half of that this component owns is the
 * answers; the panel that was asking closes itself on the same key, which is
 * what withdraws the question. `CenterPreview` carries the measurement that
 * says why one without the other is not a way out at all.
 *
 * A waiting trigger is the one question Escape cannot make go away: CR 603.3d
 * chose its targets as it went on the stack and the engine is genuinely stopped
 * until it is answered. It is not a trap either, because the engine removes an
 * ability with no legal target before it ever gets here, so there is always
 * something to press. Escape on one of those clears the answers so far and asks
 * again from the top, which is what its own `cancelLabel` says.
 */

import { useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { GameCardView } from './GameCardView';
import { offBoardTargets } from './aiming';
import { useAimRequest } from './useAiming';
import type { GameState, PlayerId } from '@/lib/game';

export interface AimLayerProps {
  state: GameState;
  /** The seat this device controls. Another seat's question is not drawn here. */
  viewerPlayerId: PlayerId;
  className?: string;
}

function AimChip({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 max-w-full items-center gap-1.5 truncate rounded-md bg-foreground/[0.12] px-2.5',
        'text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.22]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <Crosshair aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
      {label}
    </button>
  );
}

export function AimLayer({ state, viewerPlayerId, className }: AimLayerProps) {
  const aim = useAimRequest(state.id, viewerPlayerId);

  /* Escape, on the window rather than on this element: the player's hands are
     on the board, not in this strip, so nothing in here will have focus when
     they want out. Deliberately does not stop the event. `CenterPreview` is
     listening for the same key and closing the panel that was asking is the
     other half of getting out. */
  useEffect(() => {
    if (!aim) return;
    const cancel = aim.cancel;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aim]);

  if (!aim) return null;

  const source = aim.sourceInstanceId ? state.cards[aim.sourceInstanceId] : undefined;
  const strays = offBoardTargets(state, aim.instanceIds);
  const onBoard = aim.instanceIds.length - strays.length;
  const seatOf = (playerId: PlayerId) =>
    state.players.find(player => player.id === playerId)?.name ?? 'A player';
  const nameOf = (instanceId: string) => state.cards[instanceId]?.name ?? 'That card';

  /* The engine's own prompt, unless it is saying the same thing the heading
     already says. Two lines reading "Choose a target" is the row of names all
     over again, one size larger. */
  const prompt =
    aim.prompt && aim.prompt.trim().toLowerCase().replace(/\.$/, '') !== 'choose a target'
      ? aim.prompt
      : '';

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex max-w-[min(94vw,46rem)] items-start gap-3 overflow-hidden rounded-xl px-3 py-2.5 shadow-xl shadow-black/50',
        className
      )}
      role="group"
      aria-label={`Choosing a target for ${aim.sourceName}`}
    >
      <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />

      {/* The card that is asking, as a card. It is the thing the player is
          checking the clause against, so a name would not do. */}
      {source && (
        <GameCardView
          card={source}
          width={54}
          ignoreTapped
          className="relative shrink-0"
          title={source.name}
        />
      )}

      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Crosshair aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Choose a target
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
            {aim.sourceName}
          </span>
        </div>

        {/* Verbatim. A player has to be able to check the engine against the
            card rather than against somebody's summary of the card. */}
        {aim.clause && (
          <p className="text-[11px] leading-snug text-foreground">{aim.clause}</p>
        )}

        {prompt && (
          <p aria-live="polite" className="text-[10px] leading-snug text-muted-foreground">
            {prompt}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {onBoard > 0 && (
            <span className="text-[10px] leading-8 text-muted-foreground">
              Press a card on the table.
            </span>
          )}

          {/* A player is not on the board, so a player gets a control. Pressing
              the seat's own life band does the same thing, for anyone who looks
              there first. */}
          {aim.playerIds.map(playerId => (
            <AimChip
              key={`p:${playerId}`}
              label={seatOf(playerId)}
              title={`Aim ${aim.sourceName} at ${seatOf(playerId)}`}
              onClick={() => aim.answerPlayer(playerId)}
            />
          ))}

          {/* A legal card that is inside a pile. There is no card on screen for
              it, so this is the only place it can be pressed. */}
          {strays.map(instanceId => (
            <AimChip
              key={`c:${instanceId}`}
              label={nameOf(instanceId)}
              title={`Aim ${aim.sourceName} at ${nameOf(instanceId)}`}
              onClick={() => aim.answerCard(instanceId)}
            />
          ))}

          <button
            type="button"
            onClick={aim.cancel}
            title={`${aim.cancelLabel} (Esc)`}
            className={cn(
              'ml-auto flex h-8 shrink-0 items-center rounded-md bg-foreground/[0.06] px-2.5',
              'text-[11px] font-medium text-muted-foreground transition-colors',
              'hover:bg-foreground/[0.14] hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {aim.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AimLayer;
