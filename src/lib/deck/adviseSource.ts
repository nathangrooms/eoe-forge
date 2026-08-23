import { supabase } from '@/integrations/supabase/client';
import type { CandidateQuery, RawCardRow } from '@/engine/advise';

/**
 * The database half of the in-house recommender.
 *
 * `src/engine/advise` is pure by design: it builds a *description* of the
 * candidate query and takes a `CandidateSource` rather than opening a socket,
 * so the rules about what may legally be suggested can be tested without a
 * database. This is the adapter that turns the description into a Supabase
 * call, and it is the only thing standing between a tested, deterministic
 * recommender and no deck surface calling it at all — which is where the census
 * found it: *"a tested local recommender that no tab calls is either the Add
 * tab's ranking and the Analysis tab's suggestions, or it is dead code with a
 * test suite. It cannot stay both."*
 *
 * ## THE ONE PLACE THIS DEVIATES FROM THE ENGINE, STATED PLAINLY
 *
 * `CandidateQuery` carries `limit: null`, and the comment on it says why: the
 * pool is filtered on hard rules only, and truncation happens after ranking,
 * because a limit applied first picks an arbitrary slice of the table and ranks
 * the leftovers.
 *
 * **This adapter applies a limit anyway**, and it is not free. Measured by the
 * engine's own note against the live catalogue, a five-colour commander's legal
 * pool is 32,881 rows, and the projected columns come to roughly 9.4 MB. That
 * is a request nobody should make from a browser to draw a list of forty
 * suggestions, and paying it on every visit to a tab would be the same class of
 * mistake as a per-row query loop, in the other direction.
 *
 * So the pool is the **{@link POOL_CAP} most-played legal cards in the deck's
 * colour identity**, ordered by `edhrec_rank` with unranked cards last. That is
 * a real change to what gets ranked and the interface must say so rather than
 * present the result as "the best cards in the format":
 *
 * - It is a popularity pre-filter, so a card nobody plays cannot be suggested
 *   even if it fits this deck perfectly.
 * - `edhrec_rank` is a Commander ordering. For a Modern or Pauper deck it is a
 *   weaker prior than it is for Commander, and it is still the only "what do
 *   people actually play" signal in the schema.
 * - Every hard rule the engine enforces still holds, because `rankCandidates`
 *   re-checks legality and colour identity on whatever this returns. The
 *   pre-filter can only make the pool smaller, never wronger.
 *
 * If the pool ever needs to be complete, the right answer is a Postgres
 * function that ranks server-side, not a bigger download.
 */

/**
 * How many candidates come back.
 *
 * 3,000 rows of the eleven projected columns is roughly 850 kB, which is about
 * the size of one card page's images and is paid once, on demand, behind a
 * button. It is deep enough that the ranking has real choices: the engine
 * returns twenty to forty suggestions and its signals do the work, so the depth
 * only has to cover the cards a deck could plausibly want.
 */
export const POOL_CAP = 3000;

/**
 * Run one candidate query.
 *
 * Hand this to `recommend(profile, supabaseCandidateSource)`. It reads
 * `CandidateQuery` rather than a profile so the hard filters stay the engine's
 * to decide and this file only knows how to ask PostgREST for them.
 */
export async function supabaseCandidateSource(
  query: CandidateQuery
): Promise<readonly RawCardRow[]> {
  const format = query.legalityFilter.key;

  /*
   * PostgREST spells the two JSON projections differently from the SQL in
   * `selectColumns`. `query.columns` holds `prices->>'usd' as usd`, which is
   * valid SQL and not valid PostgREST, so the select list is written out here
   * in the form the client speaks. `query.columns` is still the contract: if a
   * column is added there and not here, the ranker reads undefined.
   */
  const select = [
    'id',
    'oracle_id',
    'name',
    'type_line',
    'cmc',
    'color_identity',
    'tags',
    'mana_cost',
    'edhrec_rank',
    'usd:prices->>usd',
    `legal_in_format:legalities->>${format}`,
  ].join(', ');

  const { data, error } = await supabase
    .from('cards')
    .select(select)
    /* The partial expression index on `legalities->>'<format>'` is what makes
       this an index scan rather than a walk of 34,088 rows, and it has to go
       first: colour identity is a post-filter the planner applies afterwards.
       `INDEXED_FORMATS` in the engine lists the seven formats that have one. */
    .eq(`legalities->>${format}`, 'legal')
    .containedBy('color_identity', query.colorIdentityFilter.containedBy)
    /* Unranked last. A null `edhrec_rank` is a card the sync has not reached,
       which is unknown rather than unpopular, and sorting it to the front would
       fill the whole pool with cards we know nothing about. */
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
    .limit(POOL_CAP);

  if (error) throw error;
  return (data ?? []) as unknown as RawCardRow[];
}
