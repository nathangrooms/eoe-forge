/**
 * The hard filters, and the shape of the query that applies them.
 *
 * This module builds a *description* of the candidate query. It never executes
 * anything, so it stays pure and testable; an adapter turns the description
 * into a Supabase call. That split is deliberate: the rules about what may
 * legally be suggested are the part worth unit-testing, and they should not
 * require a database to test.
 *
 * Three things are load-bearing, all of them measured against the live
 * catalogue on 2026-08-18:
 *
 * 1. **Only seven formats have a supporting index.** `cards` carries 23 format
 *    keys in `legalities`, but partial expression indexes exist for exactly
 *    commander, legacy, modern, pauper, pioneer, standard and vintage. A query
 *    on any other key cannot use an index and falls back to a sequential scan
 *    of 34,088 rows — the road to a Postgres 57014 statement timeout. Callers
 *    asking for an unindexed format get told so, explicitly, instead of
 *    silently issuing a scan.
 *
 * 2. **`color_identity <@ ...` is a post-filter, not an index scan.** Verified
 *    with EXPLAIN ANALYZE: the planner uses `cards_legal_commander_idx` and
 *    then filters colour identity as a plain `Filter` step, discarding 20,029
 *    of 32,881 rows for a two-colour commander in 65 ms. That is fine — but
 *    only because the legality index goes first. Order the filters the other
 *    way and there is nothing to drive the scan.
 *
 * 3. **Never select the wide columns.** `oracle_text`, `image_uris` and
 *    `faces` are not needed to rank, and a five-colour commander's legal pool
 *    is 32,881 rows. Selecting them would move tens of megabytes to rank a
 *    list of forty.
 *
 * Pure. No network, no AI.
 */

import type { CandidateCard, Color, DeckProfile } from '../core/types.ts';
import { COLORS } from '../core/types.ts';

/**
 * Formats with a partial expression index on `legalities->>'<format>'`.
 *
 * Read off `pg_indexes` for `public.cards`. Keep in step with the database: a
 * format added here without its index reintroduces the sequential scan.
 */
export const INDEXED_FORMATS: ReadonlySet<string> = new Set([
  'commander',
  'legacy',
  'modern',
  'pauper',
  'pioneer',
  'standard',
  'vintage',
]);

/**
 * Columns the ranker reads, as raw SQL projections.
 *
 * `prices` and `legalities` are projected down to the single key each that
 * ranking needs, and this is not a micro-optimisation. Measured on the live
 * catalogue for a five-colour commander (32,881 rows, the worst case):
 *
 *   whole `prices` + whole `legalities` objects ... 28 MB
 *   `prices->>'usd'` + `legalities->>'<format>'` .. 9.4 MB
 *
 * `legalities` carries 23 format keys per row and ranking reads exactly one.
 * Shipping the other 22 tripled the payload of every request.
 *
 * The PostgREST equivalent of these two projections is
 * `usd:prices->>usd, legal_in_format:legalities->>${format}`.
 */
export function selectColumns(format: string): string[] {
  return [
    'id',
    'oracle_id',
    'name',
    'type_line',
    'cmc',
    'color_identity',
    'tags',
    'mana_cost',
    // A popularity prior, not a verdict. See `CandidateCard.edhrecRank`.
    'edhrec_rank',
    `prices->>'usd' as usd`,
    `legalities->>'${format}' as legal_in_format`,
  ];
}

export class UnindexedFormatError extends Error {
  readonly format: string;
  constructor(format: string) {
    super(
      `No index supports format "${format}". The query falls back to a bitmap ` +
        `heap scan driven by cards_color_identity_idx. That was measured at ` +
        `roughly 5x the cost of an indexed format, and it degrades as the table grows. ` +
        `Indexed formats: ${[...INDEXED_FORMATS].sort().join(', ')}.`
    );
    this.name = 'UnindexedFormatError';
    this.format = format;
  }
}

/**
 * A declarative description of the candidate query.
 *
 * Note there is no `limit`. That is the point: the pool is filtered on hard
 * rules only, and truncation happens after ranking. A limit here would pick an
 * arbitrary slice of the table and rank the leftovers.
 */
export interface CandidateQuery {
  table: 'cards';
  columns: readonly string[];
  /** `legalities->>'<format>' = 'legal'`, which the partial index serves. */
  legalityFilter: { column: 'legalities'; key: string; equals: 'legal' };
  /** `color_identity <@ '{...}'`: strict subset of the commander's identity. */
  colorIdentityFilter: { column: 'color_identity'; containedBy: Color[] };
  /**
   * Whether a partial index on this format's legality exists.
   *
   * Measured on the live catalogue for a two-colour identity:
   *
   *   commander (indexed) ... 89 ms, index scan
   *   brawl (unindexed) ..... 497 ms, bitmap heap scan, 7,901 heap blocks
   *
   * So an unindexed format is roughly 5x the cost and scales worse, but it is
   * not a timeout at 34,088 rows against a 2 minute `statement_timeout`. It is
   * reported rather than forbidden, because refusing it would lock out brawl,
   * duel, oathbreaker and predh — real formats this engine otherwise supports.
   * Callers that would rather fail than run it can pass `requireIndex`.
   */
  usesIndex: boolean;
  /** Always false — kept explicit so the discipline is visible and testable. */
  limit: null;
}

export interface BuildQueryOptions {
  /** Throw `UnindexedFormatError` instead of returning `usesIndex: false`. */
  requireIndex?: boolean;
}

/**
 * Build the hard-filter query for a deck.
 *
 * @throws {UnindexedFormatError} only when `requireIndex` is set and the
 * format has no supporting index.
 */
export function buildCandidateQuery(
  profile: DeckProfile,
  options: BuildQueryOptions = {}
): CandidateQuery {
  const format = profile.format.toLowerCase();
  const usesIndex = INDEXED_FORMATS.has(format);
  if (!usesIndex && options.requireIndex) throw new UnindexedFormatError(format);

  return {
    usesIndex,
    table: 'cards',
    columns: selectColumns(format),
    legalityFilter: { column: 'legalities', key: format, equals: 'legal' },
    colorIdentityFilter: {
      column: 'color_identity',
      // Sorted so the emitted SQL is byte-identical for the same identity.
      containedBy: normalizeIdentity(profile.colorIdentity),
    },
    limit: null,
  };
}

/** Render the query as SQL. Used by the adapter and by tests. */
export function toSql(q: CandidateQuery): string {
  const ci = q.colorIdentityFilter.containedBy;
  const arr = ci.length ? `ARRAY[${ci.map(c => `'${c}'`).join(',')}]::text[]` : `ARRAY[]::text[]`;
  return (
    `select ${q.columns.join(', ')} from ${q.table} ` +
    `where ${q.legalityFilter.column}->>'${q.legalityFilter.key}' = '${q.legalityFilter.equals}' ` +
    `and ${q.colorIdentityFilter.column} <@ ${arr}`
  );
}

/** Dedupe, upper-case and sort a colour identity into canonical WUBRG order. */
export function normalizeIdentity(identity: readonly string[] | null | undefined): Color[] {
  if (!identity?.length) return [];
  const seen = new Set(identity.map(c => String(c).toUpperCase()));
  return COLORS.filter(c => seen.has(c));
}

/**
 * Is `cardIdentity` a subset of `deckIdentity`?
 *
 * This is the same rule the SQL `<@` applies, restated in TypeScript so the
 * ranker can enforce it a second time on whatever the database returned. The
 * duplication is intentional: SQL is the fast path, this is the guarantee.
 */
export function withinIdentity(
  cardIdentity: readonly string[] | null | undefined,
  deckIdentity: readonly string[] | null | undefined
): boolean {
  const allowed = new Set(normalizeIdentity(deckIdentity));
  for (const c of normalizeIdentity(cardIdentity)) {
    if (!allowed.has(c)) return false;
  }
  return true;
}

/** Is this card legal in this format according to its own legalities map? */
export function isLegalIn(
  legalities: Record<string, string> | null | undefined,
  format: string
): boolean {
  if (!legalities) return false;
  return legalities[format.toLowerCase()] === 'legal';
}

/* ------------------------------------------------------------------ *
 * Row normalisation
 * ------------------------------------------------------------------ */

/**
 * A raw `cards` row.
 *
 * Both the projected shape (`usd`, `legal_in_format` — what `selectColumns`
 * asks for) and the whole-object shape (`prices`, `legalities`) are accepted,
 * so a caller that already holds full rows can rank them without a re-fetch.
 */
export interface RawCardRow {
  id: string;
  oracle_id: string | null;
  name: string;
  type_line: string | null;
  /** `numeric` — arrives as a string. */
  cmc: number | string | null;
  color_identity: string[] | null;
  tags: string[] | null;
  mana_cost: string | null;
  /** Projected `prices->>'usd'`. */
  usd?: string | number | null;
  /** Whole `prices` object, when not projected. */
  prices?: { usd?: string | number | null } | null;
  /** Scryfall's EDHREC popularity rank. Null until the sync has reached it. */
  edhrec_rank?: number | string | null;
  /** Projected `legalities->>'<format>'`. */
  legal_in_format?: string | null;
  /** Whole `legalities` map, when not projected. */
  legalities?: Record<string, string> | null;
}

/**
 * Coerce a raw row into a `CandidateCard`.
 *
 * `cmc` is `numeric` and `prices->>'usd'` is a JSON string, so both arrive as
 * strings over the wire. Coercing them at the boundary — once — keeps every
 * comparison downstream a real numeric comparison rather than a string one,
 * where '10' < '9'.
 */
export function normalizeRow(row: RawCardRow, format?: string): CandidateCard {
  // Rebuild a legalities map from whichever shape arrived. When the row was
  // projected we only know about one format — which is the one being asked
  // about, so `isLegalIn` still answers correctly, and every other format
  // correctly reads as "not legal" rather than as an optimistic guess.
  // Guarded rather than trusted: `rows.map(normalizeRow)` would hand the array
  // index in as `format`, and a number here would throw on `.toLowerCase()`.
  const fmt = typeof format === 'string' && format ? format.toLowerCase() : null;

  let legalities: Record<string, string>;
  if (row.legalities) {
    legalities = row.legalities;
  } else if (fmt && row.legal_in_format != null) {
    legalities = { [fmt]: row.legal_in_format };
  } else {
    legalities = {};
  }

  return {
    id: row.id,
    // Fall back to the printing id so a null oracle_id cannot collapse
    // unrelated cards into one another during dedupe.
    oracleId: row.oracle_id ?? row.id,
    name: row.name,
    typeLine: row.type_line ?? '',
    cmc: toNumber(row.cmc) ?? 0,
    colorIdentity: normalizeIdentity(row.color_identity),
    tags: row.tags ?? [],
    manaCost: row.mana_cost ?? null,
    usd: toNumber(row.usd ?? row.prices?.usd ?? null),
    legalities,
    edhrecRank: toNumber(row.edhrec_rank ?? null),
  };
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
