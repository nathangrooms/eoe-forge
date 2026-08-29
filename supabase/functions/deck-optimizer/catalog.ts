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
  keywords?: string[] | null;
  prices?: { usd?: string | number | null } | null;
}

export interface CatalogOptions {
  url: string;
  anonKey: string;
  /** The caller's own `Authorization` header, forwarded for RLS. */
  authorization?: string | null;
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
  async fetchAll<T>(pathAndQuery: string): Promise<T[]> {
    const rows: T[] = [];
    let after: string | null = null;

    // A hard stop, so a malformed cursor can never spin forever. 200 pages is
    // 200,000 rows, comfortably past the whole catalogue.
    for (let page = 0; page < 200; page++) {
      const url = withKeyset(pathAndQuery, after);
      const result = await this.#get<T>(url, {
        Range: `0-${PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
      });
      rows.push(...result.rows);
      if (result.rows.length < PAGE_SIZE) return rows;

      const last = result.rows[result.rows.length - 1] as { id?: unknown };
      const lastId = typeof last?.id === 'string' ? last.id : null;
      if (!lastId) {
        // A caller that did not select `id` cannot be keyset-paged. That is a
        // programming error rather than a data condition, so it says so instead
        // of quietly returning whatever the first page held.
        throw new Error(
          `fetchAll needs "id" in the select to page: ${pathAndQuery.slice(0, 120)}`
        );
      }
      after = lastId;
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
  async poolFor(
    query: CandidateQuery,
    opts?: { withOracleText?: boolean }
  ): Promise<CatalogRow[]> {
    const fmt = query.legalityFilter.key;
    const identity = `{${query.colorIdentityFilter.containedBy.join(',')}}`;

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
      // A popularity prior for the ranker. Cheap: one integer column.
      'edhrec_rank',
      ...(opts?.withOracleText ? ['oracle_text'] : []),
      'usd:prices->>usd',
      `legal_in_format:legalities->>${fmt}`,
    ].join(',');

    return this.fetchAll<CatalogRow>(
      `${POOL_TABLE}?select=${encodeURIComponent(select)}` +
        `&legalities->>${encodeURIComponent(fmt)}=eq.${query.legalityFilter.equals}` +
        `&color_identity=cd.${encodeURIComponent(identity)}`
    );
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
