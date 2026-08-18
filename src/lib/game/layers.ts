/**
 * DeckMatrix — shared game-state core: the continuous-effects layer system (CR 613).
 *
 * ## Attribution
 *
 * The *architecture* in this file is a port of XMage's continuous-effect model
 * (https://github.com/magefree/mage), which is MIT licensed:
 *
 *   Copyright (c) XMage contributors. Licensed under the MIT License.
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the above copyright notice being retained.
 *
 * Specifically ported, with names kept recognisable on purpose:
 *
 *   - `mage.constants.Layer`            -> `Layer` / `LAYER_OF_SUBLAYER`
 *   - `mage.constants.SubLayer`         -> `SubLayer` / `LAYER_ORDER`
 *   - `mage.constants.DependencyType`   -> `DEPENDENCY_KEYS`
 *   - `ContinuousEffect.hasLayer/apply` -> `ContinuousEffect.parts[]`
 *   - `ContinuousEffect.getDependencyTypes()` / `getDependedToTypes()`
 *                                       -> `provides[]` / `dependsOn[]`
 *   - `ContinuousEffects.apply(Game)`   -> `computeLayers()`
 *   - `ContinuousEffects.getLayeredEffects()` order-by-timestamp
 *                                       -> `orderEffectGroup()`
 *
 * No XMage *code* is copied — Java that mutates live `Permanent` objects through
 * an inheritance tree cannot be transliterated into a pure reducer, and doing so
 * would break the one property this project cannot lose. What is ported is the
 * model: effects declare which layers they act in, they are ordered by timestamp
 * within a layer, dependency overrides timestamp, and layer 7 has five sublayers.
 *
 * ## Determinism, restated because it constrains every choice here
 *
 * `computeLayers` is a pure function of its arguments. No clock, no `Math.random`,
 * no class instances, no mutation of its inputs, and nothing it returns is
 * anything other than plain JSON. Two clients handed the same battlefield and the
 * same effect list produce byte-identical characteristics, which is what lets the
 * network ship actions instead of state.
 *
 * Consequences you will notice:
 *
 *   - Effects are **data**, never closures. A "power equal to the number of
 *     Elves you control" is a `DynamicValue` tree, not a callback, because a
 *     callback cannot be replayed on a client that only received an action log.
 *   - Timestamps are **caller-supplied integers**, not `Date.now()`. Feed them a
 *     monotonic counter kept in game state.
 *   - Ties are broken by effect id, so two effects sharing a timestamp still
 *     order identically everywhere.
 *
 * ## The model, in the order the rules apply it
 *
 *   1  copy effects                       (1a copy, 1b face-down)
 *   2  control-changing effects
 *   3  text-changing effects
 *   4  type-changing effects
 *   5  colour-changing effects
 *   6  ability adding / removing effects
 *   7  power/toughness, in five sublayers:
 *        7a characteristic-defining abilities
 *        7b setting power and/or toughness
 *        7c modifying (anthems, "+3/+3 until end of turn")
 *        7d counters (+1/+1, -1/-1, and any `+N/+N` style counter)
 *        7e switching power and toughness
 *
 * Two rules do the real work and are the two everybody gets wrong:
 *
 *   - **CR 613.7 timestamps.** Within one layer, earlier timestamp applies first.
 *   - **CR 613.8 dependency.** If applying B first would change what A applies to
 *     or what A does, A waits for B regardless of timestamp; a dependency loop is
 *     broken by falling back to timestamp order (613.8c). Dependency is only ever
 *     considered *within the same layer and sublayer*.
 *
 * And the rule that makes Humility work at all:
 *
 *   - **CR 613.6.** An effect that has begun to apply keeps applying, to the same
 *     set of objects, in every later layer — even if the ability that generated it
 *     has since been removed. Humility strips its own abilities in layer 6 and
 *     still sets everything to 1/1 in layer 7b because of this rule. It is
 *     implemented here by locking an effect's target set on first application and
 *     by only re-checking `fromAbility` for effects that have not yet applied.
 *
 * ## What this deliberately does not do
 *
 *   - It does not decide *which* effects are active. Duration, "until end of
 *     turn", phasing and leaves-the-battlefield are the caller's job; this
 *     function is handed the live set.
 *   - Layer 3 (text-changing) only rewrites subtype and colour words, because
 *     nothing in this engine models rules text as tokens. Anything else marked as
 *     a text change is reported in `LayerResult.unsupported` rather than silently
 *     ignored — silence is the bug this codebase exists to kill.
 *   - It does not run state-based actions. +1/+1 and -1/-1 counters both apply in
 *     7d and are *not* annihilated here; that is CR 704.5q and belongs in SBAs.
 */

import type { CardInstance, GameState, PlayerId } from './types.ts';
import { effectiveKeywords } from './keywords.ts';

/* -------------------------------------------------------------------------- */
/* Layers and sublayers                                                       */
/* -------------------------------------------------------------------------- */

export type Layer = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Sublayer keys. Layers without sublayers in the rules still get one here (`2a`,
 * `4a`, …) so the pipeline is a single flat list rather than a layer loop with a
 * special case inside it.
 */
export type SubLayer =
  | '1a'
  | '1b'
  | '2a'
  | '3a'
  | '4a'
  | '5a'
  | '6a'
  | '7a'
  | '7b'
  | '7c'
  | '7d'
  | '7e';

/** The pipeline. This order is the whole point of the file. */
export const LAYER_ORDER: readonly SubLayer[] = [
  '1a',
  '1b',
  '2a',
  '3a',
  '4a',
  '5a',
  '6a',
  '7a',
  '7b',
  '7c',
  '7d',
  '7e',
] as const;

export const LAYER_OF_SUBLAYER: Record<SubLayer, Layer> = {
  '1a': 1,
  '1b': 1,
  '2a': 2,
  '3a': 3,
  '4a': 4,
  '5a': 5,
  '6a': 6,
  '7a': 7,
  '7b': 7,
  '7c': 7,
  '7d': 7,
  '7e': 7,
};

export const SUBLAYER_LABELS: Record<SubLayer, string> = {
  '1a': 'Copy effects',
  '1b': 'Face-down effects',
  '2a': 'Control-changing effects',
  '3a': 'Text-changing effects',
  '4a': 'Type-changing effects',
  '5a': 'Colour-changing effects',
  '6a': 'Ability adding and removing effects',
  '7a': 'Characteristic-defining power/toughness',
  '7b': 'Power/toughness setting effects',
  '7c': 'Power/toughness modifying effects',
  '7d': 'Power/toughness from counters',
  '7e': 'Power/toughness switching effects',
};

/* -------------------------------------------------------------------------- */
/* Characteristics                                                            */
/* -------------------------------------------------------------------------- */

export const CARD_TYPES = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'instant',
  'kindred',
  'land',
  'planeswalker',
  'sorcery',
] as const;

export type CardType = (typeof CARD_TYPES)[number];

export const SUPERTYPES = ['basic', 'legendary', 'ongoing', 'snow', 'world'] as const;

/** Colourless is the absence of every colour, so it is not a member. */
export type LayerColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const LAYER_COLORS: readonly LayerColor[] = ['W', 'U', 'B', 'R', 'G'] as const;

export type ObjectId = string;
export type EffectId = string;

/**
 * The printed, pre-effect characteristics of one object.
 *
 * "Base" here means *before continuous effects*, which is not quite the same as
 * "printed": a hand-set `powerOverride` from `manual.ts` arrives as `power`,
 * because the player is declaring what the card's base value is.
 *
 * `power`/`toughness` are `null` for anything with no printed P/T. That is
 * distinct from `0`, and the difference matters: counters and anthems do nothing
 * to a `null`, but a layer-7b effect can give it a value (Opalescence).
 */
export interface BaseObject {
  id: ObjectId;
  name: string;
  /** Printed controller — the battlefield controller before any layer-2 effect. */
  controller: PlayerId;
  owner?: PlayerId;
  cardTypes: CardType[];
  subtypes?: string[];
  supertypes?: string[];
  colors?: LayerColor[];
  /** Normalised lower-case ability keys. Keywords, or ids minted by the compiler. */
  abilities?: string[];
  power?: number | null;
  toughness?: number | null;
  manaValue?: number;
  /** Counter name -> count. `+1/+1` and `-1/-1` are read in layer 7d. */
  counters?: Record<string, number>;
}

/** The answer: one object's characteristics with every continuous effect applied. */
export interface LayeredCharacteristics {
  id: ObjectId;
  name: string;
  controller: PlayerId;
  owner?: PlayerId;
  cardTypes: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: LayerColor[];
  abilities: string[];
  power: number | null;
  toughness: number | null;
  manaValue: number;
  counters: Record<string, number>;
  /** True when an odd number of layer-7e switches applied. Rendering hint only. */
  ptSwitched: boolean;
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Who an effect applies to, as data.
 *
 * A selector is evaluated **at the moment its layer runs**, against
 * characteristics as modified by every earlier layer. That is what makes
 * dependency (CR 613.8) a real problem rather than a theoretical one: a layer-4
 * effect that turns lands into creatures changes which objects a *different*
 * layer-4 effect matches.
 *
 * The exception is CR 613.6: once an effect has applied in any layer, its target
 * set is locked and reused for its remaining layers.
 */
export type Selector =
  | { kind: 'self' }
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'ids'; ids: ObjectId[] }
  | ({ kind: 'match' } & MatchFilter)
  | { kind: 'and'; of: Selector[] }
  | { kind: 'or'; of: Selector[] }
  | { kind: 'not'; of: Selector };

/**
 * Every field is optional and every present field must hold. Array fields mean
 * "has any of these".
 *
 * `controller: 'you'` is the effect's controller — `ContinuousEffect.controllerId`
 * when set, otherwise the *current* (post-layer-2) controller of the source. A
 * stolen anthem pumps its new controller's team, which is the behaviour a player
 * expects and the reason control change is layer 2 rather than layer 7.
 */
export interface MatchFilter {
  ids?: ObjectId[];
  notIds?: ObjectId[];
  names?: string[];
  cardTypes?: CardType[];
  notCardTypes?: CardType[];
  subtypes?: string[];
  notSubtypes?: string[];
  supertypes?: string[];
  notSupertypes?: string[];
  colors?: LayerColor[];
  notColors?: LayerColor[];
  /** Match a colourless object (no colours at all). */
  colorless?: boolean;
  abilities?: string[];
  notAbilities?: string[];
  controller?: 'you' | 'not-you' | PlayerId;
  /** "each other …" — drop the effect's own source from the set. */
  excludeSelf?: boolean;
  minPower?: number;
  maxPower?: number;
  minToughness?: number;
  maxToughness?: number;
  minManaValue?: number;
  maxManaValue?: number;
}

/* -------------------------------------------------------------------------- */
/* Dynamic values                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A number an effect needs but cannot know until it runs — "equal to its mana
 * value", "for each Elf you control".
 *
 * It is a tree rather than a function so that it survives `JSON.stringify`. A
 * plain `number` is accepted everywhere for the common case.
 *
 * `of: 'affected'` means the object being modified right now, which is how
 * Opalescence's "each equal to its mana value" is expressed.
 */
export type DynamicValue =
  | number
  | { kind: 'constant'; value: number }
  | { kind: 'manaValue'; of: 'affected' | 'source' | ObjectId }
  | { kind: 'power'; of: 'affected' | 'source' | ObjectId }
  | { kind: 'toughness'; of: 'affected' | 'source' | ObjectId }
  | { kind: 'counters'; counter: string; on: 'affected' | 'source' | ObjectId }
  | { kind: 'count'; of: Selector }
  | { kind: 'sum'; of: DynamicValue[] }
  | { kind: 'negate'; of: DynamicValue };

/* -------------------------------------------------------------------------- */
/* Modifications                                                              */
/* -------------------------------------------------------------------------- */

/** Copiable values, layer 1a. Anything omitted is left alone. */
export interface CopiableValues {
  name?: string;
  cardTypes?: CardType[];
  subtypes?: string[];
  supertypes?: string[];
  colors?: LayerColor[];
  abilities?: string[];
  power?: number | null;
  toughness?: number | null;
  manaValue?: number;
}

export type Modification =
  /** 1a — become a copy of something. Counters and control are not copiable. */
  | { kind: 'copy'; values: CopiableValues }
  /** 1b — a face-down permanent is a 2/2 colourless creature with no name or abilities. */
  | { kind: 'face-down' }
  /** 2a — control change. */
  | { kind: 'control'; controller: PlayerId | 'you' }
  /**
   * 3a — text change, limited to subtype and colour words. Anything else is
   * reported as unsupported rather than pretended.
   */
  | { kind: 'text-change'; scope: 'subtype' | 'color'; from: string; to: string }
  /** 4a — type line. `set*` replaces, `add*`/`remove*` adjust. */
  | {
      kind: 'type';
      setCardTypes?: CardType[];
      addCardTypes?: CardType[];
      removeCardTypes?: CardType[];
      setSubtypes?: string[];
      addSubtypes?: string[];
      removeSubtypes?: string[];
      removeAllSubtypes?: boolean;
      setSupertypes?: string[];
      addSupertypes?: string[];
      removeSupertypes?: string[];
    }
  /** 5a — colour. */
  | {
      kind: 'color';
      setColors?: LayerColor[];
      addColors?: LayerColor[];
      removeColors?: LayerColor[];
      /** "is colourless" */
      removeAllColors?: boolean;
    }
  /** 6a — abilities. `removeAllAbilities` runs before `addAbilities` within one effect. */
  | {
      kind: 'ability';
      addAbilities?: string[];
      removeAbilities?: string[];
      removeAllAbilities?: boolean;
    }
  /**
   * 7a / 7b — set base power and/or toughness. Use sublayer `7a` only for a
   * characteristic-defining ability printed on the object itself; anything an
   * outside effect does belongs in `7b`.
   */
  | { kind: 'set-pt'; power?: DynamicValue | null; toughness?: DynamicValue | null }
  /** 7c — anthems and pump. */
  | { kind: 'modify-pt'; power?: DynamicValue; toughness?: DynamicValue }
  /** 7e — switch power and toughness. Two switches cancel. */
  | { kind: 'switch-pt' };

/** One layer's worth of one effect. An effect may hold several. */
export interface EffectPart {
  sublayer: SubLayer;
  modification: Modification;
}

/* -------------------------------------------------------------------------- */
/* Dependency                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ported from XMage's `DependencyType`. XMage's insight, which is worth keeping:
 * CR 613.8 dependency is undecidable in general, so rather than trying to infer
 * it, an effect *declares* what it produces and what it is sensitive to, and the
 * engine orders on those declarations.
 *
 * The list is open — the oracle-text compiler is free to mint its own keys — but
 * these are the ones ported across, so two authors reaching for "this makes
 * things creatures" land on the same string.
 */
export const DEPENDENCY_KEYS = [
  'adding-ability',
  'removing-ability',
  'adding-creature-type',
  'adding-subtype',
  'removing-subtype',
  'become-creature',
  'become-artifact',
  'become-enchantment',
  'become-land',
  'become-nonbasic-land',
  'become-forest',
  'become-island',
  'become-mountain',
  'become-plains',
  'become-swamp',
  'aura-adding-removing',
  'control-change',
  'copy',
  'color-change',
  'set-pt',
  'modify-pt',
  'switch-pt',
] as const;

export type DependencyKey = string;

/* -------------------------------------------------------------------------- */
/* The effect                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One continuous effect. Pure data; no behaviour, no closures, no identity
 * beyond `id`.
 *
 * `fromAbility` is the load-bearing field for CR 613.6. Set it to the ability key
 * on `sourceId` that generates this effect, and the engine will stop applying the
 * effect's *not yet applied* layers once that ability is gone — which is exactly
 * how Humility switches off an anthem on a creature-ified enchantment, while
 * Humility's own already-applied effect keeps going. Leave it unset for effects
 * from resolved spells, which do not care whether their source still exists.
 */
export interface ContinuousEffect {
  id: EffectId;
  /**
   * Caller-supplied monotonic integer. **Never** a wall clock — a replaying
   * client must generate the same ordering, so this comes from a counter held in
   * game state. Ties fall back to `id`.
   */
  timestamp: number;
  /** The object generating the effect. Required for `self`/`you`/`excludeSelf`. */
  sourceId?: ObjectId;
  /** Ability key on the source that generates this. See CR 613.6 note above. */
  fromAbility?: string;
  /** Overrides "you" when the effect came from a spell rather than a permanent. */
  controllerId?: PlayerId;
  affects: Selector;
  parts: EffectPart[];
  /** CR 613.8 — what this effect produces, in `DEPENDENCY_KEYS` terms. */
  provides?: DependencyKey[];
  /** CR 613.8 — what this effect must be applied after. */
  dependsOn?: DependencyKey[];
  /** Escape hatch: an explicit "apply after these effect ids". */
  dependsOnEffects?: EffectId[];
  /** Human-readable, for the game log and the debug trace. */
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

export interface AppliedStep {
  sublayer: SubLayer;
  effectId: EffectId;
  targets: ObjectId[];
  note?: string;
}

/** An effect that stopped applying, and why. Reported, never silently dropped. */
export interface SkippedEffect {
  effectId: EffectId;
  sublayer: SubLayer;
  reason: 'source-missing' | 'ability-removed' | 'no-targets';
}

/** Something the caller asked for that this implementation does not model. */
export interface UnsupportedNote {
  effectId: EffectId;
  sublayer: SubLayer;
  detail: string;
}

export interface LayerResult {
  objects: Record<ObjectId, LayeredCharacteristics>;
  /** Input order, preserved. Iterate this rather than `Object.keys`. */
  order: ObjectId[];
  /** Every application, in the order it happened. Debug UI and tests read this. */
  trace: AppliedStep[];
  skipped: SkippedEffect[];
  unsupported: UnsupportedNote[];
}

export interface LayerInput {
  objects: BaseObject[];
  effects: ContinuousEffect[];
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type Working = LayeredCharacteristics & { switchCount: number };

function uniqueLower(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function unique<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function startWorking(base: BaseObject): Working {
  return {
    id: base.id,
    name: base.name,
    controller: base.controller,
    owner: base.owner,
    cardTypes: unique(base.cardTypes ?? []),
    subtypes: uniqueLower(base.subtypes ?? []),
    supertypes: uniqueLower(base.supertypes ?? []),
    colors: unique(base.colors ?? []),
    abilities: uniqueLower(base.abilities ?? []),
    power: base.power ?? null,
    toughness: base.toughness ?? null,
    manaValue: base.manaValue ?? 0,
    counters: { ...(base.counters ?? {}) },
    ptSwitched: false,
    switchCount: 0,
  };
}

/* --- selectors ------------------------------------------------------------ */

interface Ctx {
  objects: Record<ObjectId, Working>;
  order: ObjectId[];
  effect: ContinuousEffect;
}

/** The player an effect's "you" refers to, after control-changing effects. */
function effectController(ctx: Ctx): PlayerId | undefined {
  if (ctx.effect.controllerId) return ctx.effect.controllerId;
  const source = ctx.effect.sourceId ? ctx.objects[ctx.effect.sourceId] : undefined;
  return source?.controller;
}

function matches(object: Working, filter: MatchFilter, ctx: Ctx): boolean {
  const { effect } = ctx;

  if (filter.ids && !filter.ids.includes(object.id)) return false;
  if (filter.notIds && filter.notIds.includes(object.id)) return false;
  if (filter.excludeSelf && effect.sourceId && object.id === effect.sourceId) return false;

  if (filter.names) {
    const wanted = filter.names.map(n => n.toLowerCase());
    if (!wanted.includes(object.name.toLowerCase())) return false;
  }

  if (filter.cardTypes && !filter.cardTypes.some(t => object.cardTypes.includes(t))) return false;
  if (filter.notCardTypes && filter.notCardTypes.some(t => object.cardTypes.includes(t))) return false;

  if (filter.subtypes && !filter.subtypes.some(s => object.subtypes.includes(s.toLowerCase())))
    return false;
  if (filter.notSubtypes && filter.notSubtypes.some(s => object.subtypes.includes(s.toLowerCase())))
    return false;

  if (
    filter.supertypes &&
    !filter.supertypes.some(s => object.supertypes.includes(s.toLowerCase()))
  )
    return false;
  if (
    filter.notSupertypes &&
    filter.notSupertypes.some(s => object.supertypes.includes(s.toLowerCase()))
  )
    return false;

  if (filter.colors && !filter.colors.some(c => object.colors.includes(c))) return false;
  if (filter.notColors && filter.notColors.some(c => object.colors.includes(c))) return false;
  if (filter.colorless === true && object.colors.length > 0) return false;
  if (filter.colorless === false && object.colors.length === 0) return false;

  if (filter.abilities && !filter.abilities.some(a => object.abilities.includes(a.toLowerCase())))
    return false;
  if (
    filter.notAbilities &&
    filter.notAbilities.some(a => object.abilities.includes(a.toLowerCase()))
  )
    return false;

  if (filter.controller) {
    const you = effectController(ctx);
    if (filter.controller === 'you') {
      if (you === undefined || object.controller !== you) return false;
    } else if (filter.controller === 'not-you') {
      if (you === undefined || object.controller === you) return false;
    } else if (object.controller !== filter.controller) {
      return false;
    }
  }

  if (filter.minPower !== undefined && (object.power === null || object.power < filter.minPower))
    return false;
  if (filter.maxPower !== undefined && (object.power === null || object.power > filter.maxPower))
    return false;
  if (
    filter.minToughness !== undefined &&
    (object.toughness === null || object.toughness < filter.minToughness)
  )
    return false;
  if (
    filter.maxToughness !== undefined &&
    (object.toughness === null || object.toughness > filter.maxToughness)
  )
    return false;

  if (filter.minManaValue !== undefined && object.manaValue < filter.minManaValue) return false;
  if (filter.maxManaValue !== undefined && object.manaValue > filter.maxManaValue) return false;

  return true;
}

function selects(object: Working, selector: Selector, ctx: Ctx): boolean {
  switch (selector.kind) {
    case 'self':
      return !!ctx.effect.sourceId && object.id === ctx.effect.sourceId;
    case 'all':
      return true;
    case 'none':
      return false;
    case 'ids':
      return selector.ids.includes(object.id);
    case 'match':
      return matches(object, selector, ctx);
    case 'and':
      return selector.of.every(sub => selects(object, sub, ctx));
    case 'or':
      return selector.of.some(sub => selects(object, sub, ctx));
    case 'not':
      return !selects(object, selector.of, ctx);
  }
}

/** Deterministic: always walks `ctx.order`, which is the caller's input order. */
function resolveTargets(selector: Selector, ctx: Ctx): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ctx.order) {
    const object = ctx.objects[id];
    if (object && selects(object, selector, ctx)) out.push(id);
  }
  return out;
}

/* --- dynamic values ------------------------------------------------------- */

function referenced(
  of: 'affected' | 'source' | ObjectId,
  affected: Working | undefined,
  ctx: Ctx
): Working | undefined {
  if (of === 'affected') return affected;
  if (of === 'source') return ctx.effect.sourceId ? ctx.objects[ctx.effect.sourceId] : undefined;
  return ctx.objects[of];
}

function resolveValue(
  value: DynamicValue | undefined,
  affected: Working | undefined,
  ctx: Ctx
): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;

  switch (value.kind) {
    case 'constant':
      return value.value;
    case 'manaValue':
      return referenced(value.of, affected, ctx)?.manaValue ?? 0;
    case 'power':
      return referenced(value.of, affected, ctx)?.power ?? 0;
    case 'toughness':
      return referenced(value.of, affected, ctx)?.toughness ?? 0;
    case 'counters': {
      const target = referenced(value.on, affected, ctx);
      return target?.counters?.[value.counter] ?? 0;
    }
    case 'count':
      return resolveTargets(value.of, ctx).length;
    case 'sum':
      return value.of.reduce((total, part) => total + resolveValue(part, affected, ctx), 0);
    case 'negate':
      return -resolveValue(value.of, affected, ctx);
  }
}

/* --- counters (layer 7d) -------------------------------------------------- */

const PT_COUNTER = /^([+-]\d+)\/([+-]\d+)$/;

/**
 * Net power/toughness from counters.
 *
 * Generalised past `+1/+1` and `-1/-1` on purpose: `+2/+2`, `-0/-1` and friends
 * are real counter names on real cards, and a table that only knew two of them
 * would be wrong in a way nobody could see.
 */
export function counterPT(counters: Record<string, number> | undefined): {
  power: number;
  toughness: number;
} {
  let power = 0;
  let toughness = 0;
  if (!counters) return { power, toughness };

  // Sorted so the arithmetic is identical regardless of key insertion order.
  for (const name of Object.keys(counters).sort()) {
    const count = counters[name];
    if (!count) continue;
    const match = PT_COUNTER.exec(name.trim());
    if (!match) continue;
    power += parseInt(match[1], 10) * count;
    toughness += parseInt(match[2], 10) * count;
  }
  return { power, toughness };
}

/* --- CR 613.7 / 613.8 ordering ------------------------------------------- */

function timestampSort(a: ContinuousEffect, b: ContinuousEffect): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Order one layer's effects: timestamp order (CR 613.7), except that an effect
 * waits for anything it declares a dependency on (CR 613.8b), and a dependency
 * loop falls back to timestamp order (CR 613.8c).
 *
 * This is XMage's `waitingEffects` loop rewritten as a deterministic topological
 * sort. Kahn's algorithm with a timestamp-ordered ready queue gives exactly the
 * rules behaviour: effects go as early as their dependencies allow, and among
 * equally-ready effects the earlier timestamp wins.
 *
 * Exported because the ordering is worth testing on its own.
 */
export function orderEffectGroup(group: readonly ContinuousEffect[]): ContinuousEffect[] {
  const effects = [...group].sort(timestampSort);
  if (effects.length < 2) return effects;

  const byId = new Map<EffectId, ContinuousEffect>();
  for (const effect of effects) byId.set(effect.id, effect);

  // waitingFor[a] = the effects a must be applied after.
  const waitingFor = new Map<EffectId, Set<EffectId>>();
  for (const effect of effects) waitingFor.set(effect.id, new Set());

  for (const effect of effects) {
    const needs = waitingFor.get(effect.id)!;
    for (const id of effect.dependsOnEffects ?? []) {
      if (id !== effect.id && byId.has(id)) needs.add(id);
    }
    if (effect.dependsOn?.length) {
      const wanted = new Set(effect.dependsOn);
      for (const other of effects) {
        if (other.id === effect.id) continue;
        if ((other.provides ?? []).some(key => wanted.has(key))) needs.add(other.id);
      }
    }
  }

  const done = new Set<EffectId>();
  const out: ContinuousEffect[] = [];
  const remaining = [...effects];

  while (remaining.length > 0) {
    let index = remaining.findIndex(effect =>
      [...waitingFor.get(effect.id)!].every(id => done.has(id))
    );
    // CR 613.8c — every remaining effect is in a dependency loop. Ignore the
    // dependencies and fall back to timestamp order, which `remaining` is in.
    if (index === -1) index = 0;

    const [next] = remaining.splice(index, 1);
    done.add(next.id);
    out.push(next);
  }

  return out;
}

/* --- modification application -------------------------------------------- */

const FACE_DOWN: CopiableValues = {
  name: '',
  cardTypes: ['creature'],
  subtypes: [],
  supertypes: [],
  colors: [],
  abilities: [],
  power: 2,
  toughness: 2,
  manaValue: 0,
};

function applyCopiable(object: Working, values: CopiableValues): void {
  if (values.name !== undefined) object.name = values.name;
  if (values.cardTypes !== undefined) object.cardTypes = unique(values.cardTypes);
  if (values.subtypes !== undefined) object.subtypes = uniqueLower(values.subtypes);
  if (values.supertypes !== undefined) object.supertypes = uniqueLower(values.supertypes);
  if (values.colors !== undefined) object.colors = unique(values.colors);
  if (values.abilities !== undefined) object.abilities = uniqueLower(values.abilities);
  if (values.power !== undefined) object.power = values.power;
  if (values.toughness !== undefined) object.toughness = values.toughness;
  if (values.manaValue !== undefined) object.manaValue = values.manaValue;
}

function applyModification(
  object: Working,
  modification: Modification,
  ctx: Ctx,
  unsupported: (detail: string) => void
): void {
  switch (modification.kind) {
    case 'copy':
      applyCopiable(object, modification.values);
      return;

    case 'face-down':
      applyCopiable(object, FACE_DOWN);
      return;

    case 'control': {
      const next =
        modification.controller === 'you' ? effectController(ctx) : modification.controller;
      if (next !== undefined) object.controller = next;
      return;
    }

    case 'text-change': {
      const from = modification.from.toLowerCase();
      if (modification.scope === 'subtype') {
        object.subtypes = uniqueLower(
          object.subtypes.map(s => (s === from ? modification.to : s))
        );
      } else {
        const to = modification.to as LayerColor;
        if (!LAYER_COLORS.includes(to)) {
          unsupported(`text-change to unknown colour "${modification.to}"`);
          return;
        }
        object.colors = unique(
          object.colors.map(c => (c.toLowerCase() === from || c === modification.from ? to : c))
        );
      }
      return;
    }

    case 'type': {
      if (modification.setCardTypes) object.cardTypes = unique(modification.setCardTypes);
      if (modification.removeCardTypes) {
        const drop = new Set(modification.removeCardTypes);
        object.cardTypes = object.cardTypes.filter(t => !drop.has(t));
      }
      if (modification.addCardTypes)
        object.cardTypes = unique([...object.cardTypes, ...modification.addCardTypes]);

      if (modification.removeAllSubtypes) object.subtypes = [];
      if (modification.setSubtypes) object.subtypes = uniqueLower(modification.setSubtypes);
      if (modification.removeSubtypes) {
        const drop = new Set(modification.removeSubtypes.map(s => s.toLowerCase()));
        object.subtypes = object.subtypes.filter(s => !drop.has(s));
      }
      if (modification.addSubtypes)
        object.subtypes = uniqueLower([...object.subtypes, ...modification.addSubtypes]);

      if (modification.setSupertypes) object.supertypes = uniqueLower(modification.setSupertypes);
      if (modification.removeSupertypes) {
        const drop = new Set(modification.removeSupertypes.map(s => s.toLowerCase()));
        object.supertypes = object.supertypes.filter(s => !drop.has(s));
      }
      if (modification.addSupertypes)
        object.supertypes = uniqueLower([...object.supertypes, ...modification.addSupertypes]);
      return;
    }

    case 'color': {
      if (modification.removeAllColors) object.colors = [];
      if (modification.setColors) object.colors = unique(modification.setColors);
      if (modification.removeColors) {
        const drop = new Set(modification.removeColors);
        object.colors = object.colors.filter(c => !drop.has(c));
      }
      if (modification.addColors) object.colors = unique([...object.colors, ...modification.addColors]);
      return;
    }

    case 'ability': {
      if (modification.removeAllAbilities) object.abilities = [];
      if (modification.removeAbilities) {
        const drop = new Set(modification.removeAbilities.map(a => a.toLowerCase()));
        object.abilities = object.abilities.filter(a => !drop.has(a));
      }
      if (modification.addAbilities)
        object.abilities = uniqueLower([...object.abilities, ...modification.addAbilities]);
      return;
    }

    case 'set-pt': {
      if (modification.power !== undefined) {
        object.power = modification.power === null ? null : resolveValue(modification.power, object, ctx);
      }
      if (modification.toughness !== undefined) {
        object.toughness =
          modification.toughness === null ? null : resolveValue(modification.toughness, object, ctx);
      }
      return;
    }

    case 'modify-pt': {
      // A modification cannot give power/toughness to something that has none.
      if (modification.power !== undefined && object.power !== null) {
        object.power += resolveValue(modification.power, object, ctx);
      }
      if (modification.toughness !== undefined && object.toughness !== null) {
        object.toughness += resolveValue(modification.toughness, object, ctx);
      }
      return;
    }

    case 'switch-pt': {
      if (object.power === null || object.toughness === null) return;
      const power = object.power;
      object.power = object.toughness;
      object.toughness = power;
      object.switchCount += 1;
      object.ptSwitched = object.switchCount % 2 === 1;
      return;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The layer engine                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Apply every continuous effect in CR 613 order and return the current
 * characteristics of every object.
 *
 * Pure. Inputs are not mutated; the result is fresh JSON. Call it whenever
 * characteristics are needed — it is cheap enough to run per render and cheap
 * enough to run per replayed action, and caching a layer computation is how
 * engines end up with stale power/toughness.
 *
 * The loop is XMage's `ContinuousEffects.apply(Game)`: walk the sublayers in
 * order, and for each, take the effects that act in it, order them, apply them.
 * Two rules bend that shape and both are deliberate:
 *
 *   - an effect's target set is resolved fresh each layer *unless* the effect has
 *     already applied somewhere, in which case the locked set is reused (CR 613.6);
 *   - an effect that has not yet applied is dropped once the ability generating
 *     it is gone, which is only observable after layer 6 has run.
 */
export function computeLayers(input: LayerInput): LayerResult {
  const order: ObjectId[] = [];
  const objects: Record<ObjectId, Working> = {};

  for (const base of input.objects) {
    if (objects[base.id]) continue; // first definition wins; ids are unique by contract
    objects[base.id] = startWorking(base);
    order.push(base.id);
  }

  const effects = input.effects.filter(effect => effect.parts.length > 0);

  const trace: AppliedStep[] = [];
  const skipped: SkippedEffect[] = [];
  const unsupported: UnsupportedNote[] = [];

  /** CR 613.6 — the set an effect first applied to, reused for its later layers. */
  const lockedTargets = new Map<EffectId, ObjectId[]>();
  const hasApplied = new Set<EffectId>();

  for (const sublayer of LAYER_ORDER) {
    if (sublayer === '7d') {
      applyCounterLayer(objects, order, trace);
      continue;
    }

    const group: ContinuousEffect[] = [];
    for (const effect of effects) {
      if (!effect.parts.some(part => part.sublayer === sublayer)) continue;

      // Liveness. Once an effect has begun applying it keeps applying (CR 613.6);
      // before that, it needs its generating ability to still be there.
      if (!hasApplied.has(effect.id) && effect.fromAbility) {
        const source = effect.sourceId ? objects[effect.sourceId] : undefined;
        if (!source) {
          skipped.push({ effectId: effect.id, sublayer, reason: 'source-missing' });
          continue;
        }
        if (!source.abilities.includes(effect.fromAbility.toLowerCase())) {
          skipped.push({ effectId: effect.id, sublayer, reason: 'ability-removed' });
          continue;
        }
      }
      group.push(effect);
    }

    if (group.length === 0) continue;

    for (const effect of orderEffectGroup(group)) {
      const ctx: Ctx = { objects, order, effect };
      const targets = lockedTargets.get(effect.id) ?? resolveTargets(effect.affects, ctx);
      lockedTargets.set(effect.id, targets);

      const parts = effect.parts.filter(part => part.sublayer === sublayer);

      if (targets.length === 0) {
        skipped.push({ effectId: effect.id, sublayer, reason: 'no-targets' });
        // It still counts as applied: CR 613.6 locks the (empty) set, and an
        // effect that found nothing this layer must not be re-evaluated later.
        hasApplied.add(effect.id);
        continue;
      }

      for (const id of targets) {
        const object = objects[id];
        if (!object) continue;
        for (const part of parts) {
          applyModification(object, part.modification, ctx, detail => {
            unsupported.push({ effectId: effect.id, sublayer, detail });
          });
        }
      }

      hasApplied.add(effect.id);
      trace.push({ sublayer, effectId: effect.id, targets, note: effect.note });
    }
  }

  const out: Record<ObjectId, LayeredCharacteristics> = {};
  for (const id of order) {
    const { switchCount: _switchCount, ...rest } = objects[id];
    out[id] = rest;
  }

  return { objects: out, order, trace, skipped, unsupported };
}

/**
 * Layer 7d. Counters are state on the object rather than continuous effects, so
 * they are applied by the engine itself and never appear in the effect list.
 *
 * Nothing here annihilates +1/+1 against -1/-1: that is a state-based action
 * (CR 704.5q), it happens outside the layer system, and doing it here would make
 * the layer computation destructive.
 */
function applyCounterLayer(
  objects: Record<ObjectId, Working>,
  order: ObjectId[],
  trace: AppliedStep[]
): void {
  const touched: ObjectId[] = [];
  for (const id of order) {
    const object = objects[id];
    if (!object || object.power === null || object.toughness === null) continue;
    const delta = counterPT(object.counters);
    if (delta.power === 0 && delta.toughness === 0) continue;
    object.power += delta.power;
    object.toughness += delta.toughness;
    touched.push(id);
  }
  if (touched.length > 0) {
    trace.push({ sublayer: '7d', effectId: '(counters)', targets: touched, note: 'Counters' });
  }
}

/* -------------------------------------------------------------------------- */
/* Reading the result                                                         */
/* -------------------------------------------------------------------------- */

export function isCreatureCharacteristics(
  object: LayeredCharacteristics | null | undefined
): boolean {
  return !!object && object.cardTypes.includes('creature');
}

/**
 * Power as combat should use it. Power can legitimately be negative in the
 * layers (CR 613 does not clamp), but a creature deals damage equal to its power
 * only when that is positive, so combat clamps and rendering does not.
 */
export function combatPower(object: LayeredCharacteristics | null | undefined): number {
  if (!object || object.power === null) return 0;
  return Math.max(0, object.power);
}

/** The printed stat line, or `null` for anything that is not a creature. */
export function layeredStatLine(
  object: LayeredCharacteristics | null | undefined
): string | null {
  if (!object || !isCreatureCharacteristics(object)) return null;
  if (object.power === null || object.toughness === null) return null;
  return `${object.power}/${object.toughness}`;
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

interface BuilderCommon {
  id: EffectId;
  timestamp: number;
  sourceId?: ObjectId;
  fromAbility?: string;
  controllerId?: PlayerId;
  note?: string;
  provides?: DependencyKey[];
  dependsOn?: DependencyKey[];
  dependsOnEffects?: EffectId[];
}

function build(common: BuilderCommon, affects: Selector, parts: EffectPart[]): ContinuousEffect {
  return {
    id: common.id,
    timestamp: common.timestamp,
    sourceId: common.sourceId,
    fromAbility: common.fromAbility,
    controllerId: common.controllerId,
    note: common.note,
    provides: common.provides,
    dependsOn: common.dependsOn,
    dependsOnEffects: common.dependsOnEffects,
    affects,
    parts,
  };
}

/**
 * "Creatures you control get +1/+1" and every relative of it. Layer 7c.
 *
 * Defaults to creatures the effect's controller controls, which is the shape
 * roughly every anthem in Magic has; pass `affects` for the exceptions.
 */
export function anthemEffect(
  common: BuilderCommon & { power?: DynamicValue; toughness?: DynamicValue; affects?: Selector }
): ContinuousEffect {
  const affects: Selector =
    common.affects ?? { kind: 'match', cardTypes: ['creature'], controller: 'you' };
  return build(
    { ...common, provides: common.provides ?? ['modify-pt'] },
    affects,
    [
      {
        sublayer: '7c',
        modification: {
          kind: 'modify-pt',
          power: common.power ?? 0,
          toughness: common.toughness ?? 0,
        },
      },
    ]
  );
}

/** "… has base power and toughness 1/1". Layer 7b unless told it is a CDA. */
export function setBasePTEffect(
  common: BuilderCommon & {
    affects: Selector;
    power?: DynamicValue | null;
    toughness?: DynamicValue | null;
    /** Pass `'7a'` only for a characteristic-defining ability on the object itself. */
    sublayer?: '7a' | '7b';
  }
): ContinuousEffect {
  return build({ ...common, provides: common.provides ?? ['set-pt'] }, common.affects, [
    {
      sublayer: common.sublayer ?? '7b',
      modification: { kind: 'set-pt', power: common.power, toughness: common.toughness },
    },
  ]);
}

/** "… gains flying" / "… loses all abilities". Layer 6. */
export function abilityEffect(
  common: BuilderCommon & {
    affects: Selector;
    add?: string[];
    remove?: string[];
    removeAll?: boolean;
  }
): ContinuousEffect {
  const provides = common.provides ?? [
    ...(common.add?.length ? ['adding-ability'] : []),
    ...(common.removeAll || common.remove?.length ? ['removing-ability'] : []),
  ];
  return build({ ...common, provides }, common.affects, [
    {
      sublayer: '6a',
      modification: {
        kind: 'ability',
        addAbilities: common.add,
        removeAbilities: common.remove,
        removeAllAbilities: common.removeAll,
      },
    },
  ]);
}

/** "… is a creature in addition to its other types". Layer 4. */
export function typeEffect(
  common: BuilderCommon & {
    affects: Selector;
    addCardTypes?: CardType[];
    setCardTypes?: CardType[];
    removeCardTypes?: CardType[];
    addSubtypes?: string[];
    setSubtypes?: string[];
    removeAllSubtypes?: boolean;
  }
): ContinuousEffect {
  const becomes = [...(common.addCardTypes ?? []), ...(common.setCardTypes ?? [])];
  const provides =
    common.provides ??
    unique([
      ...becomes.map(t => `become-${t}` as DependencyKey),
      ...(common.addSubtypes?.length || common.setSubtypes?.length ? ['adding-subtype'] : []),
    ]);
  return build({ ...common, provides }, common.affects, [
    {
      sublayer: '4a',
      modification: {
        kind: 'type',
        addCardTypes: common.addCardTypes,
        setCardTypes: common.setCardTypes,
        removeCardTypes: common.removeCardTypes,
        addSubtypes: common.addSubtypes,
        setSubtypes: common.setSubtypes,
        removeAllSubtypes: common.removeAllSubtypes,
      },
    },
  ]);
}

/** "… is blue" / "… is colourless". Layer 5. */
export function colorEffect(
  common: BuilderCommon & {
    affects: Selector;
    setColors?: LayerColor[];
    addColors?: LayerColor[];
    removeAllColors?: boolean;
  }
): ContinuousEffect {
  return build({ ...common, provides: common.provides ?? ['color-change'] }, common.affects, [
    {
      sublayer: '5a',
      modification: {
        kind: 'color',
        setColors: common.setColors,
        addColors: common.addColors,
        removeAllColors: common.removeAllColors,
      },
    },
  ]);
}

/** "Gain control of …". Layer 2. */
export function controlEffect(
  common: BuilderCommon & { affects: Selector; controller: PlayerId | 'you' }
): ContinuousEffect {
  return build({ ...common, provides: common.provides ?? ['control-change'] }, common.affects, [
    { sublayer: '2a', modification: { kind: 'control', controller: common.controller } },
  ]);
}

/** "Switch … power and toughness". Layer 7e. */
export function switchPTEffect(common: BuilderCommon & { affects: Selector }): ContinuousEffect {
  return build({ ...common, provides: common.provides ?? ['switch-pt'] }, common.affects, [
    { sublayer: '7e', modification: { kind: 'switch-pt' } },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Bridging to the game state                                                 */
/* -------------------------------------------------------------------------- */

const CARD_TYPE_SET = new Set<string>(CARD_TYPES);
const SUPERTYPE_SET = new Set<string>(SUPERTYPES);

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Split a type line into card types, supertypes and subtypes.
 *
 * Handles both dash characters Scryfall uses and multi-faced lines joined with
 * ` // ` by taking the union, which is right for split/adventure cards on the
 * battlefield in every case this engine can currently reach.
 */
export function parseTypeLine(typeLine: string | undefined): {
  cardTypes: CardType[];
  supertypes: string[];
  subtypes: string[];
} {
  const cardTypes: CardType[] = [];
  const supertypes: string[] = [];
  const subtypes: string[] = [];
  if (!typeLine) return { cardTypes, supertypes, subtypes };

  for (const face of typeLine.split('//')) {
    const [left, right] = face.split(/[—–-]/);
    for (const word of (left ?? '').trim().toLowerCase().split(/\s+/)) {
      if (!word) continue;
      if (SUPERTYPE_SET.has(word)) supertypes.push(word);
      else if (CARD_TYPE_SET.has(word)) cardTypes.push(word as CardType);
      // "tribal" was renamed "kindred"; accept the old printing.
      else if (word === 'tribal') cardTypes.push('kindred');
    }
    for (const word of (right ?? '').trim().toLowerCase().split(/\s+/)) {
      if (word) subtypes.push(word);
    }
  }

  return {
    cardTypes: unique(cardTypes),
    supertypes: uniqueLower(supertypes),
    subtypes: uniqueLower(subtypes),
  };
}

/**
 * A `CardInstance` as base characteristics.
 *
 * Two documented approximations, both inherited from the rest of the engine:
 *
 *   - colour comes from `colorIdentity`, which is not the same thing as colour
 *     (`keywords.ts` makes the same trade for protection and says so);
 *   - base abilities are `effectiveKeywords`, so a hand-flagged keyword is a real
 *     ability as far as the layers are concerned — which is the whole point of
 *     the manual controls.
 *
 * `powerOverride`/`toughnessOverride` become the base value, so "set to 4/4" and
 * "add two +1/+1 counters" compose in the order a player expects: 7b then 7d.
 */
export function baseObjectFromCard(card: CardInstance): BaseObject {
  const { cardTypes, supertypes, subtypes } = parseTypeLine(card.typeLine);
  const colors = (card.colorIdentity ?? []).filter((c): c is LayerColor =>
    LAYER_COLORS.includes(c as LayerColor)
  );

  return {
    id: card.instanceId,
    name: card.name,
    controller: card.controllerId,
    owner: card.ownerId,
    cardTypes,
    supertypes,
    subtypes,
    colors,
    abilities: effectiveKeywords(card),
    power: card.powerOverride ?? parseNumber(card.power),
    toughness: card.toughnessOverride ?? parseNumber(card.toughness),
    manaValue: card.cmc ?? 0,
    counters: card.counters ?? {},
  };
}

/**
 * Every permanent on every battlefield, in a deterministic order: seat order,
 * then each player's battlefield array order. Both are already deterministic and
 * replicated, so every client builds the identical list.
 */
export function baseObjectsFromState(state: GameState): BaseObject[] {
  const out: BaseObject[] = [];
  for (const player of state.players) {
    for (const id of player.zones.battlefield) {
      const card = state.cards[id];
      if (card) out.push(baseObjectFromCard(card));
    }
  }
  return out;
}

/**
 * Convenience: compute layers straight from game state.
 *
 * `effects` is passed in rather than read off the state because the state does
 * not carry a continuous-effect list yet — the oracle-text compiler is what will
 * produce one. Until then this returns correct characteristics for counters,
 * hand-set base P/T and hand-flagged keywords, which is exactly what the current
 * engine already models, and it does it through the same code path the compiler
 * will use.
 */
export function computeStateLayers(
  state: GameState,
  effects: readonly ContinuousEffect[] = []
): LayerResult {
  return computeLayers({ objects: baseObjectsFromState(state), effects: [...effects] });
}
