/**
 * The only part of the deck engine's edge functions that talks to the database.
 *
 * Before this file existed the deck optimiser made ZERO queries: its single
 * outbound call was to an AI gateway, and every card name it produced came out
 * of a language model's memory with nothing checking it. Everything downstream
 * of here exists so that a card the user is told to buy is a row that exists.
 * The deck generator now reads through the same module for the same reason, and
 * `scripts/vendor-engine.mjs` keeps the two copies byte-identical.
 *
 * Three facts shape this module.
 *
 * 1. **PostgREST caps a response at 1000 rows.** Confirmed by the response
 *    header `Content-Range: 0-999/25376` on an unranged request. So `fetchAll`
 *    pages, and it learns the true total from that header rather than guessing.
 * 2. **The candidate pool comes from `cards_unique`, not `cards`.** See
 *    {@link POOL_TABLE}.
 * 3. **Never select the wide columns for the pool.** `oracle_text`, `faces`
 *    and the whole `image_uris` / `prices` / `legalities` objects are not
 *    needed to rank. `legalities` alone carries 23 keys per row and ranking
 *    reads one. Projecting `prices->>'usd'` and `legalities->>'<format>'`
 *    takes the worst-case five-colour pool from 28 MB to about 9 MB. Lands are
 *    the single exception, and `landPoolFor` says why.
 *
 * Raw `fetch` against PostgREST rather than `@supabase/supabase-js`, because
 * paging needs the `Range` and `Content-Range` headers directly and the
 * function needs to forward the caller's own `Authorization` header verbatim
 * so that row-level security decides what a user's collection contains.
 */

import type { CandidateQuery, RawCardRow } from './_engine/advise/index.ts';

/**
 * Where cards come from: one row per CARD, not per printing.
 *
 * This is the project's standing rule and this module was breaking it. From
 * CLAUDE.md, on the two card sources: `cards_unique` is "the default — search,
 * commander selection, all suggestions and recommendations, deck-building
 * candidate pools, the optimiser, MTG Brain, deck lists", and `cards` is only
 * for "where the printing IS the subject: collection rows, marketplace
 * listings, scanner results, the art-variants list on a card page". A
 * suggestion is about a card. So is a deck slot.
 *
 * Three separate things get better at once, which is usually the sign a rule
 * was right:
 *
 * - **Correctness.** `cards` holds every printing, so the pool carried Sol Ring
 *   several times over and the ranker had to collapse them afterwards.
 *   `dedupeByOracle` still runs — it is the guarantee, not the mechanism — but
 *   it now has nothing to do. The representative printing is the same one
 *   either way: CLAUDE.md records that the view's `order by`, `comparePrintings`
 *   and the ranker's `cheaper()` were checked against each other across all 995
 *   oracle_ids with more than one printing and all three agree.
 * - **Size.** Measured 2026-08-19: `cards` holds about 56,500 printings against
 *   `cards_unique`'s 33,037 rows, 31,833 of them commander-legal. A four-colour
 *   pool drops from roughly 26 pages to 13.
 * - **Availability.** `cards` is the table `scryfall-sync` writes to, and it
 *   carries 27 indexes. Measured while the printings sync was mid-run on
 *   2026-08-19, five of ten trivial anon reads of `cards` were cancelled by the
 *   3 s `statement_timeout` — see `#get`. `cards_unique` is a materialized view
 *   that the sync does not touch, and it carries its own commander-legality,
 *   colour-identity, id and name indexes.
 *
 * The one thing to know: a materialized view freezes its column list, so adding
 * a column to `cards` does not add it here. `public.cards_unique_column_drift()`
 * reports what is missing. Every column this file selects was confirmed present
 * on 2026-08-19.
 */
export const POOL_TABLE = 'cards_unique';

/**
 * Where the CANDIDATE POOL comes from: a narrow view of the same rows.
 *
 * `cards_unique` rows average 3.2 KB, because alongside the nine columns
 * ranking reads they carry `oracle_text`, `faces`, `image_uris`, `legalities`
 * and `prices`. One fat row is one heap block, so scanning the 7,495 mono-red
 * candidates touched 6,441 blocks and the pool query was the slowest thing in
 * the product. Measured 2026-08-30:
 *
 *   cards_unique heap                105 MB
 *   the columns the pool reads         6.7 MB
 *   cards_pool heap, facets included  13 MB
 *
 *   mono-red pool page, ORDER BY id, from cards_unique   2,923 ms
 *   the same page from cards_pool, ORDER BY rank             6 ms
 *
 * It also carries the precompiled `facets` and the two projections the query
 * used to make PostgREST compute per request, `prices->>'usd'` and
 * `legalities->>'commander'`, as ordinary columns.
 *
 * ONLY FOR RANKING. Anything that needs oracle text, images or the whole
 * legalities object is asking about a CARD rather than about a candidate and
 * must read `POOL_TABLE`. `landPoolFor` is the standing example: it needs the
 * rules text that says what a land taps for. The moment a wide column is added
 * to `cards_pool` the saving disappears and nothing on screen will say so.
 */
export const RANK_POOL_TABLE = 'cards_pool';

/** PostgREST's configured `db-max-rows` for this project, measured. */
export const PAGE_SIZE = 1000;

/**
 * Backoff between retries of a read the database refused.
 *
 * Three attempts and about 3.6 s of waiting in the worst case, which is
 * affordable inside an edge function's budget and long enough to step over the
 * write bursts measured during a sync. See `#get`.
 */
const RETRY_DELAYS_MS = [400, 1200, 2000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A `cards` row as this function selects it.
 *
 * Extends the engine's `RawCardRow` (which already accepts the projected
 * `usd` / `legal_in_format` shape) with the two display columns the UI needs
 * and ranking does not: an image and a set code.
 */
export interface CatalogRow extends RawCardRow {
  image_url?: string | null;
  /**
   * The whole `image_uris` object, not one pre-chosen URL.
   *
   * `<CardImage>` picks its Scryfall resolution from the width it is being
   * drawn at, and reads this object to do it. A card that reaches the client
   * without `image_uris` renders as a grey rectangle with a name on it — which
   * is precisely what the deck generator was shipping, because its card query
   * never selected the column. Selected for the deck's own cards only; the
   * 30,000-row pool must never carry it.
   */
  image_uris?: Record<string, string> | null;
  set_code?: string | null;
  rarity?: string | null;
  /**
   * Selected for the deck's own cards, for lands, and for a pool that asks.
   *
   * The castability engine reads it to classify mana sources: without it a
   * Command Tower is a land that makes nothing and a Signet is not a source at
   * all, so every non-basic source disappears and the whole deck reads as
   * uncastable. LANDS therefore always carry it — see `landPoolFor`.
   *
   * It used to say "never for the 30,000-row pool", and for the optimiser that
   * is still true: it ranks on tags and would pay for a column it never reads.
   * The generator is the exception and `poolFor({ withOracleText: true })` is
   * how it says so, because behaviour facets are compiled FROM this text and a
   * pool without it reaches the ranker as 30,000 cards whose behaviour is
   * unknown. Measured cost is on `poolFor`.
   */
  oracle_text?: string | null;
  /**
   * The card's faces, when it has more than one.
   *
   * Selected only for the deck's own cards, never for the pool, for the same
   * width reason as `oracle_text`. It matters because `oracle_text` is NULL on
   * every transform, modal DFC, split, adventure and prepare layout, and the
   * commander plan is read off text: without this a double-faced legend
   * reaches the reader as a card that says nothing. Measured 2026-08-30, that
   * was 186 of 586 silent commanders, 31.7% of all commander silence.
   */
  faces?: { oracle_text?: string | null; type_line?: string | null; name?: string | null }[] | null;
  /**
   * The precompiled behaviour facets, when the caller asked for them.
   *
   * A computed column on `cards_unique` backed by `card_facet_memo`. An EMPTY
   * ARRAY IS A REAL ANSWER, not a miss: 7,058 of 33,032 cards genuinely
   * compile to no facets. Absent means the filler has not reached that card.
   */
  facets?: string[] | null;
  keywords?: string[] | null;
  prices?: { usd?: string | number | null } | null;
}

export interface CatalogOptions {
  url: string;
  anonKey: string;
  /** The caller's own `Authorization` header, forwarded for RLS. */
  authorization?: string | null;
}

/** One row of `combo_pool`: a Commander Spellbook combo with its pieces. */
export interface ComboRow {
  id: string;
  popularity: number | null;
  card_count: number;
  bracket_tag: string | null;
  produces: string[] | null;
  oracle_ids: string[];
  card_names: string[];
  needs_commander: boolean | null;
}

export class Catalog {
  readonly #url: string;
  readonly #anonKey: string;
  readonly #authorization: string;

  constructor(opts: CatalogOptions) {
    this.#url = opts.url.replace(/\/+$/, '');
    this.#anonKey = opts.anonKey;
    // Falls back to the anon key when the caller is anonymous. RLS then sees
    // no `auth.uid()`, which is exactly right: the collection reads as empty
    // rather than as somebody else's.
    this.#authorization = opts.authorization?.trim() || `Bearer ${opts.anonKey}`;
  }

  #headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      apikey: this.#anonKey,
      Authorization: this.#authorization,
      Accept: 'application/json',
      ...extra,
    };
  }

  /**
   * One read, retried when the database is momentarily too busy to answer.
   *
   * Not defensive padding. Measured on 2026-08-19 while `scryfall-sync` was
   * mid-run at page 220 of 553 (38,293 of 96,732 printings written): ten
   * consecutive `select id,name from cards where name = 'Atraxa, Praetors''
   * Voice' limit 1` requests on the anon key took 1.7 s to 3.0 s each and five
   * of the ten came back `57014 canceling statement due to statement timeout`.
   * The plan is a two-row index scan on `idx_cards_name`; `EXPLAIN` puts
   * execution at 29 ms and PLANNING at 250 ms warm and 15,054 ms cold, over 509
   * shared buffers, because `cards` carries 27 indexes and the sync's writes
   * keep evicting the catalogue cache. The `anon` role's `statement_timeout` is
   * 3 s, so a cold plan alone exhausts it.
   *
   * That is a transient condition with a known cause and a known end (the sync
   * finishes), and a read is safe to repeat, so it is repeated. It is NOT a
   * cure: while a sync is running the deck generator and the optimiser are both
   * slower and can still fail, and the real fix is fewer indexes on `cards` or a
   * higher `statement_timeout` for these two functions. Recorded here so
   * whoever does that has the measurement rather than the anecdote.
   *
   * Only 5xx and 429 are retried. A 4xx is a malformed query and repeating it
   * would just be wrong three times.
   */
  async #get<T>(pathAndQuery: string, extraHeaders: Record<string, string> = {}): Promise<{
    rows: T[];
    contentRange: string | null;
  }> {
    let lastStatus = 0;
    let lastBody = '';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
      const res = await fetch(`${this.#url}/rest/v1/${pathAndQuery}`, {
        headers: this.#headers(extraHeaders),
      });
      if (res.ok) {
        return { rows: (await res.json()) as T[], contentRange: res.headers.get('content-range') };
      }
      lastStatus = res.status;
      lastBody = await res.text();
      if (res.status < 500 && res.status !== 429) break;
    }
    throw new Error(
      `PostgREST ${lastStatus} on ${pathAndQuery.slice(0, 120)}: ${lastBody.slice(0, 300)}`
    );
  }

  /**
   * Fetch every row matching a query, paging past the 1000-row cap.
   *
   * The first page asks for an exact count so the remaining page boundaries are
   * known rather than discovered one round trip at a time; those pages then go
   * out in parallel. There is deliberately no cap on the number of rows: the
   * pool must be complete before it is ranked. Truncating here would rank an
   * arbitrary slice of the table, which is precisely the bug this engine was
   * written to avoid.
   *
   * Every page is a SEPARATE query, so the ordering must be pinned or the pages
   * do not compose. Postgres only promises an order when one is asked for:
   * without `ORDER BY`, `EXPLAIN` on this very pool query is a bare
   * `Limit -> Index Scan using cards_legal_commander_idx` with no sort node, so
   * page boundaries fall wherever the scan happened to be. Any concurrent write
   * to `cards` — `scryfall-sync` runs exactly such an update — moves a row
   * between two of those independent scans, and the row is then fetched twice
   * or not at all. Duplicates the ranker would absorb in `dedupeByOracle`; the
   * silent drop is the real damage, because a legal card vanishes from the pool
   * and the engine cannot suggest what it never retrieved. That is the same
   * class of failure as ranking a truncated pool, arriving by a different road.
   *
   * `id` is the primary key, so it is unique and total — a stable sort needs
   * both, and a non-unique key like `name` would leave ties free to reorder.
   * Measured cost of pinning it, on the two-colour commander pool: 13 ms to
   * 71 ms per page, the extra being a top-N heapsort over the matched rows.
   * Paid deliberately. A pool that is fast and wrong has no value here.
   *
   * What that two-colour figure does NOT show, measured 2026-08-18 with
   * EXPLAIN (ANALYZE, BUFFERS) on the live catalogue: the sort is over every
   * matched row, not over a page of them, so it is re-done in full for each
   * page and the total is quadratic in page count. Worst case is a five-colour
   * commander, where `color_identity <@ '{W,U,B,R,G}'` matches all 32,881
   * commander-legal rows:
   *
   *   two-colour  (12,977 matched, 13 pages) ..  72 ms/page, quicksort
   *   four-colour (25,376 matched, 26 pages) .. 129 ms/page, external merge 5.8 MB
   *   five-colour (32,881 matched, 33 pages) .. 150 ms/page, external merge 7.6 MB
   *
   * Every page past the smallest spills to temp disk, so a five-colour run
   * writes roughly 250 MB of temp across its 33 pages. Warm, that is about 5 s
   * of database time, and six pages in flight at a time kept the wall clock
   * near 1 s.
   * Cold is the number to watch: the first five-colour page measured 3,984 ms
   * against a `statement_timeout` of 3 s for `anon` and 8 s for
   * `authenticated`. An anonymous caller is therefore within reach of a
   * Postgres 57014 on a cold cache, and a signed-in caller's margin is 2x, not
   * 50x.
   *
   * THE FIX, AND WHY IT IS THIS ONE
   * -------------------------------
   * The comment that used to end here proposed a covering index and left the
   * quadratic sort in place. The index would help, but it is a migration per
   * format and it does not remove the real defect, which is that OFFSET paging
   * asks the database to produce and discard everything before the page. Every
   * page re-sorts the whole matched set precisely because `OFFSET n` has to
   * know what the first n rows were.
   *
   * Keyset paging does not. `id > <last id seen> ORDER BY id LIMIT 1000` is an
   * index range scan that starts where the previous page stopped, so each page
   * costs a page and the total is linear. It keeps exactly the stability
   * guarantee the sort was bought for — `id` is unique and total, so no row can
   * be seen twice or skipped no matter what is written between pages — and it
   * needs no `count=exact`, which was a second full pass over the matched set
   * on the first request.
   *
   * The cost is that pages are sequential rather than six in flight at a time:
   * each one needs the previous page's last id. That is the right
   * trade here. Measured on 2026-08-19 with the printings sync running, one
   * OFFSET page of the four-colour pool took 36.5 s of execution — an index
   * scan over 24,578 rows feeding a top-N heapsort — against a 3 s
   * `statement_timeout`, so the parallelism was buying nothing at all: every
   * page failed. A linear scheme that finishes beats a parallel one that is
   * cancelled.
   */
  /**
   * @param by Which key the walk is ordered and cursored on.
   *   `id` is the default and is right for any query with no other order.
   *   `rank` orders by `(edhrec_rank, id)` and is for the CANDIDATE POOL, whose
   *   filter is a rank ceiling: ordering that by `id` made every page read all
   *   14,984 matching rows and sort them, 4,078 ms a page against a 3 s
   *   statement timeout. See `withRankKeyset`.
   */
  async fetchAll<T>(pathAndQuery: string, by: 'id' | 'rank' = 'id'): Promise<T[]> {
    const rows: T[] = [];
    let after: string | null = null;
    let rankAfter: RankCursor | null = null;

    // A hard stop, so a malformed cursor can never spin forever. 200 pages is
    // 200,000 rows, comfortably past the whole catalogue.
    for (let page = 0; page < 200; page++) {
      const url = by === 'rank'
        ? withRankKeyset(pathAndQuery, rankAfter)
        : withKeyset(pathAndQuery, after);
      const result = await this.#get<T>(url, {
        Range: `0-${PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
      });
      rows.push(...result.rows);
      if (result.rows.length < PAGE_SIZE) return rows;

      const last = result.rows[result.rows.length - 1] as { id?: unknown; edhrec_rank?: unknown };
      const lastId = typeof last?.id === 'string' ? last.id : null;
      if (!lastId) {
        // A caller that did not select `id` cannot be keyset-paged. That is a
        // programming error rather than a data condition, so it says so instead
        // of quietly returning whatever the first page held.
        throw new Error(
          `fetchAll needs "id" in the select to page: ${pathAndQuery.slice(0, 120)}`
        );
      }

      if (by === 'rank') {
        const lastRank = typeof last?.edhrec_rank === 'number' ? last.edhrec_rank : null;
        if (lastRank === null) {
          /* A null rank cannot be a cursor and the walk cannot continue past
             it. Saying so beats looping on the same page or, worse, silently
             returning a partial pool that nothing downstream can tell is
             partial: a legal card that never reaches the pool cannot be
             suggested and nothing reports its absence. The pool query filters
             `edhrec_rank < 15000`, which already excludes nulls, so reaching
             here means the caller ordered by rank without that filter. */
          throw new Error(
            'a rank-ordered walk needs a non-null edhrec_rank on every row; ' +
            `filter them out with edhrec_rank=lt.<n>: ${pathAndQuery.slice(0, 120)}`
          );
        }
        rankAfter = { rank: lastRank, id: lastId };
      } else {
        after = lastId;
      }
    }
    return rows;
  }

  /**
   * The legal candidate pool, executed from the engine's own query description.
   *
   * `buildCandidateQuery` decides what the filters are; this only renders them
   * for PostgREST. Keeping the decision in one place means the SQL the edge
   * function runs and the rules `recommend.test.ts` asserts cannot drift apart.
   *
   * The two filters are the ones that make a Commander suggestion legal at all:
   * legal in the format, and colour identity a subset of the commander's. They
   * are applied here in SQL for speed and again in TypeScript in the ranker for
   * the guarantee.
   *
   * `query.limit` is `null` by construction and there is no relevance filter.
   * Relevance is a ranking question, and ranking happens only once every
   * candidate is in hand.
   *
   * `withOracleText` is OFF by default, and the default is the old behaviour to
   * the byte. It exists because the two consumers now want different things
   * from the same pool and neither should pay for the other's needs:
   *
   *   - The OPTIMISER ranks against tags and never reads oracle text, so it
   *     leaves this alone and its query is unchanged.
   *   - The GENERATOR compiles oracle text into behaviour facets, because
   *     `planFit` cannot tell what a card does without them. Before this, its
   *     pool rows carried no text, so every row reached the ranker with
   *     `facets: null` and the commander plan had nothing to match against.
   *
   * Measured on the 2026-08-19 catalogue snapshot, five-colour identity, all
   * 31,833 commander-legal rows: `oracle_text` adds 4.93 MB to a pool that
   * already ships those rows. That is the price of the column, paid by the one
   * caller that reads it.
   */
  /**
   * @param opts.maxRank Only cards Commander plays at least this often, by
   *   `edhrec_rank`. Bounds the pool for a wide colour identity.
   */
  async poolFor(
    query: CandidateQuery,
    opts?: { withOracleText?: boolean; maxRank?: number }
  ): Promise<CatalogRow[]> {
    const fmt = query.legalityFilter.key;
    const identity = `{${query.colorIdentityFilter.containedBy.join(',')}}`;

    /* `cards_pool` CARRIES COMMANDER LEGALITY AND NOTHING ELSE, deliberately:
       the whole point of the view is that it is narrow, and `legalities` is one
       of the five fat columns it exists to leave behind. Twenty-three formats
       would put most of that weight straight back.

       So any other format reads `cards_unique`, which holds the whole object.
       Commander is what this generator is for and what every measurement here
       was taken on, and a Standard pool is small enough that the slower path
       costs nothing worth optimising. Branching on the format rather than
       assuming it matters because reading `commander_legal` for a Standard deck
       would not error: it would quietly build the wrong pool. */
    const useNarrowPool = fmt === 'commander';
    const table = useNarrowPool ? RANK_POOL_TABLE : POOL_TABLE;
    const legalityFilter = useNarrowPool
      ? `&commander_legal=eq.${query.legalityFilter.equals}`
      : `&legalities->>${encodeURIComponent(fmt)}=eq.${query.legalityFilter.equals}`;

    // The engine's `selectColumns` is SQL; PostgREST needs its own spelling of
    // the same two JSON projections.
    const select = [
      'id',
      'oracle_id',
      'name',
      'type_line',
      'cmc',
      'color_identity',
      'tags',
      'mana_cost',
      // A popularity prior for the ranker, and the walk's own sort key. Cheap:
      // one integer column, and it is in the index the filter already uses.
      'edhrec_rank',
      /* THE COMPILED FACETS, READ RATHER THAN COMPUTED.
         ----------------------------------------------
         An ordinary column on `cards_pool`, joined from `card_facet_memo` when
         the view is built and filled by the `facet-memo-fill` edge function.
         Before it existed, `pipeline.ts` compiled facets from `oracle_text` on
         EVERY REQUEST, capped at 6,000 cards, into a Map on the module that
         dies with the instance. Every measured run reported `cached: 0`; a
         five-colour pool is roughly 100,000 facets computed from scratch
         inside one CPU budget, and the budget lost.

         Asking for facets instead of oracle text also takes 4.93 MB off the
         five-colour pool response, which is most of why that query timed out
         whenever the nightly sync was writing. */
      ...(opts?.withOracleText ? ['facets'] : []),
      /* On `cards_pool` these are ordinary columns, so PostgREST no longer
         computes `prices->>'usd'` and `legalities->>'<format>'` per row per
         request. Both aliases keep the shape `RawCardRow` expects. */
      ...(useNarrowPool
        ? ['usd', 'legal_in_format:commander_legal']
        : ['usd:prices->>usd', `legal_in_format:legalities->>${fmt}`]),
    ].join(',');

    /* THE RANK CEILING, and why it is a filter rather than an order.
       ---------------------------------------------------------------
       A five colour commander's pool is the whole commander-legal catalogue,
       31,829 rows, and the edge function ran out of MEMORY holding it: Golos,
       Najeela and Kenrith all returned 546 with "Memory limit exceeded" in the
       log, after the facet compile had already been bounded and was no longer
       the cost.

       `edhrec_rank` is the only evidence we have about what people actually
       play, and a card ranked worse than fifteen thousandth is not going into a
       generated deck. Only 67 of the 31,829 carry no rank at all.

       It is a FILTER and not an ORDER BY on purpose. Ordering by rank was tried
       and the planner refused the index: `color_identity <@` has no usable
       selectivity statistic, it estimated 165 rows against 31,829, decided a
       sort was cheap and spilled 2.2 MB to disk for 11 seconds. The same
       misestimate that made the pool query time out at 13.7 s before the
       id-ordered indexes went in. A range condition needs no estimate to be
       right:

         ORDER BY edhrec_rank LIMIT 12000   Sort, external merge, 11,040 ms
         WHERE edhrec_rank < 15000          Index Cond, 14,984 rows,   382 ms

       served by `cards_unique_commander_rank_idx`. */
    /* A CEILING ONLY WHEN THE CALLER ASKED FOR ONE, and the reason a wider one
       was tried and rejected is worth keeping.

       One and two colour pools carry no ceiling, so they cannot take the
       rank-ordered walk, so they take the `id` path and are the slowest builds
       in the product. The obvious fix was to send a ceiling so large it
       excludes nothing, purely to get the range condition the ordered plan
       needs. Measured on mono-red, it makes things WORSE:

         edhrec_rank < 15000     Index Scan + Incremental Sort        5 ms
         edhrec_rank < 20000     BitmapAnd + Sort, 5,284 heap blocks
         edhrec_rank < 1000000   BitmapAnd + Sort, 6,953 heap blocks

       Past a selectivity threshold the planner stops believing the rank index
       is worth walking, bitmap-ANDs it with the colour index, and that
       destroys the index ordering so the sort comes back. A range condition
       only buys the ordered plan while it is SELECTIVE, which is the same
       lesson as CLAUDE.md section 10d in a different disguise: an ORDER BY is
       only free when an index can actually supply it.

       So one and two colour pools keep the id walk for now, and the fix for
       them is a different one: an index that can serve colour identity and
       rank together. Left undone deliberately rather than shipped as a
       regression. */
    const rankCeiling =
      typeof opts?.maxRank === 'number' && Number.isFinite(opts.maxRank)
        ? `&edhrec_rank=lt.${Math.round(opts.maxRank)}`
        : '';

    /* ORDERED BY RANK, NOT BY ID, and that is worth four seconds a page.
       The rank ceiling is served by `cards_unique_commander_rank_idx`, which
       cannot supply `id` order, so ordering by id made every page read all
       14,984 matching rows and sort them, and a sort must see everything
       before it yields the first row so `LIMIT 1000` could never stop early:

         ORDER BY id                Sort, 14,984 rows, hit=16743   4,078 ms
         ORDER BY edhrec_rank, id   Incremental Sort, 1,001 rows       5 ms

       Measured end to end on the deployed function, four-colour Atraxa went
       from 59.8 s to 3.1 s and mono-red Krenko from HTTP 500 to a built deck.

       A rank-ordered walk needs a rank on every row, because a null cannot be
       a cursor, and `edhrec_rank=lt.<n>` excludes nulls in SQL. That is why
       the unranked tail is fetched separately below rather than lost: 67 of
       the 31,829 commander-legal cards carry no rank, and dropping them
       silently would be a pool that is quietly incomplete, which is the one
       failure nothing downstream can detect. */
    const base =
      `${table}?select=${encodeURIComponent(select)}` +
      legalityFilter +
      `&color_identity=cd.${encodeURIComponent(identity)}`;

    /* RANK-ORDERED AT EVERY COLOUR COUNT NOW, which the narrow view is what
       makes possible.

       The ordered walk needs a rank on every row, because a null cannot be a
       cursor. It used to get that from the ceiling, which only three-colour
       and larger pools set, so one and two colour pools fell back to the id
       walk and were the SLOWEST decks in the product: measured on the
       deployed function, mono-white Isamaru took 37.2 s and mono-red Krenko
       8.9 s, while four-colour Atraxa took 2.9 s.

       `edhrec_rank=not.is.null` asks for the same guarantee without narrowing
       anything, and on `cards_pool` the planner takes the ordered index and
       stops early:

         from cards_unique, ORDER BY id       2,923 ms a page
         from cards_pool,   ORDER BY id       1,167 ms
         from cards_pool,   ORDER BY rank         6 ms

       The ceiling still applies where the caller set one, because at three
       colours and up it exists for MEMORY rather than for speed. */
    const ranked = await this.fetchAll<CatalogRow>(
      `${base}&edhrec_rank=not.is.null${rankCeiling}`,
      'rank'
    );

    /* THE UNRANKED TAIL, one page, and only when the caller set no ceiling.
       67 of the 31,829 commander-legal cards carry no `edhrec_rank`, and the
       ordered walk cannot include them because a null cannot be a cursor.
       Dropping them silently would make the pool quietly incomplete, which is
       the one failure nothing downstream can detect: a legal card that never
       reaches the pool cannot be suggested and nothing reports its absence.

       Where the caller DID set a ceiling, that ceiling exists to keep a large
       pool inside the runtime's memory, and a card nobody has ever been
       recorded playing is exactly what it is for. */
    if (opts?.maxRank !== undefined) return ranked;

    const unranked = await this.fetchAll<CatalogRow>(`${base}&edhrec_rank=is.null`);
    return unranked.length ? ranked.concat(unranked) : ranked;
  }

  /**
   * The land half of the pool, with the rules text that says what it taps for.
   *
   * The deck generator has to CHOOSE a mana base before it can rank anything
   * that has to be cast off it, and colour identity does not answer "what does
   * this land make": Command Tower's identity is empty and it taps for every
   * colour you play, while Reliquary Tower's is also empty and it taps for one
   * colourless. Only the oracle text separates them, and `manaSourceFor` in the
   * castability engine is what reads it.
   *
   * Affordable because lands are a small slice of the catalogue. Measured on
   * the live table on 2026-08-19: 4,386 commander-legal land PRINTINGS in the
   * whole catalogue carrying 397 KB of oracle text in total, before any colour
   * identity filter narrows it further. The same column across the full 55,000
   * row pool is what `poolFor` refuses to fetch, and still does.
   */
  async landPoolFor(query: CandidateQuery): Promise<CatalogRow[]> {
    const fmt = query.legalityFilter.key;
    const identity = `{${query.colorIdentityFilter.containedBy.join(',')}}`;

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
      'oracle_text',
      'usd:prices->>usd',
      `legal_in_format:legalities->>${fmt}`,
    ].join(',');

    return this.fetchAll<CatalogRow>(
      `${POOL_TABLE}?select=${encodeURIComponent(select)}` +
        `&legalities->>${encodeURIComponent(fmt)}=eq.${query.legalityFilter.equals}` +
        `&color_identity=cd.${encodeURIComponent(identity)}` +
        `&type_line=ilike.${encodeURIComponent('*Land*')}`
    );
  }

  /** Basic lands matching a colour identity, for the land section. */
  async basicLands(format: string, colorIdentity: readonly string[]): Promise<CatalogRow[]> {
    const BASICS: Record<string, string> = {
      W: 'Plains',
      U: 'Island',
      B: 'Swamp',
      R: 'Mountain',
      G: 'Forest',
    };
    const names = colorIdentity.map(c => BASICS[c]).filter(Boolean);
    if (!names.length) return [];
    return this.cardsByName(names, format);
  }

  /**
   * Look up specific cards by name, with the display columns attached.
   *
   * Used for the deck's own cards, for the COMMANDER, and for the diagnostic
   * pass that explains why a model-suggested name never appeared in the pool.
   * Chunked because a URL carrying a hundred card names is already long.
   *
   * Each name goes out in every spelling {@link nameVariants} produces, because
   * `in.` is byte equality and a typographic apostrophe is a byte. See that
   * function for what it cost.
   */
  async cardsByName(names: readonly string[], format: string): Promise<CatalogRow[]> {
    const fmt = format.toLowerCase();
    const unique = [...new Set(names.flatMap(n => nameVariants(n)))];
    if (!unique.length) return [];

    const select = [
      'id',
      'oracle_id',
      'name',
      'type_line',
      'cmc',
      'color_identity',
      'tags',
      'mana_cost',
      'set_code',
      'rarity',
      'edhrec_rank',
      // The castability engine needs these two. See `CatalogRow.oracle_text`.
      'oracle_text',
      'keywords',
      'prices',
      'usd:prices->>usd',
      'image_uris',
      'image_url:image_uris->>normal',
      'legalities',
    ].join(',');

    const out: CatalogRow[] = [];
    const CHUNK = 80;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const list = chunk.map(quoteForIn).join(',');
      // Paged, not capped. This used to ask for `Range: 0-999` once per chunk
      // and keep whatever came back — the same silent truncation `fetchAll`
      // exists to prevent, sitting in the function that resolves the user's own
      // deck. Against `cards_unique` a chunk of 80 names cannot return more
      // than 80 rows plus the handful of names two distinct cards share, so the
      // cap is now unreachable by construction rather than by margin. The
      // paging stays, because the guarantee is worth more than the round trip
      // it saves.
      //
      // What truncation would cost is not a missing image. Deck rows resolve
      // through here and the commander's own row is one of them: lose it off
      // the end of a truncated page and `commanderCard` is null, colour
      // identity falls back to the deck union — a superset — and the pool
      // silently widens to cards the deck may not legally play.
      out.push(
        ...(await this.fetchAll<CatalogRow>(
          `${POOL_TABLE}?select=${encodeURIComponent(select)}&name=in.${encodeURIComponent(`(${list})`)}`
        ))
      );
    }
    // `legalities` arrived whole here, so make the projected key available too
    // and keep `normalizeRow` on one code path.
    for (const r of out) r.legal_in_format = r.legalities?.[fmt] ?? null;
    return out;
  }

  /**
   * The facets the POOL carries for these cards, by name.
   *
   * `cardsByName` reads {@link POOL_TABLE}, which is `cards_unique` and has no
   * facets column, so everything needing facets compiled them on the spot with
   * `facetsForCard`. That was the same answer the pool held until Scryfall
   * Tagger was merged in on 2 Sep 2026. It is not the same answer now:
   *
   *     Animate Dead     pool: cares:zone:graveyard eff:return-from
   *                     local: cares:sub:aura eff:pump trig:enters
   *
   * That broke the archetype shells silently. A shell is read by compiling its
   * example cards and keeping what they agree on, and those facets are matched
   * against POOL cards — so compiling locally compares two vocabularies.
   * Reanimator's "The reanimation" package (Reanimate, Animate Dead, Victimize,
   * Stitch Together, all four carrying `eff:return-from` in the pool) agreed on
   * nothing but `cares:type:creature`, and a Meren deck came back with no
   * recursion in it at all.
   *
   * One extra round trip for about 200 names, run beside the pool query.
   */
  async poolFacetsByName(names: readonly string[]): Promise<Map<string, string[]>> {
    const unique = [...new Set(names.flatMap(n => nameVariants(n)))];
    const byName = new Map<string, string[]>();
    if (!unique.length) return byName;

    const CHUNK = 80;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const list = unique.slice(i, i + CHUNK).map(quoteForIn).join(',');
      const rows = await this.fetchAll<{ name: string; facets: string[] | null }>(
        `${RANK_POOL_TABLE}?select=name,facets&name=in.${encodeURIComponent(`(${list})`)}`
      );
      for (const r of rows) {
        if (!r?.name || !r.facets) continue;
        if (!byName.has(r.name)) byName.set(r.name, r.facets);
      }
    }
    return byName;
  }

  /**
   * The combos this commander's colours could build, most played first.
   *
   * Owner, 3 Sep 2026: *"this card works, because the deck contains other cards
   * that combo with it, including win condition combos, also important."* The
   * ranker scores cards one at a time and can never say that, so the pieces
   * have to arrive as a unit the builder can reason about.
   *
   * `combo_pool` is the aggregate of Commander Spellbook's 61,130
   * commander-legal combos (ingested 19 Aug, read by nothing until now), one
   * row per combo with its pieces as an array. Filtered by CONTAINMENT against
   * the commander's identity, which is one indexed test rather than a check per
   * piece, and capped: the top few hundred by how many real decks play them is
   * every combo anybody would build, and the tail is 56,000 rows of
   * three-card curiosities.
   *
   * A combo whose pieces are not all in the pool is dropped by the caller, not
   * here: this does not know what the pool holds.
   */
  async combosFor(identity: readonly string[], limit = 400): Promise<ComboRow[]> {
    /*
     * BY SUBSET KEY, not by array containment, and the difference is the whole
     * query. `identity <@ '{R}'` cannot serve an ordered LIMIT: measured 3 Sep
     * 2026 the planner walked the popularity index and threw away 5,875 rows
     * to find 400, taking 3,328 ms against a 3 s statement timeout - so combos
     * failed INSIDE a build, and a narrower identity was worse because it read
     * further down for the same 400.
     *
     * `identity_key` is the colours as one sorted string, so the question
     * becomes "any of the subsets of my identity", at most 32 of them, each an
     * index range on (identity_key, popularity DESC). 3,328 ms -> 217 ms,
     * buffers 6,287 -> 709.
     */
    const colours = [...new Set(identity.map(c => c.toUpperCase()))].sort();
    const keys: string[] = [];
    for (let mask = 0; mask < 1 << colours.length; mask++) {
      keys.push(colours.filter((_, i) => mask & (1 << i)).join(''));
    }
    const list = keys.map(k => (k === '' ? '""' : k)).join(',');
    const rows = await this.fetchAll<ComboRow>(
      `combo_pool?select=id,popularity,card_count,bracket_tag,produces,oracle_ids,card_names,needs_commander` +
        `&identity_key=in.${encodeURIComponent(`(${list})`)}` +
        `&order=popularity.desc.nullslast&limit=${limit}`
    );
    return rows.slice(0, limit);
  }

  /**
   * The caller's WHOLE collection, in one read.
   *
   * `ownedQuantities` asks about a list of names, which is right once the
   * shortlist exists but wrong before it does: the land ranker wants to know
   * whether the user already owns each of the thousand-odd lands in identity,
   * and asking by name would be a dozen chunked round trips to decide one
   * signal. This project has had two outages caused by per-row agent queries,
   * so the rule is batch, and a user's collection is small enough to be one
   * batch — the whole `user_collections` table held 51 rows on 2026-08-19,
   * across all thirteen accounts, and RLS narrows this to one account's share.
   *
   * Runs under the caller's own JWT, so row-level security (`auth.uid() =
   * user_id`) decides what comes back. An anonymous caller gets an empty map
   * rather than an error, and nothing is marked as owned.
   */
  async ownedCollection(): Promise<Map<string, number>> {
    const owned = new Map<string, number>();
    try {
      const rows = await this.fetchAll<{ id: string; card_name: string; quantity: number | null }>(
        'user_collections?select=id,card_name,quantity'
      );
      for (const r of rows) {
        const key = normalizeName(r.card_name);
        if (!key) continue;
        owned.set(key, (owned.get(key) ?? 0) + (Number(r.quantity) || 0));
      }
    } catch (e) {
      // A collection we cannot read is a collection we report as empty. It
      // must never take the whole analysis down with it.
      console.warn('collection read failed, treating as empty:', String(e).slice(0, 200));
    }
    return owned;
  }

  /**
   * How many copies of each named card the calling user owns.
   *
   * Runs under the caller's own JWT, so row-level security (`auth.uid() =
   * user_id`) decides what comes back. An anonymous caller gets an empty map
   * rather than an error, and the suggestion is simply not marked as owned.
   *
   * `user_collections.card_name` is TYPED BY A PERSON, or pasted, so it is the
   * one place a typographic apostrophe is likely to be the stored form rather
   * than the asked-for one. Same fix, same reason: both spellings go out. A
   * missed match here does not fail a build, it silently tells the player they
   * do not own a card they own.
   */
  async ownedQuantities(names: readonly string[]): Promise<Map<string, number>> {
    const owned = new Map<string, number>();
    const unique = [...new Set(names.flatMap(n => nameVariants(n)))];
    if (!unique.length) return owned;

    const CHUNK = 80;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const list = chunk.map(quoteForIn).join(',');
      try {
        const { rows } = await this.#get<{ card_name: string; quantity: number | null }>(
          `user_collections?select=card_name,quantity&card_name=in.${encodeURIComponent(`(${list})`)}`,
          { Range: `0-${PAGE_SIZE - 1}`, 'Range-Unit': 'items' }
        );
        for (const r of rows) {
          const key = normalizeName(r.card_name);
          owned.set(key, (owned.get(key) ?? 0) + (Number(r.quantity) || 0));
        }
      } catch (e) {
        // A collection we cannot read is a collection we report as empty. It
        // must never take the whole analysis down with it.
        console.warn('collection lookup failed, treating as empty:', String(e).slice(0, 200));
        return owned;
      }
    }
    return owned;
  }
}

/**
 * One page of a keyset walk: ordered by `id`, starting after the last id seen.
 *
 * `id` is the primary key, so it is unique and total. Uniqueness is what makes
 * the cursor exact — no two rows can share a boundary, so none can be returned
 * twice or stepped over — and totality is what makes the order complete. A
 * non-unique key like `name` would leave ties free to reorder between pages and
 * silently drop rows, which is the failure this whole scheme exists to prevent:
 * a legal card that never reaches the pool cannot be suggested, and nothing
 * downstream can tell that it is missing.
 *
 * An order the caller already chose is respected and the cursor is skipped,
 * because a cursor on `id` is meaningless beside somebody else's `ORDER BY`.
 * Such a caller gets one page, which is correct for every current one.
 */
export function withKeyset(pathAndQuery: string, after: string | null): string {
  // Match `order` as a whole query parameter, never as a substring of another
  // key — `&reorder=` and `&order_by=` must not read as an existing order.
  if (/[?&]order=/.test(pathAndQuery)) return pathAndQuery;
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const cursor = after === null ? '' : `&id=gt.${encodeURIComponent(after)}`;
  return `${pathAndQuery}${sep}order=id.asc${cursor}`;
}

/** Where a `(edhrec_rank, id)` walk got to. Both halves, because rank ties. */
export interface RankCursor {
  rank: number;
  id: string;
}

/**
 * The same keyset walk, ordered by POPULARITY instead of by id.
 *
 * WHY THIS EXISTS, measured 2026-08-30 on the five-colour pool.
 *
 * The pool query filters on `edhrec_rank < 15000` and then ordered by `id`. The
 * rank filter is served by `cards_unique_commander_rank_idx`, but that index
 * cannot supply `id` order, so every page read ALL 14,984 matching rows and
 * sorted them, and a sort must see everything before it yields the first row,
 * so `LIMIT 1000` could never terminate early:
 *
 *   ORDER BY id            Sort (top-N heapsort), 14,984 rows, hit=16743   4,078 ms
 *   ORDER BY edhrec_rank, id   Incremental Sort, 1,001 rows,   hit=1095        5 ms
 *
 * Fifteen pages at four seconds each is the sixty seconds a four-colour
 * generate took, and it is why mono-red and two-colour builds returned HTTP 500
 * on the three-second statement timeout. This is the same shape as the pool
 * failure in CLAUDE.md section 10d: an ORDER BY no index can supply.
 *
 * ORDERING BY RANK IS ALSO THE RIGHT ORDER. The pool is a candidate list and
 * `edhrec_rank` is the only evidence we hold about what people actually play,
 * so a truncated walk keeps the cards most likely to matter rather than an
 * arbitrary slice of the id space.
 *
 * THE CURSOR NEEDS BOTH HALVES. `edhrec_rank` is not unique, so a cursor on
 * rank alone would either re-read or step over every row sharing a boundary
 * rank. `(rank, id)` is unique and total because `id` is, which is the exact
 * property `withKeyset`'s comment above says the scheme depends on.
 */
export function withRankKeyset(pathAndQuery: string, after: RankCursor | null): string {
  if (/[?&]order=/.test(pathAndQuery)) return pathAndQuery;
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const order = 'order=edhrec_rank.asc,id.asc';
  if (!after) return `${pathAndQuery}${sep}${order}`;

  /* Row-value comparison, spelled the way PostgREST spells it:
       (rank, id) > (R, I)  ==  rank > R OR (rank = R AND id > I)          */
  const clause =
    `or=(edhrec_rank.gt.${after.rank},` +
    `and(edhrec_rank.eq.${after.rank},id.gt.${encodeURIComponent(after.id)}))`;
  return `${pathAndQuery}${sep}${order}&${clause}`;
}

/**
 * Quote a value for a PostgREST `in.(...)` list.
 *
 * Card names routinely contain commas ("Atraxa, Praetors' Voice") and
 * occasionally double quotes, both of which are list syntax unless quoted and
 * escaped.
 */
export function quoteForIn(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A name written the way Scryfall writes it: ASCII punctuation, single spaces.
 *
 * Scryfall's `name` is plain ASCII, and our catalogue is a copy of it. Measured
 * against the live table on 2026-08-28, over all 33,032 rows of
 * `cards_unique`: ZERO names carry U+2019, U+2018, a curly double quote, an
 * ellipsis, an en dash or an em dash, while 2,258 commander-legal names carry
 * the ASCII apostrophe — 7.1% of the format, "Yuriko, the Tiger's Shadow"
 * among them.
 *
 * So every typographic character listed here is one a caller can only have
 * introduced, and folding it can never turn one real card into another. Both
 * spellings are still sent to the database by {@link nameVariants}; this fold
 * decides what the second spelling is, it does not replace the first.
 */
export function asciiPunctuation(name: string): string {
  return String(name ?? '')
    // Apostrophes: right/left single quote, modifier letter apostrophe,
    // fullwidth apostrophe, Armenian apostrophe.
    .replace(/[‘’ʼ＇՚]/g, "'")
    // Double quotes.
    .replace(/[“”„‟]/g, '"')
    // Hyphens and dashes, including the non-breaking hyphen and minus sign.
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    // Non-breaking and other exotic spaces, then collapse.
    .replace(/[     ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The key card names are compared on.
 *
 * Case-insensitive, whitespace-collapsed, and with typographic punctuation
 * folded to ASCII — a model writing "Yawgmoth’s Will" means the card stored as
 * "Yawgmoth's Will", and letting that near-miss read as "this card does not
 * exist" would throw away a valid suggestion and overstate the failure rate.
 */
export function normalizeName(name: string): string {
  return asciiPunctuation(name).toLowerCase();
}

/**
 * Every spelling of a name worth asking the database for.
 *
 * THE BUG THIS EXISTS FOR. `normalizeName` folds the typographic apostrophe,
 * and until now it was only ever applied to the ANSWER — to rows that had
 * already come back. The QUESTION went out unfolded, as
 * `name=in.("Yuriko, the Tiger’s Shadow")`, and PostgREST `in.` is byte
 * equality. It matched nothing. Nothing then normalised anything, because
 * there was nothing to normalise.
 *
 * That is not a degraded result, it is no result. `pipeline.ts` resolves the
 * COMMANDER through `cardsByName` and throws
 * `"…" is not in the card database, so a deck cannot be built around it`
 * when the lookup comes back empty — so a commander whose name arrives with a
 * curly apostrophe does not build a worse deck, it builds no deck at all.
 * Reproduced live on 2026-08-28: the ASCII spelling returns one row, the
 * typographic spelling returns zero.
 *
 * The names reaching here are not all typed by us. They come from a language
 * model's prose, from a decklist pasted out of an article or a forum post, and
 * from `deck_cards` rows written by earlier versions of this app. Word,
 * Google Docs, Notion and iOS all substitute U+2019 for a typed apostrophe by
 * default, so the typographic spelling is the one a person is most likely to
 * arrive with.
 *
 * BOTH spellings go out, never one instead of the other. Folding is a guess
 * about how the catalogue is written, and the raw name is what the caller
 * actually asked for; sending both means a row that really does carry a
 * typographic character is still found, so this can only add matches. The cost
 * is at most one extra entry per name in an `in.` list that is already chunked.
 */
export function nameVariants(name: string): string[] {
  const raw = String(name ?? '').trim();
  if (!raw) return [];
  const folded = asciiPunctuation(raw);
  return folded && folded !== raw ? [raw, folded] : [raw];
}

/**
 * The front face of a double-faced name.
 *
 * `cards.name` stores both faces ("Agadeem's Awakening // Agadeem, the
 * Undercrypt"). A model naming only the front face is naming a real card, so
 * front faces are indexed alongside full names — but only as a *fallback*, and
 * only where the front face is not itself a different card's full name.
 */
export function frontFace(name: string): string | null {
  const i = name.indexOf('//');
  if (i < 0) return null;
  const front = name.slice(0, i).trim();
  return front || null;
}
