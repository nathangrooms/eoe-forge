/**
 * Which card rows a caller is asking for, said out loud.
 *
 * `public.cards` holds every printing. Before 2026-08-19 it did not: the sync
 * asked Scryfall for `unique=cards`, so 34,088 rows covered 33,037 distinct
 * oracle_ids and the table was effectively one printing of every card. Alternate
 * art, borderless, extended art, showcase, promo and every reprint were thrown
 * away before they reached us.
 *
 * That had to change, because three things cannot be built without printings:
 *
 *   Collection value. Printings of one card differ enormously in price, and you
 *   own a particular one. Valuing everyone's collection at a single printing's
 *   price is simply the wrong number.
 *
 *   The scanner. It identifies a card by its artwork. With one printing per
 *   card there is nothing for it to tell apart.
 *
 *   Marketplace listings. A listing is always for a specific printing.
 *
 * But most of the product wants CARDS, not printings. Sol Ring has dozens of
 * printings. A commander picker that offers the same legend eight times, or a
 * suggestion list that spends every slot on reprints of one card, is worse than
 * the problem we set out to fix. So there are two sources and every caller
 * declares which it wants.
 *
 * ---------------------------------------------------------------------------
 * UNIQUE CARDS is the default and covers most of the product:
 *   commander selection and search
 *   all suggestions and recommendations
 *   deck building candidate pools
 *   the deck optimiser
 *   MTG Brain
 *   deck lists, unless the user deliberately chose a printing
 *
 * SPECIFIC PRINTINGS, only where the individual printing is the subject:
 *   collection rows, because you own a particular one and its price is the one
 *     that counts
 *   marketplace listings
 *   scanner results
 *   the art variants section of a card page
 * ---------------------------------------------------------------------------
 *
 * Pure module. No network and no Supabase import, so it runs under
 * `node --test --experimental-strip-types` and can be vendored into an edge
 * function unchanged.
 */

/** The two ways to read the catalogue. There is no third. */
export type CardMode = 'unique' | 'printings';

/**
 * The table or view each mode reads.
 *
 * `cards_unique` is a materialized view over `cards` holding exactly one row
 * per oracle_id, chosen by {@link comparePrintings}. It carries a UNIQUE index
 * on oracle_id, so the database itself refuses to hold a second row for a card:
 * a consumer reading it cannot be handed a duplicate even by accident.
 */
export const CARD_RELATION: Readonly<Record<CardMode, string>> = Object.freeze({
  unique: 'cards_unique',
  printings: 'cards',
});

/**
 * Name the relation for a mode.
 *
 * Prefer this over writing `'cards'` in a query. The literal string is the bug:
 * it reads as "the cards table", which is what a caller wanting unique cards
 * thinks it is asking for, and it silently returns printings instead.
 */
export function cardRelation(mode: CardMode): string {
  return CARD_RELATION[mode];
}

/** The fields the dedupe rule needs. Anything wider satisfies it. */
export interface PrintingLike {
  /** Scryfall printing id, the primary key of `cards`. */
  id: string;
  /** Scryfall oracle id: the CARD this printing is a printing of. */
  oracle_id: string;
  /** Raw Scryfall price map. `usd` arrives as a decimal string or is absent. */
  prices?: Record<string, string | null> | null;
}

/**
 * The USD price of a printing, or null when it has none.
 *
 * Scryfall sends prices as strings and omits `usd` entirely for printings that
 * have never been sold in dollars. Anything that is not a plain decimal is
 * treated as no price rather than coerced to NaN, which would sort
 * unpredictably.
 */
export function usdPrice(row: PrintingLike): number | null {
  const raw = row.prices?.usd;
  if (typeof raw !== 'string' || !/^[0-9]+(\.[0-9]+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Which of two printings represents the card. Negative means `a` wins.
 *
 * ONE rule, in one place, matching what the database and the deck optimiser
 * already do:
 *
 *   1. cheapest USD price wins
 *   2. a priced printing always beats an unpriced one
 *   3. ties break on the lowest id
 *
 * Cheapest is the right answer because the question a candidate pool exists to
 * answer is "what does it cost to add this card", and that is the cheapest
 * printing you could actually buy. Rule 3 is what makes it deterministic: the
 * same catalogue yields the same printing however the rows arrive, so a
 * suggestion list does not quietly change because a query planner changed its
 * mind about row order.
 *
 * The same ordering is written twice more, deliberately and identically:
 *   - the `order by` of `public.cards_unique` (migration
 *     cards_unique_one_row_per_oracle_id)
 *   - `cheaper()` in supabase/functions/deck-optimizer/_engine/deck/recommend/
 *     rank.ts, which predates this file and is the convention being matched
 *     rather than a second invention.
 */
export function comparePrintings(a: PrintingLike, b: PrintingLike): number {
  const ap = usdPrice(a);
  const bp = usdPrice(b);

  if (ap === null && bp === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (ap === null) return 1;
  if (bp === null) return -1;
  if (ap !== bp) return ap - bp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Collapse printings to cards.
 *
 * Use this when rows came from `cards` and the caller wanted cards after all.
 * Reading `cards_unique` is better where it is possible, because the database
 * has already done this and cannot get it wrong. This exists for the cases that
 * cannot: rows fetched live from Scryfall, or a set already in memory.
 *
 * Output is ordered by oracle_id so it does not depend on input order either.
 */
export function dedupeByOracleId<T extends PrintingLike>(rows: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const prev = best.get(row.oracle_id);
    if (!prev || comparePrintings(row, prev) < 0) best.set(row.oracle_id, row);
  }
  return [...best.values()].sort((a, b) =>
    a.oracle_id < b.oracle_id ? -1 : a.oracle_id > b.oracle_id ? 1 : 0
  );
}

/**
 * Throw if a list meant to be one row per card contains two rows for one card.
 *
 * This is the regression the whole change risks, so it is worth being able to
 * assert against rather than eyeball. Cheap enough to leave in a hot path.
 */
export function assertUniqueByOracleId(rows: readonly PrintingLike[], context: string): void {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const first = seen.get(row.oracle_id);
    if (first !== undefined) {
      throw new Error(
        `${context}: two printings of one card (oracle_id ${row.oracle_id}): ${first} and ${row.id}. ` +
          `Read ${CARD_RELATION.unique} instead of ${CARD_RELATION.printings}, or pass the rows through dedupeByOracleId.`
      );
    }
    seen.set(row.oracle_id, row.id);
  }
}
