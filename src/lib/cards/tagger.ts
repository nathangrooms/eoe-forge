/**
 * Moved. The card tagging rules now live in the engine.
 *
 * `src/engine/knowledge/tagger.ts` is the only copy. This file stays so the
 * fourteen modules that already import `@/lib/cards/tagger` keep working, and
 * so the deck-optimizer's vendored tree can mirror `src/engine/` one to one
 * without dragging half of `src/lib/` along with it.
 *
 * Nothing is reimplemented here. If you are adding a rule, add it in the
 * engine.
 */
export * from '../../engine/knowledge/tagger.ts';
