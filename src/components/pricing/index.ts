/**
 * Price display, in one place.
 *
 * `CardPrices` is the full panel: every market and finish we hold for one
 * printing, with buy links. `PriceTag` is the single number for a grid tile or
 * a list row. `PriceTotalLine` is a sum that admits what it could not price.
 *
 * All three refuse to render 0 for a price we do not have, and none of them
 * converts one currency into another.
 */

export { CardPrices, type CardPricesProps } from './CardPrices';
export { PriceTag, type PriceTagProps } from './PriceTag';
export { PriceTotalLine, type PriceTotalLineProps } from './PriceTotalLine';
