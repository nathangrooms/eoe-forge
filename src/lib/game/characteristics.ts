/**
 * DeckMatrix — the one question everything asks: what are this object's
 * characteristics *right now*?
 *
 * This module is the seam that was missing. `layers.ts` implemented CR 613 in
 * full and `abilities/statics.ts` learned to feed it continuous effects, but
 * nothing that draws a board, resolves combat or drives the bot ever called
 * either. The battlefield read `combat.ts`'s `powerOf`, which is handed a
 * `CardInstance` and therefore *cannot* see an anthem — an anthem is a property
 * of the battlefield, not of the card. So a 2/2 under Glorious Anthem with a
 * +1/+1 counter rendered 3/3 while the rules, and the layer engine's own 41
 * tests, said 4/4.
 *
 * Everything now asks one of the accessors below, which is the actual fix: not
 * "the layer engine is correct" (it already was) but "there is exactly one
 * function to ask, and the board, the inspector, combat and the bot all ask it".
 * Two of them disagreeing is the class of bug this file exists to make
 * impossible.
 *
 * ## Performance: computed once per state, not once per card
 *
 * `computeLayers` takes the whole battlefield, so calling it per card per render
 * is O(n²) and would be visible at four-player Commander board sizes. It is
 * instead computed **once per `GameState` object** and memoised on that object's
 * identity, in `abilities/statics.ts`'s `LAYER_CACHE`.
 *
 * Identity is a soundcache key here for a specific reason: `applyAction` is a
 * pure reducer that returns a *new* object on every change and never mutates in
 * place. So a given `GameState` reference can only ever describe one board, and
 * a cache keyed on it can be stale only if someone mutates state — which the
 * reducer's own replay tests already forbid. The map is a `WeakMap`, so
 * superseded states are collected rather than accumulating over a long game.
 *
 * The consequence for React: call these with the `GameState` you already have.
 * Do **not** wrap them in a `useMemo` keyed on anything else, and do not build a
 * context value that recomputes per render — the memo is on the state object, so
 * a hundred components asking during one render share one computation and every
 * render after that is a `WeakMap` hit.
 *
 * ## Determinism
 *
 * Nothing here reads a clock or a random source, and nothing mutates. The
 * effect list is rebuilt from the battlefield in seat order with timestamps
 * taken from scan position, so two clients replaying the same action log
 * compute byte-identical characteristics. Memoisation changes speed and nothing
 * else: dropping every cache in this file would change no result.
 *
 * ## Off the battlefield
 *
 * The layer engine only covers permanents on a battlefield. A card in hand, in
 * a graveyard or on the stack has no layered entry, and every accessor here
 * falls back to its printed value for those. That is correct — an anthem does
 * not pump a creature card in your hand — and it keeps the inspector working
 * for cards it is asked about in any zone.
 */

import type { CardInstance, GameState, InstanceId, PlayerId } from './types.ts';
import type { LayeredCharacteristics, LayerResult } from './layers.ts';
import { combatPower, isCreatureCharacteristics } from './layers.ts';
import { layeredState } from './abilities/statics.ts';
import { parseTypeLine } from './abilities/context.ts';
import { effectiveKeywords } from './keywords.ts';
import { hasVariablePT, powerOf, statLine, toughnessOf } from './printed.ts';

/** Anything that names a permanent: the id, or the instance itself. */
export type CardRef = InstanceId | CardInstance | null | undefined;

function refId(ref: CardRef): InstanceId | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? ref : ref.instanceId;
}

function refCard(state: GameState, ref: CardRef): CardInstance | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? state.cards[ref] : ref;
}

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every permanent's current characteristics, with every static ability applied.
 *
 * One `computeLayers` run per state, memoised on state identity. Call it freely.
 */
export function boardCharacteristics(state: GameState): LayerResult {
  return layeredState(state);
}

/** One permanent's layered characteristics, or `undefined` off the battlefield. */
export function characteristicsOf(
  state: GameState,
  ref: CardRef
): LayeredCharacteristics | undefined {
  const id = refId(ref);
  if (!id) return undefined;
  return boardCharacteristics(state).objects[id];
}

/* -------------------------------------------------------------------------- */
/* Power and toughness                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Current power, or `null` when the engine genuinely does not know it.
 *
 * `null` means a characteristic-defining `*` the engine cannot evaluate —
 * Tarmogoyf's `*`, Mortivore's `*`. It is not a failure to be papered over with
 * a zero; it is the signal that the UI should print the `*` and offer the manual
 * override. See `ptIsUnknownIn`.
 */
export function powerIn(state: GameState, ref: CardRef): number | null {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.power;

  const card = refCard(state, ref);
  if (!card) return null;
  return hasVariablePT(card) ? null : powerOf(card);
}

/** Current toughness, or `null` when it is an unevaluated `*`. */
export function toughnessIn(state: GameState, ref: CardRef): number | null {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.toughness;

  const card = refCard(state, ref);
  if (!card) return null;
  return hasVariablePT(card) ? null : toughnessOf(card);
}

/**
 * Power as combat and the bot should use it.
 *
 * Clamped at zero and `null` collapsed to zero, matching what `powerOf` always
 * did: CR 613 does not clamp power, but a creature deals damage equal to its
 * power only when that is positive. Rendering must NOT use this — a `-1/1` shows
 * `-1`, and an unknown `*` must not print as `0`.
 */
export function combatPowerIn(state: GameState, ref: CardRef): number {
  const layered = characteristicsOf(state, ref);
  if (layered) return combatPower(layered);

  const card = refCard(state, ref);
  return card ? powerOf(card) : 0;
}

/**
 * Toughness as combat and the bot should use it: `null` collapsed to zero, and
 * deliberately *not* clamped, because a creature at zero or less toughness dies
 * and `sba.ts` needs to see that.
 */
export function combatToughnessIn(state: GameState, ref: CardRef): number {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.toughness ?? 0;

  const card = refCard(state, ref);
  return card ? toughnessOf(card) : 0;
}

/**
 * True when power or toughness is a `*` the engine has not evaluated, so the
 * caller should show the printed text and offer a manual override rather than
 * print a number nobody computed.
 */
export function ptIsUnknownIn(state: GameState, ref: CardRef): boolean {
  const card = refCard(state, ref);
  if (!card) return false;

  const layered = characteristicsOf(state, ref);
  if (layered) {
    if (!isCreatureCharacteristics(layered)) return false;
    return layered.power === null || layered.toughness === null;
  }
  return hasVariablePT(card);
}

/**
 * The stat line a battlefield card should display, with layers applied.
 *
 * `null` for anything that is not currently a creature — which is a layered
 * question, so an animated Gideon or a Dryad Arbor land answers correctly.
 *
 * When the engine does not know a `*`, this returns the **printed** text
 * (Tarmogoyf shows its printed star over `1+*`) rather than inventing a number.
 * Project law: nothing fabricated.
 */
export function statLineIn(state: GameState, ref: CardRef): string | null {
  const card = refCard(state, ref);
  const layered = characteristicsOf(state, ref);

  if (!layered) return card ? statLine(card) : null;
  if (!isCreatureCharacteristics(layered)) return null;

  if (layered.power === null || layered.toughness === null) {
    if (!card) return null;
    return `${card.power ?? '*'}/${card.toughness ?? '*'}`;
  }
  return `${layered.power}/${layered.toughness}`;
}

/* -------------------------------------------------------------------------- */
/* Types, colours, abilities                                                  */
/* -------------------------------------------------------------------------- */

/** Current card types, lowercase — type-changing effects applied. */
export function typesIn(state: GameState, ref: CardRef): string[] {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.cardTypes.map(String);
  const card = refCard(state, ref);
  return card ? printedTypeWords(card).types : [];
}

/** Current subtypes, lowercase. */
export function subtypesIn(state: GameState, ref: CardRef): string[] {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.subtypes;
  const card = refCard(state, ref);
  return card ? printedTypeWords(card).subtypes : [];
}

/** Current supertypes, lowercase. */
export function supertypesIn(state: GameState, ref: CardRef): string[] {
  const layered = characteristicsOf(state, ref);
  return layered ? layered.supertypes : [];
}

/** Current colours as single-letter codes. */
export function colorsIn(state: GameState, ref: CardRef): string[] {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.colors.map(String);
  const card = refCard(state, ref);
  return (card?.colorIdentity ?? []).map(String);
}

/**
 * Current abilities and keywords, lowercase, layer 6 applied — so a granted
 * flying is present and a stripped one is gone.
 */
export function keywordsIn(state: GameState, ref: CardRef): string[] {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.abilities;
  const card = refCard(state, ref);
  return card ? effectiveKeywordsFallback(card) : [];
}

/** Does this permanent currently have this keyword? Layer 6 applied. */
export function hasKeywordIn(state: GameState, ref: CardRef, keyword: string): boolean {
  return keywordsIn(state, ref).includes(keyword.toLowerCase());
}

/** Is this permanent currently a creature? Layer 4 applied. */
export function isCreatureIn(state: GameState, ref: CardRef): boolean {
  const layered = characteristicsOf(state, ref);
  if (layered) return isCreatureCharacteristics(layered);
  const card = refCard(state, ref);
  return card ? printedTypeWords(card).types.includes('creature') : false;
}

/** Who currently controls this permanent? Layer 2 applied, so a Mind Control counts. */
export function controllerIn(state: GameState, ref: CardRef): PlayerId | undefined {
  const layered = characteristicsOf(state, ref);
  if (layered) return layered.controller;
  return refCard(state, ref)?.controllerId;
}

/* -------------------------------------------------------------------------- */
/* Off-battlefield fallbacks                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Printed type words for a card with no layered entry, via the existing
 * `parseTypeLine` rather than a third type-line parser. Two parsers that
 * disagree about "Legendary Creature — Elf Druid" is the same class of bug this
 * module was written to remove.
 */
function printedTypeWords(card: CardInstance): { types: string[]; subtypes: string[] } {
  const parsed = parseTypeLine(card.typeLine);
  return { types: parsed.types, subtypes: parsed.subtypes };
}

/** Printed keywords plus anything the player flagged by hand, via `keywords.ts`. */
function effectiveKeywordsFallback(card: CardInstance): string[] {
  return effectiveKeywords(card);
}
