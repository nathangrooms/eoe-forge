/**
 * DeckMatrix — the oracle-text ability compiler.
 *
 *   import { compileCardAbilities } from '@/lib/cards/abilities';
 *
 *   const abilities = compileCardAbilities(cardRow);
 *   if (abilities.coverage !== 'full') {
 *     // the card still plays; it carries a marker and a note. It never
 *     // pretends to have resolved something it did not.
 *   }
 *
 * Files, in reading order:
 *
 *   - `dsl.ts`          the type space. Pure JSON, no functions, no closures.
 *                       Moves to `@/lib/game/ability-dsl` when that lands; this
 *                       folder imports its types from here and nowhere else, so
 *                       the move is a one-file edit.
 *   - `normalize.ts`    oracle text -> paragraphs, with reminder text stripped,
 *                       the card's own name and its post-2024 self-references
 *                       collapsed to `~`, and spans that let the compiler prove
 *                       it read everything.
 *   - `grammar.ts`      counts, noun phrases, players, durations, keywords.
 *   - `effect-rules.ts` what an ability DOES -> the closed `Effect` vocabulary.
 *   - `clause-rules.ts` what KIND of ability it is: trigger, cost, static,
 *                       replacement, keyword line.
 *   - `compiler.ts`     the orchestrator, and `assertClausesAccounted`.
 *   - `coverage.ts`     catalogue-wide measurement.
 *
 * The one rule everything else follows: precision over recall. A wrong ability
 * silently corrupts a game; a missing one is visible, marked, and resolved by
 * hand in two taps. Every parser in here returns `null` rather than guessing,
 * and every `null` becomes a counted, named gap.
 */

export * from './dsl.ts';
export * from './normalize.ts';
export * from './grammar.ts';
export * from './effect-rules.ts';
export * from './clause-rules.ts';
export * from './compiler.ts';
export * from './coverage.ts';
