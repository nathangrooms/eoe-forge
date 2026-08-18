/**
 * DeckMatrix — the card-ability DSL: targeting.
 *
 * Legality is checked in exactly three places, and all three earn their keep:
 *
 *  1. **ANNOUNCE** — `legalTargets` builds the candidate list the UI may offer.
 *     A control that cannot be clicked cannot produce an illegal action.
 *  2. **VALIDATE** — `validateTargets` re-runs the same check on an incoming
 *     action, because a browser client can lie. On a networked table this is
 *     the server relay's only job besides ordering: revalidate and rebroadcast.
 *     That is the whole scaling argument in one function.
 *  3. **RESOLVE** — `pruneIllegalTargets` implements CR 608.2b: illegal targets
 *     are dropped at resolution, and if EVERY target is illegal the ability is
 *     countered on resolution and says so out loud. That is a real rules
 *     outcome, not a silent drop.
 *
 * Hexproof, shroud and protection come from `keywords.ts` via `canBeTargetedBy`
 * and `hasProtectionFrom`. There is deliberately no second implementation here:
 * a creature that is untargetable in combat and targetable by an ability would
 * be the worst kind of inconsistency, the kind that only shows up mid-game.
 */

import type { GameState, InstanceId, PlayerId, StackTarget } from '../types.ts';
import type { TargetSpec } from './dsl.ts';
import type { AbilityContext } from './query.ts';
import { alivePlayers, cardOf, idsInZone, matchesFilter, resolvePlayers } from './query.ts';
import { canBeTargetedBy } from '../keywords.ts';
import { deriveState } from './continuous.ts';

/* -------------------------------------------------------------------------- */
/* Announcement                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything this target specification could legally point at right now.
 *
 * Cards carry the zone they were chosen in, because CR 400.7 makes a card that
 * has changed zones a NEW object — and therefore not the thing that was
 * targeted. Recording the zone is what lets `pruneIllegalTargets` tell "the
 * creature I targeted" from "a different card with the same id".
 */
export function legalTargets(spec: TargetSpec, ctx: AbilityContext): StackTarget[] {
  const out: StackTarget[] = [];

  if (spec.what === 'player' || spec.what === 'any') {
    for (const player of alivePlayers(ctx.state)) {
      if (spec.controller) {
        const allowed = resolvePlayers(spec.controller, ctx);
        if (!allowed.includes(player.id)) continue;
      }
      out.push({ kind: 'player', playerId: player.id });
    }
  }

  if (spec.what === 'card' || spec.what === 'any') {
    const zone = spec.zone ?? 'battlefield';
    const controllerIds = spec.controller ? resolvePlayers(spec.controller, ctx) : undefined;
    const source = cardOf(ctx.state, ctx.sourceId);

    for (const instanceId of idsInZone(ctx.state, zone, controllerIds)) {
      const card = cardOf(ctx.state, instanceId);
      if (!card || card.removedFromGame) continue;
      if (spec.filter && !matchesFilter(spec.filter, instanceId, ctx)) continue;
      // Hexproof / shroud / protection — the one implementation, in keywords.ts.
      if (!canBeTargetedBy(card, ctx.controllerId, source)) continue;
      if (hasTargetingRestriction(ctx, instanceId)) continue;
      out.push({ kind: 'card', instanceId, zone: card.zone });
    }
  }

  return out;
}

/** A live `{rule:'cant-be-targeted'}` restriction from a continuous effect. */
function hasTargetingRestriction(ctx: AbilityContext, instanceId: InstanceId): boolean {
  return ctx.derived.restrictions.some(
    active => active.rule.rule === 'cant-be-targeted' && active.affected.includes(instanceId)
  );
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export interface TargetValidation {
  ok: boolean;
  reason: string;
}

/**
 * Re-check a set of announced targets against the spec.
 *
 * This is the function a server runs. It takes no trust from the client: the
 * candidate list is rebuilt from state and the submitted targets must be a
 * subset of it, distinct if the spec says so, and within the min/max the card
 * prints.
 */
export function validateTargets(
  specs: readonly TargetSpec[],
  targets: readonly StackTarget[],
  ctx: AbilityContext
): TargetValidation {
  for (const spec of specs) {
    const chosen = targets.filter((_, index) => index === spec.ref);
    const count = chosen.length;

    if (count < spec.min) return { ok: false, reason: `${spec.prompt}: choose at least ${spec.min}.` };
    if (count > spec.max) return { ok: false, reason: `${spec.prompt}: at most ${spec.max}.` };
    if (count === 0) continue;

    const legal = legalTargets(spec, ctx);
    for (const target of chosen) {
      const found = legal.some(
        candidate =>
          candidate.kind === target.kind &&
          candidate.playerId === target.playerId &&
          candidate.instanceId === target.instanceId
      );
      if (!found) return { ok: false, reason: `${spec.prompt}: that is not a legal target.` };
    }

    if (spec.distinct) {
      const keys = chosen.map(target => `${target.kind}:${target.playerId ?? ''}${target.instanceId ?? ''}`);
      if (new Set(keys).size !== keys.length) {
        return { ok: false, reason: `${spec.prompt}: targets must be different.` };
      }
    }
  }

  return { ok: true, reason: '' };
}

/* -------------------------------------------------------------------------- */
/* Resolution — CR 608.2b                                                     */
/* -------------------------------------------------------------------------- */

export interface PruneResult {
  /** The targets that are still legal. */
  targets: StackTarget[];
  /** True when the ability was announced with targets and has none left. */
  countered: boolean;
  /** What went illegal, for the log line that has to say so out loud. */
  lost: string[];
}

/**
 * Drop targets that went illegal between announcement and resolution.
 *
 * The three ways a target dies: the player left the game, the card changed
 * zones (CR 400.7 — what is there now is a different object), or it gained
 * hexproof, shroud or protection in the meantime.
 *
 * If every target is gone the ability is COUNTERED on resolution. That is a
 * rules outcome with a name, and the caller is expected to log it — a spell
 * that quietly achieved nothing is the exact complaint this engine answers.
 */
export function pruneIllegalTargets(
  state: GameState,
  announced: readonly StackTarget[],
  ctx: AbilityContext
): PruneResult {
  if (announced.length === 0) return { targets: [], countered: false, lost: [] };

  const source = cardOf(state, ctx.sourceId);
  const kept: StackTarget[] = [];
  const lost: string[] = [];

  for (const target of announced) {
    if (target.kind === 'player') {
      const player = state.players.find(p => p.id === target.playerId);
      if (player && !player.hasLost && !player.conceded) kept.push(target);
      else lost.push(player?.name ?? 'a player');
      continue;
    }

    if (target.kind === 'card') {
      const card = cardOf(state, target.instanceId);
      if (!card || card.removedFromGame) {
        lost.push('a permanent that has left the game');
        continue;
      }
      if (target.zone && card.zone !== target.zone) {
        // CR 400.7 — it moved, so it is a different object now.
        lost.push(`${card.name} (it changed zones)`);
        continue;
      }
      if (!canBeTargetedBy(card, ctx.controllerId, source)) {
        lost.push(`${card.name} (no longer targetable)`);
        continue;
      }
      kept.push(target);
      continue;
    }

    // A stack target: still legal only while the object is still on the stack.
    const stack = state.stack ?? [];
    if (stack.some(object => object.stackId === target.stackId)) kept.push(target);
    else lost.push('a spell that already resolved');
  }

  return { targets: kept, countered: kept.length === 0, lost };
}

/** Build an ability context for target work, with the derived view attached. */
export function targetingContext(
  state: GameState,
  sourceId: InstanceId,
  controllerId: PlayerId,
  targets: StackTarget[] = []
): AbilityContext {
  return {
    state,
    derived: deriveState(state),
    sourceId,
    controllerId,
    targets,
    x: 0,
  };
}
