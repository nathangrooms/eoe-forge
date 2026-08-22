/**
 * DeckMatrix — shared game-state core: aiming a spell as it is cast.
 *
 * ## The hole this fills
 *
 * `CastOptions.targets` has existed since the stack did, and its own doc
 * comment said plainly that no surface supplied it. Twenty recorded commander
 * games measured what that costs: of 498 distinct instants and sorceries in the
 * eighty decklists, 271 compile to text the engine can run and **187 of those
 * name a target nobody asks for**. A spell like that reaches the top of the
 * stack, finds `object.targets` empty, and prints "no target was chosen when it
 * was cast" instead of doing what it says.
 *
 * `activate.ts` has had the asker all along, for an ACTIVATED ability: the
 * legality rules, the CR 601.2c refusal when nothing legal exists, the "a
 * forced choice is not a choice" shortcut, and the `PendingChoice` shape a
 * caller answers. A `SpellAbility` carries the identical `TargetSpec[]`, so
 * this module reuses that machinery rather than writing a second copy of it.
 * `chooseTargetsFor` and `targetCandidatesFor` are that machinery, exported for
 * exactly this.
 *
 * ## Nothing here decides anything
 *
 * Same bargain as `planActivation`. One legal candidate is taken, because a
 * forced choice is not a choice. Several is a DECISION, and the plan comes back
 * refused carrying the question. `planCastWith` runs the ask-and-answer loop
 * for a caller with a policy — `bot.ts` has one, a person pressing the mat is
 * another — and it is the exact twin of `planActivationWith`.
 *
 * ## What it does not do
 *
 * A spell needing two targets at once is refused rather than half-announced;
 * that limit is `chooseTargetsFor`'s and is stated there. Modes on a spell are
 * not asked for here: `planCastFromHand` has no mode field to carry them onto
 * the stack object, so a modal instant still resolves on its compiled default.
 * Alternative and additional costs are not modelled.
 *
 * Pure: no clock (`at` is passed in), no randomness, no React.
 */

import type { SpellAbility, TargetSpec } from '../cards/abilities/dsl.ts';
import type { CardInstance, GameState, InstanceId, PlayerId, StackTarget } from './types.ts';
import { getCard } from './rules.ts';
import { abilitiesFor, announcedTargetsOf } from './abilities/card-abilities.ts';
import { auraNeedsHost } from './attach.ts';
import { chooseTargetsFor, type ActivationChoices, type PendingChoice } from './activate.ts';
import { planCastFromHand, type CastOptions, type CastPlan } from './moves.ts';

/**
 * The `kind: 'spell'` abilities on a card — an instant or sorcery's own text.
 *
 * The same filter `compiledSpellActions` applies at resolution, so what is
 * aimed here is what runs there. Measured over the cached Scryfall bulk file:
 * the compiler emits this kind for 3,648 of 7,358 instants and sorceries and
 * for 0 of 29,136 permanents, which is why no type check is needed around it.
 */
export function spellAbilitiesOf(card: CardInstance | null | undefined): SpellAbility[] {
  if (!card) return [];
  return abilitiesFor(card).abilities.filter(
    (ability): ability is SpellAbility => ability.kind === 'spell'
  );
}

/**
 * Every target this spell announces, in the order the card names them.
 *
 * POSITION IS THE CONTRACT. `{sel:'target', ref: n}` in the compiled effects is
 * a plain index into `StackObject.targets`, so the list is keyed by `ref` and a
 * gap is left as a gap. Two spell abilities on one card number their refs from
 * zero independently, so a later one overwriting an earlier one at the same ref
 * would point the first ability at the second's victim. That cannot be repaired
 * here without renumbering the compiled effects too, so the FIRST claim on a
 * ref wins and the second is dropped. The dropped one then resolves against a
 * target chosen for its neighbour, which is the same answer the engine gives
 * today for every one of these cards and is not made worse by aiming the first.
 *
 * ## A REF NOTHING READS IS NOT A TARGET
 *
 * `announcedTargetsOf` is that rule and it lives in `card-abilities.ts`,
 * because `stack.ts` has to answer the same question at resolution and two
 * readings of one spec list is what put Personify onto the stack aimed at the
 * same creature six times. The reason it happens, and the count, are written
 * there.
 */
export function spellTargetSpecs(card: CardInstance | null | undefined): TargetSpec[] {
  const byRef = new Map<number, TargetSpec>();
  for (const ability of spellAbilitiesOf(card)) {
    for (const spec of announcedTargetsOf(ability)) {
      if (!byRef.has(spec.ref)) byRef.set(spec.ref, spec);
    }
  }
  return [...byRef.values()].sort((a, b) => a.ref - b.ref);
}

/** True when this card announces at least one target as it is cast. */
export function spellNeedsATarget(card: CardInstance | null | undefined): boolean {
  return spellTargetSpecs(card).length > 0;
}

export interface SpellTargetResult {
  targets: StackTarget[];
  /** Empty when every target is settled. A sentence, never a code. */
  reason: string;
  /** Decisions still outstanding. Non-empty only when `reason` is set. */
  pending: PendingChoice[];
}

/**
 * Line this spell's targets up against the board, asking for what is undecided.
 *
 * CR 601.2c: targets are chosen as the spell is CAST, off the board as it
 * stands now, and a spell with no legal target cannot be cast at all. That last
 * one is the rule the bot's "a removal spell with no legal target is not cast"
 * policy is: it does not need a policy, it needs this function's refusal.
 */
export function planSpellTargets(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance | null | undefined,
  choices: ActivationChoices = {}
): SpellTargetResult {
  if (!card) return { targets: [], reason: 'That card is not in this game.', pending: [] };
  const specs = spellTargetSpecs(card);
  if (specs.length === 0) return { targets: [], reason: '', pending: [] };
  return chooseTargetsFor(state, playerId, card, specs, choices, choices.x ?? 0);
}

export interface TargetedCastPlan extends CastPlan {
  /** Decisions still outstanding. Non-empty only when `ok` is false. */
  pending: PendingChoice[];
}

/**
 * Cast one card, letting a CALLER answer whatever the engine will not decide.
 *
 * The twin of `planActivationWith`, deliberately down to the eight-pass bound
 * and the "a decider that hands back the wrong shape gives up" rule. The
 * decider is injected rather than built in, so the engine still chooses
 * nothing: `bot.ts` passes its own policy and a test passes "take the first
 * candidate", and what they share is this loop, so no caller can drift into a
 * different idea of what a legal target is.
 *
 * An Aura is left alone. `planCastFromHand` already asks for its host through
 * `hostChoices`, that answer already rides onto the stack object as the target,
 * and a second asker would announce the same thing twice.
 */
export function planCastWith(
  state: GameState,
  playerId: PlayerId,
  instanceId: InstanceId,
  decide: (choice: PendingChoice) => StackTarget | InstanceId[] | number[] | null,
  options: CastOptions = {}
): TargetedCastPlan {
  const card = getCard(state, instanceId);
  const plain = (plan: CastPlan): TargetedCastPlan => ({ ...plan, pending: [] });

  if (!card) return plain(planCastFromHand(state, playerId, instanceId, options));
  if (auraNeedsHost(card)) return plain(planCastFromHand(state, playerId, instanceId, options));
  if (!spellNeedsATarget(card)) return plain(planCastFromHand(state, playerId, instanceId, options));

  /*
   * A target only reaches the stack object, so a cast that is not going onto
   * the stack cannot carry one. Planned anyway rather than skipped, because the
   * CR 601.2c refusal — no legal target means no cast — is true in both
   * configurations and a caller that took the immediate branch would otherwise
   * cast a removal spell at nobody and bin it.
   */
  const choices: ActivationChoices = {};

  for (let pass = 0; pass < 8; pass++) {
    const aim = planSpellTargets(state, playerId, card, choices);

    if (aim.reason) {
      if (aim.pending.length === 0) {
        return {
          ok: false,
          actions: [],
          payment: { ok: false, tapIds: [], spend: [], required: 0, available: 0, reason: aim.reason },
          destination: 'graveyard',
          tax: 0,
          reason: aim.reason,
          hostChoices: [],
          hostPrompt: '',
          pending: [],
        };
      }
      const choice = aim.pending[0];
      const answer = decide(choice);
      if (!answer || Array.isArray(answer)) {
        return {
          ok: false,
          actions: [],
          payment: { ok: false, tapIds: [], spend: [], required: 0, available: 0, reason: aim.reason },
          destination: 'graveyard',
          tax: 0,
          reason: aim.reason,
          hostChoices: [],
          hostPrompt: '',
          pending: aim.pending,
        };
      }
      const targets = [...(choices.targets ?? [])];
      targets[choice.ref] = answer;
      choices.targets = targets;
      continue;
    }

    return plain(planCastFromHand(state, playerId, instanceId, { ...options, targets: aim.targets }));
  }

  const last = planSpellTargets(state, playerId, card, choices);
  return {
    ok: false,
    actions: [],
    payment: { ok: false, tapIds: [], spend: [], required: 0, available: 0, reason: last.reason },
    destination: 'graveyard',
    tax: 0,
    reason: last.reason || `The engine could not settle ${card.name}'s targets.`,
    hostChoices: [],
    hostPrompt: '',
    pending: last.pending,
  };
}
