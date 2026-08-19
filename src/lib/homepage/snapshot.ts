/**
 * The homepage's data, read from a file instead of the database.
 *
 * ## Why
 *
 * Fifteen sections of the homepage used to query Supabase from the browser: 27
 * queries before a visitor scrolled at all, 48 by the bottom of the page, on
 * every single anonymous visit, for rows that are identical for everybody and
 * change once a night. `scripts/homepage-snapshot.mjs` runs those queries once
 * after the nightly card sync and writes `src/data/homepage-snapshot.json`.
 * This module is how the page reads it.
 *
 * ## Two things it guarantees
 *
 * **Never zero.** Every accessor returns `null` when the thing it is asked for
 * is not in the file, exactly as a failed query used to. The components already
 * know how to draw a null: a dash, a fallback phrase, an empty row. What they
 * must never be handed is a zero, because `total.count ?? 0` on a count that
 * had timed out is precisely how this page came to tell visitors there were
 * ZERO cards you can search.
 *
 * **Never falsely precise.** A number in this file was true at
 * `generatedAt` and the catalogue has grown since. See {@link approx}.
 */

import snapshotJson from '@/data/homepage-snapshot.json';
import { approx, approxLabel } from './precision';

/* Re-exported so every consumer has one import. The two functions live in their
   own module because this one imports the data file through the `@/` alias, and
   the test runner does not resolve aliases. `precision.test.ts` covers them. */
export { approx, approxLabel };

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** A `cards` row as this file stores it: nulls dropped, image and price keys trimmed. */
export interface SnapshotCard {
  id: string;
  name: string;
  type_line?: string;
  mana_cost?: string | null;
  cmc?: number;
  rarity?: string;
  set_code?: string;
  collector_number?: string;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  layout?: string;
  faces?: unknown;
  image_uris?: Record<string, string>;
  prices?: { usd?: string };
}

export interface SnapshotCounts {
  /** One row per card, from `cards_unique`. */
  cards: number | null;
  /** Every printing, from `cards`. Null when the generator ran without the service role. */
  printings: number | null;
  legendaryCreatures: number | null;
  mythics: number | null;
  formatLegal: Record<string, number>;
  colorIdentity: Record<string, number>;
}

export interface SetTile {
  code: string;
  name: string;
  released: string;
  count: number;
  art: string | null;
  headline: string | null;
}

export interface FormatSlot {
  role: string;
  card: SnapshotCard;
}

export interface TrackedCard {
  card: SnapshotCard;
  series: number[];
  first: number;
  last: number;
  low: number;
  high: number;
  change: number;
}

export interface PriceTracking {
  cards: TrackedCard[];
  from: string;
  to: string;
  snapshots: number;
}

export interface TutorEntry {
  card_name: string;
  quantity: number;
  scryfall_id?: string;
  is_commander?: boolean;
  typeLine: string;
  mv: number;
  manaCost: string | null;
  [key: string]: unknown;
}

interface Snapshot {
  version: number;
  generatedAt: string;
  cardsSyncedAt: string | null;
  counts: SnapshotCounts;
  sections: {
    hero: SnapshotCard[];
    showcase: SnapshotCard[];
    appVisual: SnapshotCard[];
    storage: { filed: SnapshotCard[]; palette: SnapshotCard[] };
    scanner: SnapshotCard | null;
    precons: Record<string, SnapshotCard>;
    newSets: { tiles: SetTile[]; commanders: SnapshotCard[] };
    formatPicker: Record<string, FormatSlot[]>;
    portability: Record<string, SnapshotCard>;
    playTable: Record<string, SnapshotCard>;
    power: Record<string, SnapshotCard>;
    tournaments: Record<string, SnapshotCard>;
    priceTracking: PriceTracking | null;
    tutor: TutorEntry[] | null;
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The file, or null.
 *
 * A missing file is a build error rather than a runtime one — the import above
 * would not resolve — so in practice this only ever guards against a file that
 * parsed but is not the shape this module expects. When that happens every
 * accessor below returns null and each section draws the same thing it drew for
 * a failed query. That is the honest outcome and it is deliberately the same
 * one, so there is no second, less-tested failure path to get wrong.
 */
const snapshot: Snapshot | null = (() => {
  const raw = snapshotJson as unknown as Snapshot;
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.generatedAt !== 'string' || !raw.sections || !raw.counts) return null;
  return raw;
})();

/** When the queries behind this data were run. */
export const generatedAt: Date | null = (() => {
  const at = snapshot ? Date.parse(snapshot.generatedAt) : NaN;
  return Number.isFinite(at) ? new Date(at) : null;
})();

/** When the card sync that produced these rows last finished. */
export const cardsSyncedAt: Date | null = (() => {
  const at = snapshot?.cardsSyncedAt ? Date.parse(snapshot.cardsSyncedAt) : NaN;
  return Number.isFinite(at) ? new Date(at) : null;
})();

/* -------------------------------------------------------------------------- */
/* Counts                                                                     */
/* -------------------------------------------------------------------------- */

/** Null, never zero. A count that is not in the file is a count we do not have. */
function positive(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export const counts = {
  /** Distinct cards, from `cards_unique`. The figure to use under the word "cards". */
  cards: () => positive(snapshot?.counts.cards),
  /** Every printing, from `cards`. Only for a label that says "printings". */
  printings: () => positive(snapshot?.counts.printings),
  legendaryCreatures: () => positive(snapshot?.counts.legendaryCreatures),
  mythics: () => positive(snapshot?.counts.mythics),
  formatLegal: (format: string) => positive(snapshot?.counts.formatLegal?.[format]),
  colorIdentity: (color: string) => positive(snapshot?.counts.colorIdentity?.[color]),
};

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A list of rows, or null.
 *
 * Null and empty mean different things and the components rely on the
 * difference: null is "we have no data", which draws the loading or fallback
 * rendering, and an empty array is "we have data and there is nothing in it".
 * The generator refuses to write an empty required section, so in practice an
 * empty array here means the file is not the one the generator wrote.
 */
function list<T>(rows: T[] | undefined | null): T[] | null {
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

function map<T>(rows: Record<string, T> | undefined | null): Record<string, T> | null {
  return rows && typeof rows === 'object' && Object.keys(rows).length > 0 ? rows : null;
}

const s = snapshot?.sections;

/** HomeHero: the seven cards in the fan, in fan order. */
export const heroCards = () => list(s?.hero);

/** HomeShowcase: the twelve cards in the marquee, most valuable first. */
export const showcaseCards = () => list(s?.showcase);

/** HomeAppVisual: the deck the mock builder is holding. */
export const appVisualCards = () => list(s?.appVisual);

/** HomeStorage: the commanders on the shelf, and the pool the colour boxes draw from. */
export const storageFiled = () => list(s?.storage?.filed);
export const storagePalette = () => list(s?.storage?.palette);

/** HomeScanner: the card held up to the camera. */
export const scannerCard = (): SnapshotCard | null => s?.scanner ?? null;

/** HomePrecons: commander rows keyed by the printing id the precon index stores. */
export const preconCommanders = () => map(s?.precons);

/** HomeNewSets. */
export const newSetTiles = () => list(s?.newSets?.tiles);
export const newSetCommanders = () => list(s?.newSets?.commanders);

/** HomeFormatPicker: role-ordered slots for one format. */
export const formatSlots = (format: string) => list(s?.formatPicker?.[format]);

/** HomePortability: the pasted list resolved, keyed by lower-cased card name. */
export const portabilityCards = () => map(s?.portability);

/** HomePlayTable and HomePower: keyed by lower-cased card name. */
export const playTableCards = () => map(s?.playTable);
export const powerCards = () => map(s?.power);

/** HomeTournaments: keyed by the commander's printing id. */
export const tournamentCards = () => map(s?.tournaments);

/** HomeMarketplace: the price-tracked cards and their real history. */
export const priceTracking = (): PriceTracking | null => s?.priceTracking ?? null;

/** HomeTutor: a real precon, every card resolved. Null when it could not be. */
export const tutorDeck = (): TutorEntry[] | null => list(s?.tutor);
