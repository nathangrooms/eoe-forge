/**
 * Turning a list you already keep into a list of things to print.
 *
 * The owner: *"no way to convert wishlist or shopping list to proxy"*. This is
 * the rule for that conversion, kept away from the panel that draws it so it
 * can be tested directly. `proxies.test.ts` does exactly that.
 *
 * ONE ENTRY PER CARD
 * ------------------
 * A proxy list holding Sol Ring twice is a list that prints Sol Ring twice for
 * no reason anybody asked for, and it makes the count on the button a lie. Both
 * source lists can name the same card more than once: a wishlist can hold two
 * printings of it, and a shopping list is four sources merged. So everything is
 * folded on {@link cardKey} first, which is the oracle id where we have one and
 * the lowercased name where we do not.
 *
 * The folded quantity is the LARGEST of the rows, not their sum. Two wishlist
 * rows for one card are two ways of saying the same want, not two wants, and
 * the shopping list has already done its own adding up in `assemble.ts` before
 * these entries ever reach here. Taking the sum would quietly double what gets
 * printed.
 *
 * WHICH PRINTING GETS PRINTED
 * ---------------------------
 * The first row seen wins, because that is the one the source page is showing
 * the reader. A later duplicate can still fill in art when the first row has
 * none, which is worth doing: about one wishlist row in eight carries a card id
 * the catalogue has never held.
 */

import { cardKeyWith, oracleIdsByName, type CardListItem } from './list.ts';
import type { ShoppingEntry, WishlistSourceRow } from './assemble.ts';

/** Anything on a list that could become a proxy. */
export interface ProxyCandidate {
  /** Stable and unique within one conversion. */
  key: string;
  cardId: string;
  cardName: string;
  oracleId?: string | null;
  quantity: number;
  /** The `cards` row where the source list joined one on. Art comes from here. */
  card?: any;
}

function fold(rows: ProxyCandidate[]): ProxyCandidate[] {
  const usable = rows.filter(row => row.cardId && String(row.cardName ?? '').trim());

  /*
   * The name to oracle id sweep runs BEFORE anything is bucketed, for the same
   * reason `assemble.ts` does it: the same card arrives from one row with an
   * oracle id and from another without, and without the sweep the two land in
   * different buckets and the card is printed twice. The production case is a
   * wishlist row whose `card_id` is the literal text `sol-ring` from an old
   * import, sitting beside a real Sol Ring row.
   */
  const oracleByName = oracleIdsByName(
    usable.map(row => ({ oracleId: row.oracleId ?? null, name: row.cardName }))
  );

  const out = new Map<string, ProxyCandidate>();

  for (const row of usable) {
    const name = String(row.cardName).trim();
    const key = cardKeyWith(oracleByName, { oracleId: row.oracleId ?? null, name });
    const seen = out.get(key);
    if (!seen) {
      out.set(key, { ...row, key, cardName: name, quantity: Math.max(1, row.quantity || 1) });
      continue;
    }

    seen.quantity = Math.max(seen.quantity, Math.max(1, row.quantity || 1));
    // A duplicate is allowed to supply art the first row could not.
    if (!seen.card?.id && row.card?.id) {
      seen.card = row.card;
      seen.cardId = row.cardId;
      seen.oracleId = seen.oracleId ?? row.oracleId ?? null;
    }
  }

  return [...out.values()];
}

/** The shopping list's "still to buy" cards. Its quantity is already settled. */
export function proxyCandidatesFromShopping(entries: ShoppingEntry[]): ProxyCandidate[] {
  return fold(
    entries.map(entry => ({
      key: entry.key,
      cardId: entry.cardId,
      cardName: entry.cardName,
      oracleId: entry.card?.oracle_id ?? null,
      quantity: entry.quantity,
      card: entry.card,
    }))
  );
}

/** Raw wishlist rows, as the wishlist page and the list store both hold them. */
export function proxyCandidatesFromWishlist(
  rows: (WishlistSourceRow | { id: string; card_id: string; card_name: string; quantity?: number | null; card?: any })[]
): ProxyCandidate[] {
  return fold(
    rows.map(row => ({
      key: row.id,
      cardId: row.card_id,
      cardName: row.card_name,
      oracleId: row.card?.oracle_id ?? null,
      quantity: row.quantity ?? 1,
      card: row.card,
    }))
  );
}

/** Rows of one of the card lists themselves, for converting proxies back or on. */
export function proxyCandidatesFromItems(items: CardListItem[]): ProxyCandidate[] {
  return fold(
    items.map(item => ({
      key: item.id,
      cardId: item.card_id,
      cardName: item.card_name,
      oracleId: item.oracle_id,
      quantity: item.quantity,
      card: item.card,
    }))
  );
}

/** How many physical cards a selection prints. */
export function countProxyCopies(candidates: ProxyCandidate[]): number {
  return candidates.reduce((sum, row) => sum + Math.max(1, row.quantity), 0);
}

/**
 * "1 card" / "12 cards".
 *
 * Written down once because the number appears on a button, in a toast and in a
 * confirmation, and those three saying it three ways is how an interface starts
 * to feel assembled rather than made. No irregular plural is offered, because
 * every noun this is used with is "card".
 */
export function showListItemCount(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}
