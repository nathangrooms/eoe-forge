/**
 * DeckMatrix — running an effect tree with the primitives in front.
 *
 * This is the adoption path, written as a wrapper so that measuring it does not
 * require editing `to-actions.ts` while other authors are in that file. The
 * eventual edit is one line per case:
 *
 *   case 'pump': return merge(scope, pumpToContinuous(effect, ctx, env));
 *
 * and the switch keeps its trailing throw, so a new effect verb is still a
 * failure rather than a card that quietly does nothing.
 *
 * ## Why it delegates rather than reimplements
 *
 * Everything a primitive does not handle falls through to the real `runEffects`.
 * A second walker with its own copy of the `if` / `for-each` / `repeat` logic
 * would drift from the first one, and the drift would show up as two clients
 * disagreeing about a card that nobody changed.
 *
 * Control flow is the one thing this walker must own, because a `{do:'if'}` can
 * contain a `{do:'pump'}` and delegating the whole `if` to `runEffects` would
 * hide the pump behind the old deferral.
 */

import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { evalCondition, evalValue, isPlayerSelector, resolvePlayers, resolveSelector } from '../context.ts';
import type { Selector } from '../../../cards/abilities/dsl.ts';
import { runEffects } from '../to-actions.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { primitiveFor } from './registry.ts';
import type { AnyEffectDo } from './extended-dsl.ts';

/** Control-flow verbs this walker handles itself so it can see inside them. */
const CONTROL = new Set(['if', 'for-each', 'repeat', 'may', 'choose-mode']);

export function runEffectsWithPrimitives(
  effects: readonly Effect[],
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const out: PrimitiveResult = { actions: [], deferred: [], continuous: [] };
  let ordinal = env.ordinal;

  const push = (result: PrimitiveResult) => {
    for (const action of result.actions) out.actions.push(action);
    for (const line of result.deferred) out.deferred.push(line);
    for (const effect of result.continuous) out.continuous.push(effect);
  };

  const runOne = (effect: Effect, innerCtx: AbilityContext): void => {
    if (CONTROL.has(effect.do)) {
      switch (effect.do) {
        case 'if': {
          const branch = evalCondition(effect.condition, innerCtx) ? effect.then : effect.else;
          for (const inner of branch ?? []) runOne(inner, innerCtx);
          return;
        }
        case 'for-each': {
          if (isPlayerSelector(effect.over)) {
            for (const playerId of resolvePlayers(effect.over, innerCtx)) {
              const bound: AbilityContext = { ...innerCtx, eachPlayerId: playerId, controllerId: playerId };
              for (const inner of effect.effects) runOne(inner, bound);
            }
            return;
          }
          for (const instanceId of resolveSelector(effect.over as Selector, innerCtx)) {
            const bound: AbilityContext = { ...innerCtx, eachCardId: instanceId };
            for (const inner of effect.effects) runOne(inner, bound);
          }
          return;
        }
        case 'repeat': {
          const times = Math.min(Math.max(evalValue(effect.times, innerCtx), 0), 64);
          for (let n = 0; n < times; n++) {
            for (const inner of effect.effects) runOne(inner, innerCtx);
          }
          return;
        }
        default:
          // `may` and `choose-mode` are player decisions. Their bodies are NOT
          // walked: running the inside of a "you may" would be taking it.
          break;
      }
    }

    const primitive = primitiveFor(effect.do as AnyEffectDo);
    if (primitive) {
      push(primitive(effect as never, innerCtx, { ...env, ordinal: ordinal++ }));
      return;
    }

    const fallback = runEffects([effect], innerCtx, {
      at: env.at,
      idPrefix: env.idPrefix,
      ...(env.cause ? { cause: env.cause } : {}),
    });
    push({ actions: fallback.actions, deferred: fallback.deferred, continuous: [] });
  };

  for (const effect of effects) runOne(effect, ctx);
  return out;
}
