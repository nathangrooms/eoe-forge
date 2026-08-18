import { supabase } from '@/integrations/supabase/client';

/**
 * Loose-typed builders for JSON-path filters on the `cards` table.
 *
 * The generated Supabase types describe `legalities` as a single jsonb column,
 * so a PostgREST JSON-path filter (`legalities->>commander`) is not expressible
 * as a typed column name. Threading one through the typed query builder makes
 * TypeScript exceed its instantiation-depth limit (TS2589).
 *
 * These helpers drop to a minimal structural type for that one call chain. The
 * queries themselves are unchanged — only the static column typing is given up,
 * and only where the generated types cannot represent the filter anyway.
 */

type CountBuilder = {
  eq: (column: string, value: string) => PromiseLike<{ count: number | null }>;
};

type RowsBuilder = {
  eq: (column: string, value: string) => RowsBuilder;
  in: (column: string, values: readonly string[]) => RowsBuilder;
  not: (column: string, operator: string, value: unknown) => RowsBuilder;
  limit: (n: number) => PromiseLike<{ data: unknown[] | null }>;
};

/**
 * Count-only query over `cards`, awaiting a JSON-path `.eq`.
 *
 * Selects `id` rather than `*`: on a count-only HEAD request PostgREST still
 * materialises every selected column, and asking for `*` over this table (which
 * carries several large jsonb columns) makes the request fail with a 500. The
 * count is identical either way.
 */
export const countCardsWhere = (): CountBuilder =>
  supabase
    .from('cards')
    .select('id', { count: 'exact', head: true }) as unknown as CountBuilder;

/** `select(columns)` over `cards`, awaiting a JSON-path `.eq` plus normal filters. */
export const selectCardsWhere = (columns: string): RowsBuilder =>
  supabase.from('cards').select(columns) as unknown as RowsBuilder;
