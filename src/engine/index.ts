/**
 * DeckMatrix's engine: the one place that answers what a card is, what a deck
 * is, how castable it is, how strong it is, and what should change.
 *
 * THE RULES THIS DIRECTORY LIVES BY
 * ---------------------------------
 * 1. **Pure.** Nothing under `src/engine/` may import React, the Supabase
 *    client, a `@/` alias, or anything that opens a socket. Data arrives
 *    through injected sources, the way `CandidateSource` already does.
 * 2. **Relative specifiers with explicit `.ts`.** That is what lets the whole
 *    tree be mirrored byte for byte into an edge function.
 * 3. **One implementation of each thing.** If a calculation exists here, no
 *    consumer keeps a private copy of it. `src/engine/engine-parity.test.ts`
 *    enforces 1 and 2 mechanically; 3 is enforced by review and by
 *    `one-brain.test.ts`, which pins the score the deck page shows to the score
 *    the optimiser reasons about.
 *
 * WHAT IS DELIBERATELY NOT IN HERE
 * --------------------------------
 * - `src/lib/game/**`, the rules engine. It resolves what *happens*; this
 *   judges what is *good*. Two different state models, correctly separate.
 *   The play-mode bot should consume `evaluateDeck` through this interface
 *   rather than carrying its own "is this worth casting" heuristics.
 * - The AI prompt layers (`mtg-brain`, the prompt half of `deck-optimizer`).
 *   They are model calls, not deterministic computation. They become consumers
 *   of engine output, grounded in engine numbers. Purity is the point.
 * - The edhpowerlevel scrape. It is a third party's number and cannot be
 *   unified by definition. It is a calibration input, never an authority.
 */

/* What is this card, and what is a deck made of. */
export * from './core/card.ts';
export * from './core/types.ts';

/* What does this card do. */
export {
  deriveCardTags,
  normalizeOracleText,
  TAG_RULES,
  ALL_TAGS,
  type TaggerCard,
  type TagRule,
} from './knowledge/tagger.ts';
export {
  signalTags,
  sharedTags,
  sharedTagScore,
  tagWeight,
  isSignalTag,
  ALIAS_TAGS,
} from './knowledge/tag-signal.ts';

/* How castable is it. Exact, not simulated. */
export * from './playability/castability.ts';

/* How strong is it, and why. */
export {
  computePower,
  weightedMean,
  subscoreValues,
  POWER_BANDS,
  LOGISTIC,
  SUBSCORE_ORDER,
  SUBSCORE_LABELS,
  SUBSCORE_DESCRIPTIONS,
  SUBSCORE_WEIGHTS,
  SUBSCORE_KEYS,
  LOW_CASTABILITY_PCT,
  bandForScore,
  bracketIdForScore,
  type PowerResult,
  type PowerBand,
  type BracketId,
  type Subscore,
  type Contribution,
  type SubscoreKey,
  type ComputePowerOptions,
} from './power/score.ts';

/* What should change. */
export { recommend, type CandidateSource } from './advise/index.ts';
export {
  deriveDeckProfile,
  roleShortfall,
  gapRoles,
  type DeckProfileInput,
} from './advise/profile.ts';
export { rankCandidates, scoreCandidate, ineligibility, WEIGHTS } from './advise/rank.ts';
export {
  servesRole,
  cardRole,
  roleTargetsFor,
  creatureTargetFor,
  ROLE_TAGS,
  CREATURE_TARGETS,
  DECK_STYLES,
  type DeckStyle,
} from './advise/roles.ts';

/*
 * What a card DOES, and what a commander is FOR.
 *
 * The vocabulary lives here; the producer that fills it is
 * `src/lib/deck/recommend/behaviour.ts`, outside this tree because
 * `engine-parity.test.ts` forbids the engine from importing the ability
 * compiler. A caller holding card rows with oracle text runs that producer and
 * hands the result back on `CandidateCard.facets`.
 */
export {
  planForCommander,
  planFit,
  behaviourSimilarity,
  describeSharedFacets,
  facetsOf,
  hasRecord,
  isCompleteRecord,
  facetCoverage,
  cardServesRole,
  FACET_PREFIXES,
  EFFECT_VERBS,
  REC_FULL,
  REC_PARTIAL,
  type Facet,
  type CommanderPlan,
  type Want,
  type PlanFit,
  type RoleSubject,
  type BehaviourMatch,
} from './knowledge/behaviour.ts';
export {
  buildCandidateQuery,
  normalizeRow,
  normalizeIdentity,
  isLegalIn,
  withinIdentity,
  type CandidateQuery,
  type RawCardRow,
} from './advise/query.ts';
export { chooseCuts, toCandidate, type CutTarget, type CutGrounds } from './advise/cuts.ts';

/* How to build one from nothing. Same ranker, same castability, same score. */
export {
  generateDeck,
  allocateBasics,
  pipDemand,
  type BuildCard,
  type BasicColour,
  type Bucket,
  type GenerateDeckInput,
  type GeneratedDeck,
  type GeneratedEntry,
} from './build/generate.ts';

/* The one call that answers all of it at once. */
export { evaluateDeck, type DeckEvaluation, type EvaluateDeckOptions } from './evaluate.ts';
