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
