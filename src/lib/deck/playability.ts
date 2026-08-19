/**
 * Moved. Exact castability now lives in the engine.
 *
 * `src/engine/playability/castability.ts` is the only copy, and it is now what
 * the power score is computed from as well as what the deck page displays.
 * Before this move there were two: this exact one, used for display, and a
 * Monte Carlo approximation in `deckbuilder/score/simulation.ts` that the power
 * score was actually built on. They could disagree and nothing reconciled them.
 *
 * This file stays so the twenty-odd components importing `@/lib/deck/playability`
 * keep working. Nothing is reimplemented here.
 */
export * from '../../engine/playability/castability.ts';
