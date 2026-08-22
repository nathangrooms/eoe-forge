/**
 * DeckMatrix — shared game-state core: composite moves.
 *
 * A single `GameAction` is small on purpose. "Cast this creature" is not one
 * action, it is tap-tap-tap-play; "resolve combat" is a fistful of damage and a
 * pile of graveyard moves. This module composes those batches once, so the
 * human's click and the bot's decision go down the identical path — which is
 * the whole point of routing bot play through the rules engine rather than
 * writing it a private simulator.
 *
 * Every function returns actions. Nothing here applies them; the caller feeds
 * the batch to `applyActions`, and a networked table broadcasts the same batch.
 */

import { getCard, getPlayer } from './rules.ts';
import { announceCommanderCast, taxForCard } from './commander.ts';
import {
  castingCostOf,
  isLand,
  manaSourcesFor,
  paymentActions,
  planPayment,
  resolvesToGraveyard,
  type PaymentPlan,
} from './mana.ts';
import { eligibleAttackers, resolveCombat, tapsToAttack, type CombatOutcome } from './combat.ts';
import { auraNeedsHost, hostPrompt, illegalHostReason, legalHostsFor } from './attach.ts';
import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  StackTarget,
  Zone,
} from './types.ts';

/* -------------------------------------------------------------------------- */
/* Casting                                                                    */
/* -------------------------------------------------------------------------- */

export interface CastPlan {
  ok: boolean;
  /** Empty when `ok` is false. Tap actions first, then the play. */
  actions: GameAction[];
  payment: PaymentPlan;
  /** Zone the card resolves into. Instants and sorceries go to the graveyard. */
  destination: Zone;
  /** Extra generic mana from commander tax, if any. */
  tax: number;
  reason: string;
  /**
   * An Aura being cast needs a permanent named before it can be announced (CR
   * 601.2c). While one is outstanding this holds the permanents it could
   * legally be cast at; the caller draws them and calls back with `hostId`.
   *
   * Empty on every other card, and empty once an Aura has one, so a caller
   * that ignores it is exactly as correct as it was before this existed.
   */
  hostChoices: InstanceId[];
  /** The card's own "Enchant ..." line, to head that choice. Empty otherwise. */
  hostPrompt: string;
}

/**
 * Commander tax expressed as a cost prefix, so one parser handles both.
 *
 * `castingCostOf`, not `card.manaCost`: a card whose printed cost string never
 * loaded is charged its mana value instead of nothing. See `mana.ts`.
 */
function costWithTax(card: CardInstance, tax: number): string {
  const base = castingCostOf(card);
  return tax > 0 ? `{${tax}}${base}` : base;
}

export interface CastOptions {
  /** Skip mana entirely. This is what "free cast" in the playtest HUD sets. */
  ignoreMana?: boolean;
  /** Enters tapped. */
  tapped?: boolean;
  at?: number;
  /**
   * Announce the spell onto the STACK instead of putting it straight into play.
   *
   * Off by default HERE, because this function is called by a life counter and
   * a pile of tests as well as by the two playing surfaces, and a spell that
   * sits on the stack waiting for a priority round it will never receive is a
   * hung game rather than a more correct one. So the stack is opt-in by
   * whoever is prepared to run the round.
   *
   * **The bot is now one of those.** `bot.ts` `chooseSpell` passes `true`
   * unless a caller says `false` out loud, so a bot's spell is an object at the
   * table by default. Read the default here as "this planner does not decide",
   * not as "the app casts without the stack".
   *
   * With it on, the batch ends in `CAST_SPELL`: `rules.ts` moves the card to
   * the stack, `stack.ts` builds the object and gives the caster priority, and
   * the spell reaches `resolvesTo` only when every living player has passed.
   * That is the difference between a spell you can respond to and a spell that
   * has already happened.
   */
  viaStack?: boolean;
  /**
   * The spell this one is being cast at, for a counter. Its `stackId`.
   *
   * Only meaningful with `viaStack`. Attaches the target and the
   * `counter-spell` effect, so the counter actually counters on resolution
   * rather than resolving into a graveyard having done nothing.
   */
  counterStackId?: string;
  /**
   * The permanent an Aura is being cast at. CR 303.4a makes the Aura spell
   * require a target, and CR 303.4f puts it onto the battlefield attached to
   * whatever it was cast at.
   *
   * Refused rather than guessed when it is missing. An Aura that resolves
   * attached to nothing goes straight to its owner's graveyard under CR
   * 704.5m, so a cast that picked a host on the player's behalf and a cast
   * that picked none are both worse than a cast that asks.
   */
  hostId?: InstanceId;
  /**
   * CR 601.2c — what this spell was cast AT, chosen on announcement, in the
   * order the card names them. `{sel:'target', ref: n}` in the compiled effects
   * is an index into this list, so position is the contract and a hole is left
   * as a hole rather than closed up.
   *
   * Only meaningful with `viaStack`, because it rides on the stack object.
   * Nothing here picks a target: this carries a choice a player already made,
   * the same way `hostId` does for an Aura.
   *
   * NOT YET SUPPLIED BY ANY SURFACE. Announcing a target needs a picker, the
   * spell's `TargetSpec` list, and a legality check, and none of that exists for
   * a spell yet — `activate.ts` has all three for an ACTIVATED ability and
   * `AbilityPanel` draws them. So a targeted instant reaching resolution today
   * finds this empty and says so in the log rather than doing something to
   * nobody. The engine side is finished; the asking is not.
   */
  targets?: StackTarget[];
}

/**
 * Everything needed to cast one card from hand or the command zone: which
 * sources to tap, where it lands, and why it is not castable if it is not.
 *
 * Lands are not spells — `playLand` handles those, and this refuses them so a
 * UI cannot quietly charge mana for a land drop.
 */
export function planCastFromHand(
  state: GameState,
  playerId: PlayerId,
  instanceId: InstanceId,
  options: CastOptions = {}
): CastPlan {
  const card = getCard(state, instanceId);
  const at = options.at ?? 0;

  const fail = (reason: string, payment?: PaymentPlan): CastPlan => ({
    ok: false,
    actions: [],
    payment: payment ?? { ok: false, tapIds: [], spend: [], required: 0, available: 0, reason },
    destination: 'battlefield',
    tax: 0,
    reason,
    hostChoices: [],
    hostPrompt: '',
  });

  if (!card) return fail('That card is not in this game.');
  if (card.zone !== 'hand' && card.zone !== 'command') {
    return fail('Only cards in hand or the command zone can be cast.');
  }
  if (card.controllerId !== playerId && card.ownerId !== playerId) {
    return fail('That is not your card.');
  }
  if (isLand(card)) return fail('Lands are played, not cast.');

  const destination: Zone = resolvesToGraveyard(card) ? 'graveyard' : 'battlefield';
  const tax = taxForCard(state, card);

  /*
   * CR 601.2c - an Aura spell's target is chosen as it is CAST, and the refusal
   * has to come back carrying the candidates so a surface can ask. Asked before
   * the mana check on purpose: "choose what this enchants" is a question that
   * CONTINUES, while "you cannot pay for this" ENDS it, which is the same
   * ordering argument `activate.ts` makes about costs and targets, for the same
   * reason. Nothing is spent by planning, so the order changes which sentence
   * comes back and never what the batch does.
   */
  const needsHost = auraNeedsHost(card);

  if (needsHost) {
    if (options.hostId) {
      const illegal = illegalHostReason(state, card, options.hostId);
      if (illegal) return { ...fail(illegal), tax, destination };
    } else {
      const hosts = legalHostsFor(state, playerId, card);
      if (hosts.length === 0) {
        // CR 601.2c again: no legal target means it cannot be cast at all.
        return { ...fail(`There is nothing ${card.name} could enchant right now.`), tax, destination };
      }
      return {
        ...fail(`Choose what ${card.name} enchants.`),
        tax,
        destination,
        hostChoices: hosts,
        hostPrompt: hostPrompt(card),
      };
    }
  }

  const payment = options.ignoreMana
    ? { ok: true, tapIds: [], spend: [], required: 0, available: 0, reason: '' }
    : planPayment(costWithTax(card, tax), manaSourcesFor(state, playerId));

  if (!payment.ok) {
    return { ...fail(payment.reason, payment), tax, destination };
  }

  /*
   * Taps AND the floating mana this spends. Built by `paymentActions` rather
   * than by mapping `tapIds` here, because that map WAS the whole cost of a
   * spell and quietly stopped being it the moment `manaSourcesFor` started
   * offering pool mana: a Dark Ritual's {B}{B}{B} would have paid for a spell
   * and then still been sitting in the pool to pay for the next one.
   */
  const actions: GameAction[] = paymentActions(payment, playerId, at);

  /*
   * CR 903.8 - a commander leaving the command zone is announced, and this is
   * the ONE place any surface builds that. Every cast in this app comes through
   * here: the preview's Cast button, the bot's batch and every test, so a
   * commander cast counts itself exactly once whether it goes onto the stack or
   * straight onto the battlefield.
   *
   * Before the play rather than after it, because after the play the card is no
   * longer in the command zone and the sentence "cast from the command zone"
   * would be describing somewhere it has already left. The count is the same
   * either way; the log is not.
   */
  actions.push(...announceCommanderCast(state, card, at));

  /* CR 400.7 - the zone the host was in when it was chosen, so a flicker in
     response makes the spell fizzle rather than landing on a new object. */
  const host = needsHost && options.hostId ? getCard(state, options.hostId) : undefined;
  const hostTarget: StackTarget[] = host
    ? [
        {
          kind: 'card',
          instanceId: host.instanceId,
          zone: host.zone,
          zoneChangeCounter: host.zoneChangeCounter ?? 0,
        },
      ]
    : [];

  if (options.viaStack) {
    actions.push({
      type: 'CAST_SPELL',
      instanceId,
      controllerId: playerId,
      resolvesTo: destination,
      ...(options.counterStackId
        ? {
            targets: [{ kind: 'stack' as const, stackId: options.counterStackId }],
            effects: [{ op: 'counter-spell' as const }],
          }
        : {}),
      ...(hostTarget.length > 0 ? { targets: hostTarget } : {}),
      /* Announced targets win over the two special cases above, because a
         caller that named them said what it meant. `counterStackId` and
         `hostId` are shorthands for the two shapes that predate the general
         list; a caller using both is describing one thing twice. */
      ...(options.targets && options.targets.length > 0 ? { targets: options.targets } : {}),
      at,
    });
  } else {
    /*
     * CR 303.4f - the Aura ENTERS attached, in the same action, and this is the
     * one place the distinction is load-bearing rather than pedantic.
     *
     * It was written as a `PLAY` followed by an `ATTACH` first, and running it
     * showed why that cannot work: state-based actions are checked after every
     * single action, and CR 704.5m puts an Aura attached to nothing into its
     * owner's graveyard. Rancor cast at a 2/2 reached the battlefield and was
     * binned before the `ATTACH` could be applied. The rule and the reducer
     * agree; the two-step version disagreed with both.
     *
     * This is the branch a surface that runs no priority round takes. The stack
     * path does the same thing on resolution, in `stack.ts`, which is where a
     * spell somebody could respond to has to do it.
     */
    actions.push({
      type: 'PLAY',
      instanceId,
      to: destination,
      tapped: options.tapped,
      controllerId: playerId,
      ...(host ? { attachedTo: host.instanceId } : {}),
      at,
    });
  }

  return { ok: true, actions, payment, destination, tax, reason: '', hostChoices: [], hostPrompt: '' };
}

/* -------------------------------------------------------------------------- */
/* Land drops                                                                 */
/* -------------------------------------------------------------------------- */

export interface LandPlan {
  ok: boolean;
  actions: GameAction[];
  reason: string;
}

/** One land per turn, from hand, on your own turn. */
export function planLandDrop(
  state: GameState,
  playerId: PlayerId,
  instanceId: InstanceId,
  options: { at?: number; ignoreLandLimit?: boolean } = {}
): LandPlan {
  const card = getCard(state, instanceId);
  const player = getPlayer(state, playerId);
  const at = options.at ?? 0;

  if (!card || !player) return { ok: false, actions: [], reason: 'That card is not in this game.' };
  if (!isLand(card)) return { ok: false, actions: [], reason: 'That is not a land.' };
  if (card.zone !== 'hand') return { ok: false, actions: [], reason: 'That land is not in your hand.' };
  if (!options.ignoreLandLimit && player.landsPlayedThisTurn >= 1) {
    return { ok: false, actions: [], reason: 'You have already played a land this turn.' };
  }
  if (!options.ignoreLandLimit && state.activePlayerId !== playerId) {
    return { ok: false, actions: [], reason: 'Lands can only be played on your own turn.' };
  }

  return {
    ok: true,
    reason: '',
    actions: [{ type: 'PLAY', instanceId, to: 'battlefield', controllerId: playerId, at }],
  };
}

/* -------------------------------------------------------------------------- */
/* Combat                                                                     */
/* -------------------------------------------------------------------------- */

/** Declare an attack, tapping everything without vigilance. */
export function declareAttack(
  state: GameState,
  attacks: Array<{ attackerId: InstanceId; defenderPlayerId: PlayerId }>,
  at = 0
): GameAction[] {
  if (attacks.length === 0) return [];
  return [
    {
      type: 'ATTACK',
      at,
      attackers: attacks.map(attack => {
        const card = getCard(state, attack.attackerId);
        return {
          attackerId: attack.attackerId,
          defenderPlayerId: attack.defenderPlayerId,
          tap: card ? tapsToAttack(state, card) : true,
        };
      }),
    },
  ];
}

/** Attack legality for a UI: which of my creatures can be pointed at someone. */
export function attackableWith(state: GameState, playerId: PlayerId): CardInstance[] {
  if (state.activePlayerId !== playerId) return [];
  if (state.step !== 'declare_attackers') return [];
  return eligibleAttackers(state, playerId);
}

/**
 * Resolve the declared combat and move on. Combining the two is deliberate: a
 * surface that resolves damage but forgets to advance leaves attackers frozen
 * mid-swing, which is exactly the bug a shared helper should make impossible.
 */
export function resolveCombatAndAdvance(
  state: GameState,
  at = 0
): { actions: GameAction[]; outcome: CombatOutcome } {
  const outcome = resolveCombat(state, at);
  return {
    outcome,
    actions: [...outcome.actions, { type: 'ADVANCE_STEP', at }],
  };
}

/* -------------------------------------------------------------------------- */
/* Turn structure                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The single "next" button. At the combat damage step it resolves combat first,
 * so a human clicking through a turn and a bot ticking through one take the
 * same path.
 */
export function advanceActions(state: GameState, at = 0): GameAction[] {
  if (state.step === 'combat_damage' && state.combat.attackers.length > 0) {
    return resolveCombatAndAdvance(state, at).actions;
  }
  return [{ type: 'ADVANCE_STEP', at }];
}
