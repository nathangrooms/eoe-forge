/**
 * DeckMatrix — the primitive registry, and the compile error that guards it.
 *
 * `to-actions.ts` has one switch over `Effect` ending in a throw, so a new verb
 * cannot become a card that quietly does nothing. This folder must not weaken
 * that. It does not: the guard below is stricter than the switch, because it
 * fails at COMPILE time rather than when a card resolves.
 *
 * ## How the guard works
 *
 * Three sets, and they must together cover every verb:
 *
 *   - `HANDLED`      — verbs a gated primitive in this folder implements.
 *   - `ALREADY_GOOD` — verbs `to-actions.ts` already turns into correct actions.
 *                      Listed by name, not assumed, so promoting one to a
 *                      primitive is a deliberate edit in two places.
 *   - `PLAYER_CHOICE`— verbs whose deferral is CORRECT because the decision
 *                      belongs to a player. `may`, a modal spell, `manual`.
 *                      These are waiting on a decision protocol, not on a
 *                      primitive, and calling them "unimplemented" would put
 *                      them in a queue they will never come out of.
 *
 * `Uncovered` is what is left. The line
 *
 *     const _everyVerbIsAccountedFor: AssertNever<Uncovered> = true;
 *
 * does not compile unless `Uncovered` is `never`. Add a member to `Effect` and
 * this file goes red immediately, naming the verb — before any card is compiled,
 * before anything is played, and without waiting for a switch to be reached at
 * runtime.
 *
 * `tsconfig.app.json` has `strict: false`, which is why the check is written as
 * a conditional type resolving to `true` rather than as a `never` parameter:
 * `assertNever(x)` relies on narrowing that loose mode does not guarantee, and a
 * guard that silently stops guarding is worse than none.
 */

import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import type { AnyEffectDo, ExtendedEffect } from './extended-dsl.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';

import { gainControlToContinuous, pumpToContinuous } from './continuous.ts';
import { damageToPermanent } from './damage.ts';
import { addManaToActions } from './mana.ts';
import { returnFromForced, searchLibraryForced } from './zones.ts';
import { counterTargetSpell } from './stack.ts';
import { scryToActions, surveilToActions } from './library-order.ts';
import { regenerateShield } from './regenerate.ts';

/* -------------------------------------------------------------------------- */
/* The three sets                                                             */
/* -------------------------------------------------------------------------- */

export type HandledDo =
  | 'pump'
  | 'gain-control'
  | 'damage'
  | 'add-mana'
  | 'return-from'
  | 'search-library'
  | 'counter'
  | 'scry'
  | 'surveil'
  | 'regenerate';

/** Verbs `to-actions.ts` already turns into the right actions. */
export type AlreadyGoodDo =
  | 'gain-life'
  | 'lose-life'
  | 'set-life'
  | 'poison'
  | 'draw'
  | 'mill'
  | 'move-zone'
  | 'destroy'
  | 'exile'
  | 'shuffle'
  | 'create-token'
  | 'tap'
  | 'untap'
  | 'add-counters'
  | 'remove-counters'
  /* CR 301.5c / 303.4f. `to-actions.ts` builds the `ATTACH` directly: an
     attachment moving is a plain state change with no continuous effect of its
     own, because what the Equipment GRANTS is a separate static ability whose
     `{sel:'attached'}` selector the layer engine already reads. */
  | 'attach'
  | 'player-counter'
  | 'set-monarch'
  | 'lose-game'
  | 'win-game'
  | 'if'
  | 'for-each'
  | 'repeat';

/**
 * Verbs whose deferral is correct. Not a backlog: no primitive will ever
 * "implement" `may`, because taking a may on a player's behalf is not
 * automation. What these are waiting on is a decision protocol.
 */
export type PlayerChoiceDo =
  | 'may'
  | 'choose-mode'
  | 'manual'
  | 'discard'
  | 'sacrifice'
  /**
   * Added to `dsl.ts` by another author while this folder was being written, and
   * the guard below caught it on the first typecheck — which is the whole reason
   * the guard exists. Classified as a player decision: "unless that player pays"
   * asks somebody else whether to pay, and `dsl.ts` warns in its own comment that
   * getting the polarity wrong resolves the card backwards. Nothing may guess it.
   *
   * NOTE, and it is a live one: `to-actions.ts` has no `case 'unless-pays'`, so
   * `runEffect` reaches its `default` and throws for any card carrying it. That
   * is the designed loud failure rather than a silent no-op, but it is a runtime
   * throw where this file gives a compile error.
   */
  | 'unless-pays';

/**
 * The one verb that is not a verb.
 *
 * `{do:'xmage-body'}` is a POINTER at a machine-translated Java body, and the
 * body runs in `src/lib/game/xmage/` against its own facade rather than through
 * anything in this folder. It is listed on its own rather than folded into
 * `AlreadyGoodDo` because that name promises `to-actions.ts` turns the verb
 * into the right actions, and here `to-actions.ts` only forwards: what comes
 * out is decided by a translated body this project did not write by hand and
 * cannot inspect from the DSL.
 *
 * No primitive will ever handle it. A primitive takes an effect that DESCRIBES
 * something; this one describes nothing.
 */
export type ForeignBodyDo = 'xmage-body';

type Uncovered = Exclude<AnyEffectDo, HandledDo | AlreadyGoodDo | PlayerChoiceDo | ForeignBodyDo>;

/** Resolves to `true` only when `T` is `never`. Anything else is uninhabited. */
type AssertNever<T> = [T] extends [never] ? true : { ERROR_unhandled_effect_verb: T };

/**
 * The guard. If this line is red, an effect verb exists that no primitive
 * handles, `to-actions.ts` does not already handle, and nobody has declared to
 * be a player decision. The error message names it.
 */
export const _everyVerbIsAccountedFor: AssertNever<Uncovered> = true;

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

type EffectOf<K extends AnyEffectDo> = Extract<Effect | ExtendedEffect, { do: K }>;

export type Primitive<K extends AnyEffectDo> = (
  effect: EffectOf<K>,
  ctx: AbilityContext,
  env: PrimitiveEnv
) => PrimitiveResult;

/**
 * A TOTAL map over `HandledDo`. Omit an entry and this object does not compile;
 * add one whose function has the wrong effect type and it does not compile
 * either. That is the discriminated union doing the work it was chosen for.
 */
export const PRIMITIVES: { [K in HandledDo]: Primitive<K> } = {
  pump: pumpToContinuous,
  'gain-control': gainControlToContinuous,
  damage: damageToPermanent,
  'add-mana': addManaToActions,
  'return-from': returnFromForced,
  'search-library': searchLibraryForced,
  counter: counterTargetSpell,
  scry: scryToActions,
  surveil: surveilToActions,
  regenerate: regenerateShield,
};

/** Runtime lookup, for the harness and for `to-actions.ts` once it adopts these. */
export function primitiveFor(verb: AnyEffectDo): Primitive<AnyEffectDo> | undefined {
  return (PRIMITIVES as Record<string, Primitive<AnyEffectDo>>)[verb];
}
