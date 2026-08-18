/**
 * DeckMatrix — shared game-state core: combat.
 *
 * `rules.ts` records who is attacking and who is blocking; it deliberately does
 * not decide what that does, because damage assignment is a policy question and
 * the reducer is meant to stay a small honest state machine.
 *
 * This module is that policy, expressed the only way the rest of the system
 * accepts: as `GameAction` values. Nothing here mutates state. `resolveCombat`
 * returns a list of DAMAGE, LIFE_CHANGE and MOVE_ZONE actions which the caller
 * feeds through `applyAction`, so combat is replayable, network-safe and
 * identical whether a human or the bot declared the attack.
 *
 * ## Keyword abilities are the part of Magic we can actually implement
 *
 * They are a closed set with fixed meanings, unlike the rest of the card pool.
 * So combat implements them properly, and it reads them through `keywords.ts` —
 * which means a keyword the player flagged by hand counts exactly as much as a
 * printed one:
 *
 *   - **flying / reach** — block legality
 *   - **menace** — needs two or more blockers (`validateBlockGroup`)
 *   - **defender** — cannot attack
 *   - **vigilance** — attacking does not tap
 *   - **haste** — can attack the turn it lands
 *   - **first strike / double strike** — a real first damage step, with deaths
 *     resolved between the two, so a first-striker kills before being hit back
 *   - **deathtouch** — any nonzero damage is lethal, and one point counts as
 *     lethal when assigning through blockers
 *   - **trample** — excess over lethal hits the defending player, including the
 *     case where every blocker died in the first-strike step (CR 702.19b)
 *   - **lifelink** — the source's controller gains that much life
 *   - **indestructible** — lethal damage and deathtouch do not destroy it
 *   - **protection** — cannot be blocked by, and takes no damage from, a source
 *     with the named quality (`keywords.ts` parses the quality out of oracle text)
 *
 * ## What it still does not model, stated plainly
 *
 * No stack, so no combat triggers beyond what `effects.ts` detects; no damage
 * prevention or replacement effects; no banding; no "assign damage as though it
 * weren't blocked"; no attacking planeswalkers or battles; no ordering of
 * multiple blockers by the attacking player (they are damaged in declaration
 * order). Combat damage is dealt and deaths applied atomically per step, so
 * survivors carry no marked damage out of combat — correct by cleanup, slightly
 * early within the turn.
 */

import type {
  AttackDeclaration,
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
} from './types.ts';
import { isCreature } from './mana.ts';
import { hasKeyword, hasProtectionFrom } from './keywords.ts';

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

/**
 * Current power: the hand-set override if there is one, otherwise the printed
 * value, plus counters either way. `*` and other variable printings read as 0,
 * which is exactly the case the manual override exists for.
 */
export function powerOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  const base = card.powerOverride ?? baseNumber(card.power);
  return Math.max(0, base + counterDelta(card));
}

/** Current toughness, override and counters included. */
export function toughnessOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  const base = card.toughnessOverride ?? baseNumber(card.toughness);
  return base + counterDelta(card);
}

/** Power/toughness as it should be printed on a battlefield card. */
export function statLine(card: CardInstance | null | undefined): string | null {
  if (!card || !isCreature(card)) return null;
  return `${powerOf(card)}/${toughnessOf(card)}`;
}

/** True when the printed stats have been overridden by hand. */
export function hasStatOverride(card: CardInstance | null | undefined): boolean {
  return !!card && (card.powerOverride !== undefined || card.toughnessOverride !== undefined);
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

/**
 * Can this one creature legally block that one?
 *
 * Menace is not asked here because it is a property of the whole block rather
 * than of a single blocker — `validateBlockGroup` answers that.
 */
export function canBlock(
  attacker: CardInstance | null | undefined,
  blocker: CardInstance | null | undefined
): boolean {
  if (!attacker || !blocker) return false;
  if (blocker.tapped) return false;
  if (
    hasKeyword(attacker, 'flying') &&
    !hasKeyword(blocker, 'flying') &&
    !hasKeyword(blocker, 'reach')
  ) {
    return false;
  }
  // Protection from a quality the blocker has: it cannot block this attacker.
  if (hasProtectionFrom(attacker, blocker)) return false;
  return true;
}

/** How many creatures it takes to block this attacker. Menace makes it two. */
export function blockersRequiredFor(attacker: CardInstance | null | undefined): number {
  return hasKeyword(attacker, 'menace') ? 2 : 1;
}

export interface BlockLegality {
  ok: boolean;
  reason: string;
}

/**
 * Whether a proposed set of blockers on one attacker is legal as a group.
 * The only place menace is enforced, so a UI that calls it can never let a
 * single creature block a menacing attacker.
 */
export function validateBlockGroup(
  attacker: CardInstance | null | undefined,
  blockers: readonly (CardInstance | null | undefined)[]
): BlockLegality {
  if (!attacker) return { ok: false, reason: 'That attacker is not in this game.' };
  const live = blockers.filter((b): b is CardInstance => !!b);
  if (live.length === 0) return { ok: true, reason: '' };

  for (const blocker of live) {
    if (canBlock(attacker, blocker)) continue;
    if (hasKeyword(attacker, 'flying')) {
      return { ok: false, reason: `${blocker.name} has neither flying nor reach.` };
    }
    if (hasProtectionFrom(attacker, blocker)) {
      return { ok: false, reason: `${attacker.name} has protection from ${blocker.name}.` };
    }
    return { ok: false, reason: `${blocker.name} cannot block right now.` };
  }

  const required = blockersRequiredFor(attacker);
  if (live.length < required) {
    return { ok: false, reason: `${attacker.name} has menace — it takes ${required} blockers.` };
  }

  return { ok: true, reason: '' };
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
  /** Life gained from lifelink, by player. */
  lifelink: Array<{ playerId: PlayerId; amount: number }>;
  /** Creatures that died, by instance id. */
  destroyed: InstanceId[];
  /** True when a separate first-strike damage step happened. */
  firstStrikeStep: boolean;
  /** Prose summary for the game log panel. */
  summary: string;
}

const EMPTY_OUTCOME: CombatOutcome = {
  actions: [],
  playerDamage: [],
  lifelink: [],
  destroyed: [],
  firstStrikeStep: false,
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

function dealsInFirstStep(card: CardInstance): boolean {
  return hasKeyword(card, 'first strike') || hasKeyword(card, 'double strike');
}

function dealsInRegularStep(card: CardInstance): boolean {
  return hasKeyword(card, 'double strike') || !hasKeyword(card, 'first strike');
}

/** One creature hitting one thing, before prevention is applied. */
type Hit =
  | { kind: 'player'; source: CardInstance; playerId: PlayerId; amount: number }
  | { kind: 'creature'; source: CardInstance; targetId: InstanceId; amount: number };

/**
 * Assign an attacker's damage across its blockers, lethal-first, and hand any
 * remainder to the defending player when the attacker has trample.
 *
 * Lethal accounts for damage already marked in the first-strike step, and for
 * deathtouch, where a single point is lethal (CR 702.2b). Indestructible
 * blockers still soak their full toughness: an attacker assigns lethal damage
 * ignoring indestructibility before anything tramples over.
 */
function assignToBlockers(
  attacker: CardInstance,
  blockers: readonly CardInstance[],
  marked: Map<InstanceId, number>
): { perBlocker: Map<InstanceId, number>; trampleOver: number } {
  const perBlocker = new Map<InstanceId, number>();
  const deathtouch = hasKeyword(attacker, 'deathtouch');
  let remaining = powerOf(attacker);

  for (const blocker of blockers) {
    if (remaining <= 0) break;
    const already = marked.get(blocker.instanceId) ?? 0;
    const lethal = deathtouch ? 1 : Math.max(1, toughnessOf(blocker) - already);
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
 *
 * Two damage steps run when any participant has first or double strike.
 * Casualties from the first step are removed before the second, which is the
 * whole point of the keyword: a first-striker that kills its blocker takes
 * nothing back.
 */
export function resolveCombat(state: GameState, at = 0): CombatOutcome {
  const declarations = state.combat.attackers ?? [];
  if (declarations.length === 0) return EMPTY_OUTCOME;

  const onBattlefield = (id: InstanceId | undefined): CardInstance | undefined => {
    if (!id) return undefined;
    const card = state.cards[id];
    return card && card.zone === 'battlefield' ? card : undefined;
  };

  const live: Array<{
    declaration: AttackDeclaration;
    attacker: CardInstance;
    blockers: CardInstance[];
  }> = [];

  for (const declaration of declarations) {
    const attacker = onBattlefield(declaration.attackerId);
    if (!attacker) continue;
    live.push({
      declaration,
      attacker,
      blockers: declaration.blockedBy
        .map(id => onBattlefield(id))
        .filter((card): card is CardInstance => !!card),
    });
  }

  if (live.length === 0) return EMPTY_OUTCOME;

  const participants: CardInstance[] = [];
  for (const lane of live) {
    participants.push(lane.attacker, ...lane.blockers);
  }
  const firstStrikeStep = participants.some(dealsInFirstStep);

  const actions: GameAction[] = [];
  const marked = new Map<InstanceId, number>();
  const deathtouched = new Set<InstanceId>();
  const dead = new Set<InstanceId>();
  const destroyed: InstanceId[] = [];
  const playerTotals = new Map<PlayerId, { amount: number; commander: boolean }>();
  const lifelinkTotals = new Map<PlayerId, number>();

  const steps: Array<'first' | 'regular'> = firstStrikeStep ? ['first', 'regular'] : ['regular'];

  for (const step of steps) {
    const dealsNow = (card: CardInstance): boolean =>
      step === 'first' ? dealsInFirstStep(card) : dealsInRegularStep(card);

    const hits: Hit[] = [];

    for (const lane of live) {
      const { attacker, declaration, blockers } = lane;
      if (dead.has(attacker.instanceId)) continue;

      const survivingBlockers = blockers.filter(blocker => !dead.has(blocker.instanceId));
      const wasBlocked = declaration.blockedBy.length > 0;

      if (dealsNow(attacker) && powerOf(attacker) > 0) {
        if (survivingBlockers.length === 0) {
          // Unblocked, or every blocker is already dead. A blocked creature
          // with no blockers left deals no damage at all — unless it tramples
          // (CR 702.19b), in which case all of it goes through.
          const throughToPlayer = !wasBlocked || hasKeyword(attacker, 'trample');
          if (throughToPlayer && declaration.defenderPlayerId) {
            hits.push({
              kind: 'player',
              source: attacker,
              playerId: declaration.defenderPlayerId,
              amount: powerOf(attacker),
            });
          }
        } else {
          const { perBlocker, trampleOver } = assignToBlockers(attacker, survivingBlockers, marked);
          for (const blocker of survivingBlockers) {
            const amount = perBlocker.get(blocker.instanceId) ?? 0;
            if (amount <= 0) continue;
            hits.push({ kind: 'creature', source: attacker, targetId: blocker.instanceId, amount });
          }
          if (trampleOver > 0 && declaration.defenderPlayerId) {
            hits.push({
              kind: 'player',
              source: attacker,
              playerId: declaration.defenderPlayerId,
              amount: trampleOver,
            });
          }
        }
      }

      for (const blocker of survivingBlockers) {
        if (!dealsNow(blocker)) continue;
        const amount = powerOf(blocker);
        if (amount <= 0) continue;
        hits.push({ kind: 'creature', source: blocker, targetId: attacker.instanceId, amount });
      }
    }

    // Apply the step's hits: prevention first, then marking, then lifelink.
    for (const hit of hits) {
      if (hit.kind === 'player') {
        const commanderId = commanderIdFor(state, hit.source);
        actions.push({
          type: 'DAMAGE',
          targetPlayerId: hit.playerId,
          amount: hit.amount,
          sourcePlayerId: hit.source.controllerId,
          sourceInstanceId: hit.source.instanceId,
          commanderId,
          combat: true,
          at,
        });
        const current = playerTotals.get(hit.playerId) ?? { amount: 0, commander: false };
        playerTotals.set(hit.playerId, {
          amount: current.amount + hit.amount,
          commander: current.commander || !!commanderId,
        });
        if (hasKeyword(hit.source, 'lifelink')) {
          lifelinkTotals.set(
            hit.source.controllerId,
            (lifelinkTotals.get(hit.source.controllerId) ?? 0) + hit.amount
          );
        }
        continue;
      }

      // Protection prevents the damage entirely. It was still *assigned*,
      // which is why trample was worked out before this point.
      const target = state.cards[hit.targetId];
      if (target && hasProtectionFrom(target, hit.source)) continue;

      marked.set(hit.targetId, (marked.get(hit.targetId) ?? 0) + hit.amount);
      if (hasKeyword(hit.source, 'deathtouch')) deathtouched.add(hit.targetId);
      if (hasKeyword(hit.source, 'lifelink')) {
        lifelinkTotals.set(
          hit.source.controllerId,
          (lifelinkTotals.get(hit.source.controllerId) ?? 0) + hit.amount
        );
      }
    }

    // Deaths, once the whole step's damage is marked.
    for (const [instanceId, amount] of marked) {
      if (dead.has(instanceId) || amount <= 0) continue;
      const card = state.cards[instanceId];
      if (!card || card.zone !== 'battlefield') continue;
      if (hasKeyword(card, 'indestructible')) continue;
      const lethal = deathtouched.has(instanceId) || amount >= toughnessOf(card);
      if (!lethal) continue;
      dead.add(instanceId);
      destroyed.push(instanceId);
      actions.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', at });
    }
  }

  for (const [playerId, amount] of lifelinkTotals) {
    if (amount <= 0) continue;
    actions.push({ type: 'LIFE_CHANGE', playerId, delta: amount, at, cause: 'Lifelink' });
  }

  const playerDamage = Array.from(playerTotals.entries()).map(([playerId, entry]) => ({
    playerId,
    amount: entry.amount,
    commander: entry.commander,
  }));
  const lifelink = Array.from(lifelinkTotals.entries()).map(([playerId, amount]) => ({
    playerId,
    amount,
  }));

  const parts: string[] = [];
  for (const entry of playerDamage) {
    const name = state.players.find(p => p.id === entry.playerId)?.name ?? 'a player';
    parts.push(`${name} took ${entry.amount}`);
  }
  if (destroyed.length > 0) {
    parts.push(`${destroyed.length} creature${destroyed.length === 1 ? '' : 's'} died`);
  }
  for (const entry of lifelink) {
    const name = state.players.find(p => p.id === entry.playerId)?.name ?? 'a player';
    parts.push(`${name} gained ${entry.amount} from lifelink`);
  }

  return {
    actions,
    playerDamage,
    lifelink,
    destroyed,
    firstStrikeStep,
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
  /** Blockers this attacker needs before the block is legal. Menace makes it two. */
  blockersRequired: number;
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
      blockersRequired: blockersRequiredFor(attacker),
    };
  });
}
