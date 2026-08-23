/**
 * DeckMatrix — shared game-state core: aiming a TRIGGERED ability.
 *
 * ## One seam, not two
 *
 * "Who is this pointed at" is one question, and this project has already
 * answered it twice: `activate.ts` for an ability a player uses, and
 * `cast-targets.ts` for a spell a player casts. Both end in
 * `chooseTargetsFor`, which owns the legality, the CR 601.2c refusal when
 * nothing legal exists, and the "a forced choice is not a choice" shortcut.
 *
 * A triggered ability carries the identical `TargetSpec[]`, so this file is the
 * third caller of that one function rather than a third implementation of it.
 * Nothing about a target's legality is decided here.
 *
 * ## What was actually missing, and it was not the legality
 *
 * `trigger-bridge.ts` refused every targeted trigger outright — *"needs
 * announced targets, which triggers cannot yet carry"* — which kept **1,364
 * compiled abilities on 1,077 cards** with the old regex detector. Counted by
 * `scripts/xmage/trigger-target-census.mjs` over all 32,469 pool cards, with
 * the same pool filter `verify-ability-coverage.mjs` uses, so the denominator
 * is the one every coverage figure here is quoted against.
 *
 * Of those 1,364, only **1,109 announce anything a compiled effect actually
 * reads**; the other 255 are specs no `{sel:'target'}` ever indexes, so
 * refusing on them refused for nothing.
 *
 * The refusal was honest. `PendingTrigger` had no `targets` field, so
 * `dslTriggerActions` built a context whose `targets` array was empty, and
 * `{sel:'target', ref:0}` resolved to nobody. Angel of Despair would have
 * entered the battlefield and destroyed nothing.
 *
 * ## Why the announcement is an ACTION and not a callback
 *
 * The reducer is pure and the action log is the only authority: replay the log
 * on another client and it must land on byte-identical state. A prompt that
 * paused `applyAction` could not be replayed, and a target chosen outside the
 * log would exist on one screen and not the other. So the choice travels as
 * `ANNOUNCE_TRIGGER_TARGETS`, the same shape `triggerOrder` and
 * `replacementOrder` already use for the two other decisions CR hands to a
 * player mid-resolution.
 *
 * That has a consequence worth stating plainly: **a trigger that needs a real
 * decision HALTS the drain.** `drainTriggers` stops rather than resolving it,
 * the trigger stays visible on `pendingTriggers`, and the game waits for its
 * controller. That is what a game of Magic does. It also means every seat must
 * have somebody willing to answer — `bot.ts` answers for its own, the mat
 * answers for the human — and a seat with neither is a hung game, which the
 * playtest harness reports as a stall rather than hiding.
 *
 * ## Most triggers never wait
 *
 * A forced choice is not a choice. `chooseTargetsFor` takes the single legal
 * candidate itself, so "when this enters, destroy target creature an opponent
 * controls" with one creature across the table announces itself and resolves
 * without anybody being asked, identically on every client.
 *
 * Pure: no clock, no randomness, no React.
 */

import type { TargetSpec } from '../cards/abilities/dsl.ts';
import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PendingTrigger,
  PlayerId,
  StackTarget,
} from './types.ts';
import { getCard, getPlayer, isAlive } from './rules.ts';
import { canBeTargetedBy } from './keywords.ts';
import { announcedTargetsOf } from './abilities/card-abilities.ts';
import { chooseTargetsFor, type ActivationChoices, type PendingChoice } from './activate.ts';

/*
 * `triggers.ts` is deliberately NOT imported, and the one-liner below is
 * deliberately duplicated from its `pendingTriggersOf`.
 *
 * The dependency has to point one way: `triggers.ts` calls `planTriggerTargets`
 * from this file to decide whether the drain may continue, so an import back
 * would close the loop in the module the reducer depends on. Same trade
 * `context.ts` documents for its copies of three `rules.ts` accessors.
 *
 * It reads through a function rather than touching `state.pendingTriggers`
 * inline for the reason that field's own comment gives: the record is optional,
 * so a game saved before it existed still loads.
 */
const queueOf = (state: GameState): readonly PendingTrigger[] => state.pendingTriggers ?? [];

/* -------------------------------------------------------------------------- */
/* What a trigger announces                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every target this triggered ability announces, in the order the card names
 * them.
 *
 * `announcedTargetsOf` is the rule, and it lives in `card-abilities.ts`
 * because a spell asks the identical question: A REF NOTHING READS IS NOT A
 * TARGET. A compiled `targets` list can carry a spec no effect ever indexes,
 * and announcing one of those would ask a player to point at something that
 * changes nothing.
 *
 * Empty for a trigger the old detector owns, because `PendingTrigger.dsl` is
 * present exactly when the ability engine owns the card.
 */
export function triggerTargetSpecs(trigger: PendingTrigger | null | undefined): TargetSpec[] {
  if (!trigger?.dsl) return [];
  return announcedTargetsOf(trigger.dsl);
}

/** True when this trigger has to be pointed at something before it can resolve. */
export function triggerNeedsATarget(trigger: PendingTrigger | null | undefined): boolean {
  return triggerTargetSpecs(trigger).length > 0;
}

export interface TriggerTargetResult {
  /** Indexed by `TargetSpec.ref`. Holes are holes; nothing is compacted. */
  targets: StackTarget[];
  /** Empty when every target is settled. A sentence, never a code. */
  reason: string;
  /** Decisions still outstanding. Non-empty only when `reason` is set. */
  pending: PendingChoice[];
  /**
   * CR 603.3d — the ability names a target and the board offers none, so it is
   * removed from the stack and does nothing. Distinct from `pending`, because
   * it is an ANSWER rather than a question: nobody is being asked, and the
   * drain must not wait for one.
   */
  impossible: boolean;
}

/**
 * The source card an announcement is judged against.
 *
 * A dies trigger's source is in a graveyard by the time this is asked, and it
 * is still the source: CR 603.6d resolves the ability off last known
 * information. The card object is what `targetCandidatesFor` reads for CR 115.6
 * (protection and hexproof are judged against the source) and what a filter's
 * `{sel:'self'}` resolves to, so a missing one is a refusal rather than a guess.
 */
function sourceOf(state: GameState, trigger: PendingTrigger): CardInstance | undefined {
  return state.cards[trigger.sourceInstanceId];
}

/**
 * Line one waiting trigger's targets up against the board, asking for whatever
 * the engine will not decide.
 *
 * The exact twin of `planSpellTargets`, down to the shared `chooseTargetsFor`
 * call. What differs is only WHEN it is asked: a spell is aimed as it is cast
 * (CR 601.2c), a trigger as it goes on the stack (CR 603.3d), which for this
 * engine is the moment it comes off `pendingTriggers`.
 */
export function planTriggerTargets(
  state: GameState,
  trigger: PendingTrigger,
  choices: ActivationChoices = {}
): TriggerTargetResult {
  const specs = triggerTargetSpecs(trigger);
  if (specs.length === 0) return { targets: [], reason: '', pending: [], impossible: false };

  const card = sourceOf(state, trigger);
  if (!card) {
    /*
     * The source has left the GAME, not merely the battlefield —
     * `resolveTriggerActions` already has its own sentence for that and puts it
     * in the log. Reported as impossible so the drain resolves the trigger into
     * that sentence rather than waiting for an answer nobody can give.
     */
    return {
      targets: [],
      reason: `${trigger.sourceName}'s source has left the game, so nothing can be chosen for it.`,
      pending: [],
      impossible: true,
    };
  }

  const aim = chooseTargetsFor(state, trigger.controllerId, card, specs, choices, choices.x ?? 0);

  /*
   * CR 603.3d — a trigger that requires a target and has none legal is simply
   * removed from the stack. That is the same sentence CR 601.2c gives a spell,
   * and `chooseTargetsFor` writes it once for both; the difference is what
   * happens next, because a spell is never cast and a trigger has already
   * triggered. `impossible` is that difference.
   *
   * `aim.blocked` is the first half and it used to be missing, which hung a
   * table. "Nothing is being asked" is only the same question as "no answer
   * would help" when the ability names ONE target. With two, one spec can be
   * asking while the other has no candidates at all, and then the drain waits
   * on a question whose answer changes nothing. Energy Chamber did exactly
   * that: playtest seed 9001 stopped at turn 43 upkeep with every bot returning
   * null. The second half is kept because it is still the honest reading for a
   * refusal `blocked` does not name, such as an announcement whose refs could
   * not be lined up in order.
   */
  return { ...aim, impossible: aim.blocked || (!!aim.reason && aim.pending.length === 0) };
}

/* -------------------------------------------------------------------------- */
/* CR 608.2b — is it still a legal target when the thing resolves             */
/* -------------------------------------------------------------------------- */

/**
 * The object a target was chosen for: whose ability it is, and off which card.
 *
 * Both matter and neither is optional in spirit. Hexproof is judged against the
 * ability's CONTROLLER and protection against its SOURCE, so a rule handed only
 * one of the two would let a spell you control resolve at your opponent's
 * hexproof creature.
 */
export interface TargetingSource {
  controllerId: PlayerId;
  sourceInstanceId?: InstanceId;
}

/**
 * CR 608.2b — is this target still a legal one, as the thing pointed at it
 * resolves.
 *
 * ONE COPY OF THE RULE, and this is the file that holds it because it is the
 * file that holds the announcement. A spell asks through `stack.ts`'s
 * `targetIsLegal`, which is now a two-line adapter onto this; a triggered
 * ability asks through `triggers.ts`. Before they shared it, only the spell
 * half existed, and adding a second copy for triggers is how the flicker check
 * ends up on one path and not the other.
 *
 * Three ways a target goes illegal between announcement and resolution: the
 * player left the game, the card changed zones (CR 400.7 — what is there now is
 * a different object), or it gained hexproof, shroud or protection.
 */
export function targetStillLegal(
  state: GameState,
  target: StackTarget,
  by: TargetingSource
): boolean {
  switch (target.kind) {
    case 'player': {
      const player = target.playerId ? getPlayer(state, target.playerId) : undefined;
      return !!player && isAlive(player);
    }
    case 'card': {
      const card = target.instanceId ? getCard(state, target.instanceId) : undefined;
      if (!card || card.removedFromGame) return false;
      // Changed zones since it was targeted: a new object, so not our target.
      if (target.zone && card.zone !== target.zone) return false;
      // ...and the counter catches what the zone alone cannot — flickered out
      // and straight back, same zone, different object (CR 400.7).
      if (
        target.zoneChangeCounter !== undefined &&
        (card.zoneChangeCounter ?? 0) !== target.zoneChangeCounter
      ) {
        return false;
      }
      const sourceCard = by.sourceInstanceId ? getCard(state, by.sourceInstanceId) : undefined;
      return canBeTargetedBy(card, by.controllerId, sourceCard);
    }
    case 'stack':
      /*
       * Read off the state rather than through `stack.ts`'s own `stackObject`,
       * because `stack.ts` calls INTO this file and the dependency has to point
       * one way. The field is optional for the reason every optional field on
       * `GameState` is: a game saved before the stack existed still loads.
       */
      return !!target.stackId && (state.stack ?? []).some(object => object.stackId === target.stackId);
    default:
      return false;
  }
}

/**
 * CR 608.2b, the whole-object half: an object announced WITH targets that has
 * none left does not resolve.
 *
 * An object announced with no targets never fizzles, however dead its would-be
 * victims are, which is the half naive implementations lose.
 */
export function everyTargetIsGone(
  state: GameState,
  targets: readonly StackTarget[] | undefined,
  by: TargetingSource
): boolean {
  if (!targets || targets.length === 0) return false;
  return !targets.some(target => targetStillLegal(state, target, by));
}

/**
 * The announced targets with the illegal ones BLANKED IN PLACE.
 *
 * Positions are the contract: `{sel:'target', ref:n}` is a plain index, so
 * compacting the list would slide target 1 into slot 0 and point the first half
 * of an ability at the second half's victim — a partial fizzle turned into a
 * wrong resolution, which is worse than either. A blank entry resolves to
 * nobody in `context.ts`, which is exactly CR 608.2b for the part of the
 * ability that named it.
 */
export function blankIllegalTargets(
  state: GameState,
  targets: readonly StackTarget[] | undefined,
  by: TargetingSource
): StackTarget[] {
  return (targets ?? []).map(target =>
    targetStillLegal(state, target, by) ? target : ({ kind: 'card' } as StackTarget)
  );
}

/* -------------------------------------------------------------------------- */
/* Who is being asked, right now                                              */
/* -------------------------------------------------------------------------- */

/**
 * The decision a waiting trigger is holding the game up for, or `null`.
 *
 * ONE query, read by every surface. `bot.ts` reads it to answer for its own
 * seats, the mat reads it to draw a row of names, and an online client reads it
 * to know whose turn it is to speak. A second derivation of "what is being
 * asked" is how two of them come to disagree about which trigger is waiting.
 *
 * Only the TOP of the queue is ever reported, because `drainTriggers` pops
 * last-in-first-out and a trigger further down is not on the stack yet. Asking
 * about it would be asking a player to aim an ability before the board it will
 * see has settled.
 */
export interface TriggerAsk {
  trigger: PendingTrigger;
  /** The trigger's controller. The only seat allowed to answer. */
  playerId: PlayerId;
  /** The first outstanding decision. Answered one at a time, as elsewhere. */
  choice: PendingChoice;
  /** Answers already given for this trigger, to be carried into the next pass. */
  choices: ActivationChoices;
}

export function triggerAwaitingTargets(
  state: GameState,
  choices: ActivationChoices = {}
): TriggerAsk | null {
  const queue = queueOf(state);
  const trigger = queue[queue.length - 1];
  if (!trigger) return null;
  // Already announced. Nothing is being asked, even if the board has since
  // changed — the choice was made when the ability went on the stack.
  if (trigger.targets) return null;

  const aim = planTriggerTargets(state, trigger, choices);
  const choice = aim.pending[0];
  if (!choice) return null;
  return { trigger, playerId: trigger.controllerId, choice, choices };
}

/* -------------------------------------------------------------------------- */
/* Answering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The action that says what a waiting trigger is aimed at.
 *
 * Built here rather than by each caller so the three of them cannot spell it
 * differently. `rules.ts` validates it again against the same
 * `planTriggerTargets`, so a hand-built action carrying an illegal target is
 * refused rather than stored.
 */
export function announceTriggerTargetsAction(
  trigger: PendingTrigger,
  targets: StackTarget[],
  at = 0
): GameAction {
  return {
    type: 'ANNOUNCE_TRIGGER_TARGETS',
    triggerId: trigger.id,
    targets,
    actorId: trigger.controllerId,
    at,
    cause: `${trigger.sourceName} — choosing targets`,
  };
}

/**
 * Answer the waiting trigger with a CALLER's policy, and give back the action.
 *
 * The exact twin of `planCastWith` and `planActivationWith`, down to the
 * eight-pass bound and the "a decider that hands back the wrong shape gives up"
 * rule. The decider is injected because the engine still decides nothing:
 * `bot.ts` passes its own policy, the mat passes what a person pressed, and
 * what they share is this loop — so no caller can drift into a different idea
 * of what a legal target is.
 *
 * `null` when there is nothing waiting, or when the decider declined. Declining
 * is a real answer and it is not a failure: the trigger stays on the queue and
 * whoever else can answer still may.
 */
export function answerTriggerTargets(
  state: GameState,
  decide: (ask: TriggerAsk) => StackTarget | null,
  at = 0
): GameAction | null {
  let choices: ActivationChoices = {};

  for (let pass = 0; pass < 8; pass++) {
    const ask = triggerAwaitingTargets(state, choices);
    if (!ask) {
      // Nothing outstanding. Either nothing was ever asked, or this loop has
      // just settled the last of it — and only the second case has an answer
      // worth sending.
      if (pass === 0) return null;
      const queue = queueOf(state);
      const trigger = queue[queue.length - 1];
      if (!trigger) return null;
      const aim = planTriggerTargets(state, trigger, choices);
      if (aim.reason) return null;
      return announceTriggerTargetsAction(trigger, aim.targets, at);
    }

    const answer = decide(ask);
    if (!answer) return null;
    const targets = [...(choices.targets ?? [])];
    targets[ask.choice.ref] = answer;
    choices = { ...choices, targets };
  }

  return null;
}
