/**
 * DeckMatrix — ability bridge: static abilities into the layer engine.
 *
 * `layers.ts` says, in its own words, that the continuous-effect list is
 * "passed in rather than read off the state because the state does not carry
 * one yet — the oracle-text compiler is what will produce one". This module is
 * that producer.
 *
 * `StaticAbility.modifications` (the DSL's explicit CR 613 layers) →
 * `ContinuousEffect[]` (what `computeLayers` consumes). Nothing here applies a
 * layer; `layers.ts` owns layer application, dependency ordering and CR 613.6,
 * and re-implementing any of it here would be a second engine that drifts.
 *
 * ## Continuous effects are DERIVED, never written
 *
 * `continuousEffectsFor(state)` rebuilds the list from the battlefield every
 * time it is asked. No anthem is ever written into a `CardInstance`, so nothing
 * has to remember to unwrite it when the anthem leaves, and replaying the same
 * action log twice lands on identical state by construction. That property is
 * what lets the engine run in the browser and be re-validated on the server
 * rather than executed there.
 *
 * ## Determinism
 *
 * Timestamps come from the position of the source in a seat-order scan of the
 * battlefields, not from a clock. Two clients holding the same state assign the
 * same timestamps, so "the last anthem wins" means the same thing on both
 * screens.
 */

import type { GameState, InstanceId, PlayerId } from '../types.ts';
import type {
  Modification,
  Restriction,
  Selector,
  StaticAbility,
  ValueExpr,
} from '../../cards/abilities/dsl.ts';
import { watchQueriesIn } from '../../cards/abilities/dsl.ts';
import type {
  CardType,
  ContinuousEffect,
  DynamicValue,
  EffectPart,
  LayerColor,
  LayeredCharacteristics,
  LayerResult,
  SubLayer,
} from '../layers.ts';
import { CARD_TYPES, computeStateLayers, liveTimedEffects } from '../layers.ts';
import type { AbilityContext, CharacteristicView } from './context.ts';
import { evalCondition, evalValue, makeContext, matchesFilter, resolvePlayers, resolveSelector } from './context.ts';
import { staticAbilitiesOf } from './card-abilities.ts';

/* -------------------------------------------------------------------------- */
/* Restrictions and cost modifiers                                            */
/* -------------------------------------------------------------------------- */

/**
 * A restriction is not a characteristic, so it is not a layer effect. It comes
 * out of the same scan and is handed to combat and targeting separately.
 */
export interface ActiveRestriction {
  sourceInstanceId: InstanceId;
  sourceName: string;
  abilityId: string;
  rule: Restriction;
  /** The permanents `rule` names, resolved when the scan ran. */
  affected: InstanceId[];
  /** The escape clause, if any, still to be evaluated at the moment of asking. */
  unless?: Restriction extends { unless?: infer U } ? U : never;
}

export interface ActiveCostMod {
  sourceInstanceId: InstanceId;
  sourceName: string;
  abilityId: string;
  /** Signed generic-mana delta. Negative reduces. */
  delta: number;
  genericOnly: boolean;
  /**
   * The selector as the card wrote it, NOT a resolved id list.
   *
   * It used to be `appliesTo: InstanceId[]`, resolved at scan time, and that
   * shape made cost reduction a guaranteed no-op. The compiler writes
   * `zone:'stack'` because the thing being made cheaper is a *spell*, while
   * every caller asks about a card still in HAND — a cost is computed before
   * the spell is announced — so the resolved ids never contained the card being
   * asked about and the adjustment was always 0. This folder's own test pinned
   * that as a known gap rather than papering over it; this is the fix that test
   * describes, and the test now asserts the reduction instead of the gap.
   */
  applies: Selector;
  forWhom: PlayerId[];
  /**
   * The delta was computed from a `{v:'watch'}` query and nothing folds a log,
   * so `delta` above is 0 and **0 is wrong, not neutral**. "This spell costs {1}
   * less to cast for each creature that attacked this turn" would read as no
   * reduction at all.
   *
   * `costAdjustmentFor` skips these entirely rather than applying a wrong
   * number. That leaves the spell at its printed cost, which is the
   * conservative direction this folder already takes for costs — a spell cast
   * too cheaply is the failure with no safe marker — and the flag is here so a
   * caller can SAY the reduction is not being applied instead of a player
   * wondering why their Witchstalker Frenzy cost full price.
   */
  needsHistory: boolean;
}

export interface StaticScan {
  effects: ContinuousEffect[];
  restrictions: ActiveRestriction[];
  costMods: ActiveCostMod[];
}

/* -------------------------------------------------------------------------- */
/* Modification → EffectPart                                                  */
/* -------------------------------------------------------------------------- */

/* --- life totals stay dynamic --------------------------------------------- */

/**
 * Does this quantity read a life total anywhere inside it?
 *
 * Only life gets the special treatment below, so the check is narrow on
 * purpose. Every other `ValueExpr` keeps the plain-number path it has always
 * had, and adding a second one for values that do not need it would be the
 * "second place a number can be wrong" this file's own comment warns about.
 */
function readsLife(expr: ValueExpr): boolean {
  if (typeof expr === 'number') return false;
  switch (expr.v) {
    case 'life':
      return true;
    case 'add':
    case 'mul':
    case 'min':
    case 'max':
      return expr.of.some(readsLife);
    case 'sub':
    case 'div':
      return readsLife(expr.a) || readsLife(expr.b);
    case 'if':
      return readsLife(expr.then) || readsLife(expr.else);
    default:
      return false;
  }
}

/**
 * A `ValueExpr` that reads a life total, as a layer-native `DynamicValue`.
 *
 * WHY THIS IS NOT JUST `evalValue`
 * --------------------------------
 * `evalValue` answers "your life total" using `ctx.you`, which is the
 * controller recorded on the card. Layer 2 has not run at scan time, so a
 * Death's Shadow that somebody else has gained control of would be sized by the
 * life total of the player who no longer controls it. Handing `layers.ts` a
 * `{kind:'lifeTotal', of:'you'}` moves the question inside the pipeline, where
 * `effectController` is the post-layer-2 answer.
 *
 * Returns `null` for any shape that cannot be carried across — `mul`, `div`,
 * `min`, `max` and `if` have no `DynamicValue` counterpart. The caller then
 * falls back to `evalValue`, which is the number this file has always produced.
 * That fallback is a smaller approximation (it is only wrong when control has
 * changed), not a silent zero.
 */
function toDynamicValue(expr: ValueExpr, ctx: AbilityContext): DynamicValue | null {
  if (typeof expr === 'number') return expr;

  switch (expr.v) {
    case 'life': {
      if (expr.of.who === 'you') return { kind: 'lifeTotal', of: 'you' };
      // Anything else names concrete seats. One seat is a life total; several
      // is a sum over players, which is what "the life totals of your
      // opponents" means and what `evalValue` already computes.
      const players = resolvePlayers(expr.of, ctx);
      if (players.length === 0) return null;
      const parts: DynamicValue[] = players.map(id => ({ kind: 'lifeTotal', of: id }));
      return parts.length === 1 ? parts[0] : { kind: 'sum', of: parts };
    }

    case 'add': {
      const parts = expr.of.map(part => toDynamicValue(part, ctx));
      if (parts.some(part => part === null)) return null;
      return { kind: 'sum', of: parts as DynamicValue[] };
    }

    case 'sub': {
      const a = toDynamicValue(expr.a, ctx);
      const b = toDynamicValue(expr.b, ctx);
      if (a === null || b === null) return null;
      return { kind: 'sum', of: [a, { kind: 'negate', of: b }] };
    }

    default:
      return null;
  }
}

/**
 * The value a P/T modification should carry: dynamic when it reads a life
 * total and can be expressed, a plain number otherwise.
 */
function ptValue(expr: ValueExpr | undefined, ctx: AbilityContext): DynamicValue {
  if (expr === undefined) return 0;
  if (readsLife(expr)) {
    const dynamic = toDynamicValue(expr, ctx);
    if (dynamic !== null) return dynamic;
  }
  return evalValue(expr, ctx);
}

const CARD_TYPE_SET = new Set<string>(CARD_TYPES as readonly string[]);
const COLOR_SET = new Set(['W', 'U', 'B', 'R', 'G']);

function asCardTypes(values: string[] | undefined): CardType[] | undefined {
  if (!values) return undefined;
  const out = values
    .map(value => value.toLowerCase())
    .filter(value => CARD_TYPE_SET.has(value)) as CardType[];
  return out.length > 0 ? out : undefined;
}

function asColors(values: readonly string[] | undefined): LayerColor[] | undefined {
  if (!values) return undefined;
  const out = values
    .map(value => String(value).toUpperCase())
    .filter(value => COLOR_SET.has(value)) as LayerColor[];
  return out.length > 0 ? out : undefined;
}

/**
 * One DSL modification → one layer part, or `null` when it is not a
 * characteristic change at all (restrictions and cost modifiers).
 *
 * Values are evaluated against the state at scan time and handed over as plain
 * numbers, with ONE exception: a power/toughness value that reads a life total
 * is carried across as a `DynamicValue` instead. See `toDynamicValue` above for
 * why that one has to be resolved inside the pipeline rather than before it.
 * Everything else keeps the plain-number path, because a value that does not
 * depend on layer ordering gains nothing from being recomputed and loses the
 * single place where it is worked out.
 */
export function toEffectPart(modification: Modification, ctx: AbilityContext): EffectPart | null {
  switch (modification.layer) {
    case 'control': {
      const [controller] = resolvePlayers(modification.newController, ctx);
      if (!controller) return null;
      return { sublayer: '2a' as SubLayer, modification: { kind: 'control', controller } };
    }

    case 'type':
      return {
        sublayer: '4a' as SubLayer,
        modification: {
          kind: 'type',
          addCardTypes: asCardTypes(modification.addTypes),
          addSubtypes: modification.addSubtypes?.map(value => value.toLowerCase()),
          removeCardTypes: asCardTypes(modification.removeTypes),
        },
      };

    case 'color': {
      const setColors = asColors(modification.setColors);
      if (!setColors) return null;
      return { sublayer: '5a' as SubLayer, modification: { kind: 'color', setColors } };
    }

    case 'ability':
      return {
        sublayer: '6a' as SubLayer,
        modification: {
          kind: 'ability',
          addAbilities: modification.grant?.map(value => value.toLowerCase()),
          removeAbilities: modification.remove?.map(value => value.toLowerCase()),
        },
      };

    case 'pt-set':
      return {
        sublayer: '7b' as SubLayer,
        modification: {
          kind: 'set-pt',
          power: ptValue(modification.power, ctx),
          toughness: ptValue(modification.toughness, ctx),
        },
      };

    case 'pt-modify':
      return {
        sublayer: '7c' as SubLayer,
        modification: {
          kind: 'modify-pt',
          power: ptValue(modification.power, ctx),
          toughness: ptValue(modification.toughness, ctx),
        },
      };

    case 'pt-switch':
      return { sublayer: '7e' as SubLayer, modification: { kind: 'switch-pt' } };

    case 'cost-modify':
    case 'restriction':
      // Not characteristics. Collected separately by `scanStatics`.
      return null;

    default:
      return null;
  }
}

/** CR 613.8 dependency keys, in `layers.ts`'s vocabulary, for one part. */
function providesFor(part: EffectPart): string[] {
  switch (part.modification.kind) {
    case 'control':
      return ['control-change'];
    case 'type':
      return ['adding-subtype'];
    case 'color':
      return ['color-change'];
    case 'ability':
      return part.modification.removeAllAbilities || part.modification.removeAbilities
        ? ['removing-ability']
        : ['adding-ability'];
    case 'set-pt':
      return ['set-pt'];
    case 'modify-pt':
      return ['modify-pt'];
    case 'switch-pt':
      return ['switch-pt'];
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* The scan                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every static ability currently applying, converted for the layer engine.
 *
 * Selectors are resolved to concrete instance ids at scan time and handed over
 * as `{kind:'ids'}`. That is exact, because the scan is redone from the
 * battlefield on every call: a creature that arrives after an anthem is picked
 * up by the next scan rather than needing the effect to re-evaluate itself.
 *
 * `zonesToScan` defaults to the battlefield. An ability that applies from the
 * graveyard or the command zone says so in `activeZones`, and this respects it.
 */
export function scanStatics(state: GameState, view?: Record<InstanceId, CharacteristicView>): StaticScan {
  // Memoised on state identity for the no-view call, which is the one every hot
  // path uses: `continuousEffectsFor`, `hasRestriction` and `costAdjustmentFor`
  // all scan the whole battlefield, and combat asks about restrictions once per
  // attacker. A scan with a caller-supplied view is not cached, because the view
  // is part of the answer and is not part of the key.
  if (!view) {
    const cached = SCAN_CACHE.get(state);
    if (cached) return cached;
    const fresh = runScan(state, undefined);
    SCAN_CACHE.set(state, fresh);
    return fresh;
  }
  return runScan(state, view);
}

/** Superseded states are collected; a long game does not accumulate scans. */
const SCAN_CACHE = new WeakMap<GameState, StaticScan>();

function runScan(state: GameState, view: Record<InstanceId, CharacteristicView> | undefined): StaticScan {
  const effects: ContinuousEffect[] = [];
  const restrictions: ActiveRestriction[] = [];
  const costMods: ActiveCostMod[] = [];
  let timestamp = 0;

  for (const player of state.players) {
    for (const zone of ['battlefield', 'graveyard', 'command'] as const) {
      for (const instanceId of player.zones[zone] ?? []) {
        const card = state.cards[instanceId];
        if (!card || card.removedFromGame) continue;

        for (const ability of staticAbilitiesOf(card)) {
          const zones = ability.activeZones ?? ['battlefield'];
          if (!zones.includes(zone)) continue;

          const ctx = makeContext(state, instanceId, card.controllerId, { view });

          // "as long as …" — checked now, so an anthem that has switched itself
          // off simply is not in the list rather than being in it and inert.
          if (ability.condition && !evalCondition(ability.condition, ctx)) continue;

          const affected = resolveSelector(ability.affects, ctx);
          const parts: EffectPart[] = [];
          const provides = new Set<string>();

          for (const modification of ability.modifications) {
            if (modification.layer === 'restriction') {
              restrictions.push({
                sourceInstanceId: instanceId,
                sourceName: card.name,
                abilityId: ability.id,
                rule: modification.rule,
                affected: restrictionSubjects(modification.rule, ctx),
              });
              continue;
            }

            if (modification.layer === 'cost-modify') {
              costMods.push({
                sourceInstanceId: instanceId,
                sourceName: card.name,
                abilityId: ability.id,
                delta: evalValue(modification.delta, ctx),
                genericOnly: modification.genericOnly ?? true,
                applies: modification.applies,
                forWhom: resolvePlayers(modification.forWhom, ctx),
                needsHistory: watchQueriesIn([
                  { do: 'gain-life', who: { who: 'you' }, amount: modification.delta },
                ]).length > 0,
              });
              continue;
            }

            const part = toEffectPart(modification, ctx);
            if (!part) continue;
            parts.push(part);
            for (const key of providesFor(part)) provides.add(key);
          }

          if (parts.length === 0) continue;

          effects.push({
            id: `${instanceId}:${ability.id}`,
            timestamp: timestamp++,
            sourceId: instanceId,
            // `fromAbility` is deliberately NOT set. It is `layers.ts`'s CR 613.6
            // hook: the engine stops applying an effect's remaining layers once
            // that ability key is gone from the source's ability list. Our keys
            // ('a0', 'a1') are compiler ids, not entries in `BaseObject.abilities`,
            // so setting it would make every effect look like it had already been
            // stripped and nothing would ever apply. The guarantee it provides is
            // covered another way: this scan is rebuilt from the battlefield on
            // every call, so an effect whose source has left is simply never
            // produced.
            controllerId: card.controllerId,
            affects: affected.length > 0 ? { kind: 'ids', ids: affected } : { kind: 'none' },
            parts,
            provides: provides.size > 0 ? Array.from(provides) : undefined,
            note: `${card.name}: ${ability.text}`,
          });
        }
      }
    }
  }

  return { effects, restrictions, costMods };
}

function restrictionSubjects(rule: Restriction, ctx: AbilityContext): InstanceId[] {
  switch (rule.rule) {
    case 'cant-attack':
    case 'cant-block':
    case 'must-attack':
    case 'cant-untap':
    case 'cant-be-blocked-except-by':
    case 'cant-be-targeted':
      return resolveSelector(rule.who, ctx);
    case 'damage-prevention':
      return resolveSelector(rule.to, ctx);
    case 'cant-cast':
    case 'max-lands-per-turn':
      return [];
    default:
      return [];
  }
}

/**
 * Every continuous effect in force, from both halves, for handing straight to
 * `computeStateLayers`.
 *
 * The two halves are genuinely different and merging them here is the whole
 * point of this function existing:
 *
 *   DERIVED. A static ability's effects, rebuilt from the battlefield on every
 *   call. Nothing stores an anthem, so nothing has to remember to unstore it
 *   when the anthem dies.
 *
 *   STORED. What a spell or ability that has already RESOLVED left behind —
 *   Giant Growth's +3/+3, Act of Treason's control change. There is no source
 *   on the board to re-read, so these live on `state.timedEffects` and carry an
 *   expiry, and `liveTimedEffects` drops the ones whose expiry has passed.
 *
 * Statics come first, which affects nothing: `computeLayers` orders by CR 613
 * timestamp and dependency, not by list position.
 */
export function continuousEffectsFor(state: GameState): ContinuousEffect[] {
  return [...scanStatics(state).effects, ...liveTimedEffects(state)];
}

/* -------------------------------------------------------------------------- */
/* The layered board                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The board with every static ability applied, memoised on the state object.
 *
 * `applyAction` returns a new object on every change, so keying the cache on
 * object identity is exact and can never be stale.
 */
const LAYER_CACHE = new WeakMap<GameState, LayerResult>();

export function layeredState(state: GameState): LayerResult {
  const cached = LAYER_CACHE.get(state);
  if (cached) return cached;
  // Two passes: the first resolves selectors against printed characteristics,
  // the second applies them. A static ability therefore cannot see the result of
  // another static ability applied in the same pass — CR 613.8 dependency
  // ordering inside `layers.ts` handles the cases that matter, and the rest is
  // the declared `layer-dependency` gap rather than an accident.
  const result = computeStateLayers(state, continuousEffectsFor(state));
  LAYER_CACHE.set(state, result);
  return result;
}

/**
 * The layered board in the shape `context.ts` reads, so a filter like
 * "creatures with power 4 or greater" sees anthems.
 */
export function characteristicView(state: GameState): Record<InstanceId, CharacteristicView> {
  const out: Record<InstanceId, CharacteristicView> = {};
  for (const object of Object.values(layeredState(state).objects ?? {})) {
    const characteristics = object as LayeredCharacteristics;
    out[characteristics.id] = {
      power: characteristics.power ?? 0,
      toughness: characteristics.toughness ?? 0,
      types: characteristics.cardTypes.map(value => String(value).toLowerCase()),
      subtypes: characteristics.subtypes.map(value => value.toLowerCase()),
      supertypes: characteristics.supertypes.map(value => value.toLowerCase()),
      colors: characteristics.colors.map(value => String(value).toLowerCase()),
      keywords: characteristics.abilities.map(value => value.toLowerCase()),
      controllerId: characteristics.controller,
      manaValue: characteristics.manaValue ?? 0,
    };
  }
  return out;
}

/** A context whose predicates read the layered board. The usual entry point. */
export function layeredContext(
  state: GameState,
  sourceId: InstanceId,
  controllerId: PlayerId,
  extra: Partial<AbilityContext> = {}
): AbilityContext {
  return makeContext(state, sourceId, controllerId, { view: characteristicView(state), ...extra });
}

/** Is there a live restriction of this kind on this permanent? */
export function hasRestriction(
  state: GameState,
  instanceId: InstanceId,
  rule: 'cant-attack' | 'cant-block' | 'must-attack' | 'cant-untap'
): boolean {
  const scan = scanStatics(state);
  return scan.restrictions.some(active => {
    if (active.rule.rule !== rule) return false;
    if (!active.affected.includes(instanceId)) return false;
    const unless = 'unless' in active.rule ? active.rule.unless : undefined;
    if (!unless) return true;
    const card = state.cards[active.sourceInstanceId];
    const ctx = makeContext(state, active.sourceInstanceId, card?.controllerId ?? state.activePlayerId);
    // The escape clause is asked at the moment of attacking, not baked in when
    // the enchantment resolved.
    return !evalCondition(unless, ctx);
  });
}

/**
 * Does one cost modifier apply to one card being cast?
 *
 * The card is matched **wherever it currently is**, and the selector's `zone`
 * is deliberately ignored. That is not sloppiness: the compiler writes
 * `zone:'stack'` because the object being taxed or discounted is a *spell*,
 * while a cost is computed before the spell is announced, so the card is still
 * in hand (or the command zone, or a graveyard under a recursion effect).
 * Honouring the zone literally is what made this always answer 0.
 *
 * Everything else about the selector IS honoured — the filter and the
 * controller — so "artifact spells YOU cast" still does not discount an
 * opponent's, and the caster check in `costAdjustmentFor` is separate from it.
 */
function costModApplies(mod: ActiveCostMod, instanceId: InstanceId, ctx: AbilityContext): boolean {
  const selector = mod.applies;
  switch (selector.sel) {
    case 'self':
      return instanceId === mod.sourceInstanceId;
    case 'all': {
      if (!matchesFilter(selector.where, instanceId, ctx)) return false;
      if (!selector.controller) return true;
      const owners = resolvePlayers(selector.controller, ctx);
      const controller = ctx.state.cards[instanceId]?.controllerId;
      return !!controller && owners.includes(controller);
    }
    default:
      // Any other selector names something the caster is not: a target that was
      // never announced, a trigger subject with no trigger. Nothing, not
      // everything.
      return false;
  }
}

/**
 * Total generic-mana adjustment for casting this card. Negative reduces.
 * Handed to `mana.ts`, which stays the one implementation of paying for things.
 */
export function costAdjustmentFor(
  state: GameState,
  instanceId: InstanceId,
  casterId: PlayerId
): number {
  return scanStatics(state)
    .costMods.filter(mod => {
      if (!mod.forWhom.includes(casterId)) return false;
      // A delta computed from turn history evaluated to 0 above, and 0 is a
      // wrong reduction rather than a small one. Skipped, so the spell stays at
      // its printed cost instead of being quietly discounted by nothing.
      if (mod.needsHistory) return false;
      const source = state.cards[mod.sourceInstanceId];
      const ctx = makeContext(state, mod.sourceInstanceId, source?.controllerId ?? casterId);
      return costModApplies(mod, instanceId, ctx);
    })
    .reduce((total, mod) => total + mod.delta, 0);
}

/**
 * How many lands this player may play this turn. One, unless something says
 * otherwise.
 *
 * `max-lands-per-turn` has been in the Restriction vocabulary since it was
 * written, with nothing producing it and nothing reading it, while `moves.ts`
 * hardcoded the limit to one. Exploration, Dryad of the Ilysian Grove, Oracle
 * of Mul Daya, Azusa, Aesi and The Gitrog Monster are eleven of the 2,000 most
 * played cards in the format and NONE of them did anything in a game.
 *
 * THEY STACK, so this sums `n - 1` over every source rather than taking the
 * largest. Exploration says "you may play 2 lands each turn" and Azusa says 3;
 * together the answer is 4, which is what Magic does and what taking the
 * maximum would get wrong.
 *
 * A source whose count cannot be evaluated contributes nothing rather than
 * guessing. Under-counting means a player is stopped from a land drop they
 * were owed, which they can see and complain about; over-counting means a
 * silent extra land every turn, which nobody notices and which is cheating.
 */
export function landsAllowedPerTurn(state: GameState, playerId: PlayerId): number {
  let extra = 0;
  for (const active of scanStatics(state).restrictions) {
    if (active.rule.rule !== 'max-lands-per-turn') continue;
    const source = state.cards[active.sourceInstanceId];
    if (!source) continue;
    const ctx = makeContext(state, active.sourceInstanceId, source.controllerId ?? playerId);
    if (!resolvePlayers(active.rule.who, ctx).includes(playerId)) continue;
    const n = evalValue(active.rule.n, ctx);
    if (typeof n === 'number' && Number.isFinite(n) && n > 1) extra += n - 1;
  }
  return 1 + extra;
}

/** Every static ability a card record carries, for the coverage report. */
export function staticsOf(state: GameState, instanceId: InstanceId): StaticAbility[] {
  return staticAbilitiesOf(state.cards[instanceId]);
}
