/**
 * Canonical shapes for the collection / storage card browser.
 *
 * Everything here speaks Scryfall's own vocabulary — uppercase WUBRG, lowercase
 * rarity words, lowercase format codes — because the previous filter layer
 * emitted lowercase colours and compared them against uppercase `card.colors`,
 * which meant the colour filter could never match a single card.
 */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const WUBRG: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

export const COLOR_LABEL: Record<ManaColor, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/**
 * How a colour selection is interpreted. These are the modes MTG players
 * actually use; "any" was previously the only (broken) behaviour.
 */
export type ColorMatchMode = 'any' | 'all' | 'exactly' | 'identity';

export const COLOR_MODE_LABEL: Record<ColorMatchMode, string> = {
  any: 'Includes any',
  all: 'Includes all',
  exactly: 'Exactly these',
  identity: 'Within colour identity',
};

/** Rarities as Scryfall spells them. */
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;

/** Primary card types, matched against `type_line`. */
export const CARD_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
  'Land',
] as const;

/** Tailwind token per primary type — registered in tailwind.config.ts. */
export const TYPE_TOKEN: Record<string, string> = {
  Creature: 'text-type-creatures',
  Instant: 'text-type-instants',
  Sorcery: 'text-type-sorceries',
  Artifact: 'text-type-artifacts',
  Enchantment: 'text-type-enchantments',
  Planeswalker: 'text-type-planeswalkers',
  Battle: 'text-type-battles',
  Land: 'text-type-lands',
};

/** Formats the collection can be filtered by, keyed as Scryfall legalities are. */
export const FORMATS = [
  { value: 'standard', label: 'Standard' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'commander', label: 'Commander' },
  { value: 'pauper', label: 'Pauper' },
  { value: 'brawl', label: 'Brawl' },
] as const;

/**
 * Market condition grades (TCGplayer / CardMarket). The database still stores
 * the older seven-value vocabulary, so `normalizeCondition` maps both onto
 * these five.
 */
export const CONDITIONS = [
  { value: 'NM', label: 'Near Mint' },
  { value: 'LP', label: 'Lightly Played' },
  { value: 'MP', label: 'Moderately Played' },
  { value: 'HP', label: 'Heavily Played' },
  { value: 'DMG', label: 'Damaged' },
] as const;

export type ConditionGrade = (typeof CONDITIONS)[number]['value'];

const CONDITION_ALIASES: Record<string, ConditionGrade> = {
  mint: 'NM',
  near_mint: 'NM',
  nearmint: 'NM',
  nm: 'NM',
  excellent: 'LP',
  good: 'LP',
  light_played: 'LP',
  lightly_played: 'LP',
  lp: 'LP',
  played: 'MP',
  moderately_played: 'MP',
  mp: 'MP',
  heavily_played: 'HP',
  hp: 'HP',
  poor: 'DMG',
  damaged: 'DMG',
  dmg: 'DMG',
};

export function normalizeCondition(raw?: string | null): ConditionGrade {
  if (!raw) return 'NM';
  return CONDITION_ALIASES[String(raw).toLowerCase().trim()] ?? 'NM';
}

export function conditionLabel(raw?: string | null): string {
  const grade = normalizeCondition(raw);
  return CONDITIONS.find(c => c.value === grade)?.label ?? 'Near Mint';
}

/**
 * One row in the browser. Pages map their own domain objects onto this so a
 * single predicate, sort and renderer serve the collection, a storage
 * container, and anything else that lists owned cards.
 */
export interface BrowserCard {
  /** Stable identity of the underlying row (collection item / storage item). */
  rowId: string;
  /** Scryfall printing id. */
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber?: string;
  manaCost?: string;
  cmc: number;
  typeLine: string;
  rarity: string;
  /** Uppercase WUBRG, exactly as Scryfall returns it. */
  colors: ManaColor[];
  colorIdentity: ManaColor[];
  legalities: Record<string, string>;
  imageUrl?: string;
  /** Non-foil copies owned. */
  quantity: number;
  /** Foil copies owned. */
  foil: number;
  condition: ConditionGrade;
  /** Market price of one non-foil copy, USD. */
  unitPrice: number;
  /** Market price of one foil copy, USD (falls back to non-foil). */
  foilPrice: number;
  addedAt?: string;
  /** Escape hatch back to the caller's own object. */
  source?: unknown;
}

export function copiesOf(card: BrowserCard): number {
  return (card.quantity || 0) + (card.foil || 0);
}

/** The one valuation rule: non-foils at usd, foils at usd_foil. */
export function valueOf(card: BrowserCard): number {
  return (card.quantity || 0) * card.unitPrice + (card.foil || 0) * card.foilPrice;
}

export interface CollectionFilterState {
  query: string;
  colors: ManaColor[];
  /** Colourless is a predicate (`colors.length === 0`), not a pseudo-colour. */
  colorless: boolean;
  colorMode: ColorMatchMode;
  types: string[];
  rarities: string[];
  formats: string[];
  cmc: [number, number];
  priceMin: number | null;
  priceMax: number | null;
  sets: string[];
  conditions: string[];
  foilOnly: boolean;
}

export const CMC_MAX = 16;

export const EMPTY_FILTERS: CollectionFilterState = {
  query: '',
  colors: [],
  colorless: false,
  colorMode: 'any',
  types: [],
  rarities: [],
  formats: [],
  cmc: [0, CMC_MAX],
  priceMin: null,
  priceMax: null,
  sets: [],
  conditions: [],
  foilOnly: false,
};

export function activeFilterCount(f: CollectionFilterState): number {
  let n = 0;
  if (f.colors.length || f.colorless) n++;
  if (f.types.length) n++;
  if (f.rarities.length) n++;
  if (f.formats.length) n++;
  if (f.cmc[0] > 0 || f.cmc[1] < CMC_MAX) n++;
  if (f.priceMin != null || f.priceMax != null) n++;
  if (f.sets.length) n++;
  if (f.conditions.length) n++;
  if (f.foilOnly) n++;
  return n;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every(x => set.has(x));
}

/** The single client-side predicate. Colours are compared uppercase-to-uppercase. */
export function matchesFilter(card: BrowserCard, f: CollectionFilterState): boolean {
  const q = f.query.trim().toLowerCase().replace(/,/g, '');
  if (q) {
    const haystack = [card.name, card.typeLine, card.setCode, card.collectorNumber ?? '']
      .join(' ')
      .toLowerCase()
      .replace(/,/g, '');
    if (!haystack.includes(q)) return false;
  }

  if (f.colors.length > 0 || f.colorless) {
    const cardColors = f.colorMode === 'identity' ? card.colorIdentity : card.colors;
    const isColorless = cardColors.length === 0;

    let ok = false;
    if (f.colorless && isColorless) {
      ok = true;
    } else if (f.colors.length > 0 && !isColorless) {
      switch (f.colorMode) {
        case 'all':
          ok = f.colors.every(c => cardColors.includes(c));
          break;
        case 'exactly':
          ok = sameSet(cardColors, f.colors);
          break;
        case 'identity':
          // Everything the card needs must be inside the chosen identity.
          ok = cardColors.every(c => f.colors.includes(c));
          break;
        case 'any':
        default:
          ok = f.colors.some(c => cardColors.includes(c));
          break;
      }
    } else if (f.colors.length > 0 && isColorless && f.colorMode === 'identity') {
      // A colourless card fits inside every identity.
      ok = true;
    }
    if (!ok) return false;
  }

  if (f.types.length > 0) {
    const tl = card.typeLine.toLowerCase();
    if (!f.types.some(t => tl.includes(t.toLowerCase()))) return false;
  }

  if (f.rarities.length > 0 && !f.rarities.includes(card.rarity)) return false;

  if (f.formats.length > 0) {
    // Legalities are now mapped onto every row; previously this object was
    // always `{}` so selecting any format emptied the grid.
    const legal = f.formats.some(fmt => {
      const status = card.legalities?.[fmt];
      return status === 'legal' || status === 'restricted';
    });
    if (!legal) return false;
  }

  if (card.cmc < f.cmc[0] || card.cmc > f.cmc[1]) return false;

  if (f.priceMin != null || f.priceMax != null) {
    const price = card.foil > 0 && card.quantity === 0 ? card.foilPrice : card.unitPrice;
    if (f.priceMin != null && price < f.priceMin) return false;
    if (f.priceMax != null && price > f.priceMax) return false;
  }

  if (f.sets.length > 0 && !f.sets.includes(card.setCode)) return false;

  if (f.conditions.length > 0 && !f.conditions.includes(card.condition)) return false;

  if (f.foilOnly && card.foil <= 0) return false;

  return true;
}

export type SortKey =
  | 'name'
  | 'price'
  | 'value'
  | 'quantity'
  | 'cmc'
  | 'rarity'
  | 'set'
  | 'added';

export type SortDirection = 'asc' | 'desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Unit price' },
  { value: 'value', label: 'Total value' },
  { value: 'quantity', label: 'Copies owned' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
  { value: 'added', label: 'Date added' },
];

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  special: 3,
  mythic: 4,
  bonus: 5,
};

export function sortCards(
  cards: BrowserCard[],
  key: SortKey,
  dir: SortDirection
): BrowserCard[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'price':
        cmp = a.unitPrice - b.unitPrice;
        break;
      case 'value':
        cmp = valueOf(a) - valueOf(b);
        break;
      case 'quantity':
        cmp = copiesOf(a) - copiesOf(b);
        break;
      case 'cmc':
        cmp = a.cmc - b.cmc;
        break;
      case 'rarity':
        cmp = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
        break;
      case 'set':
        cmp = a.setCode.localeCompare(b.setCode);
        break;
      case 'added':
        cmp =
          new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime();
        break;
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return cmp * factor;
  });
}

export type BrowserViewMode = 'grid' | 'list' | 'table';

/**
 * Card-size density. Drives `grid-template-columns: repeat(auto-fill,
 * minmax(<px>, 1fr))`, so the grid genuinely changes density instead of the old
 * grid/compact modes that differed by one column at two breakpoints.
 */
export const DENSITY_STEPS = [96, 128, 160, 200, 240] as const;
export const DEFAULT_DENSITY = 2;

/** One currency formatter for the whole area. */
export function formatPrice(value: number | null | undefined, currency = 'USD'): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Compact form for stat tiles: $12.3k. */
export function formatPriceCompact(value: number | null | undefined, currency = 'USD'): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(n) >= 10000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return formatPrice(n, currency);
}

export function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Uppercase and drop anything that is not a real colour letter. */
export function toColors(raw: unknown): ManaColor[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(c => String(c).toUpperCase())
    .filter((c): c is ManaColor => (WUBRG as string[]).includes(c));
}
