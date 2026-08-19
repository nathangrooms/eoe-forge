/**
 * Moved. Card recommendation now lives in the engine.
 *
 * `src/engine/advise/` is the only copy. This file stays so anything importing
 * `@/lib/deck/recommend` keeps working. Nothing is reimplemented here.
 */
export * from '../../../engine/advise/index.ts';
