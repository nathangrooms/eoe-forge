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

import { commanderTax, getCard, getPlayer } from './rules.ts';
import {
  isLand,
  manaSourcesFor,
  planPayment,
  resolvesToGraveyard,
  type PaymentPlan,
} from './mana.ts';
import { eligibleAttackers, resolveCombat, tapsToAttack, type CombatOutcome } from './combat.ts';
import type { CardInstance, GameAction, GameState, InstanceId, PlayerId, Zone } from './types.ts';

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
}

/** Commander tax expressed as a cost prefix, so one parser handles both. */
function costWithTax(card: CardInstance, tax: number): string {
  const base = card.manaCost ?? '';
  return tax > 0 ? `{${tax}}${base}` : base;
}

function taxForCard(state: GameState, card: CardInstance): number {
  if (!card.isCommander || card.zone !== 'command') return 0;
  for (const player of state.players) {
    const ref = player.commanders.find(c => c.instanceId === card.instanceId);
    if (ref) return commanderTax(state, ref.id);
  }
  return 0;
}

export interface CastOptions {
  /** Skip mana entirely. This is what "free cast" in the playtest HUD sets. */
  ignoreMana?: boolean;
  /** Enters tapped. */
  tapped?: boolean;
  at?: number;
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
    payment: payment ?? { ok: false, tapIds: [], required: 0, available: 0, reason },
    destination: 'battlefield',
    tax: 0,
    reason,
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

  const payment = options.ignoreMana
    ? { ok: true, tapIds: [], required: 0, available: 0, reason: '' }
    : planPayment(costWithTax(card, tax), manaSourcesFor(state, playerId));

  if (!payment.ok) {
    return { ...fail(payment.reason, payment), tax, destination };
  }

  const actions: GameAction[] = payment.tapIds.map(id => ({ type: 'TAP', instanceId: id, at }));
  actions.push({
    type: 'PLAY',
    instanceId,
    to: destination,
    tapped: options.tapped,
    controllerId: playerId,
    at,
  });

  return { ok: true, actions, payment, destination, tax, reason: '' };
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
