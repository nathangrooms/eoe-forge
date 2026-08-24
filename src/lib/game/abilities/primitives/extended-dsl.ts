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

import type { Effect, Selector, ValueExpr } from '../../../cards/abilities/dsl.ts';

/*
 * `ScryEffect` and `SurveilEffect` used to be declared here. They were promoted
 * into `dsl.ts`'s `Effect` union on 24 Aug 2026, by the route this file's
 * header sets out: staged here, primitive written and gated, member moved,
 * `to-actions.ts` failed to compile, its new cases delegate to the primitives
 * that already passed. `library-order.ts` is unchanged apart from where it
 * imports its argument type from.
 *
 * `RegenerateEffect` stays. Its primitive builds the shield and nothing in
 * `sba.ts` spends one, so promoting it would put a verb in the shipped union
 * that makes a card look saved and lets it die. The verb moves when the
 * destruction path spends the shield, and not before.
 */

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

export type ExtendedEffect = RegenerateEffect;

/** Every verb a primitive in this folder can handle, shipped or staged. */
export type AnyEffect = Effect | ExtendedEffect;

/** The discriminant, which is what the registry is keyed on. */
export type AnyEffectDo = AnyEffect['do'];
