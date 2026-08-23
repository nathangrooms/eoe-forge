/**
 * Scoring several decks without asking the database about them one at a time.
 *
 * ## Why
 *
 * The deck list's background rescore called `scoreDeckById` per deck, and that
 * is three requests each: `fetchDeckCards` reads one deck, then
 * `persistDeckPower` reads `edh_analysis` back before it writes it. Measured on
 * `/decks`: 37 `deck_cards` reads and 36 `user_decks` writes for 25 decks, on
 * top of the summary calls.
 *
 * ## The shape
 *
 * One read of `deck_cards` for every deck in the pass, one read of the card
 * metadata those rows point at — deduplicated, so a card in six decks is
 * fetched once instead of six times — and one write for the whole pass.
 *
 * The card metadata goes through `fetchCardsByIds`, which is the canonical
 * loader: it owns the column list and the normalisation, so this cannot drift
 * from what the deck page and the builder see. The score itself is
 * `computeDeckPower`, the same engine every other surface uses. There is no
 * second model here and there must never be one.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchCardsByIds, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  computeDeckPower,
  deckPowerRecord,
  entriesFromDeckRows,
  type DeckPower,
} from '@/lib/deck/power';

/** A deck to score: its id and the format the score is computed against. */
export interface DeckToScore {
  id: string;
  format: string;
}

/**
 * `.in()` lists are URL segments and a URL has a length. Deck ids are 36
 * characters each, so 100 is comfortable and matches `fetchCardsByIds`.
 */
const ID_CHUNK = 100;

/**
 * Decks per `persist_deck_power_batch` call.
 *
 * The function REFUSES more than 200 and raises rather than truncating, so an
 * unchunked payload would lose the whole write, not part of it. The deck list
 * only ever asks for twelve at a time; this is here so the next caller is not
 * the one that finds out.
 */
const WRITE_CHUNK = 100;

/**
 * Score a batch of decks from their real decklists, and persist the results in
 * one write.
 *
 * Returns a score per deck that could be scored. A deck whose rows could not be
 * read is simply absent, the way a failed `scoreDeckById` returned null.
 *
 * `persist` exists for the same reason it exists on `scoreDeckById`: a caller
 * that only wants a number should not write one.
 */
export async function scoreDecksInBatch(
  decks: DeckToScore[],
  options: { persist?: boolean } = {}
): Promise<Map<string, DeckPower>> {
  const scores = new Map<string, DeckPower>();
  if (decks.length === 0) return scores;

  const ids = decks.map(deck => deck.id);

  /* ------------------------------------------------- one read of the rows */

  interface RawRow {
    id: string;
    deck_id: string;
    card_id: string;
    card_name: string;
    quantity: number | null;
    is_commander: boolean | null;
    is_sideboard: boolean | null;
  }
  const raw: RawRow[] = [];

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('deck_cards')
      .select('id, deck_id, card_id, card_name, quantity, is_commander, is_sideboard')
      .in('deck_id', ids.slice(i, i + ID_CHUNK));

    if (error) {
      console.error('Could not read deck cards for scoring:', error);
      return scores;
    }
    raw.push(...((data ?? []) as RawRow[]));
  }

  if (raw.length === 0) return scores;

  /* ------------------------- one read of the card metadata, deduplicated */

  const cards = await fetchCardsByIds(raw.map(row => row.card_id));

  const byDeck = new Map<string, DeckCardRow[]>();
  for (const row of raw) {
    const rows = byDeck.get(row.deck_id) ?? [];
    rows.push({
      id: row.id,
      card_id: row.card_id,
      card_name: row.card_name,
      quantity: row.quantity ?? 1,
      is_commander: Boolean(row.is_commander),
      is_sideboard: Boolean(row.is_sideboard),
      card: cards.get(row.card_id) ?? null,
    });
    byDeck.set(row.deck_id, rows);
  }

  /* ------------------------------------------------------- score, locally */

  const toWrite: { deck_id: string; power_level: number; deckmatrix: unknown }[] = [];

  for (const deck of decks) {
    const rows = byDeck.get(deck.id);
    if (!rows || rows.length === 0) continue;

    try {
      const power = computeDeckPower(entriesFromDeckRows(rows), { format: deck.format });
      if (!power) continue;
      scores.set(deck.id, power);

      /* `deckPowerRecord` is the shape `persistDeckPower` writes, without the
         read that precedes it there. Written for exactly this: a caller that
         can merge locally and write once. */
      if (!power.stale) {
        const record = deckPowerRecord(power);
        toWrite.push({
          deck_id: deck.id,
          power_level: record.power_level,
          deckmatrix: record.deckmatrix,
        });
      }
    } catch (error) {
      console.error(`Could not score deck ${deck.id}:`, error);
    }
  }

  /* ------------------------------------------------------- one write, once */

  if (options.persist !== false && toWrite.length > 0) {
    for (let i = 0; i < toWrite.length; i += WRITE_CHUNK) {
      const { error } = await supabase.rpc('persist_deck_power_batch' as any, {
        p_scores: toWrite.slice(i, i + WRITE_CHUNK),
      } as any);

      /* A failed cache write must never break the surface that computed the
         score — the numbers are already correct in the Map being returned. */
      if (error) console.warn('Could not persist deck power:', error);
    }
  }

  return scores;
}
