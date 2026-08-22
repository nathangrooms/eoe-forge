import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categorizeCard,
  type DeckCategory,
} from './cardCategories.ts';
import type { DeckCardRow } from './deckCards.ts';

/**
 * How the decklist is cut into sections, and in what order the cards inside
 * them sit.
 *
 * Both controls came off the builder's decklist, which is the only listing in
 * the product with an axis worth cutting on. They work over `DeckCardRow` here
 * rather than the store's card, so the one decklist surface can offer them.
 *
 * Grouping by card type goes through `cardCategories`, the same categoriser the
 * grid, the table and the deck filters already use — not the builder's second
 * copy. Two files each documented as the canonical categoriser is exactly the
 * duplicate this merge exists to remove.
 */

export type DeckGroupAxis = 'type' | 'color' | 'cmc' | 'none';
export type DeckSortAxis = 'name' | 'cmc' | 'quantity' | 'price' | 'type';
export type SortDir = 'asc' | 'desc';

export const GROUP_AXIS_LABEL: Record<DeckGroupAxis, string> = {
  type: 'Card type',
  color: 'Colour',
  cmc: 'Mana value',
  none: 'No grouping',
};

export const DECK_SORT_OPTIONS: ReadonlyArray<{ value: DeckSortAxis; label: string }> = [
  { value: 'cmc', label: 'Mana value' },
  { value: 'name', label: 'Name' },
  { value: 'quantity', label: 'Copies' },
  { value: 'price', label: 'Price' },
  { value: 'type', label: 'Type' },
];

const COLOUR_GROUP_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const COLOUR_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolour', 'Colourless'];
const CMC_ORDER = ['MV 0', 'MV 1', 'MV 2', 'MV 3', 'MV 4', 'MV 5', 'MV 6', 'MV 7+'];

export interface DeckCardGroup {
  key: string;
  label: string;
  /** Present only when the axis is card type, so the section can wear its colour. */
  category?: DeckCategory;
  rows: DeckCardRow[];
}

export function rowName(row: DeckCardRow): string {
  return row.card?.name || row.card_name;
}

function priceOf(row: DeckCardRow): number {
  const usd = parseFloat(row.card?.prices?.usd ?? '');
  return Number.isNaN(usd) ? 0 : usd;
}

function colourGroupOf(row: DeckCardRow): string {
  const identity = row.card?.color_identity?.length
    ? row.card.color_identity
    : row.card?.colors ?? [];
  if (identity.length === 0) return 'Colourless';
  if (identity.length > 1) return 'Multicolour';
  return COLOUR_GROUP_NAMES[identity[0]] ?? 'Colourless';
}

function cmcGroupOf(row: DeckCardRow): string {
  const cmc = Number.isFinite(row.card?.cmc) ? Number(row.card?.cmc) : 0;
  return cmc >= 7 ? 'MV 7+' : `MV ${Math.round(cmc)}`;
}

export function sortDeckRows(
  rows: DeckCardRow[],
  axis: DeckSortAxis,
  dir: SortDir
): DeckCardRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: DeckCardRow, b: DeckCardRow) => rowName(a).localeCompare(rowName(b));
  return [...rows].sort((a, b) => {
    switch (axis) {
      case 'name':
        return byName(a, b) * sign;
      case 'quantity':
        return (a.quantity - b.quantity) * sign || byName(a, b);
      case 'price':
        return (priceOf(a) - priceOf(b)) * sign || byName(a, b);
      case 'type':
        return (
          (a.card?.type_line || '').localeCompare(b.card?.type_line || '') * sign || byName(a, b)
        );
      case 'cmc':
      default:
        return ((a.card?.cmc ?? 0) - (b.card?.cmc ?? 0)) * sign || byName(a, b);
    }
  });
}

/**
 * Cut the rows into sections.
 *
 * `hideCommanders` exists because the commander is drawn whole and large above
 * the decklist, so a Commanders section underneath repeats it as a thumbnail
 * and pushes the actual deck down a row. Owner: "dont need to show the
 * commander row - start with creatures - we already show commander at the top".
 * Anywhere the block above is not drawn, the section comes back, because then
 * it is the only place the commander appears.
 */
export function groupDeckRows(
  rows: DeckCardRow[],
  axis: DeckGroupAxis,
  options: { hideCommanders?: boolean } = {}
): DeckCardGroup[] {
  const visible = options.hideCommanders ? rows.filter(r => !r.is_commander) : rows;

  if (axis === 'none') {
    return visible.length > 0 ? [{ key: 'all', label: 'All cards', rows: visible }] : [];
  }

  if (axis === 'type') {
    const buckets = new Map<DeckCategory, DeckCardRow[]>();
    for (const row of visible) {
      const category = categorizeCard(row.card?.type_line, {
        isCommander: row.is_commander,
        isSideboard: row.is_sideboard,
      });
      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category)!.push(row);
    }
    return CATEGORY_ORDER.filter(category => buckets.has(category))
      .map(category => ({
        key: category,
        label: CATEGORY_LABEL[category] ?? category,
        category,
        rows: buckets.get(category)!,
      }));
  }

  const keyOf = axis === 'color' ? colourGroupOf : cmcGroupOf;
  const order = axis === 'color' ? COLOUR_ORDER : CMC_ORDER;
  const buckets = new Map<string, DeckCardRow[]>();
  for (const row of visible) {
    const key = keyOf(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return order
    .filter(key => buckets.has(key))
    .map(key => ({ key, label: key, rows: buckets.get(key)! }));
}
