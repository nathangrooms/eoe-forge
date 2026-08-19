/**
 * Building the shopping list out of everything that wants a card.
 *
 * WHY THIS IS A PURE FUNCTION
 * ---------------------------
 * The list is four sources merged, and the merge is where every interesting
 * mistake lives: counting a card twice, dropping the reason it is there,
 * offering to buy something already in the post. Keeping it free of queries and
 * React means every one of those rules is directly testable, and
 * `shopping.test.ts` tests them against real row shapes.
 *
 * THE FOUR SOURCES
 * ----------------
 *   1. Added by hand, from a card page, search, a deck, anywhere.
 *   2. The wishlist.
 *   3. Cards missing from decks.
 *   4. Suggestions the player accepted from the optimiser or the generator.
 *
 * Only 1 and 4 are rows of `card_list_items`. The wishlist and the deck
 * shortfall are live facts that change when the player edits a deck, and
 * copying them into a list would freeze a stale answer. So they are recomputed
 * on read and merged here.
 *
 * That does not make any lifecycle stage a "UI mode". The moment a player acts
 * on a derived entry, `card_list_add` writes a real row for it and everything
 * after that (bought, arriving, arrived, filed) is state on that row with its
 * own dates. What stays derived is only the wanting, and the wanting is already
 * a real row somewhere else: a wishlist row, or a deck that is short a card.
 *
 * WHY EACH CARD SAYS WHY IT IS THERE
 * ----------------------------------
 * "Needed by 3 decks" is a different buying decision from "you clicked add on a
 * card page once", and a merged list that hides the difference makes the player
 * open three other screens to reconstruct it.
 */

import { cardKey, copiesNeeded, type CardListItem, type Finish } from './list.ts';

/* ------------------------------------------------------------------ inputs */

/** A wishlist row, as `wishlist` stores it, with its card joined on. */
export interface WishlistSourceRow {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number | null;
  card?: any;
}

/** One deck's shortfall for one card. */
export interface DeckShortfallRow {
  deckId: string;
  deckName: string;
  card_id: string;
  card_name: string;
  /** Copies the deck needs that the collection does not have. Always positive. */
  missing: number;
  card?: any;
}

export interface AssembleInput {
  /** Rows of `card_list_items` for the shopping list, every status. */
  items: CardListItem[];
  wishlist: WishlistSourceRow[];
  shortfalls: DeckShortfallRow[];
}

/* ----------------------------------------------------------------- outputs */

export type ReasonKind = 'manual' | 'wishlist' | 'deck' | 'suggestion' | 'marketplace';

export interface Reason {
  kind: ReasonKind;
  /** Plain words, ready to render. No jargon, no dashes. */
  label: string;
  /** Copies this reason accounts for. */
  copies: number;
  deckId?: string;
}

export interface ShoppingEntry {
  /** Stable across renders and unique per card. */
  key: string;
  /** The printing this entry prices and links to. */
  cardId: string;
  cardName: string;
  /** The `cards` row, for art and prices. Undefined when we hold no such row. */
  card?: any;
  finish: Finish;
  /** Copies to buy, after taking off anything already on the way. */
  quantity: number;
  reasons: Reason[];
  /** The stored row, when the player has acted on this card. */
  item: CardListItem | null;
  /** Copies of this card already bought and not yet put away. */
  onTheWay: number;
}

export interface AssembledList {
  /** Still to buy, dearest first, because that is the decision that matters. */
  toBuy: ShoppingEntry[];
  /** Bought and not yet in hand. */
  arriving: CardListItem[];
  /** In hand, waiting to be put away. */
  arrived: CardListItem[];
  /** Bought, received and filed. Kept as the purchase record. */
  filed: CardListItem[];
}

/* ---------------------------------------------------------------- the merge */

function decksSentence(deckNames: string[]): string {
  if (deckNames.length === 1) return `Needed by ${deckNames[0]}`;
  if (deckNames.length === 2) return `Needed by ${deckNames[0]} and ${deckNames[1]}`;
  return `Needed by ${deckNames.length} decks`;
}

export function assembleShoppingList(input: AssembleInput): AssembledList {
  const arriving = input.items.filter(i => i.status === 'bought');
  const arrived = input.items.filter(i => i.status === 'arrived');
  const filed = input.items.filter(i => i.status === 'filed');
  const wanted = input.items.filter(i => i.status === 'want');

  /* Copies in the post, keyed the same way as everything else so a card
     ordered as one printing still cancels a deck's need for another. */
  const onTheWay = new Map<string, number>();
  for (const item of [...arriving, ...arrived]) {
    const key = cardKey(item);
    onTheWay.set(key, (onTheWay.get(key) ?? 0) + item.quantity);
  }

  interface Bucket {
    key: string;
    cardId: string;
    cardName: string;
    card?: any;
    finish: Finish;
    item: CardListItem | null;
    explicit: number;
    explicitSource: ReasonKind | null;
    wishlist: number;
    perDeck: { deckId: string; deckName: string; copies: number }[];
  }

  const buckets = new Map<string, Bucket>();

  const bucketFor = (
    key: string,
    seed: { cardId: string; cardName: string; card?: any; finish?: Finish }
  ): Bucket => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        cardId: seed.cardId,
        cardName: seed.cardName,
        card: seed.card,
        finish: seed.finish ?? 'nonfoil',
        item: null,
        explicit: 0,
        explicitSource: null,
        wishlist: 0,
        perDeck: [],
      };
      buckets.set(key, bucket);
    }
    // A source that carries the full card record wins the art and the prices,
    // because a wishlist row without a join would otherwise leave the tile blank.
    if (!bucket.card && seed.card) bucket.card = seed.card;
    return bucket;
  };

  for (const item of wanted) {
    const bucket = bucketFor(cardKey(item), {
      cardId: item.card_id,
      cardName: item.card_name,
      card: item.card,
      finish: item.finish,
    });
    // The stored row is authoritative about which printing and finish to buy:
    // it is the one the player actually chose.
    bucket.item = item;
    bucket.cardId = item.card_id;
    bucket.cardName = item.card_name;
    bucket.finish = item.finish;
    bucket.explicit += item.quantity;
    bucket.explicitSource = item.source === 'suggestion' ? 'suggestion' : 'manual';
  }

  for (const row of input.wishlist) {
    const bucket = bucketFor(cardKey({ oracle_id: row.card?.oracle_id, card_name: row.card_name }), {
      cardId: row.card_id,
      cardName: row.card_name,
      card: row.card,
    });
    bucket.wishlist += Math.max(0, row.quantity ?? 1);
  }

  for (const row of input.shortfalls) {
    if (row.missing <= 0) continue;
    const bucket = bucketFor(cardKey({ oracle_id: row.card?.oracle_id, card_name: row.card_name }), {
      cardId: row.card_id,
      cardName: row.card_name,
      card: row.card,
    });
    const existing = bucket.perDeck.find(d => d.deckId === row.deckId);
    if (existing) existing.copies += row.missing;
    else bucket.perDeck.push({ deckId: row.deckId, deckName: row.deckName, copies: row.missing });
  }

  const toBuy: ShoppingEntry[] = [];

  for (const bucket of buckets.values()) {
    const inFlight = onTheWay.get(bucket.key) ?? 0;
    const quantity = copiesNeeded({
      explicit: bucket.explicit,
      wishlist: bucket.wishlist,
      perDeck: bucket.perDeck.map(d => d.copies),
      alreadyOnTheWay: inFlight,
    });

    const reasons: Reason[] = [];
    if (bucket.explicit > 0) {
      reasons.push({
        kind: bucket.explicitSource ?? 'manual',
        label:
          bucket.explicitSource === 'suggestion'
            ? 'You took this suggestion'
            : 'You added this yourself',
        copies: bucket.explicit,
      });
    }
    if (bucket.wishlist > 0) {
      reasons.push({ kind: 'wishlist', label: 'On your wishlist', copies: bucket.wishlist });
    }
    for (const deck of bucket.perDeck) {
      reasons.push({
        kind: 'deck',
        label: decksSentence([deck.deckName]),
        copies: deck.copies,
        deckId: deck.deckId,
      });
    }

    // Nothing left to buy: every copy the sources asked for is already on the
    // way. The card still shows up under "on the way", so it has not vanished.
    if (quantity <= 0) continue;
    if (reasons.length === 0) continue;

    toBuy.push({
      key: bucket.key,
      cardId: bucket.cardId,
      cardName: bucket.cardName,
      card: bucket.card,
      finish: bucket.finish,
      quantity,
      reasons,
      item: bucket.item,
      onTheWay: inFlight,
    });
  }

  return {
    toBuy,
    arriving: arriving.sort(byBoughtDate),
    arrived: arrived.sort(byArrivedDate),
    filed: filed.sort(byFiledDate),
  };
}

function byBoughtDate(a: CardListItem, b: CardListItem) {
  return (a.bought_at ?? '').localeCompare(b.bought_at ?? '');
}
function byArrivedDate(a: CardListItem, b: CardListItem) {
  return (b.arrived_at ?? '').localeCompare(a.arrived_at ?? '');
}
function byFiledDate(a: CardListItem, b: CardListItem) {
  return (b.filed_at ?? '').localeCompare(a.filed_at ?? '');
}

/**
 * How long something has been in the post, in whole days.
 *
 * The point of holding a bought date is being able to say "you bought this 23
 * days ago and it has not turned up", which is the fact a wishlist cannot hold.
 */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** Plain words for how long a parcel has been out. Never an em-dash. */
export function waitingFor(iso: string | null | undefined, now?: Date): string | null {
  const days = daysSince(iso, now);
  if (days == null) return null;
  if (days === 0) return 'Bought today';
  if (days === 1) return 'Bought yesterday';
  if (days < 21) return `Bought ${days} days ago`;
  return `Bought ${days} days ago, still not here`;
}
