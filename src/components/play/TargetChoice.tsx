/**
 * One question about what something is aimed at, asked once.
 *
 * ## One drawing of one question
 *
 * `PendingChoice` is the engine's shape for "a decision the engine will not
 * take on the player's behalf", and three surfaces ask it: an activated ability
 * in `AbilityPanel`, a spell being cast in `SpellTargetPanel`, and a triggered
 * ability waiting on the stack in `TriggerTargetBar`. The legality behind all
 * three is one function (`chooseTargetsFor`), so the control in front of all
 * three is one component.
 *
 * ## You point at the card
 *
 * Given `aim`, this draws nothing at all. It publishes the question to
 * `aiming.ts` and the TABLE becomes the control: the legal permanents light up,
 * everything else recedes, and a press on the creature is the answer.
 * `AimLayer` carries the parts a board cannot carry, which are the asking
 * card's own clause, a control for each legal player, a control for each legal
 * card sitting inside a pile, and the way out.
 *
 * What that replaces was measured on a normal two seat board on 23 Aug 2026: 30
 * name chips, 14 of them indistinguishable from another chip, each a median
 * 574px from the card it stood for, and a sixth of that card's area. Pressing
 * one was a guess.
 *
 * Without `aim` the row of names is still what you get, and it is still the
 * right answer there: a caller that cannot say which seat is being asked has no
 * table to point at.
 *
 * It is not a dialog and it is not a portal either way. Choosing a target is a
 * play, and plays are made on the mat.
 *
 * ## Why the answer carries what it carries
 *
 * A `StackTarget` for a card is not just an id: CR 400.7 says a card that has
 * changed zones is a DIFFERENT OBJECT, so the zone and the zone-change counter
 * are read at the moment of the press and travel with the answer. That is what
 * makes CR 608.2b able to tell "the creature I aimed at" from "a creature with
 * the same name that was flickered in response". Building the reference here,
 * once, is what stops one surface remembering the counter and another not, and
 * it is why the board hands back an id and never a target of its own making.
 */

import { cn } from '@/lib/utils';
import { aimSignature, type AimRequest } from './aiming';
import { usePublishAim } from './useAiming';
import type { GameState, InstanceId, PendingChoice, PlayerId, StackTarget } from '@/lib/game';

/**
 * What the caller has to be able to say before the table can be the control:
 * whose question it is, what is asking, and what that thing says.
 */
export interface TargetChoiceAim {
  /** The seat being asked. Only a board drawn for this seat lights up. */
  seatId: PlayerId;
  /** What is asking. "Flametongue Kavu". */
  sourceName: string;
  /** The asking card, so `AimLayer` can draw it beside its clause. */
  sourceInstanceId?: InstanceId;
  /** The card's own words. Verbatim, never a paraphrase. */
  clause?: string;
  /** What Escape and the way-out button say. */
  cancelLabel?: string;
  /** Undo the whole announcement, not the last press of it. */
  onCancel?: () => void;
}

export interface TargetChoiceRowProps {
  state: GameState;
  /** The question. */
  choice: PendingChoice;
  /** One answer. Never a list: a choice is answered one press at a time. */
  onAnswer: (target: StackTarget) => void;
  /** Overrides the choice's own prompt when the caller has a better sentence. */
  prompt?: string;
  /**
   * Hand the question to the table. Absent, the names are drawn here instead.
   *
   * `AbilityPanel` passes this only for the ability the player is answering: a
   * permanent with two targeted abilities would otherwise publish two questions
   * and the board would light up for whichever one rendered last, which is a
   * board saying something the player did not ask.
   */
  aim?: TargetChoiceAim | null;
  className?: string;
}

/** A card as a target, with CR 400.7's zone snapshot taken at the press. */
export function targetForCard(state: GameState, instanceId: InstanceId): StackTarget {
  const card = state.cards[instanceId];
  return {
    kind: 'card',
    instanceId,
    ...(card ? { zone: card.zone, zoneChangeCounter: card.zoneChangeCounter ?? 0 } : {}),
  };
}

export function TargetChip({
  label,
  title,
  onClick,
}: {
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 max-w-full items-center truncate rounded-md bg-foreground/[0.10] px-2',
        'text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.20]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {label}
    </button>
  );
}

export function TargetChoiceRow({
  state,
  choice,
  onAnswer,
  prompt,
  aim,
  className,
}: TargetChoiceRowProps) {
  const nameOf = (instanceId: InstanceId) => state.cards[instanceId]?.name ?? 'That card';
  const seatOf = (playerId: PlayerId) =>
    state.players.find(player => player.id === playerId)?.name ?? 'A player';

  const request: AimRequest | null = aim
    ? {
        tableId: state.id,
        seatId: aim.seatId,
        signature: aimSignature({
          source: aim.sourceInstanceId ?? aim.sourceName,
          kind: choice.kind,
          ref: choice.ref,
          prompt: prompt ?? choice.prompt,
          instanceIds: choice.instanceIds,
          playerIds: choice.playerIds,
        }),
        prompt: prompt ?? choice.prompt,
        sourceName: aim.sourceName,
        sourceInstanceId: aim.sourceInstanceId,
        clause: aim.clause,
        instanceIds: choice.instanceIds,
        playerIds: choice.playerIds,
        answerCard: instanceId => onAnswer(targetForCard(state, instanceId)),
        answerPlayer: playerId => onAnswer({ kind: 'player', playerId }),
        cancel: () => aim.onCancel?.(),
        cancelLabel: aim.cancelLabel ?? 'Cancel',
      }
    : null;

  // Called unconditionally, `null` included: a hook that only sometimes runs is
  // a hook that breaks the render the moment the question goes away.
  usePublishAim(request);

  // The table is drawing this question. Drawing it here as well would be the
  // row of names back, beside the board that replaced it.
  if (aim) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* The card's own words for what it wants. Never a paraphrase. */}
      <p className="text-[10px] leading-snug text-muted-foreground">{prompt ?? choice.prompt}</p>
      <div className="flex flex-wrap gap-1">
        {choice.playerIds.map(playerId => (
          <TargetChip
            key={`p:${playerId}`}
            label={seatOf(playerId)}
            title={`Aim at ${seatOf(playerId)}`}
            onClick={() => onAnswer({ kind: 'player', playerId })}
          />
        ))}
        {choice.instanceIds.map(instanceId => (
          <TargetChip
            key={`c:${instanceId}`}
            label={nameOf(instanceId)}
            title={`Aim at ${nameOf(instanceId)}`}
            onClick={() => onAnswer(targetForCard(state, instanceId))}
          />
        ))}
      </div>
    </div>
  );
}

export default TargetChoiceRow;
