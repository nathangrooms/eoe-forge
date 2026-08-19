/**
 * Which printing do you actually own, and what is it worth.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Until 19 Aug 2026 the catalogue held one printing of every card, so the
 * printing id on a collection row, a listing or a deck row was never a choice.
 * It was whichever row survived Scryfall's `unique=cards`. Now `cards` holds
 * every printing, and printings of the same card differ enormously in price:
 * a Sol Ring is a few dimes or a few hundred dollars depending on which one is
 * in the sleeve.
 *
 * That turns an old silence into a lie. Summing a collection at the price of an
 * arbitrary printing produces a confident total that is simply not the user's
 * total, and nothing on screen admits it. This file makes the admission
 * computable.
 *
 * THREE STATES, NOT TWO
 * ---------------------
 * A row's printing is settled when EITHER the owner picked it, OR the card only
 * exists in one printing so there was never anything to pick. The second case
 * matters: it is not a concession, it is a fact, and without it a brand new
 * collection of single-printing cards would report "nothing confirmed" and look
 * broken while being completely knowable.
 *
 * The third state is a row we assigned. For those we do not invent a price. We
 * report the range the card's printings actually span, so the user sees the
 * size of the question rather than a made-up answer to it.
 *
 * This file is pure. It does no IO, so it can be tested without a database.
 * `src/lib/cards/printings.ts` fetches the spreads it consumes.
 */

import { readAmount, type PriceCurrency, type PriceFinish } from './sources.ts';

/**
 * What every printing of one card costs, and how many there are.
 *
 * `min`/`max` are over the printings we hold a price for. A card whose
 * printings are all unpriced has counts but no bounds, which is a real state
 * and not an error.
 */
export interface PrintingSpread {
  oracleId: string;
  /** How many printings the catalogue holds. Always at least 1. */
  printings: number;
  usdMin: number | null;
  usdMax: number | null;
  usdFoilMin: number | null;
  usdFoilMax: number | null;
  eurMin: number | null;
  eurMax: number | null;
  eurFoilMin: number | null;
  eurFoilMax: number | null;
}

/**
 * How sure we are that the price we are about to quote is the price of the
 * copy in the user's box.
 *
 * - `chosen`: the owner said which printing. Trust it completely.
 * - `only-printing`: the card exists in exactly one printing, so there is
 *   nothing to choose and the answer is exact anyway.
 * - `assigned`: we picked a printing for them. The price is a sample from a
 *   range, and must never be presented as their number.
 */
export type PrintingCertainty = 'chosen' | 'only-printing' | 'assigned';

/** One owned stack, with everything needed to judge how sure its price is. */
export interface OwnedLine {
  /** `unknown` for the same reason as `PricedPrinting.prices`: callers differ. */
  prices?: unknown;
  /** Non-foil copies owned. */
  quantity?: number | null;
  /** Foil copies owned. Priced at the foil slot, never at the plain one. */
  foil?: number | null;
  /** Links the row to every other printing of the same card. */
  oracleId?: string | null;
  /** True once the owner has said which printing this is. */
  printingChosen?: boolean | null;
}

export interface OwnedValue {
  currency: PriceCurrency;

  /** Value of copies whose printing is settled AND priced. The honest total. */
  settled: number;
  /** Copies that contributed to `settled`. */
  settledCopies: number;

  /** Copies whose printing is settled but for which we hold no price. */
  unpricedCopies: number;
  /** Rows those copies came from. */
  unpricedRows: number;

  /** Rows where nobody has said which printing this is. */
  assignedRows: number;
  /** Copies in those rows. */
  assignedCopies: number;
  /** Cheapest those copies could be, across the printings we can price. */
  assignedLow: number;
  /** Dearest they could be. */
  assignedHigh: number;
  /** Assigned copies we could not bound at all, because no printing is priced. */
  unboundedCopies: number;

  /** `settled + assignedLow`. */
  low: number;
  /** `settled + assignedHigh`. */
  high: number;

  /** True when every copy is settled and priced, so `settled` is the whole answer. */
  exact: boolean;
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

/** Money to the cent. Floating point sums of two-decimal prices drift. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Which of the three states a row is in.
 *
 * A missing spread counts as `assigned`, deliberately. Not knowing how many
 * printings a card has is not evidence that it has one, and defaulting the
 * other way would quietly reinstate exactly the overconfidence this file
 * exists to remove.
 */
export function certaintyOf(
  line: Pick<OwnedLine, 'printingChosen' | 'oracleId'>,
  spread: PrintingSpread | undefined
): PrintingCertainty {
  if (line.printingChosen) return 'chosen';
  if (spread && spread.printings <= 1) return 'only-printing';
  return 'assigned';
}

/** Whether the price on this row can be quoted as the owner's price. */
export function isSettled(certainty: PrintingCertainty): boolean {
  return certainty !== 'assigned';
}

function boundsFor(
  spread: PrintingSpread | undefined,
  currency: PriceCurrency,
  finish: 'nonfoil' | 'foil'
): { min: number | null; max: number | null } {
  if (!spread) return { min: null, max: null };
  if (currency === 'EUR') {
    return finish === 'foil'
      ? { min: spread.eurFoilMin, max: spread.eurFoilMax }
      : { min: spread.eurMin, max: spread.eurMax };
  }
  if (currency === 'USD') {
    return finish === 'foil'
      ? { min: spread.usdFoilMin, max: spread.usdFoilMax }
      : { min: spread.usdMin, max: spread.usdMax };
  }
  // Magic Online tickets are not money and no spread is kept for them.
  return { min: null, max: null };
}

/**
 * Value a collection without pretending to know things we do not.
 *
 * Returns four separate facts rather than one number: what the settled copies
 * are worth, how many copies we hold no price for, how many rows have not said
 * which printing, and the range those rows span. A caller that renders only
 * `settled` and calls it the total is making the same mistake again, so the
 * components are expected to say all of it.
 */
export function valueOwned(
  lines: Iterable<OwnedLine>,
  spreads: Map<string, PrintingSpread>,
  currency: PriceCurrency = 'USD'
): OwnedValue {
  const slots = SLOT[currency];

  let settled = 0;
  let settledCopies = 0;
  let unpricedCopies = 0;
  let unpricedRows = 0;
  let assignedRows = 0;
  let assignedCopies = 0;
  let assignedLow = 0;
  let assignedHigh = 0;
  let unboundedCopies = 0;

  for (const line of lines) {
    const plainCopies = count(line.quantity);
    const foilCopies = count(line.foil);
    if (plainCopies === 0 && foilCopies === 0) continue;

    const spread = line.oracleId ? spreads.get(line.oracleId) : undefined;
    const certainty = certaintyOf(line, spread);

    if (certainty === 'assigned') {
      assignedRows += 1;
      assignedCopies += plainCopies + foilCopies;

      for (const [copies, finish] of [
        [plainCopies, 'nonfoil'],
        [foilCopies, 'foil'],
      ] as const) {
        if (copies === 0) continue;
        const { min, max } = boundsFor(spread, currency, finish);
        if (min == null || max == null) {
          // Nothing in the catalogue prices this finish of this card, so there
          // is no range to quote. Counted, not guessed.
          unboundedCopies += copies;
          continue;
        }
        assignedLow += min * copies;
        assignedHigh += max * copies;
      }
      continue;
    }

    const prices = parseBlob(line.prices);
    const plain = readAmount(prices[slots.nonfoil]);
    const foil = readAmount(prices[slots.foil]);
    let rowMissed = false;

    if (plainCopies > 0) {
      if (plain != null) {
        settled += plain * plainCopies;
        settledCopies += plainCopies;
      } else {
        unpricedCopies += plainCopies;
        rowMissed = true;
      }
    }

    if (foilCopies > 0) {
      if (foil != null) {
        settled += foil * foilCopies;
        settledCopies += foilCopies;
      } else {
        unpricedCopies += foilCopies;
        rowMissed = true;
      }
    }

    if (rowMissed) unpricedRows += 1;
  }

  settled = cents(settled);
  assignedLow = cents(assignedLow);
  assignedHigh = cents(assignedHigh);

  return {
    currency,
    settled,
    settledCopies,
    unpricedCopies,
    unpricedRows,
    assignedRows,
    assignedCopies,
    assignedLow,
    assignedHigh,
    unboundedCopies,
    low: cents(settled + assignedLow),
    high: cents(settled + assignedHigh),
    exact: assignedRows === 0 && unpricedCopies === 0,
  };
}

/**
 * The sentence that has to sit beside a total with unsettled rows.
 *
 * Returns null when there is nothing to admit. No em-dashes, no jargon: a
 * player reads "say which printing", not "resolve printing ambiguity".
 */
export function describePrintingGap(value: OwnedValue): string | null {
  if (value.assignedRows === 0) return null;

  const cards =
    value.assignedRows === 1 ? '1 card' : `${value.assignedRows} cards`;
  const verb = value.assignedRows === 1 ? 'has' : 'have';

  if (value.assignedLow === 0 && value.assignedHigh === 0) {
    return `${cards} in here ${verb} more than one printing and we have no price for any of them, so they add nothing to this total.`;
  }

  const low = money(value.assignedLow, value.currency);
  const high = money(value.assignedHigh, value.currency);

  if (value.assignedLow === value.assignedHigh) {
    return `${cards} ${verb} more than one printing. Every printing costs the same, so they are worth ${low} whichever you own.`;
  }

  return `${cards} ${verb} more than one printing and nobody has said which you own. They are worth somewhere between ${low} and ${high}.`;
}

/** Short form for a stat tile, where a full sentence will not fit. */
export function describePrintingGapShort(value: OwnedValue): string | null {
  if (value.assignedRows === 0) return null;
  return value.assignedRows === 1
    ? '1 card needs a printing'
    : `${value.assignedRows} cards need a printing`;
}

/** What to say about one row, in the words a player would use. */
export function describeCertainty(certainty: PrintingCertainty): string {
  switch (certainty) {
    case 'chosen':
      return 'You picked this printing.';
    case 'only-printing':
      return 'This card was only ever printed once, so this is the one.';
    case 'assigned':
      return 'We picked a printing for you. Say which one you own to get the price right.';
  }
}

function money(amount: number, currency: PriceCurrency): string {
  if (currency === 'TIX') return `${amount.toFixed(2)} tix`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'EUR' ? 'EUR' : 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
