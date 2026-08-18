/**
 * Canonical shapes for the collection / storage card browser.
 *
 * Filtering itself no longer lives here. The browser now drives the shared
 * `CardFilterPanel`, so a `BrowserCard` is projected onto a `LocalCard` and
 * evaluated by `matchesCardFilter` — the same `CardSearchState` the card-search
 * pages send to Scryfall, read locally instead. What remains in this file is
 * the ownership vocabulary (copies, foil, condition) that only owned cards have
 * and that no Scryfall query can express.
 */

import { toLocalCard, type LocalCard } from '@/lib/cards/local-filter';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const WUBRG: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

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
  /**
   * The full card record behind the row — Scryfall object or `cards` row.
   *
   * This is what lets a tile draw from `image_uris.large` and flip a
   * double-faced card, instead of the single pre-picked `imageUrl` the browser
   * used to carry (which is why owned cards rendered from the 488px `normal`
   * image at 240px on a 2x display).
   */
  raw?: any;
  /** Escape hatch back to the caller's own object. */
  source?: unknown;
}

/**
 * Ownership facets. These are the questions only an owned card can answer, so
 * they sit beside the shared `CardSearchState` rather than inside it.
 */
export interface OwnershipFilterState {
  conditions: ConditionGrade[];
  foilOnly: boolean;
  /** Rows with at least this many copies. */
  minCopies: number;
}

export const EMPTY_OWNERSHIP: OwnershipFilterState = {
  conditions: [],
  foilOnly: false,
  minCopies: 0,
};

export function ownershipFilterCount(f: OwnershipFilterState): number {
  return (
    (f.conditions.length ? 1 : 0) + (f.foilOnly ? 1 : 0) + (f.minCopies > 0 ? 1 : 0)
  );
}

export function matchesOwnership(card: BrowserCard, f: OwnershipFilterState): boolean {
  if (f.conditions.length > 0 && !f.conditions.includes(card.condition)) return false;
  if (f.foilOnly && card.foil <= 0) return false;
  if (f.minCopies > 0 && copiesOf(card) < f.minCopies) return false;
  return true;
}

/**
 * Project a browser row onto the shape the shared filter evaluates.
 *
 * `raw` is preferred when the caller supplied it — it carries oracle text,
 * artist and printing flags that the flattened row never had, so the advanced
 * facets work on the Collection exactly as they do on the search page. Without
 * it the projection still covers colours, types, rarity, set, mana value,
 * legality and price.
 */
export function localCardOf(card: BrowserCard): LocalCard {
  return toLocalCard(card.raw, {
    name: card.name,
    typeLine: card.typeLine,
    cmc: card.cmc,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    rarity: (card.rarity ?? '').toLowerCase(),
    setCode: (card.setCode ?? '').toLowerCase(),
    collectorNumber: card.collectorNumber ?? '',
    legalities: card.legalities ?? {},
    usd: card.unitPrice > 0 ? card.unitPrice : null,
  });
}

/**
 * The object to hand `CardImage`. Falls back to a synthetic card so rows from
 * a caller that has not yet passed `raw` still render, just without a flip
 * affordance or a higher-resolution print.
 */
export function imageCardOf(card: BrowserCard): any {
  if (card.raw) return card.raw;
  return {
    name: card.name,
    image_uris: card.imageUrl
      ? { large: card.imageUrl, normal: card.imageUrl, small: card.imageUrl }
      : undefined,
  };
}

export function copiesOf(card: BrowserCard): number {
  return (card.quantity || 0) + (card.foil || 0);
}

/** The one valuation rule: non-foils at usd, foils at usd_foil. */
export function valueOf(card: BrowserCard): number {
  return (card.quantity || 0) * card.unitPrice + (card.foil || 0) * card.foilPrice;
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
 * Card size is no longer a five-step density enum. It is a continuous width in
 * px, owned by `useCardSize` / `CardSizeSlider` and handed straight to
 * `CardGrid`, so the same control behaves identically on every surface.
 */

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
