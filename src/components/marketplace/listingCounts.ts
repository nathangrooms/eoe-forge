/**
 * A listing is not a card, and the marketplace header was printing both under
 * one heading.
 *
 * Measured 30 Aug 2026. Two tiles sit side by side:
 *
 *   Listings        3      "Cards you have for sale"
 *   Listing value   $24    "What you are asking for them"
 *
 * The count is `myListings.length`, which is ROWS. The money is
 * `price_usd * qty` summed, which is COPIES. `qty` is a real field and every
 * listing tile prints it. So one listing of four Sol Rings at $2 read
 * "Listings 1 / Cards you have for sale" beside "Listing value $8.00", which is
 * four cards' worth of asking price above a tile claiming there is one card.
 *
 * This is the same shape as the proxy page's row-versus-copy bug and the
 * tournaments rail that counted decks it was not drawing. The fix is not to
 * change which number is shown, because the tab badge and the listings grid
 * both count rows and must keep doing so. The fix is that the tile says how
 * many cards those rows hold, so the money has something to be the price of.
 */

export interface QuantifiedListing {
  qty?: number | null;
}

/**
 * Physical cards across every listing.
 *
 * A listing with no quantity recorded is one card, which is what the database
 * default and every write path already assume. Never zero: a listing of zero
 * cards is not a listing, and treating a missing quantity as nothing would
 * silently shrink the figure the asking price is computed over.
 */
export function listingCopies(listings: QuantifiedListing[]): number {
  return listings.reduce((sum, listing) => sum + Math.max(1, Number(listing.qty) || 1), 0);
}

/**
 * The line under the Listings figure.
 *
 * Says the copies only when they differ from the rows, because "3 listings, 3
 * cards" is noise and "1 listing, 4 cards" is the whole point. No em-dash and
 * no jargon, per the copy rules.
 */
export function listingsSubtext(listings: number, copies: number): string {
  if (listings <= 0) return 'Nothing listed yet';
  if (copies === listings) return 'Cards you have for sale';
  return `${copies.toLocaleString()} cards across them`;
}
