/**
 * The in-house recommendation engine: which cards in the catalogue are
 * genuinely plausible additions to this deck, ranked, without asking a
 * language model.
 *
 * The existing optimiser (`supabase/functions/deck-optimizer`) makes zero
 * database queries — its only external call is to an AI gateway — so every
 * card it names comes out of a model's memory, checked by nothing. It can
 * suggest a card that does not exist, one that is banned in the format, or one
 * outside the commander's colour identity, which is illegal on its face. This
 * module is the replacement for the *retrieval* half of that: every card it
 * returns is a row that exists, and every clause of every reason is a number
 * taken from that row or counted off the deck.
 *
 * The engine itself is pure — it takes a `CandidateSource` rather than opening
 * a connection — so the rules about what may legally be suggested can be
 * tested without a database.
 *
 * Usage:
 *
 * ```ts
 * const profile = deriveDeckProfile({
 *   format: 'commander',
 *   colorIdentity: ['G', 'U'],
 *   cards: deckCards,
 * });
 * const picks = await recommend(profile, source, { limit: 20 });
 * ```
 */

export * from './types.ts';
export * from './roles.ts';
export * from './profile.ts';
export * from './query.ts';
export * from './rank.ts';

import type { DeckProfile, Recommendation, RecommendOptions } from './types.ts';
import { buildCandidateQuery, normalizeRow, type CandidateQuery, type RawCardRow } from './query.ts';
import { rankCandidates } from './rank.ts';

/**
 * Supplies rows for a query.
 *
 * Injected rather than imported so this module never opens a socket. The
 * adapter that talks to Supabase lives with the caller; tests pass fixtures.
 *
 * The source is trusted for *speed*, not for *correctness*: whatever it
 * returns is re-checked against the hard filters in `rankCandidates`.
 */
export type CandidateSource = (query: CandidateQuery) => Promise<readonly RawCardRow[]>;

/**
 * Retrieve and rank candidates for a deck.
 *
 * @throws {UnindexedFormatError} when the deck's format has no supporting
 * index, rather than issuing a sequential scan of the whole table.
 */
export async function recommend(
  profile: DeckProfile,
  source: CandidateSource,
  options: RecommendOptions = {}
): Promise<Recommendation[]> {
  const query = buildCandidateQuery(profile);
  const rows = await source(query);
  const pool = rows.map(r => normalizeRow(r, profile.format));
  // The full legal pool goes in; truncation happens inside, after scoring.
  return rankCandidates(pool, profile, options);
}
