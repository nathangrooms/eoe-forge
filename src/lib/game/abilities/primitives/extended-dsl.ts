/**
 * DeckMatrix — effect verbs the DSL does not have yet.
 *
 * Three of the twenty specified primitives (`scry`, `surveil`, `regenerate`)
 * implement behaviour that `src/lib/cards/abilities/dsl.ts` has no member for.
 * A primitive cannot be written against a verb that does not exist, so the verb
 * is declared here, next to its handler, rather than added to the shipped union
 * before anyone has seen it work.
 *
 * ## Why this is a staging file and not a fork of the DSL
 *
 * `dsl.ts` is authored by the compiler owner and consumed by the engine. Adding
 * a member to `Effect` is a breaking change on purpose: `to-actions.ts` has one
 * switch over that union ending in a throw, so a new member forces a handler and
 * cannot become a card that quietly does nothing. That property is worth more
 * than the convenience of editing the union early.
 *
 * So the promotion order is: verb here → primitive written and gated → the union
 * member moves into `dsl.ts` → the switch fails to compile → the case delegates
 * to the primitive that already passed. Nothing ships half-adopted, and the
 * compile error arrives at the moment it is useful rather than months earlier.
 *
 * When a member is promoted, delete it here. `ExtendedEffect` shrinking to
 * `never` is the signal that this file has done its job.
 */

import type { Effect, PlayerSelector, Selector, ValueExpr } from '../../../cards/abilities/dsl.ts';

/**
 * CR 701.18. Look at the top N of your library, then put any number of them on
 * the bottom and the rest back on top in any order.
 */
export interface ScryEffect {
  do: 'scry';
  who: PlayerSelector;
  count: ValueExpr;
}

/**
 * CR 701.44. Look at the top N, then put any number into your graveyard and the
 * rest back on top in any order. Same decision shape as scry, different
 * destination — and a player reading the log has to be able to tell which one
 * happened, so they are two verbs and not one parameterised verb.
 */
export interface SurveilEffect {
  do: 'surveil';
  who: PlayerSelector;
  count: ValueExpr;
}

/**
 * CR 701.15. The next time this permanent would be destroyed this turn, instead
 * tap it, remove it from combat and heal all damage marked on it.
 *
 * `count` is how many shields to add. Shields stack — two regenerate effects on
 * one creature save it twice — which is why this is a number and not a flag.
 */
export interface RegenerateEffect {
  do: 'regenerate';
  what: Selector;
  count: ValueExpr;
}

export type ExtendedEffect = ScryEffect | SurveilEffect | RegenerateEffect;

/** Every verb a primitive in this folder can handle, shipped or staged. */
export type AnyEffect = Effect | ExtendedEffect;

/** The discriminant, which is what the registry is keyed on. */
export type AnyEffectDo = AnyEffect['do'];
