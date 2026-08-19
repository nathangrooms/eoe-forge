/**
 * Where to actually buy the card, without pretending we know more than we do.
 *
 * The `cards` table has no `purchase_uris` column. Confirmed against the live
 * schema on 19 Aug 2026: the 39 columns include `prices`, `image_uris`,
 * `legalities` and `finishes`, and there is no purchase link of any kind. So a
 * link built from a `cards` row can only ever be a SEARCH, and it is labelled
 * as one. Claiming a search URL lands on this exact printing would be a small
 * lie that costs a player money when they buy the wrong version.
 *
 * When the caller has a full Scryfall object (the routed card page fetches one)
 * its `purchase_uris` ARE per printing, and those are used and marked exact.
 */

import type { PriceMarketId, PriceReading } from './sources.ts';
import { formatSource } from './format.ts';

export interface BuyLink {
  market: PriceMarketId | 'ebay';
  /** What a player calls it. */
  name: string;
  /** Plain words for what happens when they click. */
  note: string;
  url: string;
  /**
   * True when the link goes to THIS printing. False when it is a name search
   * and the player still has to pick the right version.
   */
  exact: boolean;
  /** The price we hold for this market, already formatted, or null. */
  price: string | null;
}

export interface BuyLinkInput {
  name?: string | null;
  setName?: string | null;
  setCode?: string | null;
  /** Scryfall's per printing `purchase_uris`, when the caller has it. */
  purchaseUris?: Record<string, string | undefined> | null;
}

const q = (value: string) => encodeURIComponent(value.trim());

/**
 * Build the buy row for one printing.
 *
 * `reading` supplies the price shown beside each link, so the number on the
 * button is the number from that market and not a dollar figure pasted under a
 * European shop.
 */
export function buyLinks(card: BuyLinkInput, reading: PriceReading): BuyLink[] {
  const name = (card.name ?? '').trim();
  if (!name) return [];

  const uris = card.purchaseUris ?? {};
  const setName = (card.setName ?? '').trim();

  const priceFor = (market: PriceMarketId): string | null => {
    const source = reading.known.find(s => s.market === market);
    return source ? formatSource(source) : null;
  };

  const links: BuyLink[] = [];

  links.push({
    market: 'tcgplayer',
    name: 'TCGplayer',
    note: uris.tcgplayer ? 'Opens this exact printing' : 'Searches for this card',
    url:
      uris.tcgplayer ??
      `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${q(
        setName ? `${name} ${setName}` : name
      )}`,
    exact: Boolean(uris.tcgplayer),
    price: priceFor('tcgplayer'),
  });

  links.push({
    market: 'cardmarket',
    name: 'Cardmarket',
    // Cardmarket's search matches on card name alone. Appending the set name
    // returns nothing, which reads as "out of stock" rather than "bad query".
    note: uris.cardmarket ? 'Opens this exact printing' : 'Searches for this card',
    url:
      uris.cardmarket ??
      `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q(name)}`,
    exact: Boolean(uris.cardmarket),
    price: priceFor('cardmarket'),
  });

  // Only offered when we hold a ticket price. Sending a paper player to a
  // Magic Online shop for a card we cannot price there is a dead end.
  if (reading.known.some(s => s.market === 'mtgo')) {
    links.push({
      market: 'mtgo',
      name: 'Cardhoarder',
      note: 'Magic Online copy, not a real card',
      url:
        uris.cardhoarder ??
        `https://www.cardhoarder.com/cards?data%5Bsearch%5D=${q(name)}`,
      exact: Boolean(uris.cardhoarder),
      price: priceFor('mtgo'),
    });
  }

  return links;
}
