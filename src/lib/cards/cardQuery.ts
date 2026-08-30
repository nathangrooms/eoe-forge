/**
 * Start a card query having already said which mode you want.
 *
 * `supabase.from('cards')` is the shape that caused the problem this file
 * exists to prevent: it reads as "the cards table" and now returns every
 * printing, so a commander picker written that way offers the same legend once
 * per printing. These two functions make the choice impossible to skip.
 *
 * The rule for choosing is in ./source.ts. Short version: unique unless the
 * individual printing IS the subject (a collection row, a listing, a scan
 * result, the art variants on a card page).
 */

import { supabase } from '@/integrations/supabase/client';
import { CARD_RELATION } from './source';

/**
 * One row per card. The default.
 *
 * Reads `cards_unique`, a materialized view holding the cheapest printing of
 * each card. Its UNIQUE index on oracle_id means a duplicate cannot come back
 * from here even if something upstream goes wrong.
 *
 * It is refreshed when the sync finishes and after the nightly price capture,
 * so it lags `cards` by at most one of those. That is the right trade for
 * search and suggestions and the wrong one for a price you are about to charge
 * someone, which is why collection and marketplace read printings instead.
 */
export function uniqueCards() {
  return supabase.from(CARD_RELATION.unique as 'cards');
}

/**
 * Every printing.
 *
 * Only for surfaces where the printing is the subject. If you are about to
 * dedupe the result, you wanted `uniqueCards()`.
 */
export function cardPrintings() {
  return supabase.from(CARD_RELATION.printings as 'cards');
}

/**
 * Every printing of one card, newest first.
 *
 * The art variants list on a card page, and the "which one do I own" picker a
 * collection row needs. Served by idx_cards_oracle_id_released.
 */
export function printingsOf(oracleId: string) {
  return cardPrintings()
    .select('*')
    .eq('oracle_id', oracleId)
    .order('released_at', { ascending: false });
}

/**
 * Printing id to the card it is a printing of, for a set of ids.
 *
 * The lookup `src/lib/cards/ownership.ts` needs and cannot do for itself: that
 * module imports nothing so it can be tested, which is the same reason
 * `invokeWithRetry.ts` gives.
 *
 * Chunked at 150 ids, the size `collectionBatch.ts` settled on for the same
 * reason: an `.in()` list is a URL segment and a URL has a length. A user with
 * fifteen decks asks about roughly 1,500 ids, so this is ten requests rather
 * than 1,500, and it is the only extra read the ownership fix costs.
 *
 * A failed chunk is logged and skipped rather than thrown. Every consumer of
 * the index falls back to the printing id when a lookup misses, so a partial
 * index degrades to the old printing-only behaviour for the rows it could not
 * resolve instead of reporting that nothing is owned.
 */
export async function oracleIndexFor(ids: Iterable<string>): Promise<Map<string, string | null>> {
  const unique = [...new Set([...ids].filter(Boolean))];
  const out = new Map<string, string | null>();
  const CHUNK = 150;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await cardPrintings().select('id, oracle_id').in('id', slice);
    if (error) {
      console.warn('Could not resolve printings to cards:', error);
      continue;
    }
    for (const row of data ?? []) {
      out.set((row as { id: string }).id, (row as { oracle_id: string | null }).oracle_id ?? null);
    }
  }

  return out;
}
