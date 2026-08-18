/* Relative imports carry their `.ts` extension so this module runs unchanged
   under `node --test --experimental-strip-types`, the runner the repo already
   uses. Vite and `tsconfig.app.json` (`allowImportingTsExtensions`) both accept
   the explicit form; Node's ESM resolver does not accept the implicit one. */
import type { CardPlayability } from './playability.ts';
import { playabilityBand, type PlayabilityBandId } from './playabilityView.ts';
import { CATEGORY_LABEL, categorizeCard, CATEGORY_ORDER, type DeckCategory } from './cardCategories.ts';
import type { DeckCardRow } from './deckCards.ts';

/**
 * Filtering for the deck card list.
 *
 * The owner's standing complaint is "multiple filtering systems which make it
 * messy", so this deliberately does not introduce another popover-driven query
 * builder. It is a flat predicate over the rows the page already loaded, and
 * every facet it offers is derived from those rows — a deck with no
 * planeswalkers is never offered a Planeswalkers chip, and no chip is ever
 * offered with a count of zero. That keeps the control surface honest: every
 * option you can click changes what you see.
 */

export type ColourFacet = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type ManaValueFacet = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7+';
export type PriceFacet = 'lt1' | 'lt5' | 'lt20' | 'gte20' | 'unknown';

export interface DeckCardFilterState {
  search: string;
  categories: DeckCategory[];
  colours: ColourFacet[];
  manaValues: ManaValueFacet[];
  rarities: string[];
  prices: PriceFacet[];
  playability: PlayabilityBandId[];
}

export const EMPTY_DECK_CARD_FILTERS: DeckCardFilterState = {
  search: '',
  categories: [],
  colours: [],
  manaValues: [],
  rarities: [],
  prices: [],
  playability: [],
};

export function isFilterActive(state: DeckCardFilterState): boolean {
  return (
    state.search.trim().length > 0 ||
    state.categories.length > 0 ||
    state.colours.length > 0 ||
    state.manaValues.length > 0 ||
    state.rarities.length > 0 ||
    state.prices.length > 0 ||
    state.playability.length > 0
  );
}

export const COLOUR_FACETS: readonly ColourFacet[] = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

export const COLOUR_FACET_LABEL: Record<ColourFacet, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colourless',
};

export const MANA_VALUE_FACETS: readonly ManaValueFacet[] = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7+',
] as const;

export const PRICE_FACETS: readonly PriceFacet[] = ['lt1', 'lt5', 'lt20', 'gte20', 'unknown'];

export const PRICE_FACET_LABEL: Record<PriceFacet, string> = {
  lt1: 'Under $1',
  lt5: '$1 – $5',
  lt20: '$5 – $20',
  gte20: '$20+',
  unknown: 'No price',
};

/** Rarity order, so chips read common → mythic rather than alphabetically. */
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];

export function rowCategory(row: DeckCardRow): DeckCategory {
  return categorizeCard(row.card?.type_line, {
    isCommander: row.is_commander,
    isSideboard: row.is_sideboard,
  });
}

/**
 * Colour facets for a row, or `null` when the printing has not synced.
 *
 * A row with no `card` carries no colour information whatsoever. Falling back
 * to `['C']` filed it under Colourless — a claim about a card nobody has the
 * data for, on the very rows the table marks "card data not synced". Matching
 * no colour chip is the honest outcome.
 */
export function rowColours(row: DeckCardRow): ColourFacet[] | null {
  if (!row.card) return null;
  const colours = (row.card.colors ?? []).filter(c =>
    (['W', 'U', 'B', 'R', 'G'] as string[]).includes(c)
  ) as ColourFacet[];
  // A card with no coloured mana symbols is colourless — that includes every
  // artifact and every land that is not a coloured MDFC front face.
  return colours.length > 0 ? colours : ['C'];
}

/** Mana value facet, or `null` where there is no synced printing to read it off. */
export function rowManaValue(row: DeckCardRow): ManaValueFacet | null {
  // `?? 0` filed every unsynced row under "MV 0", next to the basics. That is
  // an invented mana value rather than a missing one.
  if (!row.card) return null;
  const cmc = row.card.cmc ?? 0;
  if (cmc >= 7) return '7+';
  const bin = Math.max(0, Math.min(6, Math.round(cmc)));
  return String(bin) as ManaValueFacet;
}

export function rowPrice(row: DeckCardRow): number | null {
  const usd = parseFloat(row.card?.prices?.usd ?? '');
  return Number.isNaN(usd) ? null : usd;
}

export function rowPriceFacet(row: DeckCardRow): PriceFacet {
  const price = rowPrice(row);
  if (price === null) return 'unknown';
  if (price < 1) return 'lt1';
  if (price < 5) return 'lt5';
  if (price < 20) return 'lt20';
  return 'gte20';
}

export interface FacetOption<T extends string> {
  value: T;
  label: string;
  /** Copies matching this facet, from the real rows. */
  count: number;
}

export interface DeckCardFacets {
  categories: FacetOption<DeckCategory>[];
  colours: FacetOption<ColourFacet>[];
  manaValues: FacetOption<ManaValueFacet>[];
  rarities: FacetOption<string>[];
  prices: FacetOption<PriceFacet>[];
  playability: FacetOption<PlayabilityBandId>[];
}

type PlayabilityLookup = (row: DeckCardRow) => CardPlayability | null;

/**
 * Which chips to offer, and the real count behind each.
 *
 * Counts are copy-weighted — four Lightning Bolts are four cards in the deck,
 * and a chip that says "1" beside a playset would be misleading about what
 * clicking it filters to.
 */
export function computeDeckCardFacets(
  rows: readonly DeckCardRow[],
  playabilityFor?: PlayabilityLookup
): DeckCardFacets {
  const categories = new Map<DeckCategory, number>();
  const colours = new Map<ColourFacet, number>();
  const manaValues = new Map<ManaValueFacet, number>();
  const rarities = new Map<string, number>();
  const prices = new Map<PriceFacet, number>();
  const bands = new Map<PlayabilityBandId, number>();

  const bump = <T>(map: Map<T, number>, key: T, qty: number) =>
    map.set(key, (map.get(key) ?? 0) + qty);

  for (const row of rows) {
    const qty = row.quantity || 1;
    bump(categories, rowCategory(row), qty);
    for (const colour of rowColours(row) ?? []) bump(colours, colour, qty);
    const mv = rowManaValue(row);
    if (mv) bump(manaValues, mv, qty);
    if (row.card?.rarity) bump(rarities, row.card.rarity, qty);
    bump(prices, rowPriceFacet(row), qty);

    const play = playabilityFor?.(row);
    if (play && play.pct !== null) bump(bands, playabilityBand(play.pct).id, qty);
  }

  return {
    categories: CATEGORY_ORDER.filter(c => categories.has(c)).map(value => ({
      value,
      label: CATEGORY_LABEL[value],
      count: categories.get(value) as number,
    })),
    colours: COLOUR_FACETS.filter(c => colours.has(c)).map(value => ({
      value,
      label: COLOUR_FACET_LABEL[value],
      count: colours.get(value) as number,
    })),
    manaValues: MANA_VALUE_FACETS.filter(m => manaValues.has(m)).map(value => ({
      value,
      label: value,
      count: manaValues.get(value) as number,
    })),
    rarities: RARITY_ORDER.filter(r => rarities.has(r)).map(value => ({
      value,
      label: value,
      count: rarities.get(value) as number,
    })),
    prices: PRICE_FACETS.filter(p => prices.has(p)).map(value => ({
      value,
      label: PRICE_FACET_LABEL[value],
      count: prices.get(value) as number,
    })),
    // Bands stay in their canonical high-to-low order rather than deck order,
    // so the chip row always reads best → worst.
    playability: (['reliable', 'fine', 'awkward', 'hard', 'unlikely'] as PlayabilityBandId[])
      .filter(b => bands.has(b))
      .map(value => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
        count: bands.get(value) as number,
      })),
  };
}

/**
 * Apply the filter.
 *
 * Within a facet the chips are OR-ed (Red *or* Green); across facets they are
 * AND-ed (Red *and* two mana). That is the behaviour every card search in the
 * hobby uses, so it needs no explaining to the player.
 */
export function filterDeckRows(
  rows: readonly DeckCardRow[],
  state: DeckCardFilterState,
  playabilityFor?: PlayabilityLookup
): DeckCardRow[] {
  const needle = state.search.trim().toLowerCase();

  return rows.filter(row => {
    if (needle) {
      const name = (row.card?.name || row.card_name || '').toLowerCase();
      const type = (row.card?.type_line || '').toLowerCase();
      const text = (row.card?.oracle_text || '').toLowerCase();
      if (!name.includes(needle) && !type.includes(needle) && !text.includes(needle)) {
        return false;
      }
    }

    if (state.categories.length && !state.categories.includes(rowCategory(row))) return false;

    if (state.colours.length) {
      // No synced printing means no colour to match on, so the row drops out
      // rather than being smuggled in under Colourless.
      const own = rowColours(row);
      if (!own || !own.some(c => state.colours.includes(c))) return false;
    }

    if (state.manaValues.length) {
      const mv = rowManaValue(row);
      if (!mv || !state.manaValues.includes(mv)) return false;
    }

    if (state.rarities.length && !state.rarities.includes(row.card?.rarity ?? '')) return false;

    if (state.prices.length && !state.prices.includes(rowPriceFacet(row))) return false;

    if (state.playability.length) {
      const play = playabilityFor?.(row);
      // A land has no band, so a playability filter necessarily excludes it.
      // That is the right answer: you asked which spells are hard to cast.
      if (!play || play.pct === null) return false;
      if (!state.playability.includes(playabilityBand(play.pct).id)) return false;
    }

    return true;
  });
}
