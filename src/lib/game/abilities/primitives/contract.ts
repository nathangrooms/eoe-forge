/**
 * DeckMatrix — the engine-primitive contract.
 *
 * A **primitive** is the smallest unit of engine behaviour that a specification
 * can describe and four gates can check: it takes data, returns data, and
 * touches nothing. `scripts/primitives/SPEC-FORMAT.md` is the spec side; this is
 * the type side.
 *
 * ## Why primitives return instead of push
 *
 * `to-actions.ts` accumulates into a `RunScope` because it is one recursive
 * walk. A primitive cannot: a function handed a mutable sink is not checkably
 * pure, and "did it mutate its argument" is precisely what the purity gate has
 * to decide by reading the AST. Returning a fresh `PrimitiveResult` makes the
 * question decidable — any assignment reachable from a parameter is a rejection,
 * with no exceptions to argue about.
 *
 * Adoption is therefore one line per case in the existing switch:
 *
 *   case 'pump': return merge(scope, pumpToContinuous(effect, ctx, env));
 *
 * and the switch keeps its `assertNever`, so a new effect verb stays a compile
 * error rather than a card that quietly does nothing.
 *
 * ## Determinism
 *
 * `PrimitiveEnv` carries every varying input a primitive is allowed to see.
 * There is no clock in it and no random source, because there is no clock or
 * random source anywhere in this folder. `idPrefix` and `ordinal` come from game
 * state — a stack id, or `${version}:${n}` — so two clients replaying one action
 * log mint identical ids and stay in step. That is the property
 * `abilities/index.ts` promises and the purity gate enforces.
 */

import type { GameAction } from '../../types.ts';
import type { ContinuousEffect } from '../../layers.ts';

/**
 * Everything a primitive may know beyond its effect and the game state.
 *
 * Deliberately tiny. Every field here is derived from state or from the
 * originating action; nothing is ambient.
 */
export interface PrimitiveEnv {
  /**
   * Seed for derived ids. From state — a stack id, or `${version}:${ordinal}`.
   * Never a uuid: two clients would mint different ids for the same token and
   * replay would diverge on the next zone change.
   */
  idPrefix: string;
  /** Position of this primitive's invocation within one resolution. Monotonic. */
  ordinal: number;
  /** Epoch ms carried in from the originating action. Nothing here reads a clock. */
  at: number;
  /** Prefixed onto log lines: "Giant Growth — resolves". */
  cause?: string;
  /**
   * CR 613 timestamp for any continuous effect produced. Caller-supplied and
   * monotonic, from `state.version` — never a wall clock, or "the last anthem
   * wins" would mean different things on two screens.
   */
  timestamp: number;
}

/**
 * What a primitive produces. All three lists are freshly allocated; a primitive
 * never receives one to append to.
 *
 * `deferred` is not an error channel. It is the engine saying out loud that a
 * decision belongs to a player — which card to discard, whether to take a "you
 * may" — and the caller turns each entry into a `NOTE`. An empty `deferred` with
 * an empty `actions` is the one shape that is always a bug, because a trigger
 * that fires and leaves no trace is indistinguishable from one that never fired.
 */
export interface PrimitiveResult {
  actions: GameAction[];
  deferred: string[];
  continuous: ContinuousEffect[];
}

/** The empty result. A helper, so no primitive hand-rolls a different shape. */
export function nothing(): PrimitiveResult {
  return { actions: [], deferred: [], continuous: [] };
}

/** One deferral and nothing else. */
export function defer(...messages: string[]): PrimitiveResult {
  return { actions: [], deferred: [...messages], continuous: [] };
}

/** Actions and nothing else. */
export function acted(actions: GameAction[]): PrimitiveResult {
  return { actions, deferred: [], continuous: [] };
}

/**
 * Fold several results into one, in order. Allocates; never writes into an
 * argument, so it is itself gate-clean and can be used inside a primitive.
 */
export function concatResults(results: readonly PrimitiveResult[]): PrimitiveResult {
  return {
    actions: results.flatMap(r => r.actions),
    deferred: results.flatMap(r => r.deferred),
    continuous: results.flatMap(r => r.continuous),
  };
}

/**
 * Deterministic id for anything a primitive mints — a continuous effect, a
 * token. Derived from state-supplied inputs only.
 */
export function derivedId(env: PrimitiveEnv, kind: string, n: number): string {
  return `${env.idPrefix}-${kind}${env.ordinal}.${n}`;
}
