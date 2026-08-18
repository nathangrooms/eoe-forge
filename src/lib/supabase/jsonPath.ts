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

/** `select('*', { count: 'exact', head: true })` over `cards`, awaiting a JSON-path `.eq`. */
export const countCardsWhere = (): CountBuilder =>
  supabase
    .from('cards')
    .select('*', { count: 'exact', head: true }) as unknown as CountBuilder;

/** `select(columns)` over `cards`, awaiting a JSON-path `.eq` plus normal filters. */
export const selectCardsWhere = (columns: string): RowsBuilder =>
  supabase.from('cards').select(columns) as unknown as RowsBuilder;
