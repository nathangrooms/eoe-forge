/**
 * The one place this feature casts around the generated Supabase types.
 *
 * `src/integrations/supabase/types.ts` is generated from the database schema
 * and is currently behind it: it predates `card_image_hashes`, its manifest
 * view, and even the `set_name` column on `cards`. Regenerating it is the real
 * fix, but that file is shared and is being edited by other work in flight, so
 * rewriting it here would clobber someone else's change.
 *
 * So the casts live here, in one module, rather than being sprinkled across
 * every query — that way regenerating the types later is a matter of deleting
 * this file's helpers, not hunting `as unknown as` through the feature. The
 * shapes below are checked against the migration in
 * `supabase/migrations/*_create_card_image_hashes.sql`; if they drift, the
 * queries fail loudly at runtime rather than returning wrong data, because
 * every field is read explicitly and missing ones surface as undefined.
 */

import { supabase } from '@/integrations/supabase/client';

/** Untyped client handle, for tables the generated types do not know about. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

/** Row shape of `public.card_image_hashes`, joined to `cards.oracle_id`. */
export interface CardImageHashRow {
  card_id: string;
  art_phash: string;
  art_dhash: string;
  hashed_at: string;
  cards: { oracle_id: string } | null;
}

/** Row shape of `public.card_image_hash_manifest`. */
export interface HashManifestRow {
  entry_count: number | string;
  newest_hashed_at: string | null;
  algo_version: number | null;
}

/** The `cards` columns the scan candidate list needs. */
export interface ScanCardRow {
  id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  set_name: string | null;
  collector_number: string | null;
  released_at: string | null;
  rarity: string | null;
  prices: Record<string, string | null> | null;
  image_uris: Record<string, string> | null;
}
