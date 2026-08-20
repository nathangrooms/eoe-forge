/**
 * Every number the analytics tab draws, worked out once, in one place.
 *
 * ## Why this is a plain module with no imports
 *
 * The tab used to derive its figures in four different components, and they
 * disagreed. Total value was computed in `AnalyticsHeader` (from the store's
 * `collectionTotals`), again in `PriceHistoryChart` (its own reduce over
 * `usd`/`usd_foil`), again in `CollectionValueTrends` (a third reduce), and
 * again in `CollectionAnalytics` (a fourth, using `parseFloat(x || '0')`). Four
 * reduces, four chances to drift, and the last one printed `$0.00` for cards
 * that only carry a foil price.
 *
 * So the arithmetic sits here, and the components draw. It imports nothing but
 * `priceable.ts`, which itself imports nothing, because the test runner is
 * `node --test --experimental-strip-types` and does not resolve the `@/` alias.
 *
 * ## The valuation rule
 *
 * `ownedValueUSD` — non-foil copies at `usd`, foil copies at `usd_foil` falling
 * back to `usd`. It is the only rule in the product and it is not restated here.
 * A stack that cannot be priced is COUNTED, not valued at zero: the smallest
 * price stored in `cards` is 0.01, so a rendered zero is always something we did
 * not know rather than something worth nothing.
 */

import { canPriceOwnedCopies, ownedValueUSD } from '../../../features/collection/priceable.ts';

/**
 * The shape the analytics reads. Deliberately structural and all-optional so a
 * `CollectionCard` satisfies it without a mapping step, and so a test can hand
 * in four fields instead of twenty.
 */
export interface OwnedRow {
  id?: string;
  card_name?: string;
  set_code?: string;
  quantity?: number;
  foil?: number;
  created_at?: string;
  card?: {
    id?: string;
    name?: string;
    set_code?: string;
    colors?: string[] | null;
    cmc?: number | null;
    type_line?: string | null;
    rarity?: string | null;
    prices?: unknown;
  } | null;
}

/** One bar. `copies` is what the bar length encodes; `value` rides the tooltip. */
export interface Slice {
  key: string;
  label: string;
  copies: number;
  value: number;
}

export interface ValuedRow {
  rowId: string;
  cardId: string;
  name: string;
  setCode: string;
  quantity: number;
  foil: number;
  /** Total worth of the copies owned. Always > 0; unpriceable rows never appear. */
  value: number;
  card: NonNullable<OwnedRow['card']>;
}

const copiesOf = (row: OwnedRow) => count(row.quantity) + count(row.foil);

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function held(rows: OwnedRow[]): OwnedRow[] {
  return rows.filter(row => row.card && copiesOf(row) > 0);
}

/* ------------------------------------------------------------------ *
 * Headline
 * ------------------------------------------------------------------ */

export interface CollectionSummary {
  /** Physical cards, counting duplicates. */
  copies: number;
  /** Rows, i.e. distinct printings held. */
  unique: number;
  /** Worth of every stack we could price. */
  value: number;
  /** Rows we hold no usable price for. Their worth is absent, not zero. */
  unpriced: number;
  /** Copies that are foil, and what they are worth. */
  foilCopies: number;
  foilValue: number;
  /** Mean mana value across spell copies. Lands are excluded, see below. */
  avgManaValue: number;
  /** Distinct sets represented. */
  sets: number;
}

export function collectionSummary(rows: OwnedRow[]): CollectionSummary {
  let copies = 0;
  let unique = 0;
  let value = 0;
  let unpriced = 0;
  let foilCopies = 0;
  let foilValue = 0;
  let manaTotal = 0;
  let manaCopies = 0;
  const sets = new Set<string>();

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);

    unique += 1;
    copies += qty + foil;
    sets.add(setCodeOf(row));

    if (canPriceOwnedCopies(card.prices, qty, foil)) {
      value += ownedValueUSD(card.prices, qty, foil);
    } else {
      unpriced += 1;
    }

    if (foil > 0) {
      foilCopies += foil;
      // The foil copies alone, priced as foils. Asking `ownedValueUSD` for
      // (0, foil) is the same rule applied to half the stack rather than a
      // second rule that could drift from the first.
      if (canPriceOwnedCopies(card.prices, 0, foil)) {
        foilValue += ownedValueUSD(card.prices, 0, foil);
      }
    }

    if (!isLand(card.type_line)) {
      const mv = manaValueOf(card.cmc);
      if (mv !== null) {
        manaTotal += mv * (qty + foil);
        manaCopies += qty + foil;
      }
    }
  }

  return {
    copies,
    unique,
    value: round2(value),
    unpriced,
    foilCopies,
    foilValue: round2(foilValue),
    avgManaValue: manaCopies > 0 ? Math.round((manaTotal / manaCopies) * 100) / 100 : 0,
    sets: sets.size,
  };
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
const COLOUR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colourless',
};

export interface ColourSpread {
  slices: Slice[];
  /** Copies printed in two or more colours. They appear in every bar they are. */
  multicolourCopies: number;
  /** Copies counted at all, so a reader can see the bars over-add and by how much. */
  totalCopies: number;
}

/**
 * One bar per colour, in WUBRG order, plus colourless.
 *
 * A two-colour card is counted in BOTH its colours, which is what a Magic player
 * means by a colour spread and is why the bars add up to more than the
 * collection. That is stated in the caption rather than hidden by inventing a
 * "Multicolour" bucket: a Golgari card is a black card and it is a green card,
 * and folding it into a seventh category answers neither "how much black do I
 * own" nor "how much green".
 *
 * `colors` is the printed colour, not colour identity. A Commander player cares
 * about identity for deck legality, but this is a shelf of cards, and what is
 * printed in the corner is what is on the shelf.
 */
export function colourSpread(rows: OwnedRow[]): ColourSpread {
  const copies: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const value: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  let multicolourCopies = 0;
  let totalCopies = 0;

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);
    const n = qty + foil;
    const worth = canPriceOwnedCopies(card.prices, qty, foil)
      ? ownedValueUSD(card.prices, qty, foil)
      : 0;

    const colours = normaliseColours(card.colors);
    totalCopies += n;

    if (colours.length === 0) {
      copies.C += n;
      value.C += worth;
      continue;
    }
    if (colours.length > 1) multicolourCopies += n;
    for (const colour of colours) {
      copies[colour] += n;
      value[colour] += worth;
    }
  }

  const slices = [...COLOUR_ORDER, 'C'].map(key => ({
    key,
    label: COLOUR_NAMES[key],
    copies: copies[key],
    value: round2(value[key]),
  }));

  return { slices, multicolourCopies, totalCopies };
}

function normaliseColours(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const letter = String(entry).toUpperCase();
    if (COLOUR_ORDER.includes(letter as (typeof COLOUR_ORDER)[number])) seen.add(letter);
  }
  return [...seen];
}

/* ------------------------------------------------------------------ *
 * Mana value
 * ------------------------------------------------------------------ */

/** Buckets 0 to 6, then everything from 7 up in one. */
export const MANA_VALUE_CAP = 7;

/**
 * Spells only.
 *
 * Every land ever printed has a mana value of zero, so leaving them in makes the
 * 0 column a land counter and flattens every other column beside it. The caption
 * says lands are out and gives their count, so nothing goes missing quietly.
 */
export function manaValueSpread(rows: OwnedRow[]): { slices: Slice[]; landCopies: number } {
  const copies = new Array(MANA_VALUE_CAP + 1).fill(0);
  const value = new Array(MANA_VALUE_CAP + 1).fill(0);
  let landCopies = 0;

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);
    const n = qty + foil;

    if (isLand(card.type_line)) {
      landCopies += n;
      continue;
    }
    const mv = manaValueOf(card.cmc);
    if (mv === null) continue;

    const bucket = Math.min(Math.floor(mv), MANA_VALUE_CAP);
    copies[bucket] += n;
    value[bucket] += canPriceOwnedCopies(card.prices, qty, foil)
      ? ownedValueUSD(card.prices, qty, foil)
      : 0;
  }

  const slices = copies.map((n, i) => ({
    key: String(i),
    label: i === MANA_VALUE_CAP ? `${MANA_VALUE_CAP}+` : String(i),
    copies: n,
    value: round2(value[i]),
  }));

  return { slices, landCopies };
}

function manaValueOf(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isLand(typeLine: unknown): boolean {
  return String(typeLine ?? '').toLowerCase().includes('land');
}

/* ------------------------------------------------------------------ *
 * Rarity
 * ------------------------------------------------------------------ */

/** Least to most scarce. The chart's colour ramp steps in this order. */
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'] as const;

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic',
  special: 'Special',
  bonus: 'Bonus',
};

/** Only the rarities actually held get a bar. An empty bar states nothing. */
export function raritySpread(rows: OwnedRow[]): Slice[] {
  const copies: Record<string, number> = {};
  const value: Record<string, number> = {};

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);
    const key = String(card.rarity ?? '').toLowerCase();
    if (!RARITY_ORDER.includes(key as (typeof RARITY_ORDER)[number])) continue;

    copies[key] = (copies[key] || 0) + qty + foil;
    value[key] =
      (value[key] || 0) +
      (canPriceOwnedCopies(card.prices, qty, foil) ? ownedValueUSD(card.prices, qty, foil) : 0);
  }

  return RARITY_ORDER.filter(key => copies[key] > 0).map(key => ({
    key,
    label: RARITY_LABELS[key],
    copies: copies[key],
    value: round2(value[key]),
  }));
}

/* ------------------------------------------------------------------ *
 * Sets
 * ------------------------------------------------------------------ */

/**
 * The biggest sets by copies held, with the tail folded into one bar.
 *
 * A collection spans dozens of sets and a bar each is a wall of three-letter
 * codes nobody reads. The tail is named "Other sets" with its own count, so the
 * chart still adds up to the whole collection.
 */
export function setSpread(rows: OwnedRow[], limit = 8): Slice[] {
  const copies: Record<string, number> = {};
  const value: Record<string, number> = {};

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);
    const key = setCodeOf(row);

    copies[key] = (copies[key] || 0) + qty + foil;
    value[key] =
      (value[key] || 0) +
      (canPriceOwnedCopies(card.prices, qty, foil) ? ownedValueUSD(card.prices, qty, foil) : 0);
  }

  const ranked = Object.keys(copies).sort((a, b) => {
    const byCopies = copies[b] - copies[a];
    return byCopies !== 0 ? byCopies : a.localeCompare(b);
  });

  const head = ranked.slice(0, limit).map(key => ({
    key,
    label: key.toUpperCase(),
    copies: copies[key],
    value: round2(value[key]),
  }));

  const tail = ranked.slice(limit);
  if (tail.length > 0) {
    head.push({
      key: '__other',
      label: `${tail.length} more`,
      copies: tail.reduce((sum, key) => sum + copies[key], 0),
      value: round2(tail.reduce((sum, key) => sum + value[key], 0)),
    });
  }

  return head;
}

function setCodeOf(row: OwnedRow): string {
  const raw = row.card?.set_code ?? row.set_code ?? '';
  return String(raw).toLowerCase() || 'unknown';
}

/* ------------------------------------------------------------------ *
 * Most valuable
 * ------------------------------------------------------------------ */

/**
 * The rail's cards, most valuable first.
 *
 * A row we cannot price is left OUT rather than ranked at the bottom with
 * `$0.00` beside it. The old list did the latter and put a card with a $1.42
 * foil price on screen labelled as worth nothing.
 */
export function mostValuable(rows: OwnedRow[], limit = 20): ValuedRow[] {
  const valued: ValuedRow[] = [];

  for (const row of held(rows)) {
    const card = row.card!;
    const qty = count(row.quantity);
    const foil = count(row.foil);
    if (!canPriceOwnedCopies(card.prices, qty, foil)) continue;

    const value = ownedValueUSD(card.prices, qty, foil);
    if (!(value > 0)) continue;

    valued.push({
      rowId: String(row.id ?? card.id ?? row.card_name ?? ''),
      cardId: String(card.id ?? ''),
      name: String(card.name ?? row.card_name ?? ''),
      setCode: setCodeOf(row).toUpperCase(),
      quantity: qty,
      foil,
      value: round2(value),
      card,
    });
  }

  return valued
    .sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Newest rows first, for the rail of what just arrived. */
export function recentlyAdded(rows: OwnedRow[], limit = 20): OwnedRow[] {
  return held(rows)
    .filter(row => Boolean(row.created_at))
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))
    .slice(0, limit);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
