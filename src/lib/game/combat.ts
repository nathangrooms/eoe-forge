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
import { hasProtectionFrom } from './keywords.ts';
import {
  combatPowerIn,
  combatToughnessIn,
  controllerIn,
  hasKeywordIn,
  isCreatureIn,
} from './characteristics.ts';
// "Creatures can't block", "creatures can't attack" and friends are compiled
// from oracle text by the ability DSL and collected by the same battlefield scan
// that produces the continuous effects. They are not characteristics, so they
// are not layer effects — but they are combat legality, so they belong here.
import { hasRestriction } from './abilities/statics.ts';

/* -------------------------------------------------------------------------- */
/* Characteristics                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The printed accessors now live in `printed.ts` and are re-exported here so
 * every existing `import { powerOf } from './combat.ts'` keeps working.
 *
 * They are no longer what this module computes with. Combat damage reads the
 * layered board through `characteristics.ts`, because an anthem changes how
 * much damage a creature deals and `powerOf` cannot see one.
 */
export { hasStatOverride, powerOf, statLine, toughnessOf } from './printed.ts';

/* -------------------------------------------------------------------------- */
/* Legality                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every keyword question in this file goes through here, and therefore through
 * the layer engine.
 *
 * `keywords.ts`'s `hasKeyword` reads the card's own printed and hand-flagged
 * keywords; it cannot see a keyword *granted* by something else on the
 * battlefield, because it is never told what else is on the battlefield. So a
 * creature under "creatures you control have flying" would block a flier here
 * and not in the card inspector — two answers to one question, which is the bug
 * class this wiring removes.
 *
 * Layer 6 is where granting and stripping happen, so this asks layer 6.
 */
function kw(state: GameState, card: CardInstance | null | undefined, keyword: string): boolean {
  if (!card) return false;
  return hasKeywordIn(state, card, keyword);
}

/** Creatures this player could declare as attackers right now. */
export function eligibleAttackers(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  return player.zones.battlefield
    .map(id => state.cards[id])
    .filter(card => {
      if (!card) return false;
      // Control is a layer-2 question: a stolen creature attacks for its new
      // controller, not the one printed on the instance.
      if (controllerIn(state, card) !== playerId) return false;
      if (!isCreatureIn(state, card)) return false;
      if (card.tapped) return false;
      if (kw(state, card, 'defender')) return false;
      if (card.summoningSick && !kw(state, card, 'haste')) return false;
      // A static "can't attack" from anywhere on the board.
      if (hasRestriction(state, card.instanceId, 'cant-attack')) return false;
      return true;
    });
}

/** Creatures this player could declare as blockers right now. */
export function eligibleBlockers(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  return player.zones.battlefield
    .map(id => state.cards[id])
    .filter(
      card =>
        !!card &&
        controllerIn(state, card) === playerId &&
        isCreatureIn(state, card) &&
        !card.tapped &&
        !hasRestriction(state, card.instanceId, 'cant-block')
    );
}

/**
 * Can this one creature legally block that one?
 *
 * Menace is not asked here because it is a property of the whole block rather
 * than of a single blocker — `validateBlockGroup` answers that.
 *
 * Takes `state` because evasion is a layered question. Granted flying and
 * granted reach both count, and both are invisible to the card alone.
 */
export function canBlock(
  state: GameState,
  attacker: CardInstance | null | undefined,
  blocker: CardInstance | null | undefined
): boolean {
  if (!attacker || !blocker) return false;
  if (blocker.tapped) return false;
  if (hasRestriction(state, blocker.instanceId, 'cant-block')) return false;
  if (kw(state, attacker, 'flying') && !kw(state, blocker, 'flying') && !kw(state, blocker, 'reach')) {
    return false;
  }
  // Protection from a quality the blocker has: it cannot block this attacker.
  // Protection parses a named quality out of oracle text rather than being a
  // layer characteristic, so it stays on `keywords.ts`.
  if (hasProtectionFrom(attacker, blocker)) return false;
  return true;
}

/** How many creatures it takes to block this attacker. Menace makes it two. */
export function blockersRequiredFor(
  state: GameState,
  attacker: CardInstance | null | undefined
): number {
  return kw(state, attacker, 'menace') ? 2 : 1;
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
  state: GameState,
  attacker: CardInstance | null | undefined,
  blockers: readonly (CardInstance | null | undefined)[]
): BlockLegality {
  if (!attacker) return { ok: false, reason: 'That attacker is not in this game.' };
  const live = blockers.filter((b): b is CardInstance => !!b);
  if (live.length === 0) return { ok: true, reason: '' };

  for (const blocker of live) {
    if (canBlock(state, attacker, blocker)) continue;
    if (kw(state, attacker, 'flying')) {
      return { ok: false, reason: `${blocker.name} has neither flying nor reach.` };
    }
    if (hasProtectionFrom(attacker, blocker)) {
      return { ok: false, reason: `${attacker.name} has protection from ${blocker.name}.` };
    }
    return { ok: false, reason: `${blocker.name} cannot block right now.` };
  }

  const required = blockersRequiredFor(state, attacker);
  if (live.length < required) {
    return { ok: false, reason: `${attacker.name} has menace — it takes ${required} blockers.` };
  }

  return { ok: true, reason: '' };
}

/** Attacking taps the creature unless it has vigilance. */
export function tapsToAttack(state: GameState, card: CardInstance): boolean {
  return !kw(state, card, 'vigilance');
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

function dealsInFirstStep(state: GameState, card: CardInstance): boolean {
  return kw(state, card, 'first strike') || kw(state, card, 'double strike');
}

function dealsInRegularStep(state: GameState, card: CardInstance): boolean {
  return kw(state, card, 'double strike') || !kw(state, card, 'first strike');
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
  state: GameState,
  attacker: CardInstance,
  blockers: readonly CardInstance[],
  marked: Map<InstanceId, number>
): { perBlocker: Map<InstanceId, number>; trampleOver: number } {
  const perBlocker = new Map<InstanceId, number>();
  const deathtouch = kw(state, attacker, 'deathtouch');
  let remaining = combatPowerIn(state, attacker);

  for (const blocker of blockers) {
    if (remaining <= 0) break;
    const already = marked.get(blocker.instanceId) ?? 0;
    const lethal = deathtouch ? 1 : Math.max(1, combatToughnessIn(state, blocker) - already);
    const assigned = Math.min(remaining, lethal);
    perBlocker.set(blocker.instanceId, assigned);
    remaining -= assigned;
  }

  const trampleOver = kw(state, attacker, 'trample') ? Math.max(0, remaining) : 0;
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
  const firstStrikeStep = participants.some(card => dealsInFirstStep(state, card));

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
      step === 'first' ? dealsInFirstStep(state, card) : dealsInRegularStep(state, card);

    const hits: Hit[] = [];

    for (const lane of live) {
      const { attacker, declaration, blockers } = lane;
      if (dead.has(attacker.instanceId)) continue;

      const survivingBlockers = blockers.filter(blocker => !dead.has(blocker.instanceId));
      const wasBlocked = declaration.blockedBy.length > 0;

      if (dealsNow(attacker) && combatPowerIn(state, attacker) > 0) {
        if (survivingBlockers.length === 0) {
          // Unblocked, or every blocker is already dead. A blocked creature
          // with no blockers left deals no damage at all — unless it tramples
          // (CR 702.19b), in which case all of it goes through.
          const throughToPlayer = !wasBlocked || kw(state, attacker, 'trample');
          if (throughToPlayer && declaration.defenderPlayerId) {
            hits.push({
              kind: 'player',
              source: attacker,
              playerId: declaration.defenderPlayerId,
              amount: combatPowerIn(state, attacker),
            });
          }
        } else {
          const { perBlocker, trampleOver } = assignToBlockers(
            state,
            attacker,
            survivingBlockers,
            marked
          );
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
        const amount = combatPowerIn(state, blocker);
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
        if (kw(state, hit.source, 'lifelink')) {
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
      if (kw(state, hit.source, 'deathtouch')) deathtouched.add(hit.targetId);
      if (kw(state, hit.source, 'lifelink')) {
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
      if (kw(state, card, 'indestructible')) continue;
      const lethal = deathtouched.has(instanceId) || amount >= combatToughnessIn(state, card);
      if (!lethal) continue;
      dead.add(instanceId);
      destroyed.push(instanceId);
      actions.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', at });
    }
  }

  /* CR 510.2 — DAMAGE STAYS MARKED ON WHAT SURVIVED.
     ----------------------------------------------------------------------
     Everything above works out damage in the local `marked` map and emits an
     action only for what DIED. That is enough to finish a combat and it is not
     enough to be right, because a creature that survives combat carries the
     damage until cleanup.

     Twenty recorded bot games found it: a 3/3 blocked by a 2/2 came out of
     combat with `damage: 0` rather than 2. Every consequence favours the
     defender wrongly. A Shock cannot finish off a creature that just traded
     blows. A second combat step in the same turn meets a creature that has
     quietly healed. Anything reading marked damage sees a board that was never
     hit.

     Only survivors are emitted. The dead are already leaving by `MOVE_ZONE`
     above, and sending damage after them would be damage dealt to a card that
     is no longer on the battlefield. `DAMAGE_CARD` adds to `card.damage` and
     sets the deathtouch flag without destroying anything: destruction is CR
     704.5g/h, which `sba.ts` runs after every action and which correctly
     declines to destroy an indestructible permanent. So an indestructible
     blocker soaked by a deathtoucher keeps the mark and lives, which is what
     the rules say. */
  for (const [instanceId, amount] of marked) {
    if (amount <= 0 || dead.has(instanceId)) continue;
    const card = state.cards[instanceId];
    if (!card || card.zone !== 'battlefield') continue;
    actions.push({
      type: 'DAMAGE_CARD',
      instanceId,
      amount,
      ...(deathtouched.has(instanceId) ? { deathtouch: true } : {}),
      at,
    });
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

/**
 * CR 509.2 — the attacks of THIS player that are blocked by two or more
 * creatures, and therefore need a damage assignment order.
 *
 * One authority for the whole feature. `turnFlow.decisionFor` asks it to decide
 * whether to stop the declare-blockers step for the attacking player, and
 * `OrderBlockersBar` asks it to decide what to draw. Two answers to "is an
 * order owed" is how a strip appears over a step the surface has already walked
 * past, so there is one.
 *
 * `controllerIn` rather than `card.controllerId`, for the reason `turnFlow`
 * already records: the printed controller is wrong for a creature attacking
 * under a control-change effect.
 */
export function lanesNeedingDamageOrder(
  state: GameState,
  playerId: PlayerId
): AttackDeclaration[] {
  if (state.status !== 'playing') return [];
  return state.combat.attackers.filter(declaration => {
    if (declaration.blockedBy.length < 2) return false;
    const attacker = state.cards[declaration.attackerId];
    if (!attacker || attacker.zone !== 'battlefield') return false;
    if (controllerIn(state, attacker) !== playerId) return false;
    // A lane whose blockers have all left is not a decision either.
    const live = declaration.blockedBy.filter(id => state.cards[id]?.zone === 'battlefield');
    return live.length >= 2;
  });
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
        !!defender &&
        declaration.blockedBy.length === 0 &&
        combatPowerIn(state, attacker) >= defender.life,
      blockersRequired: blockersRequiredFor(state, attacker),
    };
  });
}
