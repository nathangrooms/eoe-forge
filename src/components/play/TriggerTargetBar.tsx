/**
 * A triggered ability is waiting to be pointed at something.
 *
 * ## Why it interrupts, and why that is right
 *
 * CR 603.3d, an ability's targets are chosen as it goes on the stack, off the
 * board as it stands then. So `drainTriggers` stops when the top trigger offers
 * its controller a real choice, and everything under it stops too, because
 * nothing under it is on the stack yet. The queue sits on
 * `GameState.pendingTriggers` and the game resumes on the answer.
 *
 * That means this is not decoration. While the question is open the game is
 * genuinely waiting, and if nothing asks it the table hangs.
 *
 * ## It draws nothing, and that is the change
 *
 * It used to draw a strip with the trigger's clause and a name per candidate.
 * The clause was the good half and it has moved to `AimLayer`, which draws it
 * for a spell and an activated ability as well. The names were the bad half:
 * measured at 30 chips on a normal board, 14 of them repeats of another chip,
 * each one a median 574px away from the card it stood for.
 *
 * So this component is now the seat's half of the question and nothing else. It
 * works out what the engine is asking, publishes it through `TargetChoiceRow`,
 * and the TABLE answers: the legal permanents light up, everything else
 * recedes, and pressing the creature announces the ability. One seam, shared
 * with `SpellTargetPanel` and `AbilityPanel`, so the three of them cannot drift
 * into three different ideas of what pointing at something looks like.
 *
 * ## It answers for one seat only
 *
 * The trigger's controller. `triggerAwaitingTargets` reports whose decision it
 * is and the page passes the viewer's seat; a bot's waiting trigger publishes
 * nothing and is answered by `bot.ts` on its own tick. Same split as priority,
 * and the same reason: a seat does not get to operate somebody else's cards.
 *
 * ## And the refusal case never reaches here
 *
 * An ability with no legal target is removed from the stack by the engine
 * (CR 603.3d) and says so in the log. It is not a question, so it is not asked.
 * That is also why there is no way to dismiss this one: what Escape offers is
 * "start this question again", because there is always something to press and
 * the engine will not move until one of them is pressed.
 */

import { TargetChoiceRow } from './TargetChoice';
import {
  announceTriggerTargetsAction,
  triggerAwaitingTargets,
  type ActivationChoices,
  type GameAction,
  type GameState,
  type PlayerId,
  type StackTarget,
} from '@/lib/game';
import { useState } from 'react';

export interface TriggerTargetBarProps {
  state: GameState;
  /** The seat this device controls. Only its own triggers are answered here. */
  viewerPlayerId: PlayerId;
  /** The batch goes here. The page holds the reducer. */
  onDispatch: (actions: GameAction[]) => void;
  className?: string;
}

export function TriggerTargetBar({
  state,
  viewerPlayerId,
  onDispatch,
  className,
}: TriggerTargetBarProps) {
  /*
   * Answers given so far for THIS trigger, keyed by nothing: there is only ever
   * one waiting trigger, and it is the top of the queue. Cleared as soon as the
   * announcement goes out, because the next trigger is a different question.
   */
  const [choices, setChoices] = useState<ActivationChoices>({});

  const ask = triggerAwaitingTargets(state, choices);

  const answer = (target: StackTarget) => {
    if (!ask) return;
    const targets = [...(choices.targets ?? [])];
    targets[ask.choice.ref] = target;
    const merged: ActivationChoices = { ...choices, targets };

    /*
     * Does that finish it? Ask the engine rather than counting presses. An
     * ability whose second target is forced settles on the first answer, and
     * `triggerAwaitingTargets` is the same query the question is drawn from, so
     * the two cannot disagree about whether it is done.
     */
    const next = triggerAwaitingTargets(state, merged);
    if (next) {
      setChoices(merged);
      return;
    }

    onDispatch([announceTriggerTargetsAction(ask.trigger, targets, Date.now())]);
    setChoices({});
  };

  if (!ask) return null;
  if (ask.playerId !== viewerPlayerId) return null;

  return (
    <TargetChoiceRow
      state={state}
      choice={ask.choice}
      onAnswer={answer}
      className={className}
      aim={{
        seatId: viewerPlayerId,
        sourceName: ask.trigger.sourceName,
        sourceInstanceId: ask.trigger.sourceInstanceId,
        /* The card's own clause, verbatim. A player has to be able to check the
           engine against the card rather than against a paraphrase of it. */
        clause: ask.trigger.dsl?.text ?? ask.trigger.ability.clause,
        /* Not "cancel". The trigger is on the stack and it is not going
           anywhere; what this undoes is the answers given so far. */
        cancelLabel: 'Start again',
        onCancel: () => setChoices({}),
      }}
    />
  );
}

export default TriggerTargetBar;
