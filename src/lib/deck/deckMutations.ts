import { supabase } from '@/integrations/supabase/client';
import type { DeckCardDetail, DeckCardRow } from './deckCards';
import { deckPowerRecord, type DeckPower } from './power';

/**
 * Every write a deck page makes, in one place, one row at a time.
 *
 * ## Why this exists
 *
 * The builder wrote a deck by rewriting it. `deckStore.updateDeck` read the
 * user, patched `user_decks`, selected every `deck_cards` row, deleted the
 * difference, upserted the commander and then upserted *every remaining card*.
 * Measured on the built bundle with `scripts/deck-save-measure.mjs`, removing
 * one card from a hundred-card deck cost **8 Supabase requests**, one of which
 * re-upserted 98 rows that had not changed, plus a read-then-write pair to
 * cache the power score:
 *
 * ```
 * GET    user_collections
 * PATCH  user_decks          <- also overwrote the deck description
 * GET    deck_cards   (100)
 * DELETE deck_cards   (1)
 * POST   deck_cards   (1)    <- commander
 * POST   deck_cards   (98)   <- every card that did not change
 * GET    user_decks          <- persistDeckPower reads to merge
 * PATCH  user_decks          <- persistDeckPower writes
 * ```
 *
 * An edit is one row. So every function here touches one row, by its primary
 * key where it has one, and nothing else in the deck is rewritten to save it.
 *
 * ## Two bugs this shape removes rather than fixes
 *
 * **The description.** `updateDeck` wrote
 * `description: '<format> deck with <n> cards'` on every save, and the deck
 * page renders that field as the owner's own prose. Nothing here writes
 * `description` unless the caller is explicitly setting it.
 *
 * **The sideboard.** The store had no `is_sideboard` field and upserted
 * `is_sideboard: false` for every card, so opening a deck with a sideboard in
 * the builder and letting the autosave fire folded the sideboard into the
 * maindeck. These functions carry `is_sideboard` off the row they were handed.
 */

/** A card arriving from search, Scryfall, the optimiser or an import. */
export interface IncomingCard {
  id: string;
  name: string;
  type_line?: string | null;
  mana_cost?: string | null;
  cmc?: number | null;
  colors?: string[] | null;
  color_identity?: string[] | null;
  image_uris?: Record<string, string> | null;
  prices?: Record<string, string | null> | null;
  oracle_text?: string | null;
  power?: string | null;
  toughness?: string | null;
  rarity?: string | null;
  set?: string | null;
  set_code?: string | null;
  legalities?: Record<string, string> | null;
  keywords?: string[] | null;
  tags?: string[] | null;
  is_legendary?: boolean | null;
}

/**
 * Shape an incoming card as the joined metadata a `DeckCardRow` carries.
 *
 * Without this, a card added in-session rendered from a different shape than
 * the same card after a reload: the builder's store card carried no
 * `legalities`, no `power`, no `toughness` and no `keywords`, so the legality
 * check and the power engine both read a card that looked different depending
 * on how recently it had been added.
 */
export function detailFromCard(card: IncomingCard): DeckCardDetail {
  return {
    name: card.name,
    type_line: card.type_line ?? '',
    mana_cost: card.mana_cost ?? null,
    cmc: Number(card.cmc ?? 0),
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? card.colors ?? [],
    image_uris: card.image_uris ?? null,
    prices: card.prices ?? null,
    oracle_text: card.oracle_text ?? null,
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    rarity: card.rarity ?? null,
    set_code: card.set_code ?? card.set ?? null,
    legalities: card.legalities ?? null,
    is_legendary:
      card.is_legendary ??
      (card.type_line ?? '').toLowerCase().includes('legendary'),
    keywords: card.keywords ?? [],
    tags: card.tags ?? [],
  };
}

/** A local row for a card that is not saved yet. Replaced by the real id. */
export function optimisticRow(
  card: IncomingCard,
  options: { quantity?: number; isCommander?: boolean; isSideboard?: boolean } = {}
): DeckCardRow {
  return {
    id: `pending-${card.id}`,
    card_id: card.id,
    card_name: card.name,
    quantity: options.quantity ?? 1,
    is_commander: options.isCommander ?? false,
    is_sideboard: options.isSideboard ?? false,
    card: detailFromCard(card),
  };
}

/**
 * Put a card in the deck, or change how many copies are in it.
 *
 * One upsert on `(deck_id, card_id)`, which is the constraint the table
 * already carries, so adding a card the deck has never held and changing the
 * count of one it does are the same single request.
 */
export async function upsertDeckCard(
  deckId: string,
  row: Pick<DeckCardRow, 'card_id' | 'card_name' | 'quantity' | 'is_commander' | 'is_sideboard'>
): Promise<string | null> {
  const { data, error } = await supabase
    .from('deck_cards')
    .upsert(
      {
        deck_id: deckId,
        card_id: row.card_id,
        card_name: row.card_name,
        quantity: row.quantity,
        is_commander: row.is_commander,
        is_sideboard: row.is_sideboard,
      },
      { onConflict: 'deck_id,card_id', ignoreDuplicates: false }
    )
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data as { id?: string } | null)?.id ?? null;
}

/** Take a card out of the deck. One delete, by primary key where we have one. */
export async function deleteDeckCard(deckId: string, row: DeckCardRow): Promise<void> {
  const query = supabase.from('deck_cards').delete();
  const { error } = row.id.startsWith('pending-')
    ? await query.eq('deck_id', deckId).eq('card_id', row.card_id)
    : await query.eq('id', row.id);
  if (error) throw error;
}

/**
 * Swap the commander.
 *
 * Two writes, because it is two facts: the old commander stops being one and
 * the new one starts. The old row is deleted rather than demoted — a commander
 * that has been replaced is not a card in the ninety-nine, and leaving it there
 * silently puts the deck one card over.
 */
export async function setDeckCommander(
  deckId: string,
  previous: DeckCardRow | null,
  card: IncomingCard
): Promise<void> {
  if (previous && previous.card_id !== card.id) {
    await deleteDeckCard(deckId, previous);
  }
  await upsertDeckCard(deckId, {
    card_id: card.id,
    card_name: card.name,
    quantity: 1,
    is_commander: true,
    is_sideboard: false,
  });
}

/** Add many cards at once. One request, because an import is one action. */
export async function upsertDeckCards(
  deckId: string,
  rows: Array<Pick<DeckCardRow, 'card_id' | 'card_name' | 'quantity' | 'is_commander' | 'is_sideboard'>>
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('deck_cards').upsert(
    rows.map(row => ({
      deck_id: deckId,
      card_id: row.card_id,
      card_name: row.card_name,
      quantity: row.quantity,
      is_commander: row.is_commander,
      is_sideboard: row.is_sideboard,
    })),
    { onConflict: 'deck_id,card_id', ignoreDuplicates: false }
  );
  if (error) throw error;
}

/** Remove many rows at once. Used by import-as-replacement. */
export async function deleteDeckCards(rowIds: string[]): Promise<void> {
  const real = rowIds.filter(id => !id.startsWith('pending-'));
  if (real.length === 0) return;
  const { error } = await supabase.from('deck_cards').delete().in('id', real);
  if (error) throw error;
}

export interface DeckRecordPatch {
  name?: string;
  description?: string;
  colors?: string[];
  format?: string;
}

/**
 * The deck's own record, and the power cache, in one request.
 *
 * `persistDeckPower` reads `edh_analysis` before writing it, so the score cache
 * costs two requests every time it moves. The page already holds that column
 * from its own load, so it can merge locally and write once. `touch` keeps
 * `updated_at` moving, which is what orders My Decks by "recently edited"; it
 * rides along here rather than being a request of its own.
 */
export async function saveDeckRecord(
  deckId: string,
  patch: DeckRecordPatch,
  options: {
    power?: DeckPower | null;
    /** The `edh_analysis` this page already loaded, so nothing is read back. */
    edhAnalysis?: Record<string, unknown> | null;
    touch?: boolean;
  } = {}
): Promise<void> {
  const update: Record<string, unknown> = { ...patch };
  if (options.touch !== false) update.updated_at = new Date().toISOString();

  if (options.power && !options.power.stale) {
    const record = deckPowerRecord(options.power);
    update.power_level = record.power_level;
    update.edh_analysis = { ...(options.edhAnalysis ?? {}), deckmatrix: record.deckmatrix };
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from('user_decks').update(update as never).eq('id', deckId);
  if (error) throw error;
}
