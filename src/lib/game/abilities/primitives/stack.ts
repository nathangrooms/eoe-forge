/**
 * DeckMatrix — stack primitives. P07 and P18.
 *
 * `to-actions.ts` defers `{do:'counter'}` with an accurate comment: countering
 * is `stack.ts`'s `COUNTER_SPELL`, which needs the stack id the target was
 * announced with, and "until an ability announces stack targets, saying so beats
 * guessing which object was meant".
 *
 * `StackTarget` has had `kind: 'stack'` and a `stackId` the whole time, and
 * `AbilityContext.targets` carries the announced list. So the missing piece is
 * not a state change; it is these two functions.
 *
 * P18 carries the rule that makes this safe. CR 608.2b: a target that has become
 * illegal is simply not affected. A stack id that is no longer on the stack must
 * therefore be DROPPED. Returning it and letting the caller fire `COUNTER_SPELL`
 * at it would counter whatever object now occupies that id — the worst available
 * failure, because it is silent and it hits the wrong player's spell.
 */

import type { GameAction, StackObjectId } from '../../types.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { defer } from './contract.ts';

/** P18. Spec: `scripts/primitives/specs/P18.spec.json`. */
export function stackTargetsOf(ctx: AbilityContext): StackObjectId[] {
  // Optional so a state persisted before the stack existed still loads.
  const stack = ctx.state.stack ?? [];
  const live = new Set(stack.map(object => object.stackId));

  const seen = new Set<StackObjectId>();
  const out: StackObjectId[] = [];
  for (const target of ctx.targets) {
    if (target.kind !== 'stack') continue;
    const id = target.stackId;
    if (id === undefined) continue;
    if (!live.has(id)) continue; // CR 608.2b
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** P07. Spec: `scripts/primitives/specs/P07.spec.json`. */
export function counterTargetSpell(
  effect: Extract<Effect, { do: 'counter' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const ids = stackTargetsOf(ctx);
  if (ids.length === 0) {
    const announced = ctx.targets.some(target => target.kind === 'stack');
    return defer(
      announced
        ? 'the countered spell had already left the stack'
        : 'counter target spell, but no stack target was announced'
    );
  }

  const actions: GameAction[] = ids.map(stackId => ({
    type: 'COUNTER_SPELL',
    stackId,
    at: env.at,
    ...(env.cause ? { cause: env.cause, reason: env.cause } : {}),
  }));

  return { actions, deferred: [], continuous: [] };
}
