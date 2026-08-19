/**
 * Turning a price into words.
 *
 * Three rules, all of them about not lying:
 *
 * 1. `null` never becomes 0. It becomes a sentence.
 * 2. Dollars print with a dollar sign, euros with a euro sign. The symbol is
 *    part of the fact, not decoration.
 * 3. Tickets are not money and never take a currency symbol. A Magic Online
 *    ticket is an event entry, bought in bundles, and "0.04" beside a dollar
 *    sign would tell a paper player this card costs four cents.
 */

import type { PriceCurrency, PriceSource } from './sources.ts';

/** What we say when we do not have a number. Never a zero. */
export const NO_PRICE = 'No price yet';
export const NOT_PRINTED = 'Not printed';

const MONEY = {
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  EUR: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
} as const;

/**
 * Format an amount in its own currency.
 *
 * Returns null for null, so a caller cannot accidentally print "$0.00" by
 * forgetting the check. Nothing here converts between currencies.
 */
export function formatAmount(
  amount: number | null | undefined,
  currency: PriceCurrency
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (currency === 'TIX') {
    // Tickets are quoted to two places by Magic Online itself.
    return `${amount.toFixed(2)} tix`;
  }
  return MONEY[currency].format(amount);
}

/** The number, or the reason there is not one. Safe to drop straight into JSX. */
export function formatSource(source: PriceSource): string {
  const formatted = formatAmount(source.amount, source.currency);
  if (formatted) return formatted;
  return source.missing === 'not-printed' ? NOT_PRINTED : NO_PRICE;
}

/** Short label for a slot: 'Normal', 'Foil', 'Etched foil', 'Ticket price'. */
export function finishLabelFor(source: PriceSource): string {
  if (source.currency === 'TIX') return 'Ticket price';
  return source.finishLabel;
}

/**
 * Big totals, still honest.
 *
 * Compacts at four figures so a stat tile does not wrap, and keeps the currency
 * symbol. `null` stays null.
 */
export function formatTotal(
  amount: number | null | undefined,
  currency: PriceCurrency
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (currency === 'TIX') return `${amount.toFixed(2)} tix`;
  if (Math.abs(amount) >= 10000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'EUR' ? 'EUR' : 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return MONEY[currency].format(amount);
}

/**
 * Currency conversion, deliberately refused.
 *
 * We hold dollars from TCGplayer and euros from Cardmarket. Presenting one as
 * the other needs an exchange rate, and this project has no rate source, live
 * or stored. Multiplying by a number somebody remembered would invent a price
 * and put it next to two real ones, which is worse than showing neither.
 *
 * This function exists so that intent is written down and callable rather than
 * left as a comment somebody works around. Give it a rate and the date that
 * rate was read, and it returns a value that carries its own disclosure. Give
 * it nothing and it returns null.
 */
export interface ConvertedEstimate {
  amount: number;
  currency: PriceCurrency;
  /** Ready to render next to the number. Never optional. */
  disclosure: string;
}

export function convertedEstimate(
  amount: number | null | undefined,
  from: PriceCurrency,
  to: PriceCurrency,
  rate?: { value: number; asOf: string } | null
): ConvertedEstimate | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (from === to) return null;
  if (!rate || !Number.isFinite(rate.value) || rate.value <= 0 || !rate.asOf) return null;
  return {
    amount: amount * rate.value,
    currency: to,
    disclosure: `Estimate at ${rate.value} ${from} to ${to}, rate from ${rate.asOf}`,
  };
}
