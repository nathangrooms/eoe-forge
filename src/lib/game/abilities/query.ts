/**
 * DeckMatrix — the card-ability DSL: selectors, filters, values and conditions.
 *
 * The read half of the interpreter. Everything here is a pure function from
 * (state, derived view, context) to a value — no writes, no allocation of ids,
 * no randomness, no clock.
 *
 * ## Why selectors and values share a file
 *
 * A `CardFilter` can test power (`{is:'power', cmp:'gte', value: 4}`) and a
 * `ValueExpr` can count a selector (`{v:'count', of: …}`). They are mutually
 * recursive. Splitting them across two modules would create an ES module
 * import cycle, and a cycle is a class of bug that shows up as `undefined is
 * not a function` on one bundler and works fine on another. One file, two
 * sections, no cycle.
 *
 * ## Everything reads the DERIVED view
 *
 * Power, toughness, types, colours, keywords and controller all come from
 * `DerivedState`, never from the raw `CardInstance`. That is what makes an
 * anthem visible to "creatures with power 4 or greater", and it is why
 * continuous effects can be a pure derived layer instead of a write into game
 * state. The raw `CardInstance` stays exactly what the action log says it is,
 * which is what keeps replay byte-identical.
 *
 * ## Determinism
 *
 * Every selector returns instance ids in a stable order: players in seat order,
 * then each player's zone array in its own order. Two clients holding the same
 * state therefore build the same list, which matters because "the first
 * creature you control" has to mean the same thing everywhere.
 */

import type {
  CardInstance,
  GameState,
  InstanceId,
  ManaColor,
  Player,
  PlayerId,
  StackTarget,
  Zone,
} from '../types.ts';
import type {
  CardFilter,
  Cmp,
  Condition,
  Modification,
  PlayerSelector,
  Restriction,
  Selector,
  ValueExpr,
} from './dsl.ts';
import { assertNever } from './dsl.ts';

/* -------------------------------------------------------------------------- */
/* The derived view                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One card's characteristics after every continuous effect has been applied.
 *
 * Built by `continuous.ts`; consumed here and by combat. Deliberately a flat
 * record of primitives so it can be logged, diffed and asserted on in a test
 * without a game running.
 */
export interface DerivedCard {
  instanceId: InstanceId;
  controllerId: PlayerId;
  power: number;
  toughness: number;
  /** Lower-cased card types: 'creature', 'artifact', 'land'… */
  types: string[];
  subtypes: string[];
  supertypes: string[];
  colors: ManaColor[];
  /** Lower-cased, printed plus granted minus removed. */
  keywords: string[];
  manaValue: number;
}

/** A restriction that is live right now, with the ability that imposed it. */
export interface ActiveRestriction {
  sourceInstanceId: InstanceId;
  sourceName: string;
  abilityId: string;
  rule: Restriction;
  /** The permanents `rule.who` resolved to when the view was built. */
  affected: InstanceId[];
}

/** A cost modification that is live right now. */
export interface ActiveCostMod {
  sourceInstanceId: InstanceId;
  sourceName: string;
  abilityId: string;
  mod: Extract<Modification, { layer: 'cost-modify' }>;
  /** Signed generic-mana delta. Negative reduces. */
  delta: number;
}

export interface DerivedState {
  /** Keyed by instance id. Every card in `state.cards` has an entry. */
  cards: Record<InstanceId, DerivedCard>;
  restrictions: ActiveRestriction[];
  costMods: ActiveCostMod[];
}

/* -------------------------------------------------------------------------- */
/* Evaluation context                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything a selector, value or condition needs to know beyond the state.
 *
 * Note what is NOT here: no callbacks, no game object, no mutable scratch
 * space. XMage's effects close over a live `Game`; that is exactly what makes
 * rollback hard there and is exactly what we refused. A context is a value.
 */
export interface AbilityContext {
  state: GameState;
  derived: DerivedState;
  /** The permanent (or card) whose ability this is. */
  sourceId: InstanceId;
  controllerId: PlayerId;
  /** Announced targets, indexed by `TargetSpec.ref`. */
  targets: StackTarget[];
  /** The permanent that caused a trigger to fire — often, but not always, the source. */
  triggerSourceId?: InstanceId;
  /** Bound by `{do:'for-each'}`; read by `{sel:'each'}`. */
  eachCardId?: InstanceId;
  /** Bound by `{do:'for-each-player'}`. */
  eachPlayerId?: PlayerId;
  /** The X the player announced. Always a concrete integer by the time we are here. */
  x: number;
  /** Who is being attacked, for `{who:'defending'}`. */
  defendingPlayerId?: PlayerId;
}

/* -------------------------------------------------------------------------- */
/* Small local helpers                                                        */
/* -------------------------------------------------------------------------- */

/*
 * These duplicate one-liners from `rules.ts` on purpose. Importing `rules.ts`
 * here would close the loop `rules -> abilities -> rules`, and an import cycle
 * in the module that every other module depends on is not a trade worth making
 * for three array lookups.
 */

export function playerOf(state: GameState, playerId: PlayerId | undefined): Player | undefined {
  if (!playerId) return undefined;
  return state.players.find(player => player.id === playerId);
}

export function cardOf(state: GameState, instanceId: InstanceId | undefined): CardInstance | undefined {
  if (!instanceId) return undefined;
  return state.cards[instanceId];
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter(player => !player.hasLost && !player.conceded);
}

/** Every card id in one zone, players in seat order. Stable, hence replayable. */
export function idsInZone(state: GameState, zone: Zone, controllerIds?: PlayerId[]): InstanceId[] {
  const out: InstanceId[] = [];
  for (const player of state.players) {
    if (controllerIds && !controllerIds.includes(player.id)) continue;
    for (const id of player.zones[zone] ?? []) out.push(id);
  }
  return out;
}

export function compare(a: number, cmp: Cmp, b: number): boolean {
  switch (cmp) {
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'gte':
      return a >= b;
    case 'gt':
      return a > b;
    case 'ne':
      return a !== b;
    default:
      return assertNever(cmp, 'compare');
  }
}

/* -------------------------------------------------------------------------- */
/* Type lines                                                                 */
/* -------------------------------------------------------------------------- */

const SUPERTYPES = new Set(['legendary', 'basic', 'snow', 'world', 'ongoing', 'elite', 'host']);

const CARD_TYPES = new Set([
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'instant',
  'kindred',
  'land',
  'planeswalker',
  'sorcery',
  'tribal',
  'dungeon',
  'plane',
  'phenomenon',
  'scheme',
  'vanguard',
  'conspiracy',
  'emblem',
]);

export interface ParsedTypeLine {
  supertypes: string[];
  types: string[];
  subtypes: string[];
}

/**
 * Split "Legendary Creature — Elf Druid" into its three parts.
 *
 * Both the em dash Scryfall uses and a plain hyphen are accepted, because token
 * type lines are written by hand in `TokenSpec` and a hand-typed dash is a
 * hyphen. Getting that wrong would make every token subtype invisible to
 * "Goblins you control", which is the kind of silent miss this project is about.
 */
export function parseTypeLine(typeLine: string | undefined): ParsedTypeLine {
  const line = (typeLine ?? '').toLowerCase();
  if (!line) return { supertypes: [], types: [], subtypes: [] };

  const [left, right] = line.split(/\s+[—–-]\s+/);
  const supertypes: string[] = [];
  const types: string[] = [];

  for (const word of (left ?? '').split(/\s+/).filter(Boolean)) {
    if (SUPERTYPES.has(word)) supertypes.push(word);
    else if (CARD_TYPES.has(word)) types.push(word);
    // A word in neither set is a printing oddity; it is dropped rather than
    // guessed at, and it cannot make a filter match something it should not.
  }

  const subtypes = (right ?? '').split(/\s+/).filter(Boolean);
  return { supertypes, types, subtypes };
}

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

export function resolvePlayers(selector: PlayerSelector, ctx: AbilityContext): PlayerId[] {
  const { state } = ctx;

  switch (selector.who) {
    case 'you':
      return [ctx.controllerId];

    case 'each-opponent':
      return alivePlayers(state)
        .filter(player => player.id !== ctx.controllerId)
        .map(player => player.id);

    case 'each-player':
      return alivePlayers(state).map(player => player.id);

    case 'active':
      return [state.activePlayerId];

    case 'defending':
      // Falls back to the active player's opponents' defender only when combat
      // actually named one; otherwise nobody, because guessing a defender is
      // how a burn spell ends up hitting the wrong seat.
      return ctx.defendingPlayerId ? [ctx.defendingPlayerId] : [];

    case 'monarch':
      return state.monarchId ? [state.monarchId] : [];

    case 'target-player': {
      const target = ctx.targets[selector.ref];
      return target?.kind === 'player' && target.playerId ? [target.playerId] : [];
    }

    case 'controller-of': {
      const ids = resolveSelector(selector.of, ctx);
      return unique(ids.map(id => ctx.derived.cards[id]?.controllerId).filter(Boolean) as PlayerId[]);
    }

    case 'owner-of': {
      const ids = resolveSelector(selector.of, ctx);
      return unique(ids.map(id => cardOf(state, id)?.ownerId).filter(Boolean) as PlayerId[]);
    }

    case 'bound':
      return ctx.eachPlayerId ? [ctx.eachPlayerId] : [];

    default:
      return assertNever(selector, 'resolvePlayers');
  }
}

function unique<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which instance ids a selector names, in a stable order.
 *
 * A selector that names nothing returns `[]`, and every caller treats that as
 * "this effect does nothing to anybody" — which is correct, and is why an
 * effect whose target has died produces no actions rather than a crash.
 */
export function resolveSelector(selector: Selector, ctx: AbilityContext): InstanceId[] {
  switch (selector.sel) {
    case 'self':
      return ctx.state.cards[ctx.sourceId] ? [ctx.sourceId] : [];

    case 'none':
      return [];

    case 'each':
      return ctx.eachCardId ? [ctx.eachCardId] : [];

    case 'target': {
      const target = ctx.targets[selector.ref];
      if (!target || target.kind !== 'card' || !target.instanceId) return [];
      return ctx.state.cards[target.instanceId] ? [target.instanceId] : [];
    }

    case 'trigger-source': {
      const id = ctx.triggerSourceId ?? ctx.sourceId;
      return ctx.state.cards[id] ? [id] : [];
    }

    case 'attached': {
      const source = cardOf(ctx.state, ctx.sourceId);
      const host = source?.attachedTo;
      return host && ctx.state.cards[host] ? [host] : [];
    }

    case 'all': {
      const zone: Zone = selector.zone ?? 'battlefield';
      const controllerIds = selector.controller
        ? resolvePlayers(selector.controller, ctx)
        : undefined;
      const candidates = idsInZone(ctx.state, zone, controllerIds);
      return candidates.filter(id => {
        const card = ctx.state.cards[id];
        if (!card || card.removedFromGame) return false;
        return matchesFilter(selector.where, id, ctx);
      });
    }

    default:
      return assertNever(selector, 'resolveSelector');
  }
}

/**
 * Does one card satisfy a filter?
 *
 * Reads the derived view for everything a continuous effect can change, and the
 * raw instance only for facts no effect in our model rewrites (tapped, token,
 * commander, counters).
 */
export function matchesFilter(filter: CardFilter, instanceId: InstanceId, ctx: AbilityContext): boolean {
  const card = ctx.state.cards[instanceId];
  if (!card) return false;
  const view = ctx.derived.cards[instanceId];
  if (!view) return false;

  switch (filter.is) {
    case 'type':
      return view.types.includes(filter.value.toLowerCase());

    case 'subtype':
      return view.subtypes.includes(filter.value.toLowerCase());

    case 'supertype':
      return view.supertypes.includes(filter.value.toLowerCase());

    case 'name':
      return card.name.toLowerCase() === filter.value.toLowerCase();

    case 'keyword':
      return view.keywords.includes(filter.value.toLowerCase());

    case 'color':
      return view.colors.includes(filter.value);

    case 'colorless':
      return view.colors.filter(color => color !== 'C').length === 0;

    case 'multicolored':
      return view.colors.filter(color => color !== 'C').length > 1;

    case 'tapped':
      return card.tapped;

    case 'untapped':
      return !card.tapped;

    case 'attacking':
      return ctx.state.combat.attackers.some(a => a.attackerId === instanceId);

    case 'blocking':
      return ctx.state.combat.attackers.some(a => a.blockedBy.includes(instanceId));

    case 'token':
      return card.isToken;

    case 'commander':
      return card.isCommander;

    case 'other':
      return instanceId !== ctx.sourceId;

    case 'any':
      return true;

    case 'instance':
      return filter.ids.includes(instanceId);

    case 'has-counter': {
      const count = card.counters[filter.counter] ?? 0;
      return count >= (filter.atLeast ?? 1);
    }

    case 'power':
      return compare(view.power, filter.cmp, evalValue(filter.value, ctx));

    case 'toughness':
      return compare(view.toughness, filter.cmp, evalValue(filter.value, ctx));

    case 'mana-value':
      return compare(view.manaValue, filter.cmp, evalValue(filter.value, ctx));

    case 'not':
      return !matchesFilter(filter.of, instanceId, ctx);

    case 'and':
      return filter.of.every(inner => matchesFilter(inner, instanceId, ctx));

    case 'or':
      return filter.of.some(inner => matchesFilter(inner, instanceId, ctx));

    default:
      return assertNever(filter, 'matchesFilter');
  }
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Always a finite integer. Never `NaN`, never `Infinity`, never a fraction.
 *
 * Magic has no fractional quantities and an accidental `NaN` in a damage amount
 * is a silent no-op the moment it reaches the reducer — the exact failure this
 * engine is built to prevent — so every arithmetic path is clamped here rather
 * than hoped about downstream.
 */
export function evalValue(expr: ValueExpr, ctx: AbilityContext): number {
  const value = evalValueRaw(expr, ctx);
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function evalValueRaw(expr: ValueExpr, ctx: AbilityContext): number {
  if (typeof expr === 'number') return Number.isFinite(expr) ? Math.trunc(expr) : 0;

  switch (expr.v) {
    case 'x':
      return ctx.x;

    case 'count':
      return resolveSelector(expr.of, ctx).length;

    case 'count-players':
      return resolvePlayers(expr.of, ctx).length;

    case 'power':
      return sumOver(expr.of, ctx, id => ctx.derived.cards[id]?.power ?? 0);

    case 'toughness':
      return sumOver(expr.of, ctx, id => ctx.derived.cards[id]?.toughness ?? 0);

    case 'mana-value':
      return sumOver(expr.of, ctx, id => ctx.derived.cards[id]?.manaValue ?? 0);

    case 'counters':
      return sumOver(expr.of, ctx, id => ctx.state.cards[id]?.counters[expr.counter] ?? 0);

    case 'life': {
      const ids = resolvePlayers(expr.of, ctx);
      return ids.reduce((total, id) => total + (playerOf(ctx.state, id)?.life ?? 0), 0);
    }

    case 'cards-in': {
      const ids = resolvePlayers(expr.of, ctx);
      return ids.reduce((total, id) => {
        const player = playerOf(ctx.state, id);
        return total + (player?.zones[expr.zone]?.length ?? 0);
      }, 0);
    }

    case 'add':
      return expr.of.reduce((total, inner) => total + evalValue(inner, ctx), 0);

    case 'sub':
      return evalValue(expr.a, ctx) - evalValue(expr.b, ctx);

    case 'mul':
      return expr.of.reduce((total, inner) => total * evalValue(inner, ctx), 1);

    case 'div': {
      const divisor = evalValue(expr.b, ctx);
      // Division by zero is zero, not Infinity. See the note above about NaN.
      if (divisor === 0) return 0;
      return Math.floor(evalValue(expr.a, ctx) / divisor);
    }

    case 'min': {
      if (expr.of.length === 0) return 0;
      return expr.of.reduce((best, inner) => Math.min(best, evalValue(inner, ctx)), Infinity);
    }

    case 'max': {
      if (expr.of.length === 0) return 0;
      return expr.of.reduce((best, inner) => Math.max(best, evalValue(inner, ctx)), -Infinity);
    }

    case 'if':
      return evalCondition(expr.condition, ctx)
        ? evalValue(expr.then, ctx)
        : evalValue(expr.else, ctx);

    default:
      return assertNever(expr, 'evalValue');
  }
}

function sumOver(
  selector: Selector,
  ctx: AbilityContext,
  read: (id: InstanceId) => number
): number {
  return resolveSelector(selector, ctx).reduce((total, id) => total + read(id), 0);
}

/* -------------------------------------------------------------------------- */
/* Conditions                                                                 */
/* -------------------------------------------------------------------------- */

export function evalCondition(condition: Condition, ctx: AbilityContext): boolean {
  switch (condition.if) {
    case 'count':
      return compare(
        resolveSelector(condition.of, ctx).length,
        condition.cmp,
        evalValue(condition.value, ctx)
      );

    case 'value':
      return compare(evalValue(condition.a, ctx), condition.cmp, evalValue(condition.b, ctx));

    case 'controls': {
      const owners = resolvePlayers(condition.who, ctx);
      const count = idsInZone(ctx.state, 'battlefield', owners).filter(id =>
        matchesFilter(condition.what, id, ctx)
      ).length;
      return compare(count, condition.cmp, evalValue(condition.value, ctx));
    }

    case 'step':
      return condition.is.includes(ctx.state.step);

    case 'your-turn':
      return ctx.state.activePlayerId === ctx.controllerId;

    case 'not':
      return !evalCondition(condition.of, ctx);

    case 'and':
      return condition.of.every(inner => evalCondition(inner, ctx));

    case 'or':
      return condition.of.some(inner => evalCondition(inner, ctx));

    default:
      return assertNever(condition, 'evalCondition');
  }
}
