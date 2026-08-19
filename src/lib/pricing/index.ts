/**
 * Prices, in one place.
 *
 * We hold six live price slots per printing and the product showed one. Read
 * `sources.ts` for what they are and how absence is modelled; the short version
 * is that a missing price is null, never 0, and dollars are never printed as
 * euros.
 *
 * ```tsx
 * import { CardPrices } from '@/components/pricing';
 * <CardPrices card={card} />
 * ```
 */

export {
  readPrices,
  readAmount,
  byMarket,
  describeFinishes,
  primaryPrice,
  type RawPrices,
  type PriceCurrency,
  type PriceFinish,
  type PriceKey,
  type PriceMarketId,
  type PriceSource,
  type PriceReading,
  type PricedPrinting,
  type MissingReason,
} from './sources.ts';

export {
  formatAmount,
  formatSource,
  formatTotal,
  finishLabelFor,
  convertedEstimate,
  NO_PRICE,
  NOT_PRINTED,
  type ConvertedEstimate,
} from './format.ts';

export {
  totalPrices,
  describeGaps,
  describeGapsShort,
  type PriceLine,
  type PriceTotal,
} from './totals.ts';

export { buyLinks, type BuyLink, type BuyLinkInput } from './links.ts';
