/**
 * Reading and writing lists.
 *
 * Everything that changes a list goes through one of the database verbs
 * (`card_list_add`, `card_list_mark_bought`, `card_list_mark_arrived`,
 * `card_list_file`, `card_list_reset`) rather than being assembled out of three
 * client round trips. Filing is the reason: it writes the collection, a storage
 * box and a deck, and three separate requests can half succeed and leave a card
 * in a box that the collection has never heard of. One statement either does
 * all of it or none of it.
 *
 * The verbs run as the caller, not with elevated rights, so nothing here can
 * reach a row the user could not have reached with plain SQL.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CardListItem, Finish, ItemSource, ListKind } from './list.ts';
import type { DeckShortfallRow, WishlistSourceRow } from './assemble.ts';

/**
 * Everything a list row needs to draw itself and price itself.
 *
 * `finishes` earns its place: it is what tells "no foil price" apart from
 * "never printed in foil", and the price panel says different things for the
 * two. `faces` is what lets a double faced card flip in the grid.
 */
const CARD_COLUMNS =
  'id, oracle_id, name, set_code, set_name, collector_number, type_line, rarity, ' +
  'mana_cost, cmc, colors, color_identity, layout, image_uris, prices, finishes, faces';

export interface AddToListInput {
  kind: ListKind;
  cardId: string;
  cardName: string;
  quantity?: number;
  finish?: Finish;
  source?: ItemSource;
  sourceDeckId?: string | null;
  oracleId?: string | null;
  note?: string | null;
}

export async function addToList(input: AddToListInput): Promise<CardListItem> {
  const { data, error } = await supabase.rpc('card_list_add', {
    p_kind: input.kind,
    p_card_id: input.cardId,
    p_card_name: input.cardName,
    p_quantity: input.quantity ?? 1,
    p_finish: input.finish ?? 'nonfoil',
    p_source: input.source ?? 'manual',
    p_source_deck_id: input.sourceDeckId ?? undefined,
    p_oracle_id: input.oracleId ?? undefined,
    p_note: input.note ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CardListItem;
}

export async function setQuantity(itemId: string, quantity: number): Promise<void> {
  if (quantity < 1) {
    await removeItem(itemId);
    return;
  }
  const { error } = await supabase
    .from('card_list_items')
    .update({ quantity })
    .eq('id', itemId);
  if (error) throw error;
}

export async function removeItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('card_list_items').delete().eq('id', itemId);
  if (error) throw error;
}

export interface MarkBoughtInput {
  itemId: string;
  quantity?: number;
  /** What was paid for ONE copy, in the money it was paid in. Null is allowed. */
  paidUnit?: number | null;
  paidCurrency?: 'USD' | 'EUR' | null;
  boughtAt?: string | null;
}

export async function markBought(input: MarkBoughtInput): Promise<CardListItem> {
  const { data, error } = await supabase.rpc('card_list_mark_bought', {
    p_item_id: input.itemId,
    p_quantity: input.quantity ?? undefined,
    p_paid_unit: input.paidUnit ?? undefined,
    p_paid_currency: input.paidCurrency ?? undefined,
    p_bought_at: input.boughtAt ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CardListItem;
}

export async function markArrived(
  itemId: string,
  arrived?: { cardId?: string | null; finish?: Finish | null }
): Promise<CardListItem> {
  const { data, error } = await supabase.rpc('card_list_mark_arrived', {
    p_item_id: itemId,
    p_arrived_card_id: arrived?.cardId ?? undefined,
    p_arrived_finish: arrived?.finish ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CardListItem;
}

export interface FileInput {
  itemId: string;
  toCollection?: boolean;
  containerId?: string | null;
  deckId?: string | null;
}

export async function fileArrival(input: FileInput): Promise<CardListItem> {
  const { data, error } = await supabase.rpc('card_list_file', {
    p_item_id: input.itemId,
    p_to_collection: input.toCollection ?? true,
    p_container_id: input.containerId ?? undefined,
    p_deck_id: input.deckId ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CardListItem;
}

export async function resetItem(itemId: string): Promise<CardListItem> {
  const { data, error } = await supabase.rpc('card_list_reset', { p_item_id: itemId });
  if (error) throw error;
  return data as unknown as CardListItem;
}

/* -------------------------------------------------------------------- reads */

/** Supabase caps URL length, so `.in()` lists are chunked rather than sent whole. */
const CHUNK = 150;

async function fetchCards(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .in('id', unique.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data ?? []) out.set((row as any).id, row);
  }
  return out;
}

/**
 * Every row of one of the caller's lists, with its card joined on.
 *
 * The join is done here rather than as a PostgREST embed because `card_id` has
 * no foreign key to `cards` (text imports and older decks carry ids that are
 * not in the catalogue), and PostgREST can only embed across a real key.
 */
export async function loadListItems(kind: ListKind): Promise<CardListItem[]> {
  const { data, error } = await supabase
    .from('card_list_items')
    .select('*')
    .eq('kind', kind)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as CardListItem[];
  const cards = await fetchCards(
    rows.flatMap(r => [r.card_id, r.arrived_card_id].filter((v): v is string => Boolean(v)))
  );
  return rows.map(row => ({ ...row, card: cards.get(row.arrived_card_id ?? row.card_id) }));
}

/** Wishlist rows, priced and illustrated, ready to merge into the list. */
export async function loadWishlistSource(userId: string): Promise<WishlistSourceRow[]> {
  const { data, error } = await supabase
    .from('wishlist')
    .select('id, card_id, card_name, quantity')
    .eq('user_id', userId);
  if (error) throw error;

  const rows = data ?? [];
  const cards = await fetchCards(rows.map(r => r.card_id));
  return rows.map(row => ({ ...row, card: cards.get(row.card_id) }));
}

/**
 * What each deck is short of, after the collection is taken into account.
 *
 * This is the same shape the wishlist page computes for its "by deck" tab. It
 * is recomputed here rather than shared with that page because that page is
 * another agent's file today; the two must be kept saying the same thing.
 */
export async function loadDeckShortfalls(userId: string): Promise<DeckShortfallRow[]> {
  const { data: decks, error: decksError } = await supabase
    .from('user_decks')
    .select('id, name')
    .eq('user_id', userId);
  if (decksError) throw decksError;
  if (!decks?.length) return [];

  const [{ data: deckCards, error: deckCardsError }, { data: owned, error: ownedError }] =
    await Promise.all([
      supabase
        .from('deck_cards')
        .select('deck_id, card_id, card_name, quantity')
        .in('deck_id', decks.map(d => d.id))
        .eq('is_sideboard', false),
      supabase.from('user_collections').select('card_id, quantity, foil').eq('user_id', userId),
    ]);
  if (deckCardsError) throw deckCardsError;
  if (ownedError) throw ownedError;

  const ownedByCard = new Map<string, number>();
  for (const row of owned ?? []) {
    ownedByCard.set(
      row.card_id,
      (ownedByCard.get(row.card_id) ?? 0) + (row.quantity ?? 0) + (row.foil ?? 0)
    );
  }

  const deckName = new Map(decks.map(d => [d.id, d.name]));
  const shortfalls: DeckShortfallRow[] = [];
  for (const row of deckCards ?? []) {
    const missing = (row.quantity ?? 0) - (ownedByCard.get(row.card_id) ?? 0);
    if (missing <= 0) continue;
    shortfalls.push({
      deckId: row.deck_id,
      deckName: deckName.get(row.deck_id) ?? 'A deck',
      card_id: row.card_id,
      card_name: row.card_name,
      missing,
    });
  }

  const cards = await fetchCards(shortfalls.map(s => s.card_id));
  return shortfalls.map(s => ({ ...s, card: cards.get(s.card_id) }));
}

/**
 * Every printing of one card, for the case where the parcel held a different
 * version from the one that was ordered.
 *
 * Matched on `oracle_id` where we have one and on the name otherwise, because
 * a row that came from a text import has no oracle id to match on. Reads
 * `cards`, not `cards_unique`: the printing IS the subject here, so the one row
 * per card view would answer the wrong question.
 */
export async function loadPrintings(oracleId: string | null, name: string): Promise<any[]> {
  const query = supabase.from('cards').select(CARD_COLUMNS).limit(80);
  const { data, error } = oracleId
    ? await query.eq('oracle_id', oracleId)
    : await query.eq('name', name);
  if (error) throw error;
  return (data ?? []).sort((a: any, b: any) =>
    String(a.set_name ?? '').localeCompare(String(b.set_name ?? ''))
  );
}

/* ------------------------------------------------------- filing destinations */

export interface FilingDestinations {
  containers: { id: string; name: string; type: string }[];
  decks: { id: string; name: string; format: string | null }[];
}

export async function loadFilingDestinations(userId: string): Promise<FilingDestinations> {
  const [{ data: containers }, { data: decks }] = await Promise.all([
    supabase
      .from('storage_containers')
      .select('id, name, type')
      .eq('user_id', userId)
      .order('created_at'),
    supabase
      .from('user_decks')
      .select('id, name, format')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
  ]);
  return { containers: containers ?? [], decks: decks ?? [] };
}

/* ----------------------------------------------------------- what is for sale */

export interface ListingMatch {
  id: string;
  card_id: string;
  qty: number;
  price_usd: number;
  condition: string | null;
  foil: boolean | null;
  user_id: string;
}

/**
 * Marketplace listings for cards on the list.
 *
 * A caveat that has to be said out loud rather than buried: `listings` carries
 * exactly one policy, `auth.uid() = user_id`, so a signed-in player can only
 * ever read their OWN listings. Verified against the live policy list on
 * 19 Aug 2026, and `CLAUDE.md` records the same thing as a known feature gap.
 * Until that policy is deliberately loosened, this can only ever match cards
 * the player is selling to themselves, so the component that calls it says so
 * instead of rendering an empty panel that looks like nobody is selling.
 */
export async function loadListingsFor(cardIds: string[]): Promise<ListingMatch[]> {
  const unique = [...new Set(cardIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const out: ListingMatch[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, card_id, qty, price_usd, condition, foil, user_id')
      .in('card_id', unique.slice(i, i + CHUNK))
      .eq('status', 'active');
    if (error) throw error;
    out.push(...((data ?? []) as ListingMatch[]));
  }
  return out;
}
