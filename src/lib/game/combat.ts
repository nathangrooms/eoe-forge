/**
 * DeckMatrix — shared game-state core: combat.
 *
 * `rules.ts` records who is attacking and who is blocking; it deliberately does
 * not decide what that does, because damage assignment is a policy question
 * (who orders blockers, does the attacker have trample) and the reducer is
 * meant to stay a small honest state machine.
 *
 * This module is that policy, expressed the only way the rest of the system
 * accepts: as `GameAction` values. Nothing here mutates state. `resolveCombat`
 * returns a list of DAMAGE and MOVE_ZONE actions which the caller feeds through
 * `applyAction`, so combat is replayable, network-safe and identical whether a
 * human or the bot declared the attack.
 *
 * Modelled: power/toughness including +1/+1 and -1/-1 counters, evasion
 * (flying, reach) for block legality, vigilance, haste, defender, deathtouch,
 * trample, and lethal-first damage assignment across multiple blockers.
 *
 * Not modelled: first strike as a separate damage step, protection, indestructible,
 * damage prevention, banding, and any triggered ability. Those need the stack,
 * which this system does not have yet.
 */

import type {
  AttackDeclaration,
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
} from './types';
import { isCreature } from './mana';

/* -------------------------------------------------------------------------- */
/* Characteristics                                                            */
/* -------------------------------------------------------------------------- */

function baseNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function counterDelta(card: CardInstance): number {
  const plus = card.counters['+1/+1'] ?? 0;
  const minus = card.counters['-1/-1'] ?? 0;
  return plus - minus;
}

/** Current power, counters included. `*` and other variable printings read as 0. */
export function powerOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  return Math.max(0, baseNumber(card.power) + counterDelta(card));
}

/** Current toughness, counters included. */
export function toughnessOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  return baseNumber(card.toughness) + counterDelta(card);
}

export function hasKeyword(card: CardInstance | null | undefined, keyword: string): boolean {
  if (!card || !card.keywords) return false;
  const wanted = keyword.toLowerCase();
  return card.keywords.some(k => k.toLowerCase() === wanted);
}

/** Power/toughness as it should be printed on a battlefield card. */
export function statLine(card: CardInstance | null | undefined): string | null {
  if (!card || !isCreature(card)) return null;
  return `${powerOf(card)}/${toughnessOf(card)}`;
}

/* -------------------------------------------------------------------------- */
/* Legality                                                                   */
/* -------------------------------------------------------------------------- */

/** Creatures this player could declare as attackers right now. */
export function eligibleAttackers(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  return player.zones.battlefield
    .map(id => state.cards[id])
    .filter(card => {
      if (!card || card.controllerId !== playerId) return false;
      if (!isCreature(card)) return false;
      if (card.tapped) return false;
      if (hasKeyword(card, 'defender')) return false;
      if (card.summoningSick && !hasKeyword(card, 'haste')) return false;
      return true;
    });
}

/** Creatures this player could declare as blockers right now. */
export function eligibleBlockers(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  return player.zones.battlefield
    .map(id => state.cards[id])
    .filter(card => !!card && card.controllerId === playerId && isCreature(card) && !card.tapped);
}

/** Evasion check. Flying can only be blocked by flying or reach. */
export function canBlock(attacker: CardInstance, blocker: CardInstance): boolean {
  if (!attacker || !blocker) return false;
  if (blocker.tapped) return false;
  if (hasKeyword(attacker, 'flying')) {
    return hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach');
  }
  return true;
}

/** Attacking taps the creature unless it has vigilance. */
export function tapsToAttack(card: CardInstance): boolean {
  return !hasKeyword(card, 'vigilance');
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

export interface CombatOutcome {
  /** Feed straight into `applyActions`. */
  actions: GameAction[];
  /** Player damage totals, for the log and the combat view. */
  playerDamage: Array<{ playerId: PlayerId; amount: number; commander: boolean }>;
  /** Creatures that died, by instance id. */
  destroyed: InstanceId[];
  /** Prose summary for the game log panel. */
  summary: string;
}

const EMPTY_OUTCOME: CombatOutcome = {
  actions: [],
  playerDamage: [],
  destroyed: [],
  summary: 'No combat damage.',
};

function commanderIdFor(state: GameState, card: CardInstance): string | undefined {
  if (!card.isCommander) return undefined;
  for (const player of state.players) {
    const ref = player.commanders.find(c => c.instanceId === card.instanceId);
    if (ref) return ref.id;
  }
  return undefined;
}

/**
 * Assign an attacker's damage across its blockers, lethal-first, and hand any
 * remainder to the defending player when the attacker has trample.
 */
function assignToBlockers(
  state: GameState,
  attacker: CardInstance,
  blockers: CardInstance[]
): { perBlocker: Map<InstanceId, number>; trampleOver: number } {
  const perBlocker = new Map<InstanceId, number>();
  const deathtouch = hasKeyword(attacker, 'deathtouch');
  let remaining = powerOf(attacker);

  for (const blocker of blockers) {
    if (remaining <= 0) break;
    const lethal = deathtouch ? 1 : Math.max(1, toughnessOf(blocker));
    const assigned = Math.min(remaining, lethal);
    perBlocker.set(blocker.instanceId, assigned);
    remaining -= assigned;
  }

  const trampleOver = hasKeyword(attacker, 'trample') ? Math.max(0, remaining) : 0;
  return { perBlocker, trampleOver };
}

/**
 * Turn the declared combat into actions. Call this once, at the combat damage
 * step; the caller applies the result and then advances.
 */
export function resolveCombat(state: GameState, at = 0): CombatOutcome {
  const declarations = state.combat.attackers;
  if (!declarations || declarations.length === 0) return EMPTY_OUTCOME;

  const actions: GameAction[] = [];
  const destroyed: InstanceId[] = [];
  const damageToPlayer = new Map<PlayerId, { amount: number; commander: boolean }>();
  // A blocker can block several attackers; damage accumulates before deaths.
  const damageOnCreature = new Map<InstanceId, number>();
  const deathtouchedCreature = new Set<InstanceId>();

  const addPlayerDamage = (playerId: PlayerId, amount: number, commander: boolean) => {
    if (amount <= 0) return;
    const current = damageToPlayer.get(playerId) ?? { amount: 0, commander: false };
    damageToPlayer.set(playerId, {
      amount: current.amount + amount,
      commander: current.commander || commander,
    });
  };

  const addCreatureDamage = (instanceId: InstanceId, amount: number, deathtouch: boolean) => {
    if (amount <= 0) return;
    damageOnCreature.set(instanceId, (damageOnCreature.get(instanceId) ?? 0) + amount);
    if (deathtouch) deathtouchedCreature.add(instanceId);
  };

  for (const declaration of declarations) {
    const attacker = state.cards[declaration.attackerId];
    if (!attacker || attacker.zone !== 'battlefield') continue;

    const blockers = declaration.blockedBy
      .map(id => state.cards[id])
      .filter(card => !!card && card.zone === 'battlefield');

    if (blockers.length === 0) {
      const defenderId = declaration.defenderPlayerId;
      if (!defenderId) continue;
      const amount = powerOf(attacker);
      if (amount <= 0) continue;

      const commanderId = commanderIdFor(state, attacker);
      actions.push({
        type: 'DAMAGE',
        targetPlayerId: defenderId,
        amount,
        sourcePlayerId: attacker.controllerId,
        sourceInstanceId: attacker.instanceId,
        commanderId,
        combat: true,
        at,
      });
      addPlayerDamage(defenderId, amount, !!commanderId);
      continue;
    }

    const { perBlocker, trampleOver } = assignToBlockers(state, attacker, blockers);
    const attackerDeathtouch = hasKeyword(attacker, 'deathtouch');

    for (const blocker of blockers) {
      addCreatureDamage(blocker.instanceId, perBlocker.get(blocker.instanceId) ?? 0, attackerDeathtouch);
      addCreatureDamage(attacker.instanceId, powerOf(blocker), hasKeyword(blocker, 'deathtouch'));
    }

    if (trampleOver > 0 && declaration.defenderPlayerId) {
      const commanderId = commanderIdFor(state, attacker);
      actions.push({
        type: 'DAMAGE',
        targetPlayerId: declaration.defenderPlayerId,
        amount: trampleOver,
        sourcePlayerId: attacker.controllerId,
        sourceInstanceId: attacker.instanceId,
        commanderId,
        combat: true,
        at,
      });
      addPlayerDamage(declaration.defenderPlayerId, trampleOver, !!commanderId);
    }
  }

  // Deaths, once all damage is totalled. There is no marked-damage action in
  // the union, and damage wears off at cleanup anyway, so combat resolves
  // atomically: survivors keep no scar, casualties move to the graveyard.
  for (const [instanceId, amount] of damageOnCreature) {
    const card = state.cards[instanceId];
    if (!card || card.zone !== 'battlefield') continue;
    const lethal = deathtouchedCreature.has(instanceId) || amount >= toughnessOf(card);
    if (!lethal) continue;
    destroyed.push(instanceId);
    actions.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', at });
  }

  const playerDamage = Array.from(damageToPlayer.entries()).map(([playerId, entry]) => ({
    playerId,
    amount: entry.amount,
    commander: entry.commander,
  }));

  const parts: string[] = [];
  for (const entry of playerDamage) {
    const name = state.players.find(p => p.id === entry.playerId)?.name ?? 'a player';
    parts.push(`${name} took ${entry.amount}`);
  }
  if (destroyed.length > 0) {
    parts.push(`${destroyed.length} creature${destroyed.length === 1 ? '' : 's'} died`);
  }

  return {
    actions,
    playerDamage,
    destroyed,
    summary: parts.length > 0 ? `${parts.join(', ')}.` : 'Combat dealt no damage.',
  };
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

/** Every player currently being attacked. Drives the combat view. */
export function defendersUnderAttack(state: GameState): PlayerId[] {
  const ids = new Set<PlayerId>();
  for (const declaration of state.combat.attackers) {
    if (declaration.defenderPlayerId) ids.add(declaration.defenderPlayerId);
  }
  return Array.from(ids);
}

/** True when this player has creatures pointed at them right now. */
export function isUnderAttack(state: GameState, playerId: PlayerId): boolean {
  return state.combat.attackers.some(d => d.defenderPlayerId === playerId);
}

/** The attacking player, inferred from the declarations rather than the turn. */
export function attackingPlayerId(state: GameState): PlayerId | undefined {
  for (const declaration of state.combat.attackers) {
    const card = state.cards[declaration.attackerId];
    if (card) return card.controllerId;
  }
  return undefined;
}

export interface CombatLane {
  declaration: AttackDeclaration;
  attacker: CardInstance | undefined;
  blockers: CardInstance[];
  defenderPlayerId?: PlayerId;
  /** True when the attacker would kill an unblocked defender outright. */
  lethalIfUnblocked: boolean;
}

/** One row per attacker, resolved to cards. This is what the combat view renders. */
export function combatLanes(state: GameState): CombatLane[] {
  return state.combat.attackers.map(declaration => {
    const attacker = state.cards[declaration.attackerId];
    const defender = declaration.defenderPlayerId
      ? state.players.find(p => p.id === declaration.defenderPlayerId)
      : undefined;
    return {
      declaration,
      attacker,
      blockers: declaration.blockedBy.map(id => state.cards[id]).filter(Boolean),
      defenderPlayerId: declaration.defenderPlayerId,
      lethalIfUnblocked:
        !!defender && declaration.blockedBy.length === 0 && powerOf(attacker) >= defender.life,
    };
  });
}
