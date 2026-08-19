/**
 * Every price we actually hold for one printing, read honestly.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `cards.prices` is Scryfall's blob and it carries six live slots. Re-measured
 * against the production database on 19 Aug 2026 (52,130 rows in `cards`; the
 * catalogue is growing under an in-flight sync, so treat the counts as a floor
 * and the ratios as the durable part):
 *
 *   usd         46,944    TCGplayer, non-foil, US dollars
 *   usd_foil    33,311    TCGplayer, foil
 *   usd_etched     374    TCGplayer, etched foil
 *   eur         47,318    Cardmarket, non-foil, euros
 *   eur_foil    33,538    Cardmarket, foil
 *   eur_etched       0    never populated in our data, modelled anyway
 *   tix         36,150    Magic Online event tickets
 *
 * The product showed one of them. `src/components/cards/CardDetail.tsx` reads
 * `prices.usd` and `prices.usd_foil` and nothing else, so a player clicking
 * through from the marketplace saw a TCGplayer number and no way to tell that
 * Cardmarket and Magic Online prices were sitting in the same row.
 *
 * THE ZERO RULE
 * -------------
 * A missing price is NOT zero. Rendering 0.00 is a claim that the card is
 * worthless, and it is always a fabrication here: measured across all 52,130
 * rows, the smallest stored `usd` is 0.01, the smallest `eur` 0.02 and the
 * smallest `tix` 0.01, and not one row in any slot holds a zero. So the
 * database contains no genuine zero at all. Every slot in this model is
 * `number | null`, never a coerced 0, and the components refuse to print a
 * currency symbol next to a number we do not have.
 *
 * TWO DIFFERENT KINDS OF ABSENCE
 * ------------------------------
 * Sol Ring `msc` has `usd_foil: null` because that printing was never made in
 * foil. That is a different fact from "a foil exists and we have not priced
 * it", and players read them differently. `cards.finishes` tells them apart
 * where it is populated. Measured: `finishes` is null on 24,156 of 52,130 rows
 * (46%), so it cannot be the primary signal, but where it IS present it never
 * contradicts the prices (0 rows carry a `usd_foil` price without `foil` in
 * `finishes`, and 0 carry `usd_etched` without `etched`), so it is safe to
 * trust when it is there.
 */

/** Scryfall's raw price blob, exactly as `cards.prices` stores it. */
export type RawPrices = Record<string, string | number | null | undefined> | null | undefined;

/** The three things a price can be denominated in. Tix are not money. */
export type PriceCurrency = 'USD' | 'EUR' | 'TIX';

export type PriceFinish = 'nonfoil' | 'foil' | 'etched';

/** Who is quoting. Not "vendor" or "provider" — the name a player would say. */
export type PriceMarketId = 'tcgplayer' | 'cardmarket' | 'mtgo';

export type PriceKey =
  | 'usd'
  | 'usd_foil'
  | 'usd_etched'
  | 'eur'
  | 'eur_foil'
  | 'eur_etched'
  | 'tix';

/**
 * Why there is no number.
 *
 * `not-printed` is a fact about the card. `no-price` is a fact about our data.
 * Never collapse them into one message.
 */
export type MissingReason = 'not-printed' | 'no-price';

export interface PriceSource {
  key: PriceKey;
  market: PriceMarketId;
  /** 'TCGplayer', 'Cardmarket', 'Magic Online'. */
  marketName: string;
  /** Plain words for who this is and what money it is in. */
  marketNote: string;
  currency: PriceCurrency;
  finish: PriceFinish;
  /** 'Normal', 'Foil', 'Etched foil'. */
  finishLabel: string;
  /** The number, or null. NEVER 0 standing in for null. */
  amount: number | null;
  /** Set only when `amount` is null. */
  missing: MissingReason | null;
  /**
   * Whether this slot is worth putting on screen. The two plain paper prices
   * always are, because "we have no Cardmarket price" is itself useful. A foil
   * slot with no price and no evidence a foil was ever printed is noise.
   */
  show: boolean;
}

interface Slot {
  key: PriceKey;
  market: PriceMarketId;
  marketName: string;
  marketNote: string;
  currency: PriceCurrency;
  finish: PriceFinish;
}

const FINISH_LABEL: Record<PriceFinish, string> = {
  nonfoil: 'Normal',
  foil: 'Foil',
  etched: 'Etched foil',
};

/**
 * The order prices are read and rendered in. Non-foil first in each market
 * because that is the copy almost everyone is actually buying.
 */
const SLOTS: Slot[] = [
  {
    key: 'usd',
    market: 'tcgplayer',
    marketName: 'TCGplayer',
    marketNote: 'US shops, in dollars',
    currency: 'USD',
    finish: 'nonfoil',
  },
  {
    key: 'usd_foil',
    market: 'tcgplayer',
    marketName: 'TCGplayer',
    marketNote: 'US shops, in dollars',
    currency: 'USD',
    finish: 'foil',
  },
  {
    key: 'usd_etched',
    market: 'tcgplayer',
    marketName: 'TCGplayer',
    marketNote: 'US shops, in dollars',
    currency: 'USD',
    finish: 'etched',
  },
  {
    key: 'eur',
    market: 'cardmarket',
    marketName: 'Cardmarket',
    marketNote: 'European shops, in euros',
    currency: 'EUR',
    finish: 'nonfoil',
  },
  {
    key: 'eur_foil',
    market: 'cardmarket',
    marketName: 'Cardmarket',
    marketNote: 'European shops, in euros',
    currency: 'EUR',
    finish: 'foil',
  },
  {
    key: 'eur_etched',
    market: 'cardmarket',
    marketName: 'Cardmarket',
    marketNote: 'European shops, in euros',
    currency: 'EUR',
    finish: 'etched',
  },
  {
    key: 'tix',
    market: 'mtgo',
    marketName: 'Magic Online',
    marketNote: 'Digital copy, paid in event tickets',
    currency: 'TIX',
    finish: 'nonfoil',
  },
];

/**
 * Parse one stored price.
 *
 * Returns null for anything that is not a real positive number, including the
 * string '0' and '0.00'. A zero in this data would be a bad write rather than a
 * free card, and passing it through would print the exact lie this whole file
 * exists to prevent.
 */
export function readAmount(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** `cards.prices` is jsonb, but a few callers hand it over still stringified. */
function normaliseBlob(prices: unknown): Record<string, unknown> {
  if (typeof prices === 'string') {
    try {
      const parsed = JSON.parse(prices);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (prices && typeof prices === 'object') return prices as Record<string, unknown>;
  return {};
}

function normaliseFinishes(finishes: unknown): PriceFinish[] | null {
  if (!Array.isArray(finishes) || finishes.length === 0) return null;
  const out: PriceFinish[] = [];
  for (const raw of finishes) {
    const f = String(raw).toLowerCase();
    if (f === 'nonfoil' || f === 'foil' || f === 'etched') out.push(f);
  }
  return out.length ? out : null;
}

/**
 * Anything carrying a printing's prices: a `cards` row, a Scryfall object, a
 * deck row's joined card, a collection row's joined card.
 *
 * Both fields are `unknown` on purpose. Every caller in this product declares
 * `prices` differently (`Json`, `any`, `{ usd?: string }`, a parsed string) and
 * an interface with a narrower shape here would reject most of them at the call
 * site for no gain. The parsing below trusts nothing anyway.
 */
export interface PricedPrinting {
  prices?: unknown;
  finishes?: unknown;
}

export interface PriceReading {
  /** All seven slots, always, in a stable order. */
  all: PriceSource[];
  /**
   * The finishes this printing was actually made in, or null when we do not
   * know. Null on 24,156 of 52,130 rows, so absence here is normal and must not
   * be read as "no foil exists".
   */
  finishes: PriceFinish[] | null;
  /** The ones we have a number for. */
  known: PriceSource[];
  /** The ones worth rendering, priced or not. */
  visible: PriceSource[];
  /** True when we hold no price at all for this printing. */
  empty: boolean;
  /**
   * The cheapest way to get this printing IN A GIVEN CURRENCY.
   *
   * Only ever within one currency. Dollars against euros is not a comparison,
   * it is a conversion, and there is no rate source in this project, so
   * claiming one is cheaper than the other would be an invented number.
   *
   * It is worth marking, which was not obvious and so was measured rather than
   * assumed. "Non-foil is cheapest" sounds like a truism that would make the
   * badge noise. It is not: of 29,825 printings priced in both, the FOIL is
   * cheaper than the plain copy on 2,894 of them (9.7%), and in euros on 1,826
   * of 30,363 (6.0%). Etched beats foil on 48 of the 105 printings priced in
   * both. So roughly one card in ten is a case where the premium copy is the
   * cheap one, which is exactly the thing a player would want pointed out.
   */
  cheapestIn: Partial<Record<PriceCurrency, PriceKey>>;
}

/**
 * Read every price we hold for one printing.
 *
 * Pass the whole card record where you have it, so `finishes` can sharpen
 * "no price" into "never printed in foil".
 */
export function readPrices(card: PricedPrinting | null | undefined): PriceReading {
  const prices = normaliseBlob(card?.prices);
  const finishes = normaliseFinishes(card?.finishes);

  const all: PriceSource[] = SLOTS.map(slot => {
    const amount = readAmount(prices?.[slot.key]);
    const offered = finishes ? finishes.includes(slot.finish) : null;

    let missing: MissingReason | null = null;
    if (amount == null) missing = offered === false ? 'not-printed' : 'no-price';

    // Plain paper prices are always worth a row: "we have no Cardmarket price
    // for this" is information, and hiding it looks like TCGplayer is the only
    // market that exists, which is the bug being fixed.
    // A foil or etched row earns its place only when we have a number, or when
    // the card genuinely offers that finish.
    const alwaysShow = slot.finish === 'nonfoil' && slot.currency !== 'TIX';
    const show = amount != null || alwaysShow || offered === true;

    return {
      key: slot.key,
      market: slot.market,
      marketName: slot.marketName,
      marketNote: slot.marketNote,
      currency: slot.currency,
      finish: slot.finish,
      finishLabel: FINISH_LABEL[slot.finish],
      amount,
      missing,
      show,
    };
  });

  const known = all.filter(s => s.amount != null);

  const cheapestIn: Partial<Record<PriceCurrency, PriceKey>> = {};
  for (const currency of ['USD', 'EUR', 'TIX'] as PriceCurrency[]) {
    const inCurrency = known.filter(s => s.currency === currency);
    // One price is not a comparison, so there is nothing to call cheapest.
    if (inCurrency.length < 2) continue;
    let best = inCurrency[0];
    for (const s of inCurrency) if ((s.amount as number) < (best.amount as number)) best = s;
    cheapestIn[currency] = best.key;
  }

  return {
    all,
    finishes,
    known,
    visible: all.filter(s => s.show),
    empty: known.length === 0,
    cheapestIn,
  };
}

/**
 * A sentence naming the finishes this printing exists in, or null when we do
 * not know.
 *
 * It is what explains an absence. A player looking at Sol Ring `msc` sees no
 * foil row and cannot tell whether the foil is unpriced or was never made. This
 * says which, in words, without adding empty cells to the grid.
 */
export function describeFinishes(reading: PriceReading): string | null {
  const finishes = reading.finishes;
  if (!finishes || finishes.length === 0) return null;
  const words = finishes.map(f => (f === 'nonfoil' ? 'normal' : f === 'foil' ? 'foil' : 'etched foil'));
  if (words.length === 1) return `This printing was made in ${words[0]} only.`;
  const last = words[words.length - 1];
  return `This printing was made in ${words.slice(0, -1).join(', ')} and ${last}.`;
}

/** Group a reading by market, keeping slot order, dropping empty markets. */
export function byMarket(
  reading: PriceReading
): { market: PriceMarketId; name: string; note: string; sources: PriceSource[] }[] {
  const order: PriceMarketId[] = ['tcgplayer', 'cardmarket', 'mtgo'];
  return order
    .map(market => {
      const sources = reading.visible.filter(s => s.market === market);
      return {
        market,
        name: sources[0]?.marketName ?? '',
        note: sources[0]?.marketNote ?? '',
        sources,
      };
    })
    .filter(group => group.sources.length > 0);
}

/**
 * The one price to show when there is only room for one.
 *
 * Prefers the finish the caller is actually holding or buying, then the same
 * market's other finish, and never crosses into another currency, because a
 * grid cell reading "€1.54" under a dollar heading is worse than showing
 * nothing. Returns null when we have no price, and callers must render that as
 * words, not as 0.
 */
export function primaryPrice(
  card: PricedPrinting | null | undefined,
  options: { finish?: PriceFinish; currency?: PriceCurrency } = {}
): PriceSource | null {
  const { finish = 'nonfoil', currency = 'USD' } = options;
  const reading = readPrices(card);
  const inCurrency = reading.known.filter(s => s.currency === currency);
  if (inCurrency.length === 0) return null;
  return (
    inCurrency.find(s => s.finish === finish) ??
    inCurrency.find(s => s.finish === 'nonfoil') ??
    inCurrency[0]
  );
}
