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
 * ONE THOUSAND, because that is the number that was ever coming back. This said
 * 3,000 and PostgREST is configured with `db-max-rows` of 1,000 on this
 * project, so the server has been silently returning a third of what the
 * constant claimed since it was written. Verified against the live API on
 * 2026-08-30: `limit=3000` on the same request returns exactly 1,000 rows and
 * says nothing about it.
 *
 * It was not only a wrong constant, it was a wrong SENTENCE. `DeckAddPanel`
 * prints "ranked from the {POOL_CAP} most-played legal cards in your colours",
 * so the panel told every player it had considered three thousand cards when it
 * had considered a thousand. Design law 7: a number that cannot be read from
 * the database does not ship.
 *
 * A thousand rows of the eleven projected columns is roughly 280 kB, paid once,
 * on demand, behind a button. It is deep enough that the ranking has real
 * choices: the engine returns twenty to forty suggestions and its signals do
 * the work, so the depth only has to cover the cards a deck could plausibly
 * want, and by definition these are the thousand most played of them.
 *
 * IF A DEEPER POOL IS EVER WANTED it needs keyset pagination, the way
 * `deck-optimizer/catalog.ts` walks its pool, not a larger `limit`. Three round
 * trips of about 900 ms each to reach cards ranked past a thousand by play rate
 * is a poor trade, which is why it is not done here.
 */
export const POOL_CAP = 1000;

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

  /*
   * NOT `cards`, and this was broken for every signed-in user.
   * ------------------------------------------------------------------
   * This read `from('cards')` and the comment under it reasoned about "a walk
   * of 34,088 rows". `cards` has held EVERY PRINTING since 2026-08-19, about
   * 97,000 of them, so the query got roughly three times heavier the day the
   * catalogue changed and nobody re-measured it. Explained against the live
   * database on 2026-08-30, four colours, exactly the request the deck page
   * sends:
   *
   *   cards          16,119 ms   74,608 rows scanned, 21,739 dropped on colour,
   *                              top-N heapsort, 18,104 blocks read from disk
   *   cards_pool        916 ms   1,580 buffers, every one a cache hit
   *
   * The `authenticated` role carries an 8 s `statement_timeout`, so 16 s is not
   * slow, it is a guaranteed 57014 and the Suggest cards button on the deck
   * page could never have worked.
   *
   * The second bug is the one CLAUDE.md wrote the two-sources rule for.
   * `cards` is printings, so `limit 3000` was 3,000 PRINTINGS: a card with
   * eight of them ate eight candidate slots and the ranker saw the same card
   * eight times. Suggestions have to be one row per card.
   *
   * `cards_pool` carries COMMANDER legality and nothing else, which is why the
   * format decides the table rather than a constant. Reading `commander_legal`
   * for a Standard deck would not error, it would quietly build the wrong pool.
   * `deck-optimizer/catalog.ts` branches the same way for the same reason.
   * Other formats read `cards_unique`: 3,701 ms for Standard in two colours,
   * which passes and is not comfortable.
   */
  const useNarrowPool = format === 'commander';

  const table = useNarrowPool ? 'cards_pool' : 'cards_unique';
  const columns = useNarrowPool
    ? select.replace('usd:prices->>usd', 'usd').replace(
        `legal_in_format:legalities->>${format}`,
        'legal_in_format:commander_legal'
      )
    : select;

  let request = supabase
    .from(table as 'cards')
    .select(columns);

  request = useNarrowPool
    ? request.eq('commander_legal' as never, 'legal')
    /* The partial expression index on `legalities->>'<format>'` is what makes
       this an index scan rather than a walk, and it has to go first: colour
       identity is a post-filter the planner applies afterwards.
       `INDEXED_FORMATS` in the engine lists the seven formats that have one. */
    : request.eq(`legalities->>${format}` as never, 'legal');

  const { data, error } = await request
    .containedBy('color_identity', query.colorIdentityFilter.containedBy)
    /* Unranked last. A null `edhrec_rank` is a card the sync has not reached,
       which is unknown rather than unpopular, and sorting it to the front would
       fill the whole pool with cards we know nothing about. */
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
    .limit(POOL_CAP);

  if (error) throw error;
  return (data ?? []) as unknown as RawCardRow[];
}
