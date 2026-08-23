/**
 * Adding many cards to the collection in a fixed number of requests.
 *
 * ## Why this exists
 *
 * `CollectionAPI.addCardByName` (`src/server/routes/collection.ts`) adds ONE
 * card and costs four round trips to do it: `auth.getUser()`, a name lookup in
 * `cards_unique`, a printing lookup in `cards`, an existing-row check, then the
 * write. Called once per card of a deck that is 100 cards, and the "Add the
 * whole deck" button measured 1,100 requests for one press.
 *
 * `Promise.all` around it would not have helped. It is still one query per row;
 * it only makes them arrive together, which is worse for the database.
 *
 * ## The shape
 *
 * Collect the names, resolve them in ONE query, read what is already held in
 * ONE query, write the merges and the new rows in one statement each. The cost
 * is a handful of requests whatever the list length, chunked so a five thousand
 * card paste does not turn into a URL nobody will accept.
 *
 * Name resolution goes through `resolveParsedLines`, the resolver the proxy
 * paste and the collection importer already use. It sends the whole list to
 * `resolve_card_names` in one statement, and an exact name match there reads
 * `cards_unique` ordered the same way `addCardByName` reads it, so the printing
 * that lands in the collection is the printing that landed before.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveParsedLines, isSettled, MAX_LINES } from '@/lib/decklist';

/** A card to add, named the way a decklist names it. */
export interface CollectionAddByName {
  name: string;
  /** A set code means the caller has chosen a printing. Optional, always. */
  setCode?: string;
  quantity?: number;
  /** Foil copies, counted separately from `quantity` the way the table does. */
  foil?: number;
}

/** What landed, per input entry, in the order it was given. */
export interface CollectionAddResult {
  name: string;
  /** The `cards.id` the copies were filed against, or null when nothing matched. */
  cardId: string | null;
  quantity: number;
  foil: number;
  /** Shown to a person as it is. Null when the entry succeeded. */
  error: string | null;
}

/**
 * `.in()` lists are URL segments, and a URL has a length. 150 is the chunk this
 * codebase already settled on — see `CollectionBulkImport` and
 * `src/lib/shopping/api.ts`.
 */
const CHUNK = 150;

/** Rows per write. Same reasoning, applied to a request body rather than a URL. */
const WRITE_CHUNK = 200;

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Add a list of cards to the signed-in user's collection, by name.
 *
 * Quantities for the same card are merged before anything is written, so a list
 * naming a card twice adds up rather than the second line overwriting the first.
 * That is what the old one-at-a-time loop did by accident, and it has to keep
 * being true.
 */
export async function addCardsByName(
  entries: CollectionAddByName[]
): Promise<CollectionAddResult[]> {
  const results: CollectionAddResult[] = entries.map(entry => ({
    name: entry.name,
    cardId: null,
    quantity: entry.quantity ?? 1,
    foil: entry.foil ?? 0,
    error: 'Nothing was added',
  }));

  if (entries.length === 0) return results;

  /* `getSession()` reads the token the client already holds. `auth.getUser()`
     is a round trip to the auth server, and the loop this replaces made one of
     those per card. */
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return results.map(row => ({ ...row, error: 'User not authenticated' }));
  }
  const userId = session.user.id;

  /* ---------------------------------------------------- resolve the names */

  const resolvedCards: (any | null)[] = new Array(entries.length).fill(null);

  for (const batch of chunked(
    entries.map((entry, index) => ({ entry, index })),
    Math.min(MAX_LINES, 500)
  )) {
    const resolved = await resolveParsedLines(
      batch.map(({ entry, index }) => ({
        line: index + 1,
        raw: entry.name,
        name: entry.name,
        quantity: entry.quantity ?? 1,
        section: 'main' as const,
        setCode: entry.setCode,
      }))
    );

    resolved.forEach((row, i) => {
      const { index } = batch[i];
      /* Only a settled match counts. A near match is a spelling suggestion, and
         quietly filing the card it guessed at would be worse than saying no —
         which is what the single-card path said. */
      if (row.card && isSettled(row)) resolvedCards[index] = row.card;
      else {
        results[index].error =
          `"${entries[index].name}" is not currently in our database. The card database may ` +
          'need to be updated. Please try searching for a different card or contact support.';
      }
    });
  }

  /* ------------------------------------------- merge duplicates by card id */

  interface Wanted {
    cardId: string;
    name: string;
    setCode: string;
    priceUSD: number;
    quantity: number;
    foil: number;
    at: number[];
  }
  const wanted = new Map<string, Wanted>();

  entries.forEach((entry, index) => {
    const card = resolvedCards[index];
    if (!card) return;
    const existing = wanted.get(card.id);
    const quantity = entry.quantity ?? 1;
    const foil = entry.foil ?? 0;
    if (existing) {
      existing.quantity += quantity;
      existing.foil += foil;
      existing.at.push(index);
    } else {
      wanted.set(card.id, {
        cardId: card.id,
        name: card.name,
        setCode: card.set_code ?? card.set ?? '',
        priceUSD: parseFloat(card.prices?.usd || '0'),
        quantity,
        foil,
        at: [index],
      });
    }
    results[index].cardId = card.id;
  });

  if (wanted.size === 0) return results;

  /* -------------------------------------------- one read of what is held */

  const ids = [...wanted.keys()];
  const held = new Map<string, { id: string; quantity: number; foil: number }>();

  for (const slice of chunked(ids, CHUNK)) {
    const { data, error } = await supabase
      .from('user_collections')
      .select('id, card_id, quantity, foil')
      .eq('user_id', userId)
      .in('card_id', slice);

    if (error) {
      return results.map(row =>
        row.cardId ? { ...row, error: error.message } : row
      );
    }
    for (const row of data ?? []) {
      held.set(row.card_id, {
        id: row.id,
        quantity: row.quantity ?? 0,
        foil: row.foil ?? 0,
      });
    }
  }

  /* ------------------------------------------------------------- writes */

  const updates: {
    id: string;
    user_id: string;
    card_id: string;
    card_name: string;
    set_code: string;
    quantity: number;
    foil: number;
    price_usd: number;
  }[] = [];
  const inserts: {
    user_id: string;
    card_id: string;
    card_name: string;
    set_code: string;
    quantity: number;
    foil: number;
    condition: string;
    price_usd: number;
  }[] = [];

  for (const row of wanted.values()) {
    const existing = held.get(row.cardId);
    if (existing) {
      updates.push({
        id: existing.id,
        user_id: userId,
        card_id: row.cardId,
        card_name: row.name,
        set_code: row.setCode,
        quantity: existing.quantity + row.quantity,
        foil: existing.foil + row.foil,
        price_usd: row.priceUSD,
      });
    } else {
      inserts.push({
        user_id: userId,
        card_id: row.cardId,
        card_name: row.name,
        set_code: row.setCode,
        quantity: row.quantity,
        foil: row.foil,
        condition: 'near_mint',
        price_usd: row.priceUSD,
      });
    }
  }

  const fail = (message: string, cardIds: Set<string>) => {
    for (const result of results) {
      if (result.cardId && cardIds.has(result.cardId)) result.error = message;
    }
  };

  for (const slice of chunked(updates, WRITE_CHUNK)) {
    /* An upsert on the primary key. One statement for every merge, rather than
       one PATCH per card. */
    const { error } = await supabase.from('user_collections').upsert(slice, { onConflict: 'id' });
    if (error) fail(error.message, new Set(slice.map(row => row.card_id)));
    else
      for (const row of slice) {
        for (const result of results) if (result.cardId === row.card_id) result.error = null;
      }
  }

  for (const slice of chunked(inserts, WRITE_CHUNK)) {
    const { error } = await supabase.from('user_collections').insert(slice);
    if (error) fail(error.message, new Set(slice.map(row => row.card_id)));
    else
      for (const row of slice) {
        for (const result of results) if (result.cardId === row.card_id) result.error = null;
      }
  }

  return results;
}
