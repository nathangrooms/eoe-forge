/**
 * DeckMatrix — damage primitives. P03 and P19.
 *
 * ## What is being replaced, and why it matters more than a missing feature
 *
 * `to-actions.ts` currently handles damage to a permanent like this: it reads
 * the toughness, subtracts damage already marked, and if the incoming amount is
 * lethal it emits `MOVE_ZONE` to the graveyard. If it is not lethal it emits
 * nothing and pushes a line onto `deferred`.
 *
 * Both halves are wrong, and the first half is the dangerous one because it
 * *looks* like it works.
 *
 *   - CR 119.3 says damage is MARKED on a permanent. Nothing about dealing
 *     damage destroys anything. CR 704.5g destroys a creature with lethal damage
 *     as a state-based action, later, and `sba.ts` already implements 704.5f,
 *     704.5g and 704.5h correctly. Resolving lethality inline means two shocks
 *     of 2 at a 4/4 kill nothing, because neither one is lethal on its own and
 *     nothing accumulated.
 *   - It ignores deathtouch entirely (CR 702.2b), so a 1/1 deathtoucher pinging
 *     a 5/5 does nothing.
 *   - It ignores the reducer's own `DAMAGE_CARD` action, which exists, carries a
 *     `deathtouch` flag, and feeds `CardInstance.damagedByDeathtouch` — the field
 *     `sba.ts` reads for 704.5h.
 *
 * So this is not a gap being filled. It is a live defect on 396 cards, 333 of
 * which have nothing else standing between them and running.
 */

import type { GameAction } from '../../types.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { evalValue, isPlayerSelector, resolveSelector, viewOf } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { acted, nothing } from './contract.ts';

/**
 * P19. Spec: `scripts/primitives/specs/P19.spec.json`.
 *
 * The LAYERED view, not the printed card. Basilisk Collar grants deathtouch in
 * layer 6; a printed-only read would let the equipped creature ping a dragon for
 * nothing.
 */
export function sourceHasDeathtouch(ctx: AbilityContext): boolean {
  const view = viewOf(ctx, ctx.sourceId);
  if (!view) return false;
  return view.keywords.some(keyword => keyword.toLowerCase() === 'deathtouch');
}

/**
 * P03. Spec: `scripts/primitives/specs/P03.spec.json`.
 *
 * Marks damage and stops. Whether that damage kills anything is CR 704.5g's
 * business, and `sba.ts` is where 704.5g lives.
 */
export function damageToPermanent(
  effect: Extract<Effect, { do: 'damage' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  // Damage aimed at a player is a plain `DAMAGE` action and is already right in
  // `to-actions.ts`. Handling it here too would be a second implementation.
  if (isPlayerSelector(effect.to)) return nothing();

  const amount = evalValue(effect.amount, ctx);
  if (amount <= 0) return nothing();

  const deathtouch = sourceHasDeathtouch(ctx);
  const source = ctx.state.cards[ctx.sourceId];

  const actions: GameAction[] = resolveSelector(effect.to, ctx).map(instanceId => ({
    type: 'DAMAGE_CARD',
    instanceId,
    amount,
    sourceInstanceId: source?.instanceId,
    sourcePlayerId: ctx.controllerId,
    ...(deathtouch ? { deathtouch: true } : {}),
    at: env.at,
    ...(env.cause ? { cause: env.cause } : {}),
  }));

  return acted(actions);
}
