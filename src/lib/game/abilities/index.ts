/**
 * DeckMatrix — the ability bridge.
 *
 *   import { abilitiesFor, layeredState, runEffects } from '@/lib/game/abilities';
 *
 * ## Why this folder exists
 *
 * Two finished halves needed a seam.
 *
 *   - `src/lib/cards/abilities/` owns the ability DSL and the oracle-text
 *     compiler. It turns a catalogue row into `CardAbilities` and proves, with
 *     clause accounting, that no text was silently dropped. It knows nothing
 *     about a game in progress, on purpose, so it can run over all 34,088 rows.
 *   - `src/lib/game/` owns the reducer, the stack, the CR 613 layer engine,
 *     replacement effects and state-based actions. It knows nothing about
 *     oracle text.
 *
 * Neither could reach the other. This folder is the only place they meet:
 *
 *   - `card-abilities.ts` — a `CardInstance` in play → its `CardAbilities`
 *   - `context.ts`        — a `Selector` stops being a shape and names real
 *                           permanents on a real battlefield
 *   - `statics.ts`        — `StaticAbility.modifications` → `ContinuousEffect[]`
 *                           for `computeLayers`. `layers.ts` says outright that
 *                           the compiler is what will produce this list; this is
 *                           that producer.
 *   - `to-actions.ts`     — the ONE switch over `Effect`, producing `GameAction[]`
 *
 * ## The two properties everything here preserves
 *
 * **Pure.** No clock, no `Math.random`, no uuid. Token ids are derived from
 * `state.version` and an ordinal, selectors iterate in seat order, and
 * continuous effects are recomputed from the battlefield rather than written
 * into it. Two clients replaying one action log land on byte-identical state.
 *
 * **Honest.** Every decision the engine declines to make for a player comes
 * back in `EffectRun.deferred` and becomes a `NOTE` quoting it verbatim. There
 * is no path that resolves an ability carrying a manual clause without saying
 * so. A card either resolves completely, or visibly says what is left — never a
 * third state.
 */

export * from './card-abilities.ts';
export * from './context.ts';
export * from './statics.ts';
export * from './to-actions.ts';
