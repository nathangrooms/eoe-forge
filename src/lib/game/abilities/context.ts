/**
 * DeckMatrix — ability bridge: evaluating the DSL against a live `GameState`.
 *
 * ## What this module is, and what it deliberately is not
 *
 * `src/lib/cards/abilities/` owns the ability DSL and the oracle-text compiler:
 * the type space, the grammar, the clause rules, the coverage proof. It knows
 * about *cards* and nothing about a game in progress — by design, so it can be
 * run over all 34,088 catalogue rows without a game existing.
 *
 * `src/lib/game/` owns the reducer, the stack, the layer engine, replacement
 * effects and state-based actions. It knows about a game in progress and
 * nothing about oracle text.
 *
 * This folder is the seam between them, and it is the only place the two meet.
 * Here a `Selector` stops being a shape and starts naming actual permanents on
 * an actual battlefield.
 *
 * ## Reading characteristics
 *
 * Power, toughness and keywords are read through `combat.ts`'s `powerOf` /
 * `toughnessOf` and `keywords.ts`'s `effectiveKeywords` — the accessors the
 * rest of the engine already uses — so a filter like "creatures with power 4 or
 * greater" agrees with what combat will actually do. When a caller has run
 * `computeLayers` it can pass the result in as `view` and every predicate reads
 * the layered value instead; nothing here re-implements a layer.
 *
 * Two implementations of one rule always drift. There is only ever one.
 *
 * ## Purity
 *
 * Every function is `(state, context) -> value`. No writes, no clock, no
 * randomness, no id minting. Selectors return instance ids in a stable order —
 * players in seat order, then each player's zone array in its own order — so
 * two clients holding the same state derive the same list and "the first
 * creature you control" means the same thing on every screen.
 */

import type {
  CardInstance,
  GameState,
  InstanceId,
  Player,
  PlayerId,
  StackTarget,
  Zone,
} from '../types.ts';
import type {
  CardFilter,
  Cmp,
  Condition,
  PlayerSelector,
  Selector,
  ValueExpr,
} from '../../cards/abilities/dsl.ts';
// From `printed.ts`, not `combat.ts`. This is the pre-layer fallback used by the
// first pass of `scanStatics`, and importing combat here would close a cycle:
// combat -> characteristics -> statics -> context -> combat.
import { powerOf, toughnessOf } from '../printed.ts';
import { effectiveKeywords } from '../keywords.ts';
// `watch.ts` imports `parseTypeLine` from this module and nothing else, and
// imports no other engine module, so the pair is a leaf and the edge is safe.
import type { WatchLog } from './watch.ts';
import { countWatched, playerSelectorOfEvent } from './watch.ts';

/* -------------------------------------------------------------------------- */
/* Characteristics                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One card's characteristics as the ability layer should see them.
 *
 * Supplied by the caller when `computeLayers` has been run, so an anthem is
 * visible to a power predicate. Absent, the printed values plus counters are
 * used — which is what `combat.ts` uses too, so the two never disagree.
 */
export interface CharacteristicView {
  power: number;
  toughness: number;
  /** Lower-cased card types: 'creature', 'artifact', 'land'… */
  types: string[];
  subtypes: string[];
  supertypes: string[];
  /** Lower-cased colour letters, e.g. `['w','u']`. */
  colors: string[];
  keywords: string[];
  controllerId: PlayerId;
  manaValue: number;
}

const SUPERTYPE_WORDS = new Set(['legendary', 'basic', 'snow', 'world', 'ongoing', 'elite', 'host']);

const TYPE_WORDS = new Set([
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
 * "Legendary Creature — Elf Druid" → its three parts.
 *
 * Accepts an em dash or a plain hyphen: Scryfall writes em dashes, but token
 * type lines are hand-written in `TokenSpec` and a hand-typed dash is a hyphen.
 * Getting that wrong would make every token subtype invisible to "Goblins you
 * control" — a silent miss of exactly the kind this project exists to kill.
 */
export function parseTypeLine(typeLine: string | undefined | null): ParsedTypeLine {
  const line = (typeLine ?? '').toLowerCase();
  if (!line) return { supertypes: [], types: [], subtypes: [] };

  const [left, right] = line.split(/\s*[—–-]\s*/);
  const supertypes: string[] = [];
  const types: string[] = [];

  for (const word of (left ?? '').split(/\s+/).filter(Boolean)) {
    if (SUPERTYPE_WORDS.has(word)) supertypes.push(word);
    else if (TYPE_WORDS.has(word)) types.push(word);
    // A word in neither set is a printing oddity. Dropped rather than guessed
    // at, so it can never make a filter match something it should not.
  }

  return { supertypes, types, subtypes: (right ?? '').split(/\s+/).filter(Boolean) };
}

/** Printed characteristics plus counters — the fallback when no layer view is given. */
export function printedView(card: CardInstance): CharacteristicView {
  const { supertypes, types, subtypes } = parseTypeLine(card.typeLine);
  return {
    power: powerOf(card),
    toughness: toughnessOf(card),
    types,
    subtypes,
    supertypes,
    colors: (card.colorIdentity ?? []).map(color => color.toLowerCase()),
    keywords: effectiveKeywords(card),
    controllerId: card.controllerId,
    manaValue: card.cmc ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything a selector, value or condition needs beyond the state.
 *
 * Note what is absent: no callbacks, no live game object, no mutable scratch
 * space. XMage's effects close over a mutable `Game`, which is precisely what
 * makes rollback hard there. A context is a value; binding a loop variable
 * means building a new one, not assigning to a field.
 */
export interface AbilityContext {
  state: GameState;
  /** The permanent or card whose ability this is. */
  sourceId: InstanceId;
  controllerId: PlayerId;
  /** Announced targets, indexed by `TargetSpec.ref`. */
  targets: StackTarget[];
  /** The permanent that caused a trigger to fire. */
  triggerSourceId?: InstanceId;
  /** The other party to the event — the creature that was blocked, and so on. */
  triggerSubjectId?: InstanceId;
  /**
   * The PLAYER a trigger was about — the opponent who cast the spell, the one
   * who drew the card. Read by `{who:'trigger-player'}`, which is Rhystic
   * Study's "that player" and Smothering Tithe's. Unset resolves to nobody
   * rather than to every opponent, so a missing binding is a visible no-op
   * instead of a table-wide tax.
   */
  triggerPlayerId?: PlayerId;
  /**
   * E6. Facts folded from the action log, for `{v:'watch'}`. See `watch.ts`.
   *
   * Absent means the caller could not supply one, and every watch expression
   * then answers 0 — which is a WRONG answer, not a neutral one. Two things
   * stop that being silent: `runEffects` emits a note naming the query, and
   * `unrunnableReason` keeps such cards away from the ability engine entirely.
   */
  watch?: WatchLog;
  /** Bound by `{do:'for-each'}` over a `Selector`; read by `{sel:'each'}`. */
  eachCardId?: InstanceId;
  /** Bound by `{do:'for-each'}` over a `PlayerSelector`. */
  eachPlayerId?: PlayerId;
  /** The X the player announced. Always a concrete integer by the time it is here. */
  x: number;
  /** Who is being attacked, for `{who:'defending'}`. */
  defendingPlayerId?: PlayerId;
  /** Layered characteristics from `computeLayers`. Optional; printed values otherwise. */
  view?: Record<InstanceId, CharacteristicView>;
}

export function makeContext(
  state: GameState,
  sourceId: InstanceId,
  controllerId: PlayerId,
  extra: Partial<AbilityContext> = {}
): AbilityContext {
  return { state, sourceId, controllerId, targets: [], x: 0, ...extra };
}

/** Characteristics of one card, layered when the caller supplied a view. */
export function viewOf(ctx: AbilityContext, instanceId: InstanceId): CharacteristicView | undefined {
  const supplied = ctx.view?.[instanceId];
  if (supplied) return supplied;
  const card = ctx.state.cards[instanceId];
  return card ? printedView(card) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */

/*
 * These duplicate one-liners from `rules.ts`. Importing `rules.ts` here would
 * close the loop `rules -> abilities -> rules`, and an import cycle in the
 * module everything else depends on is not worth three array lookups.
 */

export function playerOf(state: GameState, playerId: PlayerId | undefined): Player | undefined {
  return playerId ? state.players.find(player => player.id === playerId) : undefined;
}

export function cardOf(state: GameState, instanceId: InstanceId | undefined): CardInstance | undefined {
  return instanceId ? state.cards[instanceId] : undefined;
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
      return false;
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

/** Discriminate the `Selector | PlayerSelector` unions the DSL uses in places. */
export function isPlayerSelector(value: Selector | PlayerSelector): value is PlayerSelector {
  return typeof (value as PlayerSelector).who === 'string';
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
      // Only when combat actually named a defender. Guessing one is how a burn
      // spell ends up hitting the wrong seat.
      return ctx.defendingPlayerId ? [ctx.defendingPlayerId] : [];

    case 'monarch':
      return state.monarchId ? [state.monarchId] : [];

    case 'trigger-player':
      // Same discipline as 'defending': only when the trigger actually named a
      // player. Falling back to every opponent would make Smothering Tithe tax
      // three seats for one player's draw.
      return ctx.triggerPlayerId ? [ctx.triggerPlayerId] : [];

    case 'target-player': {
      const target = ctx.targets[selector.ref];
      return target?.kind === 'player' && target.playerId ? [target.playerId] : [];
    }

    case 'controller-of':
      return unique(
        resolveSelector(selector.of, ctx)
          .map(id => viewOf(ctx, id)?.controllerId)
          .filter(Boolean) as PlayerId[]
      );

    case 'owner-of':
      return unique(
        resolveSelector(selector.of, ctx)
          .map(id => cardOf(state, id)?.ownerId)
          .filter(Boolean) as PlayerId[]
      );

    default:
      // A player selector we do not know is nobody, never everybody. The
      // conservative direction: an ability that affects no one is visible as a
      // no-op; one that affects everyone silently wrecks a board.
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which instance ids a selector names, in a stable order.
 *
 * A selector naming nothing returns `[]`, and every caller reads that as "this
 * effect does nothing to anybody" — which is correct, and is why an effect
 * whose target has already died produces no actions instead of a crash.
 */
export function resolveSelector(selector: Selector, ctx: AbilityContext): InstanceId[] {
  switch (selector.sel) {
    case 'self':
      return ctx.state.cards[ctx.sourceId] ? [ctx.sourceId] : [];

    case 'none':
      return [];

    case 'each':
      return ctx.eachCardId && ctx.state.cards[ctx.eachCardId] ? [ctx.eachCardId] : [];

    case 'target': {
      const target = ctx.targets[selector.ref];
      if (!target || target.kind !== 'card' || !target.instanceId) return [];
      return ctx.state.cards[target.instanceId] ? [target.instanceId] : [];
    }

    case 'trigger-source': {
      const id = ctx.triggerSourceId ?? ctx.sourceId;
      return ctx.state.cards[id] ? [id] : [];
    }

    case 'trigger-subject': {
      const id = ctx.triggerSubjectId;
      return id && ctx.state.cards[id] ? [id] : [];
    }

    case 'attached': {
      const host = cardOf(ctx.state, ctx.sourceId)?.attachedTo;
      return host && ctx.state.cards[host] ? [host] : [];
    }

    case 'all': {
      const zone: Zone = (selector.zone as Zone) ?? 'battlefield';
      const controllerIds = selector.controller ? resolvePlayers(selector.controller, ctx) : undefined;
      return idsInZone(ctx.state, zone, controllerIds).filter(id => {
        const card = ctx.state.cards[id];
        if (!card || card.removedFromGame) return false;
        return matchesFilter(selector.where, id, ctx);
      });
    }

    default:
      return [];
  }
}

/**
 * Does one card satisfy a filter?
 *
 * Reads the characteristic view for everything a continuous effect can change,
 * and the raw instance only for facts no effect in this model rewrites: tapped,
 * token, commander, counters, and what is attacking.
 */
export function matchesFilter(filter: CardFilter, instanceId: InstanceId, ctx: AbilityContext): boolean {
  const card = ctx.state.cards[instanceId];
  if (!card) return false;
  const view = viewOf(ctx, instanceId);
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
      return view.colors.includes(String(filter.value).toLowerCase());

    case 'colorless':
      return view.colors.filter(color => color !== 'c').length === 0;

    case 'multicolored':
      return view.colors.filter(color => color !== 'c').length > 1;

    case 'tapped':
      return card.tapped;

    case 'untapped':
      return !card.tapped;

    case 'attacking':
      return ctx.state.combat.attackers.some(a => a.attackerId === instanceId);

    case 'blocking':
      return ctx.state.combat.attackers.some(a => a.blockedBy.includes(instanceId));

    case 'blocked':
      return ctx.state.combat.attackers.some(
        a => a.attackerId === instanceId && a.blockedBy.length > 0
      );

    case 'token':
      return card.isToken;

    case 'commander':
      return card.isCommander;

    case 'other':
      return instanceId !== ctx.sourceId;

    case 'any':
      return true;

    case 'has-counter':
      return (card.counters[filter.counter] ?? 0) >= (filter.atLeast ?? 1);

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
      // An unknown predicate matches NOTHING. The conservative direction: a
      // filter that matches nothing is a visible no-op; one that matches
      // everything is a board wipe nobody asked for.
      return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Always a finite integer. Never `NaN`, never `Infinity`, never a fraction.
 *
 * Magic has no fractional quantities, and a `NaN` reaching the reducer as a
 * damage amount is a silent no-op — the exact failure this engine exists to
 * prevent — so every arithmetic path is clamped here rather than hoped about
 * downstream.
 */
export function evalValue(expr: ValueExpr, ctx: AbilityContext): number {
  const value = evalValueRaw(expr, ctx);
  if (!Number.isFinite(value)) return 0;
  // `+ 0` collapses negative zero, which `{v:'mul', of:[-1, 0]}` produces the
  // moment a computed count comes back empty. It is numerically 0 either way,
  // but `Object.is(-0, 0)` is false, so it would make two runs that agree on
  // every number disagree on `deepEqual` — a difference that shows up in a
  // replay comparison and nowhere a player could see it.
  return Math.trunc(value) + 0;
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
      return sumOver(expr.of, ctx, id => viewOf(ctx, id)?.power ?? 0);

    case 'toughness':
      return sumOver(expr.of, ctx, id => viewOf(ctx, id)?.toughness ?? 0);

    case 'mana-value':
      return sumOver(expr.of, ctx, id => viewOf(ctx, id)?.manaValue ?? 0);

    case 'counters':
      return sumOver(expr.of, ctx, id => ctx.state.cards[id]?.counters[expr.counter] ?? 0);

    case 'life':
      return resolvePlayers(expr.of, ctx).reduce(
        (total, id) => total + (playerOf(ctx.state, id)?.life ?? 0),
        0
      );

    case 'cards-in':
      return resolvePlayers(expr.of, ctx).reduce(
        (total, id) => total + (playerOf(ctx.state, id)?.zones[expr.zone as Zone]?.length ?? 0),
        0
      );

    case 'add':
      return expr.of.reduce<number>((total, inner) => total + evalValue(inner, ctx), 0);

    case 'sub':
      return evalValue(expr.a, ctx) - evalValue(expr.b, ctx);

    case 'mul':
      return expr.of.reduce<number>((total, inner) => total * evalValue(inner, ctx), 1);

    case 'div': {
      const divisor = evalValue(expr.b, ctx);
      // Division by zero is zero, not Infinity. See the note above about NaN.
      return divisor === 0 ? 0 : Math.floor(evalValue(expr.a, ctx) / divisor);
    }

    case 'min':
      return expr.of.length === 0
        ? 0
        : expr.of.reduce<number>((best, inner) => Math.min(best, evalValue(inner, ctx)), Infinity);

    case 'max':
      return expr.of.length === 0
        ? 0
        : expr.of.reduce<number>((best, inner) => Math.max(best, evalValue(inner, ctx)), -Infinity);

    case 'if':
      return evalCondition(expr.condition, ctx) ? evalValue(expr.then, ctx) : evalValue(expr.else, ctx);

    case 'watch': {
      // E6. No log means the question genuinely cannot be answered here, and 0
      // is the WRONG answer rather than a neutral one. It is returned anyway
      // because `evalValue` has nowhere else to go — and the two places that
      // could hide it do not: `runEffects` emits a note naming the query, and
      // `unrunnableReason` never lets the ability engine own such a card.
      if (!ctx.watch) return 0;
      const selector = playerSelectorOfEvent(expr.query.event);
      return countWatched(expr.query, ctx.watch, selector ? resolvePlayers(selector, ctx) : undefined);
    }

    default:
      return 0;
  }
}

function sumOver(selector: Selector, ctx: AbilityContext, read: (id: InstanceId) => number): number {
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

    case 'matches':
      // "At least one", which for `{sel:'self'}` and `{sel:'attached'}` is one
      // object or none. A source that has left the battlefield resolves to
      // nothing and the condition is false, which is the answer XMage gives
      // when its own `getPermanent` returns null.
      return resolveSelector(condition.of, ctx).some(id =>
        matchesFilter(condition.what, id, ctx)
      );

    case 'step':
      return condition.is.includes(ctx.state.step as never);

    case 'your-turn':
      return ctx.state.activePlayerId === ctx.controllerId;

    case 'first-time-this-turn':
      // Needs a per-turn event history the state does not carry. Declared in
      // the DSL's own gap list as `needs-history`; answering `false` here would
      // silently switch the ability off, so it answers `true` and the caller's
      // manual note carries the caveat.
      return true;

    case 'not':
      return !evalCondition(condition.of, ctx);

    case 'and':
      return condition.of.every(inner => evalCondition(inner, ctx));

    case 'or':
      return condition.of.some(inner => evalCondition(inner, ctx));

    default:
      return false;
  }
}
