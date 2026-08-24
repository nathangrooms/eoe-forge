/**
 * DeckMatrix — top-of-library primitives. P08, P09, P20.
 *
 * Scry and surveil are the two highest-value verbs the DSL does not have: 108
 * and 49 cards respectively where the compiler's ONLY complaint is a
 * `{do:'manual'}` marker holding the words
 * (`scripts/primitives/rank-missing-verbs.ts`).
 *
 * ## Both of them defer, and that is the correct implementation
 *
 * It is worth being blunt about this, because "scry is implemented" is exactly
 * the kind of claim that would be believed and would be false. Scry is a
 * DECISION: look at N, put any number on the bottom, the rest back on top in any
 * order. There is no board state on which that decision is forced — not even
 * scry 1 with a one-card library, where top and bottom are different games.
 *
 * So what these primitives buy is not automation of the choice. It is:
 *   - the verb existing, so the compiler can stop emitting `{do:'manual'}` and
 *     the card stops being classified `partial`;
 *   - the engine knowing which player, how many cards, and which destination, so
 *     a prompt can be raised against a typed effect rather than a string;
 *   - a log line that says "scry 2" instead of quoting oracle text back.
 *
 * The report counts them as primitives that PASSED and unlocked ZERO cards
 * today, and names the decision protocol as what they are waiting on. Counting
 * them as 157 automated cards would be the exact dishonesty the two-numbers rule
 * exists to prevent.
 */

import type { GameState, InstanceId, PlayerId } from '../../types.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { evalValue, playerOf, resolvePlayers } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { nothing } from './contract.ts';

/**
 * P20. Spec: `scripts/primitives/specs/P20.spec.json`.
 *
 * A NEW array. Returning `player.zones.library` itself would hand a caller the
 * live list, and one `.sort()` on it would reorder a library with no action in
 * the log — undetectable, unreplayable, and exactly the mutation the purity gate
 * exists to catch.
 */
export function libraryTop(state: GameState, playerId: PlayerId, count: number): InstanceId[] {
  if (count <= 0) return [];
  const library = playerOf(state, playerId)?.zones.library;
  if (!library) return [];
  return library.slice(0, count);
}

/** P08. Spec: `scripts/primitives/specs/P08.spec.json`. */
export function scryToActions(
  effect: Extract<Effect, { do: 'scry' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const count = evalValue(effect.count, ctx);
  if (count <= 0) return nothing();

  const deferred: string[] = [];
  for (const playerId of resolvePlayers(effect.who, ctx)) {
    const looked = libraryTop(ctx.state, playerId, count);
    // Nothing to look at is nothing to decide. Reporting it would put a line in
    // the log for an event a player did not experience.
    if (looked.length === 0) continue;
    const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
    deferred.push(
      `${name} scries ${count}${looked.length < count ? ` (only ${looked.length} card${looked.length === 1 ? '' : 's'} in library)` : ''}`
    );
  }

  return { actions: [], deferred, continuous: [] };
}

/** P09. Spec: `scripts/primitives/specs/P09.spec.json`. */
export function surveilToActions(
  effect: Extract<Effect, { do: 'surveil' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const count = evalValue(effect.count, ctx);
  if (count <= 0) return nothing();

  const deferred: string[] = [];
  for (const playerId of resolvePlayers(effect.who, ctx)) {
    const looked = libraryTop(ctx.state, playerId, count);
    if (looked.length === 0) continue;
    const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
    deferred.push(
      `${name} surveils ${count}${looked.length < count ? ` (only ${looked.length} card${looked.length === 1 ? '' : 's'} in library)` : ''}`
    );
  }

  return { actions: [], deferred, continuous: [] };
}
