/**
 * The list primitive, in types.
 *
 * ONE PRIMITIVE, TWO INSTANCES
 * ----------------------------
 * A shopping list and a proxy list are the same object with different endings.
 * Both are a set of cards the player curated, added to from anywhere in the
 * product, each entry carrying a quantity and a chosen printing. Shopping ends
 * in buying; proxies end in printing. Everything before the ending is shared,
 * so it is written once and both instances use it. The alternative is two
 * parallel systems that slowly disagree, which is what this project already has
 * too much of.
 *
 * The database enforces the difference rather than trusting the interface: a
 * row on a proxy list cannot hold a buying status at all. See
 * `supabase/migrations/20260819180000_card_lists_shopping_and_proxies.sql`.
 *
 * This file holds no queries and no React, so the rules in it can be tested
 * directly. `shopping.test.ts` does exactly that.
 */

export type ListKind = 'shopping' | 'proxy';

/**
 * Where a card is in its life.
 *
 * There is no separate 'arriving'. Something you have bought and not received
 * IS arriving, so a fifth status would be a step to click through that records
 * nothing new. `isArriving` below asks the question directly.
 */
export type ItemStatus = 'want' | 'bought' | 'arrived' | 'filed' | 'cancelled';

export type Finish = 'nonfoil' | 'foil' | 'etched';

export type ItemSource = 'manual' | 'wishlist' | 'deck' | 'suggestion' | 'marketplace';

/** A row of `card_list_items`, with the `cards` row joined on where we have it. */
export interface CardListItem {
  id: string;
  list_id: string;
  user_id: string;
  kind: ListKind;
  card_id: string;
  oracle_id: string | null;
  card_name: string;
  finish: Finish;
  quantity: number;
  note: string | null;
  source: ItemSource;
  source_deck_id: string | null;
  status: ItemStatus;
  paid_unit: number | null;
  paid_currency: 'USD' | 'EUR' | null;
  bought_at: string | null;
  arrived_at: string | null;
  filed_at: string | null;
  arrived_card_id: string | null;
  arrived_finish: Finish | null;
  filed_container_id: string | null;
  filed_deck_id: string | null;
  created_at: string;
  updated_at: string;
  /** Joined `cards` row. Absent for a printing the catalogue does not hold. */
  card?: any;
}

/** Bought and not yet in hand. The interface calls this "on the way". */
export function isArriving(item: Pick<CardListItem, 'status'>): boolean {
  return item.status === 'bought';
}

/** In hand but not yet put away. This is the state that opens the filing step. */
export function isAwaitingFiling(item: Pick<CardListItem, 'status'>): boolean {
  return item.status === 'arrived';
}

/**
 * Grouping key for one card across every source.
 *
 * `oracle_id` where we have it, because Sol Ring from a deck and Sol Ring from
 * the wishlist are the same card even when the two rows point at different
 * printings, and a shopping list that says "Sol Ring" twice is a list that
 * makes you decide twice. Falls back to the lowercased name, which is what
 * text-imported decks and rows written before printings existed can offer.
 */
export function cardKey(input: {
  oracle_id?: string | null;
  oracleId?: string | null;
  card_name?: string | null;
  name?: string | null;
}): string {
  const oracle = input.oracle_id ?? input.oracleId ?? null;
  if (typeof oracle === 'string' && oracle.length > 0) return `o:${oracle}`;
  const name = input.card_name ?? input.name ?? '';
  return `n:${String(name).trim().toLowerCase()}`;
}

export interface KeyedLike {
  oracle_id?: string | null;
  oracleId?: string | null;
  card_name?: string | null;
  name?: string | null;
}

/**
 * The name to oracle id lookup that stops one card becoming two entries.
 *
 * `cardKey` above falls back to the name when a row carries no oracle id, and
 * that fallback is the whole problem: the SAME card can arrive from one source
 * with an oracle id and from another without, and the two then land in
 * different buckets. Measured on production 19 Aug 2026: 11 of 94 wishlist rows
 * (12%) carry a `card_id` that is not in the `cards` catalogue, so nothing can
 * be joined onto them and they have no oracle id to offer. One of them is the
 * admin account's Sol Ring, whose `card_id` is the literal text `sol-ring` from
 * an old import, and Sol Ring is also short in a deck. Without this map the
 * shopping list printed Sol Ring TWICE, once under `n:sol ring` and once under
 * `o:6ad8011d…`, and charged for three copies of a card the player wanted one
 * of.
 *
 * So before anything is bucketed, every source is swept for rows that DO know
 * their oracle id, and a name-only row is upgraded onto that same key. First
 * one seen wins, which is stable because the sweep order is fixed.
 */
export function oracleIdsByName(rows: Iterable<KeyedLike>): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const oracle = row?.oracle_id ?? row?.oracleId ?? null;
    if (typeof oracle !== 'string' || oracle.length === 0) continue;
    const name = String(row?.card_name ?? row?.name ?? '').trim().toLowerCase();
    if (!name || out.has(name)) continue;
    out.set(name, oracle);
  }
  return out;
}

/** `cardKey`, with a name-only row lifted onto the oracle key when we know it. */
export function cardKeyWith(oracleByName: Map<string, string>, input: KeyedLike): string {
  const key = cardKey(input);
  if (key.startsWith('o:')) return key;
  const oracle = oracleByName.get(key.slice(2));
  return oracle ? `o:${oracle}` : key;
}

export const FINISH_LABEL: Record<Finish, string> = {
  nonfoil: 'Normal',
  foil: 'Foil',
  etched: 'Etched foil',
};

/**
 * How many copies to buy when several sources want the same card.
 *
 * Deck shortfalls ADD UP. Two decks each missing a Sol Ring need two Sol Rings,
 * because one piece of cardboard cannot be in two decks at a table. That is the
 * whole reason "needed by 3 decks" changes the buying decision.
 *
 * The wishlist and an explicit add do NOT add to that. A card you wishlisted
 * and also need for a deck is one card, not two: the wishlist is a note that
 * you want it, not a second physical requirement. So those two are taken at
 * their largest rather than summed, and the deck sum is compared against them.
 *
 * Copies already bought and not yet filed are subtracted last, because a card
 * in the post still satisfies the deck that wanted it, and offering to buy it
 * again is how a player ends up with three.
 */
export function copiesNeeded(input: {
  explicit?: number;
  wishlist?: number;
  perDeck?: number[];
  alreadyOnTheWay?: number;
}): number {
  const deckTotal = (input.perDeck ?? []).reduce((sum, n) => sum + Math.max(0, n), 0);
  const standing = Math.max(
    Math.max(0, input.explicit ?? 0),
    Math.max(0, input.wishlist ?? 0),
    deckTotal
  );
  return Math.max(0, standing - Math.max(0, input.alreadyOnTheWay ?? 0));
}
