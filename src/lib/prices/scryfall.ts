/**
 * Reading prices out of a Scryfall card object.
 *
 * One file, used in three runtimes, which is why it imports nothing:
 *
 *   - Node, by scripts/prices/daily-sweep.mjs, which streams the daily bulk file
 *   - Deno, by supabase/functions/price-bulk-sync, which does the same thing
 *     from inside Supabase when the GitHub runner is unavailable
 *   - the browser, wherever a live Scryfall price is shown next to history
 *
 * The Deno copy at supabase/functions/price-bulk-sync/scryfall.ts must stay
 * byte-identical to this file. The test "the edge function copy of scryfall.ts
 * is identical to the source", in src/lib/prices/history.test.ts, fails if it
 * drifts. (This line used to name a `scryfall.test.ts`, which has never
 * existed. A comment pointing at a guard that is not there is the same defect
 * as a comment claiming a measurement that was never taken.)
 */

/** Every price Scryfall publishes. The old capture silently dropped tix and etched. */
export const PRICE_KEYS = ['usd', 'usd_foil', 'usd_etched', 'eur', 'eur_foil', 'tix'] as const;

export type PriceKey = (typeof PRICE_KEYS)[number];

/** Prices in hundredths, so six numerics become six 4-byte integers in storage. */
export type PriceCents = { [K in PriceKey]: number | null };

export interface StagedPrice extends PriceCents {
  card_id: string;
}

/**
 * Dollars (or euros, or tickets) to hundredths.
 *
 * Scryfall sends prices as strings, sometimes with more precision than two
 * decimals, and sometimes as null. Anything that is not a finite number comes
 * back null, never 0: a card with no price is not a card worth nothing.
 */
export function toCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Hundredths back to a number of currency units. Null stays null. */
export function fromCents(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : v / 100;
}

/**
 * True for the printings the catalogue tracks: paper, not digital.
 *
 * Same predicate as scryfall-sync's `-is:digital game:paper`. Arena and Magic
 * Online only printings have no paper price and would be dead weight in a table
 * whose whole point is what a physical card is worth. The `tix` column is the
 * exception and it belongs to the paper printing, because Scryfall attaches the
 * Magic Online price to the paper card object.
 */
export function isTrackedPrinting(card: {
  digital?: boolean;
  games?: string[] | null;
}): boolean {
  if (card.digital) return false;
  const games = card.games;
  return Array.isArray(games) ? games.includes('paper') : true;
}

/**
 * Pull one staging row out of a Scryfall card object.
 *
 * Returns null when the printing is not tracked, or when it carries no price at
 * all. A row of six nulls is an absence, not an observation, and storing it
 * would claim we measured something.
 */
export function stagedPriceFrom(card: {
  id?: string;
  digital?: boolean;
  games?: string[] | null;
  prices?: Record<string, unknown> | null;
}): StagedPrice | null {
  if (!card.id || !isTrackedPrinting(card)) return null;
  const p = card.prices ?? {};
  const row = { card_id: card.id } as StagedPrice;
  let any = false;
  for (const k of PRICE_KEYS) {
    const c = toCents(p[k]);
    row[k] = c;
    if (c !== null) any = true;
  }
  return any ? row : null;
}
