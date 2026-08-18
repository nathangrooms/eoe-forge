/**
 * DeckMatrix — the card-ability DSL: activation costs.
 *
 * `canPayCosts` answers "may this be activated at all", and
 * `costPaymentActions` turns a cost list into the ordinary actions that pay it.
 * Costs are paid ATOMICALLY: either every component is payable and the whole
 * list is emitted, or nothing is.
 *
 * ## Mana is `mana.ts`'s job and nobody else's
 *
 * `{pay:'mana'}` hands its cost string straight to `parseCost` / `planPayment`.
 * There is no second mana implementation here, because two implementations of
 * the same rule is how a codebase ends up with a cost that is affordable on one
 * screen and not on another.
 *
 * ## A cost never picks for the player
 *
 * "Sacrifice a creature" with four creatures on the board has four legal
 * payments. This module reports the candidates and pays only when the choice is
 * forced. The caller supplies the chosen ids, so the decision lands in the
 * action log and every client replays it identically — a bot and a human go
 * through exactly the same door.
 */

import type { GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { ActivatedAbility, Cost } from './dsl.ts';
import { assertNever } from './dsl.ts';
import type { AbilityContext } from './query.ts';
import { cardOf, evalValue, playerOf, resolveSelector } from './query.ts';
import { manaSourcesFor, planPayment } from '../mana.ts';

/* -------------------------------------------------------------------------- */
/* Payability                                                                 */
/* -------------------------------------------------------------------------- */

export interface CostCheck {
  ok: boolean;
  /** Prose for a disabled control's tooltip. Empty when `ok`. */
  reason: string;
  /**
   * One entry per component that has more legal payments than it needs. The UI
   * must ask; the engine must not decide.
   */
  choices: Array<{ cost: Cost; candidates: InstanceId[]; need: number; prompt: string }>;
}

const OK: CostCheck = { ok: true, reason: '', choices: [] };

function fail(reason: string): CostCheck {
  return { ok: false, reason, choices: [] };
}

/**
 * Can the controller pay every component of this cost right now?
 *
 * `chosen` supplies ids the player has already picked for the components that
 * need a decision; anything still ambiguous comes back in `choices`.
 */
export function canPayCosts(
  costs: readonly Cost[],
  ctx: AbilityContext,
  chosen: Record<number, InstanceId[]> = {}
): CostCheck {
  const choices: CostCheck['choices'] = [];
  const source = cardOf(ctx.state, ctx.sourceId);
  const player = playerOf(ctx.state, ctx.controllerId);
  if (!player) return fail('Unknown player.');

  // Mana is checked once, against the whole cost, so two mana components on one
  // ability cannot both spend the same land.
  const manaString = costs
    .filter((cost): cost is Extract<Cost, { pay: 'mana' }> => cost.pay === 'mana')
    .map(cost => cost.cost)
    .join('');
  if (manaString) {
    const plan = planPayment(manaString, manaSourcesFor(ctx.state, ctx.controllerId));
    if (!plan.ok) return fail(plan.reason);
  }

  for (let index = 0; index < costs.length; index++) {
    const cost = costs[index];

    switch (cost.pay) {
      case 'mana':
        break; // handled above

      case 'tap':
        if (!source) return fail('The source is gone.');
        if (source.tapped) return fail(`${source.name} is already tapped.`);
        if (source.summoningSick && isCreature(ctx, ctx.sourceId)) {
          return fail(`${source.name} has summoning sickness.`);
        }
        break;

      case 'untap':
        if (!source) return fail('The source is gone.');
        if (!source.tapped) return fail(`${source.name} is already untapped.`);
        break;

      case 'life': {
        const amount = evalValue(cost.amount, ctx);
        // CR 118.4 — a player may pay life only down to zero, not below.
        if (player.life < amount) return fail(`Not enough life to pay ${amount}.`);
        break;
      }

      case 'remove-counters': {
        const need = evalValue(cost.count, ctx);
        const from = cost.from ? resolveSelector(cost.from, ctx) : [ctx.sourceId];
        const available = from.reduce(
          (total, id) => total + (cardOf(ctx.state, id)?.counters[cost.counter] ?? 0),
          0
        );
        if (available < need) return fail(`Not enough ${cost.counter} counters.`);
        break;
      }

      case 'add-counters':
        break; // Always payable; loyalty +N never fails.

      case 'discard': {
        const need = evalValue(cost.count, ctx);
        if (player.zones.hand.length < need) return fail(`Not enough cards to discard ${need}.`);
        if (player.zones.hand.length > need && !cost.random) {
          choices.push({
            cost,
            candidates: player.zones.hand.slice(),
            need,
            prompt: `Discard ${need} card${need === 1 ? '' : 's'}`,
          });
        }
        break;
      }

      case 'sacrifice':
      case 'exile':
      case 'return-to-hand':
      case 'reveal':
      case 'tap-others': {
        const need = evalValue(cost.count, ctx);
        const candidates = eligibleFor(cost, ctx, chosen[index]);
        if (candidates.length < need) return fail(`Not enough permanents to pay this cost.`);
        if (candidates.length > need) {
          choices.push({ cost, candidates, need, prompt: promptFor(cost, need) });
        }
        break;
      }

      default:
        return assertNever(cost, 'canPayCosts');
    }
  }

  return choices.length > 0 ? { ok: true, reason: '', choices } : OK;
}

function isCreature(ctx: AbilityContext, instanceId: InstanceId): boolean {
  return ctx.derived.cards[instanceId]?.types.includes('creature') ?? false;
}

function eligibleFor(cost: Cost, ctx: AbilityContext, chosen?: InstanceId[]): InstanceId[] {
  if (chosen && chosen.length > 0) return chosen;
  switch (cost.pay) {
    case 'sacrifice':
    case 'return-to-hand':
    case 'reveal':
      return resolveSelector(cost.what, ctx);
    case 'exile':
      return resolveSelector(cost.what, ctx);
    case 'tap-others':
      return resolveSelector(cost.what, ctx).filter(
        id => id !== ctx.sourceId && !cardOf(ctx.state, id)?.tapped
      );
    default:
      return [];
  }
}

function promptFor(cost: Cost, need: number): string {
  switch (cost.pay) {
    case 'sacrifice':
      return `Sacrifice ${need}`;
    case 'exile':
      return `Exile ${need}`;
    case 'return-to-hand':
      return `Return ${need} to hand`;
    case 'reveal':
      return `Reveal ${need}`;
    case 'tap-others':
      return `Tap ${need} other permanent${need === 1 ? '' : 's'}`;
    default:
      return `Choose ${need}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The actions that pay a cost, in order.
 *
 * Returns `null` when the cost cannot be paid, or when a component still needs
 * a decision the player has not made — never a partial payment. A half-paid
 * cost in the log is a game state the rules do not have a name for.
 */
export function costPaymentActions(
  costs: readonly Cost[],
  ctx: AbilityContext,
  options: { at?: number; cause?: string; chosen?: Record<number, InstanceId[]> } = {}
): GameAction[] | null {
  const chosen = options.chosen ?? {};
  const check = canPayCosts(costs, ctx, chosen);
  if (!check.ok) return null;
  if (check.choices.length > 0) return null;

  const at = options.at ?? 0;
  const meta = options.cause ? { at, cause: options.cause } : { at };
  const out: GameAction[] = [];

  const manaString = costs
    .filter((cost): cost is Extract<Cost, { pay: 'mana' }> => cost.pay === 'mana')
    .map(cost => cost.cost)
    .join('');
  if (manaString) {
    const plan = planPayment(manaString, manaSourcesFor(ctx.state, ctx.controllerId));
    if (!plan.ok) return null;
    for (const instanceId of plan.tapIds) out.push({ type: 'TAP', instanceId, ...meta });
  }

  for (let index = 0; index < costs.length; index++) {
    const cost = costs[index];

    switch (cost.pay) {
      case 'mana':
        break;

      case 'tap':
        out.push({ type: 'TAP', instanceId: ctx.sourceId, ...meta });
        break;

      case 'untap':
        out.push({ type: 'UNTAP', instanceId: ctx.sourceId, ...meta });
        break;

      case 'life':
        out.push({
          type: 'LIFE_CHANGE',
          playerId: ctx.controllerId,
          delta: -evalValue(cost.amount, ctx),
          ...meta,
        });
        break;

      case 'remove-counters': {
        const need = evalValue(cost.count, ctx);
        const from = cost.from ? resolveSelector(cost.from, ctx) : [ctx.sourceId];
        let left = need;
        for (const instanceId of from) {
          if (left <= 0) break;
          const have = cardOf(ctx.state, instanceId)?.counters[cost.counter] ?? 0;
          const take = Math.min(have, left);
          if (take <= 0) continue;
          out.push({ type: 'CARD_COUNTER', instanceId, counter: cost.counter, delta: -take, ...meta });
          left -= take;
        }
        break;
      }

      case 'add-counters': {
        const count = evalValue(cost.count, ctx);
        if (count === 0) break;
        const to = cost.to ? resolveSelector(cost.to, ctx) : [ctx.sourceId];
        for (const instanceId of to) {
          out.push({ type: 'CARD_COUNTER', instanceId, counter: cost.counter, delta: count, ...meta });
        }
        break;
      }

      case 'discard': {
        const need = evalValue(cost.count, ctx);
        const hand = playerOf(ctx.state, ctx.controllerId)?.zones.hand ?? [];
        const ids = chosen[index] ?? hand.slice(0, need);
        for (const instanceId of ids.slice(0, need)) {
          out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...meta });
        }
        break;
      }

      case 'sacrifice': {
        const need = evalValue(cost.count, ctx);
        for (const instanceId of eligibleFor(cost, ctx, chosen[index]).slice(0, need)) {
          out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...meta });
        }
        break;
      }

      case 'exile': {
        const need = evalValue(cost.count, ctx);
        for (const instanceId of eligibleFor(cost, ctx, chosen[index]).slice(0, need)) {
          out.push({ type: 'MOVE_ZONE', instanceId, to: 'exile', ...meta });
        }
        break;
      }

      case 'return-to-hand': {
        const need = evalValue(cost.count, ctx);
        for (const instanceId of eligibleFor(cost, ctx, chosen[index]).slice(0, need)) {
          out.push({ type: 'MOVE_ZONE', instanceId, to: 'hand', ...meta });
        }
        break;
      }

      case 'tap-others': {
        const need = evalValue(cost.count, ctx);
        for (const instanceId of eligibleFor(cost, ctx, chosen[index]).slice(0, need)) {
          out.push({ type: 'TAP', instanceId, ...meta });
        }
        break;
      }

      case 'reveal':
        // Revealing changes no game state. It is still logged, because the
        // table needs to know it happened.
        out.push({
          type: 'NOTE',
          message: `${cardOf(ctx.state, ctx.sourceId)?.name ?? 'A player'} reveals as a cost.`,
          instanceId: ctx.sourceId,
          ...meta,
        });
        break;

      default:
        return assertNever(cost, 'costPaymentActions');
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Activation legality                                                        */
/* -------------------------------------------------------------------------- */

export interface ActivationCheck {
  ok: boolean;
  reason: string;
}

/**
 * Everything except the cost: zone, timing, and any condition on the ability.
 *
 * Split from `canPayCosts` so a UI can say "you can't afford this" and "you
 * can't do this now" differently, which is the difference between a player
 * waiting and a player confused.
 */
export function canActivate(
  ability: ActivatedAbility,
  ctx: AbilityContext,
  activatorId: PlayerId
): ActivationCheck {
  const card = cardOf(ctx.state, ctx.sourceId);
  if (!card) return { ok: false, reason: 'The source is gone.' };
  if (card.controllerId !== activatorId) return { ok: false, reason: 'You do not control it.' };

  const zones = ability.activeZones ?? ['battlefield'];
  if (!zones.includes(card.zone)) {
    return { ok: false, reason: `Can only be activated from ${zones.join(' or ')}.` };
  }

  if (ability.timing === 'sorcery') {
    if (ctx.state.activePlayerId !== activatorId) {
      return { ok: false, reason: 'Only on your own turn.' };
    }
    if (ctx.state.step !== 'precombat_main' && ctx.state.step !== 'postcombat_main') {
      return { ok: false, reason: 'Only during a main phase.' };
    }
  }

  return { ok: true, reason: '' };
}
