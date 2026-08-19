/**
 * Adding prices up without hiding what is missing.
 *
 * A collection total, a deck value, a storage box worth: every one of them is
 * a sum over rows where some rows have no price. The existing accessor
 * (`ownedValueUSD` in `src/features/collection/value.ts`) coerces a missing
 * price to 0 and adds it, so 51 owned cards with 6 unpriced ones report a
 * confident number that is quietly too low, and nothing on screen says so.
 *
 * Measured on production 19 Aug 2026, on a 10% page sample of `cards`
 * (9,670 rows of 97,140, `tablesample system (10) repeatable (42)`, because a
 * full scan of a 255 MB table to answer this is exactly what the database
 * discipline rules forbid): 1.1% of printings carry no price in any of the six
 * slots and 16.2% carry no `usd`, which is roughly 1,100 and 15,800 rows. Those
 * rows are not free.
 *
 * An earlier version of this note said "726 of 52,130 printings". That
 * denominator was the row count partway through the printings sync and it went
 * stale within hours. Quote the denominator and how it was taken, every time.
 *
 * So a total from this file is never a bare number. It is the sum of what we
 * could price, plus the count of what we could not, and the components are
 * expected to say the second part out loud.
 */

import { readAmount, type PriceCurrency, type PriceFinish } from './sources.ts';

/** One stack of copies to be valued. */
export interface PriceLine {
  /** `unknown` for the same reason as `PricedPrinting.prices`: callers differ. */
  prices?: unknown;
  /** Non-foil copies. */
  quantity?: number | null;
  /** Foil copies. Priced at the foil slot, and NOT silently at the plain one. */
  foil?: number | null;
}

export interface PriceTotal {
  currency: PriceCurrency;
  /** Sum over the copies we could price. Never includes a guessed zero. */
  amount: number;
  /** Copies that had a price. */
  pricedCopies: number;
  /** Copies that did not. These are missing from `amount`. */
  unpricedCopies: number;
  /** Distinct lines that contributed nothing because we hold no price. */
  unpricedLines: number;
  /** True when every copy counted had a price. */
  complete: boolean;
}

const SLOT: Record<PriceCurrency, Record<PriceFinish, string>> = {
  USD: { nonfoil: 'usd', foil: 'usd_foil', etched: 'usd_etched' },
  EUR: { nonfoil: 'eur', foil: 'eur_foil', etched: 'eur_etched' },
  TIX: { nonfoil: 'tix', foil: 'tix', etched: 'tix' },
};

function count(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function parseBlob(prices: unknown): Record<string, unknown> {
  if (typeof prices === 'string') {
    try {
      return JSON.parse(prices) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (prices ?? {}) as Record<string, unknown>;
}

/**
 * Total a set of lines in ONE currency.
 *
 * Foils are priced at the foil slot. If a printing has foil copies and no foil
 * price, those copies count as unpriced rather than borrowing the non-foil
 * number, because a foil that sells for twenty times the plain copy is a real
 * thing and quietly substituting understates it. That is a deliberate
 * difference from `ownedValueUSD`, which falls back.
 */
export function totalPrices(
  lines: Iterable<PriceLine>,
  currency: PriceCurrency = 'USD'
): PriceTotal {
  const slots = SLOT[currency];
  let amount = 0;
  let pricedCopies = 0;
  let unpricedCopies = 0;
  let unpricedLines = 0;

  for (const line of lines) {
    const prices = parseBlob(line.prices);
    const plain = readAmount(prices[slots.nonfoil]);
    const foil = readAmount(prices[slots.foil]);

    const plainCopies = count(line.quantity);
    const foilCopies = count(line.foil);
    if (plainCopies === 0 && foilCopies === 0) continue;

    let lineMissed = false;

    if (plainCopies > 0) {
      if (plain != null) {
        amount += plain * plainCopies;
        pricedCopies += plainCopies;
      } else {
        unpricedCopies += plainCopies;
        lineMissed = true;
      }
    }

    if (foilCopies > 0) {
      if (foil != null) {
        amount += foil * foilCopies;
        pricedCopies += foilCopies;
      } else {
        unpricedCopies += foilCopies;
        lineMissed = true;
      }
    }

    if (lineMissed) unpricedLines += 1;
  }

  return {
    currency,
    // Money to the cent. Floating point sums of two-decimal prices drift.
    amount: Math.round(amount * 100) / 100,
    pricedCopies,
    unpricedCopies,
    unpricedLines,
    complete: unpricedCopies === 0,
  };
}

/**
 * The sentence that has to sit next to a partial total.
 *
 * Returns null when the total is complete, so a caller can render it
 * unconditionally. No em-dashes, no jargon.
 */
export function describeGaps(total: PriceTotal): string | null {
  if (total.complete) return null;
  if (total.pricedCopies === 0) {
    return total.unpricedCopies === 1
      ? 'We have no price for this card yet, so there is no total to show.'
      : `We have no prices for these ${total.unpricedCopies} cards yet, so there is no total to show.`;
  }
  const cards = total.unpricedCopies === 1 ? '1 card' : `${total.unpricedCopies} cards`;
  return `${cards} in this total had no price, so the real figure is higher.`;
}

/** Short form for a stat tile, where a full sentence will not fit. */
export function describeGapsShort(total: PriceTotal): string | null {
  if (total.complete) return null;
  return total.unpricedCopies === 1 ? '1 unpriced' : `${total.unpricedCopies} unpriced`;
}
