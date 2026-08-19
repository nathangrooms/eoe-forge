/**
 * DeckMatrix — zone primitives. P05, P06, P17.
 *
 * `to-actions.ts` handles `return-from` and `search-library` in one two-line
 * case that defers both, unconditionally, with the comment "both need the player
 * to pick from a zone we may not even be allowed to show them".
 *
 * That is true when there is something to pick. It is not true when there is
 * not. Raise Dead with exactly one creature in the graveyard has no decision in
 * it, and Rampant Growth still shuffles the library whether or not it found a
 * land (CR 701.19). Measured: 178 cards are blocked by `return-from` alone and
 * 119 by `search-library` alone, and a large share of those resolve with no
 * choice on a typical board.
 *
 * The forced case is what these primitives take. The genuinely-a-choice case
 * still defers, and must — guessing which card a player tutors for is not
 * automation, it is playing their deck for them.
 */

import type { GameAction, InstanceId, PlayerId, Zone } from '../../types.ts';
import type { Effect, Selector } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { evalValue, matchesFilter, playerOf, resolvePlayers } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { nothing } from './contract.ts';

/* -------------------------------------------------------------------------- */
/* P17 — the pool                                                             */
/* -------------------------------------------------------------------------- */

/**
 * P17. Spec: `scripts/primitives/specs/P17.spec.json`.
 *
 * Stored order, never sorted. A sort would be an ordering the reducer does not
 * share, and two clients disagreeing about which card was "first" in a library
 * is a desynchronised replay.
 */
export function zonePool(
  zone: Zone,
  playerId: PlayerId,
  what: Selector,
  ctx: AbilityContext
): InstanceId[] {
  const player = playerOf(ctx.state, playerId);
  if (!player) return [];
  const ids = player.zones[zone];
  if (!ids) return [];

  // Only a filtered all-selector describes a pool. Anything else — `self`,
  // `target`, `trigger-source` — names specific objects, and widening it to the
  // zone would let a forced-choice fast path move cards the effect never named.
  if (what.sel !== 'all') return [];

  return ids.filter(id => matchesFilter(what.where, id, ctx));
}

/* -------------------------------------------------------------------------- */
/* P05 — return from a zone                                                   */
/* -------------------------------------------------------------------------- */

/** P05. Spec: `scripts/primitives/specs/P05.spec.json`. */
export function returnFromForced(
  effect: Extract<Effect, { do: 'return-from' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const count = evalValue(effect.count, ctx);
  if (count <= 0) return nothing();

  const actions: GameAction[] = [];
  const deferred: string[] = [];

  for (const playerId of resolvePlayers(effect.who, ctx)) {
    const pool = zonePool(effect.zone as Zone, playerId, effect.what, ctx);
    // CR 608.2 — do as much as you can. Nothing is what can be done, and there
    // is no decision to report either.
    if (pool.length === 0) continue;

    if (pool.length <= count) {
      for (const instanceId of pool) {
        actions.push({
          type: 'MOVE_ZONE',
          instanceId,
          to: effect.to,
          at: env.at,
          ...(env.cause ? { cause: env.cause } : {}),
        });
      }
      continue;
    }

    const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
    deferred.push(
      `${name} returns ${count} of ${pool.length} eligible card${pool.length === 1 ? '' : 's'} from their ${effect.zone}`
    );
  }

  return { actions, deferred, continuous: [] };
}

/* -------------------------------------------------------------------------- */
/* P06 — search a library                                                     */
/* -------------------------------------------------------------------------- */

/**
 * P06. Spec: `scripts/primitives/specs/P06.spec.json`.
 *
 * The shuffle is the part a naive implementation gets wrong. CR 701.19 makes it
 * part of the effect, not a consequence of finding something, so a fruitless
 * search still shuffles — and a search whose CHOICE is deferred still shuffles
 * too, because the shuffle is not the thing being decided.
 */
export function searchLibraryForced(
  effect: Extract<Effect, { do: 'search-library' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const count = evalValue(effect.count, ctx);
  const actions: GameAction[] = [];
  const deferred: string[] = [];

  for (const playerId of resolvePlayers(effect.who, ctx)) {
    const pool = zonePool('library', playerId, effect.what, ctx);
    const name = playerOf(ctx.state, playerId)?.name ?? 'A player';

    if (count > 0 && pool.length > count) {
      deferred.push(`${name} searches their library for ${count} of ${pool.length} matching cards`);
    } else if (count > 0) {
      for (const instanceId of pool) {
        actions.push({
          type: 'MOVE_ZONE',
          instanceId,
          to: effect.to,
          ...(effect.tapped ? { tapped: true } : {}),
          at: env.at,
          ...(env.cause ? { cause: env.cause } : {}),
        });
      }
    }

    if (effect.thenShuffle) {
      actions.push({
        type: 'SHUFFLE',
        playerId,
        at: env.at,
        ...(env.cause ? { cause: env.cause } : {}),
      });
    }
  }

  return { actions, deferred, continuous: [] };
}
