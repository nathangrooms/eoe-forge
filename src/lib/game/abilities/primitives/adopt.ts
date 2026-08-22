/**
 * DeckMatrix — kept only so callers written against the adoption wrapper still
 * compile. It walks nothing.
 *
 * ## What this file used to be, and why it is not that any more
 *
 * The primitives in this folder were written while other authors were inside
 * `to-actions.ts`, so they could not be called from the switch that owns the
 * `Effect` union. This file was the way round that: a second walker that ran a
 * primitive when it had one and delegated the rest to `runEffects`. It carried
 * its own copy of the `if` / `for-each` / `repeat` logic, because a
 * `{do:'pump'}` inside a `{do:'if'}` had to be visible to it.
 *
 * Two copies of control flow is the drift this project keeps paying for. The
 * copies would not disagree on the day they were written. They would disagree
 * six months later, on one card, and it would show up as two clients landing on
 * different boards from the same action log.
 *
 * So the primitives moved into the switch. `to-actions.ts` calls
 * `pumpToContinuous`, `gainControlToContinuous`, `damageToPermanent`,
 * `returnFromForced`, `searchLibraryForced` and `counterTargetSpell` directly,
 * keeps its trailing throw so a new verb is still a loud failure, and turns a
 * returned continuous effect into an `ADD_CONTINUOUS` action.
 *
 * `runEffectsWithPrimitives` therefore means the same thing as `runEffects`
 * now. It stays because `scripts/primitives/measure-unlocked.ts` calls it, and
 * because deleting the name would quietly turn that script's before/after into
 * a comparison of one thing with itself without anybody noticing. Run today it
 * reports what the shipped engine does, which is the honest answer: there is no
 * longer a "before" to compare against.
 */

import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { runEffects } from '../to-actions.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';

/**
 * Run an effect tree through the shipped engine.
 *
 * `continuous` always comes back empty, and that is not a loss: the continuous
 * effect a pump produces is already in `actions`, as `ADD_CONTINUOUS`, because
 * that is how it reaches the reducer and the log.
 */
export function runEffectsWithPrimitives(
  effects: readonly Effect[],
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const run = runEffects(effects, ctx, {
    at: env.at,
    idPrefix: env.idPrefix,
    ...(env.cause ? { cause: env.cause } : {}),
  });
  return { actions: run.actions, deferred: run.deferred, continuous: [] };
}
