/**
 * Which printing a wishlist row means, when the row's own printing is not in
 * our catalogue.
 *
 * A wishlist row stores the exact printing the user picked. Eleven of the
 * owner's 94 rows point at a Scryfall id `cards` does not hold (card sync has
 * been stalled since January, and one legacy row stores the slug `sol-ring`
 * rather than a uuid at all), so those rows have to be matched by name instead,
 * and a name matches many printings at wildly different prices.
 *
 * There is exactly one right answer to "which one", and the reason this file
 * exists is that there were two. `/wishlist` picked the CHEAPEST priced
 * printing; the dashboard's wishlist tile picked the MOST EXPENSIVE. Measured
 * against the same four-row list, the two screens reported $7,314.94 and
 * $7,315.36 in the same session. That is the small, still-live remainder of the
 * bug that once made the same two screens read $2,318 and $4,653.
 *
 * The cheapest priced printing is the correct answer, because the question a
 * wishlist asks is "what would this cost me to buy", and the answer is the
 * cheapest copy you could actually buy. It is also the rule `cards_unique` and
 * the deck optimiser already use for the same reason (see
 * `src/lib/cards/source.ts`), so the product now has one convention rather than
 * three.
 *
 * Pure module. No React, no Supabase.
 */

/** Parse a Scryfall price string. Absent, blank or unparseable means no price. */
function usd(card: any): number | null {
  const raw = card?.prices?.usd;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hasImage(card: any): boolean {
  return Boolean(card?.image_uris?.normal || card?.image_uris?.large);
}

/**
 * Lower wins. Cheapest priced printing with art first, then a priced printing
 * without art, then anything unpriced. Deterministic, so the same catalogue
 * gives the same face and the same total on every load and on every screen.
 */
export function printingRank(card: any): number {
  const price = usd(card);
  if (price === null) return Number.MAX_SAFE_INTEGER - (hasImage(card) ? 1 : 0);
  return hasImage(card) ? price : price + 1_000_000;
}

/** Of two printings of one card, the one a wishlist should quote. */
export function betterPrinting<T>(candidate: T, incumbent: T | undefined): T {
  if (!incumbent) return candidate;
  return printingRank(candidate) < printingRank(incumbent) ? candidate : incumbent;
}

/**
 * Collapse rows returned by a name lookup to one printing per name.
 *
 * Keyed on the lowercased name, which is how both callers look a row back up.
 */
export function pickPrintingsByName<T extends { name?: string | null }>(
  rows: readonly T[]
): Map<string, T> {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (!row?.name) continue;
    const key = String(row.name).toLowerCase();
    best.set(key, betterPrinting(row, best.get(key)));
  }
  return best;
}

/** The USD price of the printing a wishlist should quote, or null when none has one. */
export function wishlistUnitPrice(card: any): number | null {
  return usd(card);
}
