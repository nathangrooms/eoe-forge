/**
 * DeckMatrix — shared game-state core: activating an ability (CR 602).
 *
 * ## What was missing, stated plainly
 *
 * The oracle-text compiler reads 5,440 activated abilities off the 30,611-card
 * harness pool and `activatedAbilitiesOf` has narrowed them out of a card's
 * compiled record since the day it was written. Nothing called it. Every one of
 * those abilities compiled correctly and was dropped on the floor, so from a
 * seat at the table every card reading "{T}: do something" was a card that did
 * nothing. The harness measured the consequence over 80 games: a permanent with
 * an activated ability reached the battlefield 472 times and an activated
 * ability was used 0 times.
 *
 * This module is the missing half. It answers two questions and builds one
 * batch:
 *
 *   - **what could this player activate on this permanent right now**
 *     (`activationsFor`), and
 *   - **what actions does activating it take** (`planActivation`) — the costs,
 *     then `PUT_ABILITY_ON_STACK` carrying the compiled ability's id.
 *
 * `stack.ts` does the rest: the object waits for a priority round, and on
 * resolution `compiledAbilityActions` runs the ability through `to-actions.ts`.
 *
 * ## Nothing here decides anything for a player
 *
 * A cost that names one candidate is not a choice and is taken. A cost or a
 * target that names several is a DECISION, and the plan comes back refused with
 * that decision described in `pending` rather than resolved by picking the
 * first one. The caller — a person pressing a control, or `bot.ts` applying its
 * own policy — supplies the choice and asks again. This is the same rule
 * `to-actions.ts` follows on resolution, one step earlier.
 *
 * ## And nothing is hidden
 *
 * Every compiled activated ability on a card comes back from `activationsFor`,
 * including the ones that cannot be activated. `ok` is false and `reason` is a
 * sentence saying why, because a control that quietly is not drawn and a rule
 * the engine does not implement look identical from the table. That is project
 * law: the engine never silently does nothing.
 *
 * Pure: no clock (`at` is passed in), no randomness, no I/O, no React.
 */

import type {
  ActivatedAbility,
  Cost,
  Selector,
  TargetSpec,
  ValueExpr,
} from '../cards/abilities/dsl.ts';
import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  StackTarget,
  Zone,
} from './types.ts';
import { getCard, getPlayer, livingPlayers } from './rules.ts';
import { isCreature, manaSourcesFor, planPayment } from './mana.ts';
import { canBeTargetedBy } from './keywords.ts';
import { hasKeywordIn } from './characteristics.ts';
import { readableClause } from './manual.ts';
import { abilitiesFor } from './abilities/card-abilities.ts';
import {
  evalValue,
  idsInZone,
  makeContext,
  matchesFilter,
  resolvePlayers,
  resolveSelector,
} from './abilities/context.ts';

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** A decision the engine will not take on the player's behalf. */
export interface PendingChoice {
  /** `target` indexes `TargetSpec.ref`; `cost` indexes into `ability.costs`. */
  kind: 'target' | 'cost';
  ref: number;
  /** One sentence, in a player's words. Drawn as text. */
  prompt: string;
  /** Cards that could be chosen. */
  instanceIds: InstanceId[];
  /** Players that could be chosen. Only ever populated for a target. */
  playerIds: PlayerId[];
  min: number;
  max: number;
}

/** What the caller has already decided. */
export interface ActivationChoices {
  /**
   * Targets, keyed by `TargetSpec.ref` — the same number `PendingChoice.ref`
   * reports, so an answer goes back where the question came from. A hole is
   * allowed: the plan asks again for whatever is still missing.
   */
  targets?: Array<StackTarget | undefined>;
  /** Cards spent on a cost, keyed by that cost's index in `ability.costs`. */
  costs?: Record<number, InstanceId[]>;
  /** The X announced for a cost or an effect that names one. */
  x?: number;
}

export interface ActivationPlan {
  ok: boolean;
  /** Costs first, announcement last. Empty when `ok` is false. */
  actions: GameAction[];
  /** Empty when `ok`. A sentence, never a code. */
  reason: string;
  /** Permanents this would tap to pay for it, including the source's own `{T}`. */
  tapIds: InstanceId[];
  /** Decisions still outstanding. Non-empty only when `ok` is false. */
  pending: PendingChoice[];
}

/** One activatable ability on one permanent, already planned. */
export interface AbilityOption extends ActivationPlan {
  /** `${instanceId}:${abilityId}` — unique, stable, a React key and a test handle. */
  id: string;
  sourceInstanceId: InstanceId;
  abilityId: string;
  /** The verbatim oracle clause, with the compiler's tilde put back to the name. */
  text: string;
  /**
   * The compiled cost list, verbatim.
   *
   * Exposed rather than summarised because a caller deciding whether it WANTS
   * to pay asks different questions than the planner deciding whether it CAN:
   * `bot.ts` declines to feed its own board to a sacrifice outlet, and a
   * derived "what this gives up" summary would be a second description of the
   * cost that could disagree with the one being charged.
   */
  costs: readonly Cost[];
  isManaAbility: boolean;
  isLoyalty: boolean;
  /** CR 307.1 timing: true when it may only be activated in a main phase. */
  sorcerySpeed: boolean;
  /**
   * Something true about this ability that the engine cannot enforce. Shown
   * beside it rather than swallowed, so a player is never told a restriction is
   * being kept when it is not.
   */
  caution: string;
}

/* -------------------------------------------------------------------------- */
/* Per-turn usage                                                             */
/* -------------------------------------------------------------------------- */

const usageKey = (instanceId: InstanceId, abilityId: string) => `${instanceId}:${abilityId}`;

/**
 * How many times this ability has been activated this turn.
 *
 * Read through this, never off `state.abilityUses` directly: the record is
 * optional so a game saved before it existed still loads, and it is dropped
 * rather than emptied when a turn begins.
 */
export function abilityUsesThisTurn(
  state: GameState,
  instanceId: InstanceId,
  abilityId: string
): number {
  return state.abilityUses?.[usageKey(instanceId, abilityId)] ?? 0;
}

/** Has any loyalty ability of this planeswalker been activated this turn (CR 606.3)? */
function loyaltyUsedThisTurn(state: GameState, card: CardInstance): boolean {
  return activatedAbilitiesOfCard(card).some(
    ability => ability.isLoyalty && abilityUsesThisTurn(state, card.instanceId, ability.id) > 0
  );
}

function activatedAbilitiesOfCard(card: CardInstance): ActivatedAbility[] {
  return abilitiesFor(card).abilities.filter(
    (ability): ability is ActivatedAbility => ability.kind === 'activated'
  );
}

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * CR 602.5d / 307.1 — when may this ability be activated.
 *
 * Deliberately the same two branches `castTiming` uses for a spell, because
 * they are the same rule: an ability with no timing restriction is an instant
 * and a sorcery-speed one is a sorcery. The wording of the refusals matches too,
 * so a player reading the mat does not have to learn that abilities work
 * differently. They do not.
 */
export function activationTiming(
  state: GameState,
  playerId: PlayerId,
  sorcerySpeed: boolean
): { ok: boolean; reason: string } {
  if (state.status !== 'playing') return { ok: false, reason: 'The game is over.' };

  const stackHeight = (state.stack ?? []).length;

  if (!sorcerySpeed) {
    if (stackHeight === 0) return { ok: true, reason: '' };
    if (state.priorityPlayerId !== playerId) {
      return { ok: false, reason: 'Another player has priority right now.' };
    }
    if ((state.stack ?? []).some(object => object.splitSecond)) {
      return { ok: false, reason: 'A spell with split second is on the stack.' };
    }
    return { ok: true, reason: '' };
  }

  if (stackHeight > 0) {
    return { ok: false, reason: 'Something is on the stack. This can only be used when the stack is clear.' };
  }
  if (state.activePlayerId !== playerId) {
    return { ok: false, reason: 'It is not your turn. This can only be used on your own turn.' };
  }
  if (state.step !== 'precombat_main' && state.step !== 'postcombat_main') {
    return { ok: false, reason: 'This can only be used in one of your main phases.' };
  }
  return { ok: true, reason: '' };
}

/* -------------------------------------------------------------------------- */
/* Small readers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Does anything in this ability ask for the X the player announces?
 *
 * A walk rather than a regex over the serialised ability, because `{v:'x'}` is
 * a node in a tree and a string search would also match a card named X. X is
 * treated as 0 everywhere else in this engine (`parseCost` says so outright),
 * and 0 is a wrong answer rather than a small one for an ability whose whole
 * point is the number.
 */
function mentionsX(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mentionsX);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.v === 'x') return true;
    return Object.values(record).some(mentionsX);
  }
  return typeof value === 'string' && /\{X\}/i.test(value);
}

/**
 * A restriction printed on the ability that NOTHING IN THIS ENGINE ENFORCES.
 *
 * The compiler lifts exactly two of them into fields it can act on: "activate
 * only as a sorcery" becomes `timing`, and "activate only once each turn"
 * becomes `limit`. Every other "activate only ..." stays in the effect body as
 * a note, and a note is read AFTER the ability has already gone off.
 *
 * Found by playing, not by reading: `scripts/play-ability-shots.mjs` opened
 * Sinew Dancer and the panel cheerfully offered *"Corrupted — {W}, {T}: Tap
 * target creature. Activate only if an opponent has three or more poison
 * counters."* against an opponent with no poison counters at all. That is a
 * card playing STRONGER than it is printed, which this project treats as worse
 * than a card that does nothing: the other seat has no answer to a cost that
 * was never paid.
 *
 * Measured over the 30,611-card harness pool: 5,440 compiled activated
 * abilities, of which 152 carry "activate only if" and 74 carry another
 * unmodelled "activate only ..." window. Refusing 226 abilities costs less
 * than letting 226 be used illegally.
 *
 * "Only as an instant" is deliberately NOT refused. It grants permission rather
 * than removing it, and instant speed is already this engine's default, so
 * refusing it would hide an ability that is legal exactly as written.
 */
function unenforcedRestriction(text: string): string | null {
  const match = text.match(/activate\s+(?:this ability\s+)?only\s+([^.]*)/i);
  if (!match) return null;
  const rest = match[1].trim().toLowerCase();
  if (/^as a sorcery/.test(rest)) return null;
  if (/^any time you could cast a sorcery/.test(rest)) return null;
  if (/^once each/.test(rest)) return null;
  if (/^as an instant/.test(rest)) return null;
  if (/^any time you could cast an instant/.test(rest)) return null;
  return match[0].trim().replace(/\s+/g, ' ');
}

/** CR 302.6 — a creature that has not been under your control since your turn began cannot pay `{T}`. */
function tooSickToTap(state: GameState, card: CardInstance): boolean {
  if (!card.summoningSick) return false;
  if (!isCreature(card)) return false;
  return !hasKeywordIn(state, card, 'haste');
}

/** The zones an ability works in. Battlefield unless the compiler said otherwise. */
function activeZonesOf(ability: ActivatedAbility): readonly Zone[] {
  return ability.activeZones && ability.activeZones.length > 0
    ? ability.activeZones
    : (['battlefield'] as const);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * CR 605.1a — is this a mana ability?
 *
 * "It doesn't require a target, it could add mana to a player's mana pool when
 * it resolves, and it's not a loyalty ability." That is the whole test, and
 * COULD is the important word: an ability that adds mana AND does something
 * else is still a mana ability and still does not use the stack.
 *
 * The compiler's own `isManaAbility` flag is stricter than the rule — its
 * `isManaOnly` requires EVERY effect to be `add-mana` — so it misses every land
 * that charges for its mana. Trusting it alone is what put 142 mana abilities
 * on the stack across 120 harness games, and the damage was real rather than
 * cosmetic: this engine has no mana pool, so `add-mana` resolves to a note and
 * the mana is binned, while the rider is applied in full. Barbarian Ring, seed
 * 7004, game log, verbatim:
 *
 *     Barbarian Ring tapped.
 *     {T}: Add {R}. This land deals 1 damage to you.: Barbarian Ring goes on the stack.
 *     Barbarian Ring: Bot 1 took 1 damage from Barbarian Ring.
 *     Barbarian Ring: not resolved automatically — Bot 1 adds {R}
 *
 * A land tapped, a point of life gone, and no mana. Refusing it is not a
 * feature gap, it is the difference between a card that does nothing and a card
 * that actively costs the player something for nothing.
 *
 * The flag is still honoured when it is set, so a compiled ability that says it
 * is a mana ability stays one even if this reader cannot see the `add-mana`.
 */
function isManaAbility(ability: ActivatedAbility): boolean {
  if (ability.isManaAbility) return true;
  if (ability.isLoyalty) return false;
  if (ability.targets && ability.targets.length > 0) return false;
  return addsMana(ability.effects);
}

/** Does any branch of this effect tree add mana? Modes count: any of them could. */
function addsMana(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(addsMana);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.do === 'add-mana') return true;
    return Object.values(record).some(addsMana);
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Cost payment                                                               */
/* -------------------------------------------------------------------------- */

interface CostContext {
  state: GameState;
  playerId: PlayerId;
  card: CardInstance;
  at: number;
  choices: ActivationChoices;
  /**
   * BODIES already spent by an earlier cost: sacrificed, discarded, exiled,
   * returned. A second cost that has to CHOOSE a permanent may not choose one
   * of these, because there is only one of it.
   *
   * Deliberately not the same set as `tapping`. "{T}, Sacrifice this creature"
   * spends one permanent through two costs and both are legal, so a tap must
   * not remove the body a sacrifice needs.
   */
  committed: Set<InstanceId>;
  /**
   * Permanents this batch is already TAPPING. Only the mana planner reads it,
   * and it exists because a permanent has one tap and can spend it once.
   */
  tapping: Set<InstanceId>;
  x: number;
}

interface CostResult {
  actions: GameAction[];
  tapIds: InstanceId[];
  reason: string;
  pending?: PendingChoice;
}

const paid = (actions: GameAction[], tapIds: InstanceId[] = []): CostResult => ({
  actions,
  tapIds,
  reason: '',
});
const refused = (reason: string): CostResult => ({ actions: [], tapIds: [], reason });

/**
 * Which cards could pay one cost, and which of them the caller already chose.
 *
 * The three outcomes are the whole design. Enough candidates and a choice
 * already made: use it. Exactly as many candidates as the cost needs: it is not
 * a choice, take them. More candidates than the cost needs: it IS a choice, and
 * the engine hands it back instead of picking.
 */
function chooseCards(
  ctx: CostContext,
  index: number,
  candidates: InstanceId[],
  count: number,
  prompt: string,
  shortfall: string
): { chosen: InstanceId[]; reason: string; pending?: PendingChoice } {
  const free = candidates.filter(id => !ctx.committed.has(id));
  if (free.length < count) return { chosen: [], reason: shortfall };

  const supplied = ctx.choices.costs?.[index];
  if (supplied) {
    const legal = supplied.filter(id => free.includes(id));
    if (legal.length < count) return { chosen: [], reason: shortfall };
    return { chosen: legal.slice(0, count), reason: '' };
  }

  if (free.length === count) return { chosen: free, reason: '' };

  return {
    chosen: [],
    reason: prompt,
    pending: {
      kind: 'cost',
      ref: index,
      prompt,
      instanceIds: free,
      playerIds: [],
      min: count,
      max: count,
    },
  };
}

/** Permanents this player controls that a selector names, on the battlefield. */
function controlledCandidates(ctx: CostContext, what: Selector): InstanceId[] {
  const abilityCtx = makeContext(ctx.state, ctx.card.instanceId, ctx.playerId, { x: ctx.x });
  return resolveSelector(what, abilityCtx).filter(id => {
    const card = getCard(ctx.state, id);
    // You may only spend your own permanents on a cost, whatever the selector
    // says. A filter with no controller clause names the whole battlefield.
    return !!card && card.controllerId === ctx.playerId && !card.removedFromGame;
  });
}

function payOneCost(ctx: CostContext, cost: Cost, index: number): CostResult {
  const { state, playerId, card, at } = ctx;
  const player = getPlayer(state, playerId);
  if (!player) return refused('That player is not in this game.');

  const amount = (expr: ValueExpr): number =>
    Math.max(0, evalValue(expr, makeContext(state, card.instanceId, playerId, { x: ctx.x })));

  switch (cost.pay) {
    case 'mana': {
      // Every source except the ones another cost has already spent. Without
      // that exclusion an ability costing "{1}, {T}" would tap its own source
      // for the {1} and then tap it again for the {T}.
      const sources = manaSourcesFor(state, playerId).filter(
        source => !ctx.committed.has(source.instanceId) && !ctx.tapping.has(source.instanceId)
      );
      const payment = planPayment(cost.cost, sources);
      if (!payment.ok) return refused(payment.reason);
      return paid(
        payment.tapIds.map(id => ({ type: 'TAP' as const, instanceId: id, at })),
        payment.tapIds
      );
    }

    case 'tap': {
      if (card.tapped) return refused(`${card.name} is already tapped.`);
      if (tooSickToTap(state, card)) {
        return refused(`${card.name} came under your control this turn, so it cannot be tapped for this yet.`);
      }
      /*
       * The source is SPENT now, and `committed` is the only thing that tells
       * the mana planner so.
       *
       * Without this line a land whose ability costs "{G}, {T}" tapped itself
       * for the {G} and then had its {T} refused as already tapped, and the
       * ability went on the stack anyway — the {T} half of the cost paid by the
       * same tap that paid the mana. Measured in the harness before the fix:
       * 40 refused TAPs in 120 games, every one of them the source of the
       * ability being activated. Okina, Temple to the Grandfathers used its
       * "{G}, {T}" ability for nothing but its own tap; Abandoned Air Temple
       * paid "{3}{W}, {T}" with three lands and no {T} at all.
       *
       * Ordering alone could not fix it: non-mana costs are already planned
       * first, but planning a tap without recording it leaves the mana planner
       * looking at a board where the source is still untapped.
       *
       * `tapping` and not `committed`: "{T}, Sacrifice this creature" spends
       * one permanent through two costs and both are legal.
       */
      ctx.tapping.add(card.instanceId);
      return paid([{ type: 'TAP', instanceId: card.instanceId, at }], [card.instanceId]);
    }

    case 'untap': {
      if (!card.tapped) return refused(`${card.name} is not tapped, so it cannot be untapped to pay for this.`);
      // Same reservation as `tap`. A tapped permanent is not a mana source
      // today, but the batch untaps it, so nothing else may plan to tap it.
      ctx.tapping.add(card.instanceId);
      return paid([{ type: 'UNTAP', instanceId: card.instanceId, at }], [card.instanceId]);
    }

    case 'tap-others': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const candidates = controlledCandidates(ctx, cost.what).filter(id => {
        const other = getCard(state, id);
        return !!other && !other.tapped && !tooSickToTap(state, other);
      });
      const picked = chooseCards(
        ctx,
        index,
        candidates,
        count,
        `Choose ${count} untapped ${plural(count, 'permanent', 'permanents')} to tap for this.`,
        `You do not control ${count} untapped ${plural(count, 'permanent', 'permanents')} this could tap.`
      );
      if (picked.reason) return { actions: [], tapIds: [], reason: picked.reason, pending: picked.pending };
      for (const id of picked.chosen) ctx.committed.add(id);
      return paid(
        picked.chosen.map(id => ({ type: 'TAP' as const, instanceId: id, at })),
        picked.chosen
      );
    }

    case 'sacrifice': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const candidates = controlledCandidates(ctx, cost.what);
      const picked = chooseCards(
        ctx,
        index,
        candidates,
        count,
        `Choose ${count} ${plural(count, 'permanent', 'permanents')} to sacrifice.`,
        `You do not control ${count} ${plural(count, 'permanent', 'permanents')} this could sacrifice.`
      );
      if (picked.reason) return { actions: [], tapIds: [], reason: picked.reason, pending: picked.pending };
      for (const id of picked.chosen) ctx.committed.add(id);
      return paid(
        picked.chosen.map(id => ({
          type: 'MOVE_ZONE' as const,
          instanceId: id,
          to: 'graveyard' as const,
          at,
          cause: `Sacrificed for ${card.name}`,
        }))
      );
    }

    case 'discard': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const abilityCtx = makeContext(state, card.instanceId, playerId, { x: ctx.x });
      const candidates = player.zones.hand.filter(id => {
        if (!cost.what || cost.what.sel !== 'all') return true;
        return matchesFilter(cost.what.where, id, abilityCtx);
      });
      const picked = chooseCards(
        ctx,
        index,
        candidates,
        count,
        `Choose ${count} ${plural(count, 'card', 'cards')} to discard.`,
        `You do not have ${count} ${plural(count, 'card', 'cards')} in hand to discard.`
      );
      if (picked.reason) return { actions: [], tapIds: [], reason: picked.reason, pending: picked.pending };
      for (const id of picked.chosen) ctx.committed.add(id);
      return paid(
        picked.chosen.map(id => ({
          type: 'MOVE_ZONE' as const,
          instanceId: id,
          to: 'graveyard' as const,
          at,
          cause: `Discarded for ${card.name}`,
        }))
      );
    }

    case 'exile':
    case 'return-to-hand': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const to: Zone = cost.pay === 'exile' ? 'exile' : 'hand';
      const from: Zone = cost.pay === 'exile' ? (cost.from ?? 'battlefield') : 'battlefield';
      const abilityCtx = makeContext(state, card.instanceId, playerId, { x: ctx.x });
      const candidates =
        cost.what.sel === 'self'
          ? [card.instanceId]
          : idsInZone(state, from, [playerId]).filter(id =>
              cost.what.sel === 'all' ? matchesFilter(cost.what.where, id, abilityCtx) : false
            );
      const verb = cost.pay === 'exile' ? 'exile' : 'return to your hand';
      const picked = chooseCards(
        ctx,
        index,
        candidates,
        count,
        `Choose ${count} ${plural(count, 'card', 'cards')} to ${verb}.`,
        `You do not have ${count} ${plural(count, 'card', 'cards')} to ${verb} for this.`
      );
      if (picked.reason) return { actions: [], tapIds: [], reason: picked.reason, pending: picked.pending };
      for (const id of picked.chosen) ctx.committed.add(id);
      return paid(
        picked.chosen.map(id => ({
          type: 'MOVE_ZONE' as const,
          instanceId: id,
          to,
          at,
          cause: `Paid for ${card.name}`,
        }))
      );
    }

    case 'life': {
      const life = amount(cost.amount);
      if (life === 0) return paid([]);
      // CR 118.4 — a player may pay life only down to zero, never past it.
      if (player.life < life) {
        return refused(`You have ${player.life} life and this costs ${life}.`);
      }
      return paid([{ type: 'LIFE_CHANGE', playerId, delta: -life, at, cause: card.name }]);
    }

    case 'remove-counters': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const targets = cost.from ? controlledCandidates(ctx, cost.from) : [card.instanceId];
      const holder = targets.find(id => (getCard(state, id)?.counters[cost.counter] ?? 0) >= count);
      if (!holder) {
        const held = getCard(state, targets[0] ?? card.instanceId)?.counters[cost.counter] ?? 0;
        return refused(
          `This costs ${count} ${cost.counter} ${plural(count, 'counter', 'counters')} and there ${plural(held, 'is', 'are')} ${held}.`
        );
      }
      return paid([
        { type: 'CARD_COUNTER', instanceId: holder, counter: cost.counter, delta: -count, at, cause: card.name },
      ]);
    }

    case 'add-counters': {
      const count = amount(cost.count);
      if (count === 0) return paid([]);
      const targets = cost.to ? controlledCandidates(ctx, cost.to) : [card.instanceId];
      const holder = targets[0];
      if (!holder) return refused('There is nowhere to put the counters this costs.');
      return paid([
        { type: 'CARD_COUNTER', instanceId: holder, counter: cost.counter, delta: count, at, cause: card.name },
      ]);
    }

    case 'reveal': {
      // Revealing changes nothing about the game state, so there is no action
      // to build. Saying it out loud is the whole of the cost being paid, and
      // silence here would be the engine doing nothing without admitting it.
      const count = amount(cost.count);
      return paid([
        {
          type: 'NOTE',
          instanceId: card.instanceId,
          message: `${card.name}: reveal ${count} ${plural(count, 'card', 'cards')} to pay for this.`,
          at,
        },
      ]);
    }

    default:
      // A cost the DSL grows and this switch has not learned. Refusing names it
      // rather than charging nothing and letting the ability go off free.
      return refused(
        `The engine does not know how to charge "${(cost as { pay: string }).pay}" yet, so it will not let this be used for free.`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

interface TargetResult {
  targets: StackTarget[];
  reason: string;
  pending: PendingChoice[];
}

/** Cards and players one `TargetSpec` could legally be pointed at right now. */
function targetCandidates(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  spec: TargetSpec,
  x: number
): { instanceIds: InstanceId[]; playerIds: PlayerId[] } {
  const ctx = makeContext(state, card.instanceId, playerId, { x });

  const playerIds =
    spec.what === 'player' || spec.what === 'any'
      ? (spec.controller ? resolvePlayers(spec.controller, ctx) : livingPlayers(state).map(p => p.id)).filter(
          id => livingPlayers(state).some(p => p.id === id)
        )
      : [];

  if (spec.what === 'player') return { instanceIds: [], playerIds };

  const controllerIds = spec.controller ? resolvePlayers(spec.controller, ctx) : undefined;
  const instanceIds = idsInZone(state, spec.zone ?? 'battlefield', controllerIds).filter(id => {
    const candidate = getCard(state, id);
    if (!candidate || candidate.removedFromGame) return false;
    if (spec.filter && !matchesFilter(spec.filter, id, ctx)) return false;
    // CR 115.6 — hexproof, shroud and protection are checked as the target is
    // chosen, not only when the ability resolves.
    return canBeTargetedBy(candidate, playerId, card);
  });

  return { instanceIds, playerIds };
}

function chooseTargets(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  ability: ActivatedAbility,
  choices: ActivationChoices,
  x: number
): TargetResult {
  const specs = ability.targets ?? [];
  const out: StackTarget[] = [];
  const pending: PendingChoice[] = [];
  let reason = '';

  for (const spec of specs) {
    if (spec.min > 1) {
      /*
       * "Up to two target creatures" and friends. One `StackTarget` is
       * announced per requirement here, so an ability demanding two at once
       * would go on the stack with half its targets and resolve against the
       * wrong board. Refusing names the gap; announcing one would hide it.
       */
      reason = reason || `This needs ${spec.min} targets at once, which the engine cannot announce yet.`;
      continue;
    }

    const candidates = targetCandidates(state, playerId, card, spec, x);
    const total = candidates.instanceIds.length + candidates.playerIds.length;

    const supplied = choices.targets?.[spec.ref];
    if (supplied) {
      const legal =
        (supplied.kind === 'card' && !!supplied.instanceId && candidates.instanceIds.includes(supplied.instanceId)) ||
        (supplied.kind === 'player' && !!supplied.playerId && candidates.playerIds.includes(supplied.playerId));
      if (legal) {
        out[spec.ref] = supplied;
        continue;
      }
      reason = reason || `That is not a legal target for ${card.name}.`;
      continue;
    }

    if (total === 0) {
      // CR 601.2c — an ability with no legal target cannot be activated at all.
      reason = reason || `There is nothing this could target: ${spec.prompt}.`;
      continue;
    }

    // A forced choice is not a choice. One candidate and one required target
    // means the player decided by pressing the button.
    if (total === 1 && spec.min === 1 && spec.max === 1) {
      const id = candidates.instanceIds[0];
      out[spec.ref] = id ? targetCardRef(state, id) : { kind: 'player', playerId: candidates.playerIds[0] };
      continue;
    }

    pending.push({
      kind: 'target',
      ref: spec.ref,
      prompt: spec.prompt,
      instanceIds: candidates.instanceIds,
      playerIds: candidates.playerIds,
      min: spec.min,
      max: spec.max,
    });
    reason = reason || `Choose a target first: ${spec.prompt}.`;
  }

  /*
   * Positions are the contract on the stack too — `{sel:'target', ref:n}` is a
   * plain index — so a hole here would silently shift every later target one
   * place left. It cannot happen while the compiler numbers refs from zero, and
   * it is checked rather than assumed, because the failure would be an ability
   * pointed at the wrong permanent rather than an error.
   */
  if (!reason && out.length !== specs.length) {
    reason = `The engine could not line this ability's targets up in order.`;
  }

  return { targets: out, reason, pending };
}

/** A card as a target, with CR 400.7's zone snapshot taken now. */
function targetCardRef(state: GameState, instanceId: InstanceId): StackTarget {
  const card = getCard(state, instanceId);
  return {
    kind: 'card',
    instanceId,
    ...(card ? { zone: card.zone, zoneChangeCounter: card.zoneChangeCounter ?? 0 } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

const NO_PLAN = (reason: string): ActivationPlan => ({ ok: false, actions: [], reason, tapIds: [], pending: [] });

export interface ActivationOptions {
  at?: number;
  choices?: ActivationChoices;
  /** Playtest escape hatch, matching `CastOptions.ignoreMana`. Costs other than mana still apply. */
  ignoreMana?: boolean;
}

/**
 * Everything activating one ability takes, or why it cannot be activated.
 *
 * The batch is costs first and `PUT_ABILITY_ON_STACK` last, the same shape
 * `planCastFromHand` returns for a spell: tap the sources, then announce. CR
 * 602.2 puts the announcement before the payment; the observable result is
 * identical, and matching the cast path matters more than matching the rule's
 * ordering of two things that happen in one click.
 */
export function planActivation(
  state: GameState,
  playerId: PlayerId,
  instanceId: InstanceId,
  abilityId: string,
  options: ActivationOptions = {}
): ActivationPlan {
  const at = options.at ?? 0;
  const choices = options.choices ?? {};
  const card = getCard(state, instanceId);

  if (!card) return NO_PLAN('That card is not in this game.');
  if (card.controllerId !== playerId) return NO_PLAN('You do not control that permanent.');

  const ability = activatedAbilitiesOfCard(card).find(entry => entry.id === abilityId);
  if (!ability) return NO_PLAN(`The engine reads no such ability on ${card.name}.`);

  const zones = activeZonesOf(ability);
  if (!zones.includes(card.zone)) {
    return NO_PLAN(
      `This works from the ${zones.join(' or ')}, and ${card.name} is in your ${card.zone}.`
    );
  }

  if (isManaAbility(ability)) {
    /*
     * CR 605 — a mana ability does not use the stack, and this engine has no
     * mana pool to put its mana in. `mana.ts` derives available mana from
     * untapped permanents at the moment a cost is paid, which means a mana
     * ability is already being activated every time a spell is paid for; there
     * is simply no moment at which activating one ON ITS OWN would do anything
     * but tap a permanent and lose the mana.
     *
     * So it is refused, and the refusal says where the ability actually runs.
     * Offering the button and quietly binning the mana would be the exact bug
     * this whole module exists to remove, one layer down.
     *
     * Read through `isManaAbility` rather than off the compiled flag. See the
     * note on that function: the flag is stricter than CR 605.1a and misses
     * every land that charges for its mana.
     */
    return NO_PLAN(
      'Mana abilities are used when you pay for something. Tap this as part of a cost rather than on its own.'
    );
  }

  const timing = activationTiming(state, playerId, ability.timing === 'sorcery');
  if (!timing.ok) return NO_PLAN(timing.reason);

  if (ability.limit) {
    const used = abilityUsesThisTurn(state, instanceId, abilityId);
    if (used >= ability.limit.count) {
      return NO_PLAN(
        `${card.name} has already used this ${used === 1 ? 'once' : `${used} times`} this turn.`
      );
    }
  }

  // CR 606.3 — one loyalty ability per planeswalker per turn, whichever one.
  if (ability.isLoyalty && loyaltyUsedThisTurn(state, card)) {
    return NO_PLAN(`${card.name} has already used a loyalty ability this turn.`);
  }

  const restriction = unenforcedRestriction(ability.text);
  if (restriction) {
    return NO_PLAN(
      `The card says "${restriction}", and the engine cannot check that yet, so it will not let this be used. Move the game by hand if the condition is met.`
    );
  }

  if (choices.x === undefined && mentionsX(ability)) {
    return NO_PLAN(
      'This needs you to say what X is, and nothing on this screen asks yet, so the engine will not guess it.'
    );
  }

  const x = choices.x ?? 0;

  /*
   * COSTS BEFORE TARGETS, which is the opposite of CR 601.2's order and is
   * deliberate, because these two refusals are not the same kind of thing. "You
   * cannot afford this" and "that permanent is already tapped" END the question;
   * "choose a target" CONTINUES it. Asking the player to pick a victim for an
   * ability they were never going to be able to use is a worse sentence to read
   * on the mat, and it was the first thing this got wrong: a tapped Prodigal
   * Pyromancer answered "choose a target first" instead of "already tapped".
   *
   * Nothing is spent by planning, so the order changes only which sentence
   * comes back, never what the batch does.
   *
   * Within the costs, everything that spends a specific permanent is planned
   * before mana, so `committed` is full by the time `planPayment` runs.
   * Otherwise it would happily tap the very land the ability is about to
   * sacrifice.
   */
  const ctx: CostContext = {
    state,
    playerId,
    card,
    at,
    choices,
    committed: new Set<InstanceId>(),
    tapping: new Set<InstanceId>(),
    x,
  };

  const costActions: GameAction[] = [];
  const manaActions: GameAction[] = [];
  const tapIds: InstanceId[] = [];

  const ordered = ability.costs
    .map((cost, index) => ({ cost, index }))
    .sort((a, b) => Number(a.cost.pay === 'mana') - Number(b.cost.pay === 'mana'));

  for (const { cost, index } of ordered) {
    if (cost.pay === 'mana' && options.ignoreMana) continue;
    const result = payOneCost(ctx, cost, index);
    if (result.reason) {
      return {
        ok: false,
        actions: [],
        reason: result.reason,
        tapIds: [],
        pending: result.pending ? [result.pending] : [],
      };
    }
    (cost.pay === 'mana' ? manaActions : costActions).push(...result.actions);
    tapIds.push(...result.tapIds);
  }

  const targeting = chooseTargets(state, playerId, card, ability, choices, x);
  if (targeting.reason) {
    return { ok: false, actions: [], reason: targeting.reason, tapIds: [], pending: targeting.pending };
  }

  const announcement: GameAction = {
    type: 'PUT_ABILITY_ON_STACK',
    controllerId: playerId,
    kind: 'activated',
    name: card.name,
    sourceInstanceId: card.instanceId,
    abilityId: ability.id,
    targets: targeting.targets,
    at,
    cause: readableClause(ability.text, card),
  };

  return {
    ok: true,
    // Mana first, so the log reads the way a player pays: lands, then the rest
    // of the cost, then the ability going on the stack.
    actions: [...manaActions, ...costActions, announcement],
    reason: '',
    tapIds,
    pending: [],
  };
}

/**
 * Plan an activation, letting a CALLER answer whatever the engine refuses to
 * decide, until the plan is either usable or genuinely impossible.
 *
 * The decider is injected rather than built in, and that is the point: the
 * engine still chooses nothing. `bot.ts` passes its own policy, a test passes
 * "take the first candidate", and a UI does not use this at all because a
 * person answers one question at a time on screen. What they share is this
 * loop, so a bot cannot drift into a different idea of what a legal choice is.
 *
 * `decide` returns a `StackTarget` for a target choice, a list of instance ids
 * for a cost choice, or null to give up on the ability. Bounded by the number
 * of choices an ability can have, which the compiler keeps small.
 */
export function planActivationWith(
  state: GameState,
  playerId: PlayerId,
  instanceId: InstanceId,
  abilityId: string,
  decide: (choice: PendingChoice) => StackTarget | InstanceId[] | null,
  options: ActivationOptions = {}
): ActivationPlan {
  const choices: ActivationChoices = { ...(options.choices ?? {}) };

  // One pass per outstanding decision, plus one to build the plan once they are
  // all answered. Eight is far more than the compiler ever emits and stops a
  // decider that keeps answering the same question from spinning.
  for (let pass = 0; pass < 8; pass++) {
    const plan = planActivation(state, playerId, instanceId, abilityId, { ...options, choices });
    if (plan.ok || plan.pending.length === 0) return plan;

    const choice = plan.pending[0];
    const answer = decide(choice);
    if (!answer) return plan;

    if (choice.kind === 'target') {
      if (Array.isArray(answer)) return plan;
      const targets = [...(choices.targets ?? [])];
      targets[choice.ref] = answer;
      choices.targets = targets;
    } else {
      if (!Array.isArray(answer)) return plan;
      choices.costs = { ...(choices.costs ?? {}), [choice.ref]: answer };
    }
  }

  return planActivation(state, playerId, instanceId, abilityId, { ...options, choices });
}

/* -------------------------------------------------------------------------- */
/* The menu                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every compiled activated ability on one card, planned against the board.
 *
 * Including the ones that cannot be used. A refusal is drawn as a sentence and
 * a usable one as a control, which is the same bargain `cardActions.ts` strikes
 * for casting: never a fixed list padded with dead buttons, and never silence
 * where an explanation belongs.
 */
export function activationsFor(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance | null | undefined,
  options: ActivationOptions = {}
): AbilityOption[] {
  if (!card) return [];

  return activatedAbilitiesOfCard(card).map(ability => {
    const plan = planActivation(state, playerId, card.instanceId, ability.id, options);
    return {
      ...plan,
      id: usageKey(card.instanceId, ability.id),
      sourceInstanceId: card.instanceId,
      abilityId: ability.id,
      text: readableClause(ability.text, card),
      costs: ability.costs,
      isManaAbility: isManaAbility(ability),
      isLoyalty: !!ability.isLoyalty,
      sorcerySpeed: ability.timing === 'sorcery',
      caution:
        ability.limit?.per === 'game'
          ? 'The card says once each game. The engine only counts once each turn, so keep track of it yourself.'
          : ability.confidence === 'approximate'
            ? 'The engine reads this ability approximately. Check what it does.'
            : '',
    };
  });
}

/**
 * Permanents this player could activate something on right now.
 *
 * "Right now" includes an ability that is one DECISION away from usable, not
 * only one that is already fully planned. A targeted ability is never `ok`
 * until somebody names the target, so filtering on `ok` alone would hide every
 * "deals damage to any target" on the board from the caller whose job is to
 * choose the target. Cards refused for a reason a choice cannot fix — no mana,
 * already tapped, wrong step — are left out, because those are not plays.
 *
 * For a board-level control, and for `bot.ts`.
 */
export function activatablePermanents(
  state: GameState,
  playerId: PlayerId,
  options: ActivationOptions = {}
): Array<{ card: CardInstance; options: AbilityOption[] }> {
  const player = getPlayer(state, playerId);
  if (!player) return [];

  const out: Array<{ card: CardInstance; options: AbilityOption[] }> = [];
  for (const instanceId of player.zones.battlefield) {
    const card = getCard(state, instanceId);
    if (!card) continue;
    const usable = activationsFor(state, playerId, card, options).filter(
      option => option.ok || option.pending.length > 0
    );
    if (usable.length > 0) out.push({ card, options: usable });
  }
  return out;
}

/**
 * Does this card have anything the engine could ever activate?
 *
 * A cheap board-level test that asks the compiler and not the board, so a badge
 * can be drawn without planning every ability on every permanent every render.
 * `isLand` is not special-cased: a land with a real activated ability has one.
 */
export function hasActivatedAbility(card: CardInstance | null | undefined): boolean {
  if (!card) return false;
  return activatedAbilitiesOfCard(card).some(ability => !isManaAbility(ability));
}
