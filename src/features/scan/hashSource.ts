/**
 * Where the browser gets the hash index from.
 *
 * Thin adapter over the Supabase client implementing the `HashSource` interface
 * that `src/lib/vision/loadIndex.ts` depends on. It exists so the vision
 * library stays free of any Supabase import and can be exercised in Node with a
 * stub — which is how its accuracy is measured.
 */

import type { HashSource, HashRowDto } from '@/lib/vision/loadIndex';
import { db, type CardImageHashRow, type HashManifestRow } from './visionDb';

/**
 * Page size for the initial index download.
 *
 * PostgREST caps a single response, and 2,000 rows of {uuid, uuid, 2x16 hex
 * chars, timestamp} is roughly 250 KB of JSON — big enough that the ~25 round
 * trips for the whole catalogue are not the bottleneck, small enough that a
 * flaky connection retries something reasonable.
 */
const PAGE_SIZE = 2000;

export const supabaseHashSource: HashSource = {
  async fetchManifest() {
    const { data, error } = await db
      .from('card_image_hash_manifest')
      .select('entry_count,newest_hashed_at,algo_version')
      .maybeSingle();
    if (error) throw error;
    const row = data as HashManifestRow | null;
    return {
      entryCount: Number(row?.entry_count ?? 0),
      newestHashedAt: row?.newest_hashed_at ?? null,
      algoVersion: Number(row?.algo_version ?? 0),
    };
  },

  async fetchRows(_since, afterCardId, limit) {
    // Joined to `cards` for `oracle_id`, which is what groups printings of the
    // same card. Keeping it out of `card_image_hashes` avoids a second copy of
    // a value that can change when Scryfall re-keys a card.
    //
    // Keyset paging on the primary key, NOT `.range()`. These ~25 pages are
    // read over many seconds while the catalogue sync inserts into the same
    // table, and an offset range under concurrent inserts silently skips rows.
    // See the contract note on `HashSource.fetchRows` for why a skipped row
    // becomes a committed wrong printing rather than a visible failure.
    let query = db
      .from('card_image_hashes')
      .select('card_id,art_phash,art_dhash,hashed_at,cards!inner(oracle_id)')
      .order('card_id', { ascending: true })
      .limit(limit);
    if (afterCardId !== null) query = query.gt('card_id', afterCardId);

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as CardImageHashRow[]).map(
      (r): HashRowDto => ({
        card_id: r.card_id,
        // Falling back to the card id keeps each printing in its own group,
        // which is the safe direction: it can only make the engine offer a
        // choice it did not need to, never merge two different cards.
        oracle_id: r.cards?.oracle_id ?? r.card_id,
        art_phash: r.art_phash,
        art_dhash: r.art_dhash,
        hashed_at: r.hashed_at,
      }),
    );
  },
};

export { PAGE_SIZE };
