/**
 * DeckMatrix — regeneration. P10.
 *
 * CR 701.15a: the next time this permanent would be destroyed this turn, instead
 * tap it, remove it from combat and heal all damage marked on it.
 *
 * Three things about that sentence decide the implementation.
 *
 *   1. It is a **shield**, placed now and consumed later. So this primitive
 *      creates the shield and stops. Nothing here prevents anything.
 *   2. Shields **stack and are counted**. Two regenerate effects on one creature
 *      save it twice, which is why XMage stores an amount rather than a flag
 *      (`incRegenerationShieldsAmount`) and why this is a counter delta rather
 *      than a `SET_KEYWORD`.
 *   3. It is **not indestructible**. Granting indestructible would look identical
 *      for one turn and would then save the creature forever — a silent, durable
 *      wrong answer, which is the failure mode this whole harness is built to
 *      reject.
 *
 * `GameState` has no shield list and `GameAction` has no shield action, but
 * `CardInstance` has a `counters` map and `CARD_COUNTER` writes to it. The
 * counter name is namespaced so it can never collide with a printed counter
 * type — there is no Magic counter called `dm:regeneration-shield`, and there
 * never will be, because the colon is not a character Wizards uses.
 *
 * **What is NOT done here, stated plainly.** Nothing consumes the shield. The
 * destruction event that would spend it lives in `sba.ts` and `replacement.ts`,
 * and wiring it is a separate change with its own spec. This primitive is
 * therefore honest and incomplete: it passes its own gates, and the card does
 * not yet play correctly end to end. The report says so rather than counting
 * regenerate cards as unlocked.
 */

import type { GameAction } from '../../types.ts';
import type { AbilityContext } from '../context.ts';
import { evalValue, resolveSelector } from '../context.ts';
import type { ExtendedEffect } from './extended-dsl.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { acted, nothing } from './contract.ts';

/** The shield counter. Namespaced; see the module note. */
export const REGENERATION_SHIELD_COUNTER = 'dm:regeneration-shield';

/** P10. Spec: `scripts/primitives/specs/P10.spec.json`. */
export function regenerateShield(
  effect: Extract<ExtendedEffect, { do: 'regenerate' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const count = evalValue(effect.count, ctx);
  if (count <= 0) return nothing();

  const battlefield = new Set(
    ctx.state.players.flatMap(player => player.zones.battlefield ?? [])
  );

  const actions: GameAction[] = resolveSelector(effect.what, ctx)
    .filter(instanceId => battlefield.has(instanceId))
    .map(instanceId => ({
      type: 'CARD_COUNTER',
      instanceId,
      counter: REGENERATION_SHIELD_COUNTER,
      delta: count,
      at: env.at,
      ...(env.cause ? { cause: env.cause } : {}),
    }));

  return acted(actions);
}
