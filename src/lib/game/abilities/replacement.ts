/**
 * DeckMatrix — the card-ability DSL: replacement effects (CR 614).
 *
 * ## Replacements REWRITE the action, they do not undo it
 *
 * A replacement effect is applied by rewriting the action BEFORE the reducer
 * sees it. "This enters tapped" turns `{tapped: false}` into `{tapped: true}`;
 * Doubling Season turns `count: 1` into `count: 2`. The log then contains one
 * action that is simply true.
 *
 * The alternative — let the event happen and then correct it — puts a pair of
 * half-applied actions in the log ("a token was created", "another token was
 * created because of Doubling Season"), and a replay that stops between them
 * lands on a state the rules say never existed. Rewriting keeps the log a
 * sequence of facts.
 *
 * ## CR 614.5 — each effect applies at most once per event
 *
 * Enforced with a set of ability ids carried through one rewrite pass. Two
 * Doubling Seasons quadruple; one Doubling Season cannot double twice.
 *
 * ## CR 616 — the affected player orders multiple applicable effects
 *
 * With exactly one candidate we apply it. With more than one, ordering is the
 * affected player's decision. Multiplication is commutative so the order does
 * not change the outcome and we apply all of them; for anything where order is
 * observable this returns the action untouched and reports the decision, which
 * the caller turns into a `NOTE`. Guessing an order the player did not choose
 * would be inventing a rules outcome.
 */

import type { GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { ReplacementAbility } from './dsl.ts';
import type { AbilityContext } from './query.ts';
import { evalCondition, evalValue, resolvePlayers, resolveSelector } from './query.ts';
import { deriveState } from './continuous.ts';
import { abilitiesFor } from './registry.ts';

/* -------------------------------------------------------------------------- */
/* Collection                                                                 */
/* -------------------------------------------------------------------------- */

interface ActiveReplacement {
  sourceInstanceId: InstanceId;
  sourceName: string;
  controllerId: PlayerId;
  ability: ReplacementAbility;
  ctx: AbilityContext;
}

/**
 * Every replacement ability currently applying, in a stable order.
 *
 * Self-replacements ("As ~ enters…") are included even though the source is not
 * yet on the battlefield when they matter, because `selfReplacement` says the
 * effect is about the source's own arrival and the arrival is exactly the event
 * being rewritten.
 */
function activeReplacements(state: GameState): ActiveReplacement[] {
  const derived = deriveState(state);
  const out: ActiveReplacement[] = [];

  for (const player of state.players) {
    for (const zone of ['battlefield', 'hand', 'graveyard', 'command'] as const) {
      for (const instanceId of player.zones[zone] ?? []) {
        const card = state.cards[instanceId];
        if (!card || card.removedFromGame) continue;

        for (const ability of abilitiesFor(card).abilities) {
          if (ability.kind !== 'replacement') continue;
          const zones = ability.activeZones ?? ['battlefield'];
          // A self-replacement about entering applies from wherever the card is
          // coming from, which is by definition not the battlefield yet.
          if (!zones.includes(zone) && !ability.selfReplacement) continue;

          const ctx: AbilityContext = {
            state,
            derived,
            sourceId: instanceId,
            controllerId: card.controllerId,
            targets: [],
            x: 0,
          };
          if (ability.condition && !evalCondition(ability.condition, ctx)) continue;

          out.push({
            sourceInstanceId: instanceId,
            sourceName: card.name,
            controllerId: card.controllerId,
            ability,
            ctx,
          });
        }
      }
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Rewriting                                                                  */
/* -------------------------------------------------------------------------- */

export interface RewriteResult {
  action: GameAction;
  /** Ability ids that applied, so nothing applies twice (CR 614.5). */
  applied: string[];
  /** Follow-up actions a rewrite could not express in the action itself. */
  followUps: GameAction[];
  /** Decisions the engine declined to make — surfaced as notes by the caller. */
  deferred: string[];
}

/**
 * Apply every replacement effect that wants this action.
 *
 * Returns the same action reference untouched when nothing applies, so callers
 * can cheaply detect "no replacement" with `result.action === action`.
 */
export function applyReplacements(state: GameState, action: GameAction): RewriteResult {
  const replacements = activeReplacements(state);
  if (replacements.length === 0) {
    return { action, applied: [], followUps: [], deferred: [] };
  }

  let current = action;
  const applied: string[] = [];
  const followUps: GameAction[] = [];
  const deferred: string[] = [];
  const at = action.at ?? 0;

  for (const replacement of replacements) {
    const key = `${replacement.sourceInstanceId}:${replacement.ability.id}`;
    if (applied.includes(key)) continue; // CR 614.5

    const next = applyOne(state, current, replacement, at, followUps, deferred);
    if (next === current) continue;
    applied.push(key);
    current = next;
  }

  return { action: current, applied, followUps, deferred };
}

function applyOne(
  state: GameState,
  action: GameAction,
  replacement: ActiveReplacement,
  at: number,
  followUps: GameAction[],
  deferred: string[]
): GameAction {
  const { ability, ctx } = replacement;
  const cause = replacement.sourceName;

  switch (ability.event.on) {
    /* --- entering the battlefield --- */
    case 'enters': {
      const entering = enteringInstanceId(action);
      if (!entering) return action;

      // Self-replacements only care about their own source arriving.
      if (ability.selfReplacement && entering !== replacement.sourceInstanceId) return action;
      if (!ability.selfReplacement) {
        const subjects = resolveSelector(ability.event.who, ctx);
        if (!subjects.includes(entering)) return action;
      }

      switch (ability.result.do) {
        case 'enters-tapped':
          if (action.type === 'PLAY' && action.tapped) return action;
          if (action.type === 'MOVE_ZONE') {
            // MOVE_ZONE has no `tapped` field, so the arrival is expressed as a
            // PLAY, which does. Same destination, same card, one action.
            return {
              ...action,
              type: 'PLAY',
              instanceId: entering,
              to: 'battlefield',
              tapped: true,
              cause,
            } as GameAction;
          }
          if (action.type === 'PLAY') return { ...action, tapped: true, cause };
          if (action.type === 'CREATE_TOKEN') return { ...action, tapped: true, cause };
          return action;

        case 'enters-with-counters': {
          const count = evalValue(ability.result.count, ctx);
          if (count <= 0) return action;
          // The counters cannot be carried on the arrival action itself, so
          // they are emitted as the FIRST follow-up — before any trigger sees
          // the permanent, which is what CR 614 asks for.
          followUps.push({
            type: 'CARD_COUNTER',
            instanceId: entering,
            counter: ability.result.counter,
            delta: count,
            at,
            cause,
          });
          return { ...action, cause };
        }

        case 'enters-under-control': {
          const [controller] = resolvePlayers(ability.result.controller, ctx);
          if (!controller) return action;
          if (action.type === 'PLAY' || action.type === 'MOVE_ZONE') {
            return { ...action, controllerId: controller, cause };
          }
          return action;
        }

        default:
          return action;
      }
    }

    /* --- counters placed --- */
    case 'counter-placed': {
      if (action.type !== 'CARD_COUNTER' || action.delta <= 0) return action;
      if (ability.event.counter !== 'any' && ability.event.counter !== action.counter) return action;
      const subjects = resolveSelector(ability.event.target, ctx);
      if (!subjects.includes(action.instanceId)) return action;
      if (ability.result.do !== 'multiply') return action;
      const factor = evalValue(ability.result.factor, ctx);
      if (factor <= 1) return action;
      return { ...action, delta: action.delta * factor, cause };
    }

    /* --- tokens --- */
    case 'token-created': {
      if (action.type !== 'CREATE_TOKEN') return action;
      const whose = resolvePlayers(ability.event.whose, ctx);
      if (!whose.includes(action.playerId)) return action;
      if (ability.result.do !== 'multiply') return action;
      const factor = evalValue(ability.result.factor, ctx);
      if (factor <= 1) return action;
      // Each extra copy needs its own derived id, or two tokens collide on one
      // instance and the board silently loses one.
      const base = action.instanceId ?? `${action.playerId}-tok`;
      for (let n = 1; n < factor; n++) {
        followUps.push({ ...action, instanceId: `${base}-x${n}`, at, cause });
      }
      return { ...action, cause };
    }

    /* --- drawing --- */
    case 'draw': {
      if (action.type !== 'DRAW') return action;
      const whose = resolvePlayers(ability.event.whose, ctx);
      if (!whose.includes(action.playerId)) return action;
      if (ability.result.do !== 'multiply') return action;
      const factor = evalValue(ability.result.factor, ctx);
      if (factor <= 1) return action;
      return { ...action, count: Math.max(1, action.count ?? 1) * factor, cause };
    }

    /* --- life --- */
    case 'life-gain': {
      if (action.type !== 'LIFE_CHANGE' || action.delta <= 0) return action;
      const whose = resolvePlayers(ability.event.whose, ctx);
      if (!whose.includes(action.playerId)) return action;
      if (ability.result.do === 'multiply') {
        const factor = evalValue(ability.result.factor, ctx);
        return factor <= 1 ? action : { ...action, delta: action.delta * factor, cause };
      }
      if (ability.result.do === 'prevent') {
        return { ...action, delta: 0, cause };
      }
      return action;
    }

    case 'life-loss': {
      if (action.type !== 'LIFE_CHANGE' || action.delta >= 0) return action;
      const whose = resolvePlayers(ability.event.whose, ctx);
      if (!whose.includes(action.playerId)) return action;
      if (ability.result.do !== 'prevent') return action;
      return { ...action, delta: 0, cause };
    }

    /* --- damage --- */
    case 'damage': {
      if (action.type !== 'DAMAGE') return action;
      if (ability.event.combatOnly && !action.combat) return action;
      const subjects = resolveSelector(ability.event.to, ctx);
      // Damage to a player is not a selector match; a prevention shield on a
      // permanent must not silently absorb damage aimed at its controller.
      if (subjects.length === 0) return action;
      if (ability.result.do !== 'prevent') return action;
      const amount = ability.result.amount === 'all' ? action.amount : evalValue(ability.result.amount, ctx);
      const remaining = Math.max(0, action.amount - amount);
      if (remaining === action.amount) return action;
      return { ...action, amount: remaining, cause };
    }

    /* --- dying --- */
    case 'dies': {
      if (action.type !== 'MOVE_ZONE' || action.to !== 'graveyard') return action;
      const card = state.cards[action.instanceId];
      if (!card || card.zone !== 'battlefield') return action;
      const subjects = resolveSelector(ability.event.who, ctx);
      if (!subjects.includes(action.instanceId)) return action;
      if (ability.result.do !== 'replace-zone') return action;
      return { ...action, to: ability.result.to, cause };
    }

    /* --- skipping a step --- */
    case 'step':
      // Skipping a step means not entering it at all, which is a turn-structure
      // change rather than an action rewrite. Named rather than approximated.
      deferred.push(`${replacement.sourceName}: ${ability.text}`);
      return action;

    default:
      return action;
  }
}

/** Which instance, if any, this action is putting onto the battlefield. */
function enteringInstanceId(action: GameAction): InstanceId | undefined {
  if (action.type === 'PLAY') {
    return (action.to ?? 'battlefield') === 'battlefield' ? action.instanceId : undefined;
  }
  if (action.type === 'MOVE_ZONE') {
    return action.to === 'battlefield' ? action.instanceId : undefined;
  }
  if (action.type === 'CREATE_TOKEN') return action.instanceId;
  return undefined;
}
