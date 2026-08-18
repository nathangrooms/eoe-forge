/**
 * The only part of the optimiser that talks to the database.
 *
 * Before this file existed the deck optimiser made ZERO queries: its single
 * outbound call was to an AI gateway, and every card name it produced came out
 * of a language model's memory with nothing checking it. Everything downstream
 * of here exists so that a card the user is told to buy is a row that exists.
 *
 * Three facts about `public.cards`, all measured against the live catalogue on
 * 2026-08-18, shape this module:
 *
 * 1. **PostgREST caps a response at 1000 rows.** Confirmed by response header
 *    `Content-Range: 0-999/25376` on an unranged request. So `fetchAll` pages,
 *    and it learns the true total from that header rather than guessing.
 * 2. **`cards` stores printings, not cards.** 32,881 commander-legal rows are
 *    31,833 distinct `oracle_id`s. Dedupe happens in the ranker (cheapest
 *    printing wins); this module returns rows as they are.
 * 3. **Never select the wide columns for the pool.** `oracle_text`, `faces`
 *    and the whole `image_uris` / `prices` / `legalities` objects are not
 *    needed to rank. `legalities` alone carries 23 keys per row and ranking
 *    reads one. Projecting `prices->>'usd'` and `legalities->>'<format>'`
 *    takes the worst-case five-colour pool from 28 MB to about 9 MB.
 *
 * Raw `fetch` against PostgREST rather than `@supabase/supabase-js`, because
 * paging needs the `Range` and `Content-Range` headers directly and the
 * function needs to forward the caller's own `Authorization` header verbatim
 * so that row-level security decides what a user's collection contains.
 */

import type { CandidateQuery, RawCardRow } from './_engine/deck/recommend/index.ts';

/** PostgREST's configured `db-max-rows` for this project, measured. */
export const PAGE_SIZE = 1000;

/** Pages fetched at once. Enough to be quick, few enough to be polite. */
const PAGE_CONCURRENCY = 6;

/**
 * A `cards` row as this function selects it.
 *
 * Extends the engine's `RawCardRow` (which already accepts the projected
 * `usd` / `legal_in_format` shape) with the two display columns the UI needs
 * and ranking does not: an image and a set code.
 */
export interface CatalogRow extends RawCardRow {
  image_url?: string | null;
  set_code?: string | null;
  rarity?: string | null;
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

  async #get<T>(pathAndQuery: string, extraHeaders: Record<string, string> = {}): Promise<{
    rows: T[];
    contentRange: string | null;
  }> {
    const res = await fetch(`${this.#url}/rest/v1/${pathAndQuery}`, {
      headers: this.#headers(extraHeaders),
    });
    if (!res.ok) {
      throw new Error(`PostgREST ${res.status} on ${pathAndQuery.slice(0, 120)}: ${await res.text()}`);
    }
    return { rows: (await res.json()) as T[], contentRange: res.headers.get('content-range') };
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
   */
  async fetchAll<T>(pathAndQuery: string): Promise<T[]> {
    pathAndQuery = withStableOrder(pathAndQuery);
    const first = await this.#get<T>(pathAndQuery, {
      Range: `0-${PAGE_SIZE - 1}`,
      'Range-Unit': 'items',
      Prefer: 'count=exact',
    });
    const rows = first.rows;

    // `Content-Range: 0-999/25376`. A `*` total means the count was refused;
    // fall back to sequential paging until a short page arrives.
    const total = Number(first.contentRange?.split('/')[1]);
    if (!Number.isFinite(total)) {
      for (let from = rows.length; ; from += PAGE_SIZE) {
        const page = await this.#get<T>(pathAndQuery, {
          Range: `${from}-${from + PAGE_SIZE - 1}`,
          'Range-Unit': 'items',
        });
        rows.push(...page.rows);
        if (page.rows.length < PAGE_SIZE) return rows;
      }
    }

    const starts: number[] = [];
    for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) starts.push(from);

    for (let i = 0; i < starts.length; i += PAGE_CONCURRENCY) {
      const batch = starts.slice(i, i + PAGE_CONCURRENCY);
      const pages = await Promise.all(
        batch.map(from =>
          this.#get<T>(pathAndQuery, {
            Range: `${from}-${from + PAGE_SIZE - 1}`,
            'Range-Unit': 'items',
          })
        )
      );
      for (const p of pages) rows.push(...p.rows);
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
   */
  async poolFor(query: CandidateQuery): Promise<CatalogRow[]> {
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
      'usd:prices->>usd',
      `legal_in_format:legalities->>${fmt}`,
    ].join(',');

    return this.fetchAll<CatalogRow>(
      `cards?select=${encodeURIComponent(select)}` +
        `&legalities->>${encodeURIComponent(fmt)}=eq.${query.legalityFilter.equals}` +
        `&color_identity=cd.${encodeURIComponent(identity)}`
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
   * Look up specific cards by exact name, with the display columns attached.
   *
   * Used for the deck's own cards and for the diagnostic pass that explains why
   * a model-suggested name never appeared in the pool. Chunked because a URL
   * carrying a hundred card names is already long.
   */
  async cardsByName(names: readonly string[], format: string): Promise<CatalogRow[]> {
    const fmt = format.toLowerCase();
    const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))];
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
      'usd:prices->>usd',
      'image_url:image_uris->>normal',
      'legalities',
    ].join(',');

    const out: CatalogRow[] = [];
    const CHUNK = 80;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const list = chunk.map(quoteForIn).join(',');
      const { rows } = await this.#get<CatalogRow>(
        `cards?select=${encodeURIComponent(select)}&name=in.${encodeURIComponent(`(${list})`)}`,
        { Range: `0-${PAGE_SIZE - 1}`, 'Range-Unit': 'items' }
      );
      out.push(...rows);
    }
    // `legalities` arrived whole here, so make the projected key available too
    // and keep `normalizeRow` on one code path.
    for (const r of out) r.legal_in_format = r.legalities?.[fmt] ?? null;
    return out;
  }

  /**
   * How many copies of each named card the calling user owns.
   *
   * Runs under the caller's own JWT, so row-level security (`auth.uid() =
   * user_id`) decides what comes back. An anonymous caller gets an empty map
   * rather than an error, and the suggestion is simply not marked as owned.
   */
  async ownedQuantities(names: readonly string[]): Promise<Map<string, number>> {
    const owned = new Map<string, number>();
    const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))];
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
 * Pin a paged query to a deterministic order.
 *
 * Appends `order=id.asc` unless the caller already chose an order, so a caller
 * with its own ordering keeps it rather than being silently overridden. Only
 * paged reads need this: a single request under the 1000-row cap returns one
 * whole result set, and there are no page boundaries for an unstable order to
 * fall across.
 */
export function withStableOrder(pathAndQuery: string, column = 'id'): string {
  // Match `order` as a whole query parameter, never as a substring of another
  // key — `&reorder=` and `&order_by=` must not read as an existing order.
  if (/[?&]order=/.test(pathAndQuery)) return pathAndQuery;
  return `${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}order=${column}.asc`;
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
 * The key card names are compared on.
 *
 * Case-insensitive, whitespace-collapsed, and with the typographic apostrophe
 * folded to the ASCII one — a model writing "Yawgmoth’s Will" means the card
 * stored as "Yawgmoth's Will", and letting that near-miss read as "this card
 * does not exist" would throw away a valid suggestion and overstate the
 * failure rate.
 */
export function normalizeName(name: string): string {
  return String(name ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
