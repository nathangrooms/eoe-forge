/**
 * A deterministic, data-driven synergy engine.
 *
 * WHAT THIS IS
 * ------------
 * A prototype answer to "can we score card synergy in-house, from data, without
 * calling an AI?". It scores a pair of cards from two independent signals:
 *
 *   1. **Observed co-occurrence** across 184 real Commander precons, corrected
 *      for card ubiquity and for colour identity. This is evidence.
 *   2. **Oracle-text mechanics, tribal type and explicit textual reference**,
 *      read from the 34,088-card Scryfall table we already sync. This is
 *      inference, and it is labelled as such via `confidence`.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a replacement for the AI builder, and the measured numbers say why:
 *
 *   • The corpus holds 6,144 distinct non-basic cards. Our `cards` table holds
 *     31,829 Commander-legal names, so the corpus has *seen* 19% of the pool.
 *   • 3,631 of those 6,144 (59.1%) appear in exactly one deck and therefore
 *     carry no co-occurrence signal at all. Only 2,513 cards appear twice or
 *     more — 7.9% of the legal pool.
 *   • Of 458,724 observed card pairs, 4,702 clear a support of 5, and only
 *     1,040 of those have a non-land on both sides.
 *   • Scoring real precon decks against the corpus, only 15.1% of their own
 *     internal card pairs clear the significance floor (per-deck median 13.8%,
 *     range 6–26%). The other ~85% fall back to text heuristics.
 *   • The corpus contains 169 distinct commanders against 3,363 legendary
 *     creatures in the table — 5% commander coverage.
 *
 * So the co-occurrence half is high-precision and very low-recall. It can say
 * something confident about staples and precon-adjacent archetypes, and nothing
 * at all about the long tail. Treat it as a *supplement* that grounds and
 * explains recommendations, not as a generative builder.
 *
 * Our own decks are not a usable second corpus and will not be for a long time:
 * `deck_cards` currently spans 8 decks with any cards, the single highest pair
 * co-occurrence is 2, and no pair occurs 3 times. That is measured, not
 * assumed. Revisit at a few thousand decks.
 *
 * USAGE
 * -----
 * ```ts
 * import { loadPreconIndex, scorePair } from '@/lib/synergy';
 *
 * const engine = await loadPreconIndex();       // one dynamic import, memoised
 * const result = scorePair(engine, cardA, cardB); // pure, synchronous
 * ```
 *
 * `cardA`/`cardB` are structural subsets of `cards` rows, so anything from
 * `lib/deck/deckCards` or `lib/precons/precon-api` can be passed directly.
 *
 * Nothing in this directory imports React, Supabase, or performs I/O beyond the
 * single memoised dynamic import of the generated corpus.
 */

export type {
  Color,
  CooccurrenceEvidence,
  Mechanic,
  SynergyBreakdown,
  SynergyCard,
  SynergyReason,
  SynergyRecommendation,
  SynergyResult,
  SynergyWeights,
} from './types';
export { DEFAULT_WEIGHTS } from './types';

export {
  buildCorpusIndex,
  cardId,
  cooccurrence,
  decksContaining,
  eligibleDecks,
  eligibleForBoth,
  frequencyOf,
  inferIdentity,
  loadPreconIndex,
  neighboursOf,
  resetPreconIndex,
  type CorpusIndex,
} from './corpus';

export {
  associate,
  associationConfidence,
  associationScore,
  clamp01,
  MIN_ELIGIBLE,
  MIN_SUPPORT,
  type Association,
} from './association';

export {
  canonicalIdentityKey,
  colorIdentityKey,
  detectMechanics,
  fitsIdentity,
  isType,
  mechanicOverlap,
  mechanicWeight,
  sharedCreatureTypes,
  subtypesOf,
  textualReferences,
} from './mechanics';

export {
  evidenceFor,
  identityCompatibility,
  isManaBase,
  profile,
  recommendFromCorpus,
  scoreDeck,
  scorePair,
  scoreProfiles,
  type CardProfile,
  type SynergyEngine,
} from './score';

export { runSynergySelfTest, type CheckResult } from './selftest';
