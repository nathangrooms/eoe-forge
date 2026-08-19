/**
 * What the list costs, per shop.
 *
 * WHY PER SHOP AND NOT ONE NUMBER
 * -------------------------------
 * People buy a whole list from one seller because postage is charged once. So
 * the useful figure is "this list at TCGplayer" beside "this list at
 * Cardmarket", not a single blended total that no basket will ever match.
 *
 * WHY THE TOTALS ARE NOT COMPARED
 * -------------------------------
 * TCGplayer quotes dollars and Cardmarket quotes euros. There is no exchange
 * rate anywhere in this project, so calling one of them cheaper would be an
 * invented claim placed next to two real ones. The two numbers sit side by side
 * and the player, who knows which continent they live on, decides.
 *
 * WHY THE UNPRICED COUNT TRAVELS WITH THE TOTAL
 * ---------------------------------------------
 * Some cards have no price in some shops. Adding those as zero makes the total
 * quietly too low while looking exact, which is the mistake this whole area of
 * the product exists to stop. So the count comes back in the same object as the
 * amount and the component cannot render one without the other.
 */

// Relative, with the extension, so `node --test` can resolve it: the test
// runner does not read the `@/` alias, and this module is on the tested path.
import { readPrices, type PriceCurrency, type PriceKey } from '../pricing/index.ts';
import type { Finish } from './list.ts';

export interface CostLine {
  /** The `cards` row, or anything else carrying a `prices` blob. */
  card?: any;
  quantity: number;
  finish: Finish;
}

export interface PlatformTotal {
  id: 'tcgplayer' | 'cardmarket' | 'mtgo';
  /** What a player calls it. */
  name: string;
  currency: PriceCurrency;
  /** Sum over the copies we could price. Never includes a guessed zero. */
  amount: number;
  pricedCopies: number;
  /** Copies missing from `amount` because this shop has no price for them. */
  unpricedCopies: number;
  /** Distinct cards that contributed nothing. */
  unpricedCards: number;
  complete: boolean;
}

const SLOT: Record<'tcgplayer' | 'cardmarket' | 'mtgo', Record<Finish, PriceKey>> = {
  tcgplayer: { nonfoil: 'usd', foil: 'usd_foil', etched: 'usd_etched' },
  cardmarket: { nonfoil: 'eur', foil: 'eur_foil', etched: 'eur_etched' },
  // Magic Online sells one digital object. There is no foil to price, so a foil
  // paper want is costed at the same ticket price rather than counted unpriced.
  mtgo: { nonfoil: 'tix', foil: 'tix', etched: 'tix' },
};

const PLATFORMS: { id: PlatformTotal['id']; name: string; currency: PriceCurrency }[] = [
  { id: 'tcgplayer', name: 'TCGplayer', currency: 'USD' },
  { id: 'cardmarket', name: 'Cardmarket', currency: 'EUR' },
  { id: 'mtgo', name: 'Magic Online', currency: 'TIX' },
];

export function platformTotals(lines: CostLine[]): PlatformTotal[] {
  return PLATFORMS.map(platform => {
    const slots = SLOT[platform.id];
    let amount = 0;
    let pricedCopies = 0;
    let unpricedCopies = 0;
    let unpricedCards = 0;

    for (const line of lines) {
      const copies = Math.max(0, Math.floor(Number(line.quantity) || 0));
      if (copies === 0) continue;

      const reading = readPrices(line.card);
      const source = reading.all.find(s => s.key === slots[line.finish]);
      const unit = source?.amount ?? null;

      if (unit == null) {
        unpricedCopies += copies;
        unpricedCards += 1;
        continue;
      }
      amount += unit * copies;
      pricedCopies += copies;
    }

    return {
      id: platform.id,
      name: platform.name,
      currency: platform.currency,
      // Money to the cent: floating point sums of two-decimal prices drift.
      amount: Math.round(amount * 100) / 100,
      pricedCopies,
      unpricedCopies,
      unpricedCards,
      complete: unpricedCopies === 0,
    };
  });
}

/**
 * The sentence that has to sit under a partial total. Null when nothing is
 * missing, so a caller can render it unconditionally.
 */
export function describePlatformGap(total: PlatformTotal): string | null {
  if (total.complete) return null;
  if (total.pricedCopies === 0) {
    return `${total.name} has no price for anything on this list.`;
  }
  const cards = total.unpricedCards === 1 ? '1 card' : `${total.unpricedCards} cards`;
  return `${cards} not priced here, so the real cost is higher.`;
}

/**
 * What the player has actually spent on the cards in flight.
 *
 * This is a different fact from what those cards are worth, and both matter.
 * Kept in its own currency for the same reason as everything else here: nothing
 * in this project can convert one into the other honestly.
 */
export interface PaidTotal {
  currency: 'USD' | 'EUR';
  amount: number;
  copies: number;
}

export function paidTotals(
  items: { paid_unit: number | null; paid_currency: 'USD' | 'EUR' | null; quantity: number }[]
): { totals: PaidTotal[]; copiesWithNoPrice: number } {
  const byCurrency = new Map<'USD' | 'EUR', PaidTotal>();
  let copiesWithNoPrice = 0;

  for (const item of items) {
    const copies = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (copies === 0) continue;
    if (item.paid_unit == null || item.paid_currency == null) {
      // Bought in a bundle with no per card price. Unknown, not free.
      copiesWithNoPrice += copies;
      continue;
    }
    const existing = byCurrency.get(item.paid_currency);
    if (existing) {
      existing.amount += item.paid_unit * copies;
      existing.copies += copies;
    } else {
      byCurrency.set(item.paid_currency, {
        currency: item.paid_currency,
        amount: item.paid_unit * copies,
        copies,
      });
    }
  }

  return {
    totals: [...byCurrency.values()].map(t => ({
      ...t,
      amount: Math.round(t.amount * 100) / 100,
    })),
    copiesWithNoPrice,
  };
}
