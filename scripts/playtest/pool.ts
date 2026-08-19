/**
 * DeckMatrix playtest harness — the local card snapshot.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * The harness plays hundreds of games. Every one of them needs a hundred cards
 * per seat, and the owner has had two outages and a disk IO warning caused by
 * agents querying Supabase in a loop. So the harness never touches the database
 * and never touches the network. It reads one file off disk.
 *
 * The file is the Scryfall bulk oracle export a parallel workflow already
 * downloads to `scratch/scryfall/oracle-cards.jsonl` (202 MB, one JSON object
 * per line). Parsing that per run costs about fifteen seconds, so this module
 * does it once and writes a slim pool to `scratch/playtest/pool.json` holding
 * only the ten fields a `PlayCard` needs. Loading the slim pool is under a
 * second, which is what makes hundreds of games practical.
 *
 * WHAT "PRODUCES" MEANS FOR A LAND, AND WHY IT IS COPIED HERE
 * -----------------------------------------------------------
 * `src/lib/game/mana.ts` reads a land's `colorIdentity` as the colours it taps
 * for, and `src/lib/play/deckSource.ts` therefore rewrites that field from the
 * card's own oracle text before handing it to the engine — Command Tower, every
 * fetch, every filter land and half a real mana base carry an EMPTY printed
 * colour identity, because colour identity is a deck-legality concept and not a
 * mana one. The harness has to make the same rewrite or its decks would be
 * unplayable for a reason that has nothing to do with the engine, and every
 * game would report a false finding.
 *
 * This is a deliberate second copy of that rule, not an import: `deckSource.ts`
 * takes a Supabase `CardRow` and this takes a Scryfall row, and that tree is
 * owned by another workflow right now. The rule is restated in `landProduces`
 * below with the same approximation (a conditional source counts as though its
 * condition is met) so the two cannot be read as disagreeing.
 *
 * No LLM, no network, no clock, no `Math.random`. Deterministic input to a
 * deterministic program.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCRYFALL_JSONL = path.join(HARNESS_ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
export const POOL_DIR = path.join(HARNESS_ROOT, 'scratch', 'playtest');
export const POOL_FILE = path.join(POOL_DIR, 'pool.json');

/** Bump when the shape or the filters change, so a stale pool is rebuilt rather than trusted. */
export const POOL_VERSION = 3;

export type PoolColor = 'W' | 'U' | 'B' | 'R' | 'G';

/** One card, flattened to exactly what `setup.PlayCard` wants. */
export interface PoolCard {
  id: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  /** Every face's text, newline joined. `effects.ts` detects nothing without it. */
  oracleText: string;
  power?: string;
  toughness?: string;
  /** As printed. Lands are corrected at deck-build time, see `landProduces`. */
  colorIdentity: PoolColor[];
  keywords: string[];
  /** Cheap flags so the deck builder does not re-parse the type line per game. */
  isLand: boolean;
  isCreature: boolean;
  isLegendaryCreature: boolean;
  isBasic: boolean;
  /** Colours this card's own text says it taps for. Empty means "none stated". */
  produces: PoolColor[];
}

export interface CardPool {
  version: number;
  builtFrom: { file: string; bytes: number; mtimeMs: number; lines: number };
  cards: PoolCard[];
}

const COLORS: readonly PoolColor[] = ['W', 'U', 'B', 'R', 'G'];

export const BASIC_FOR_COLOR: Record<PoolColor, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/* -------------------------------------------------------------------------- */
/* Reading a Scryfall row                                                     */
/* -------------------------------------------------------------------------- */

/** Layouts that are not a card you can put in a deck. */
const EXCLUDED_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
  'scheme',
  'planar',
  'vanguard',
  'augment',
  'host',
  'reversible_card',
]);

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function faces(row: Row): Row[] {
  const list = row.card_faces;
  return Array.isArray(list) ? (list as Row[]) : [];
}

/**
 * Oracle text with every face folded in.
 *
 * Always a string. Empty means "loaded, and this card has no text"; the engine
 * treats empty and absent very differently, and the harness's primary signal is
 * about cards whose text says something, so getting this wrong would poison the
 * whole measurement.
 */
function oracleFor(row: Row): string {
  const parts: string[] = [];
  const top = str(row.oracle_text);
  if (top) parts.push(top);
  for (const face of faces(row)) {
    const text = str(face.oracle_text);
    if (text && text !== top) parts.push(text);
  }
  return parts.join('\n');
}

function manaCostFor(row: Row): string {
  const top = str(row.mana_cost);
  if (top) return top;
  const front = faces(row)[0];
  return front ? str(front.mana_cost) : '';
}

function powerFor(row: Row): string | undefined {
  const top = str(row.power);
  if (top) return top;
  const front = faces(row)[0];
  const value = front ? str(front.power) : '';
  return value || undefined;
}

function toughnessFor(row: Row): string | undefined {
  const top = str(row.toughness);
  if (top) return top;
  const front = faces(row)[0];
  const value = front ? str(front.toughness) : '';
  return value || undefined;
}

function identityOf(row: Row): PoolColor[] {
  const list = Array.isArray(row.color_identity) ? (row.color_identity as unknown[]) : [];
  return COLORS.filter(color => list.indexOf(color) !== -1);
}

/**
 * What a permanent's own text says it adds, or null when it says nothing about
 * mana at all.
 *
 * Same rule as `src/lib/play/deckSource.ts`: each "Add …" clause is read up to
 * the punctuation that ends it, so "Add a lore counter" cannot bleed into
 * "Add {G}". "Any colour" means all five. `{C}` is mana but is not a colour, so
 * it deliberately produces an empty coloured list — a source that makes only
 * `{C}` pays generic costs and nothing else, which is correct.
 */
export function producedFromOracle(oracle: string, deckColors: readonly PoolColor[] = []): PoolColor[] | null {
  if (!oracle) return null;

  const produced = new Set<PoolColor>();
  let sawMana = false;

  for (const match of oracle.matchAll(/\badds?\b([^.;\n]*)/gi)) {
    const clause = match[1] ?? '';

    if (/any\s+(?:one\s+)?colou?r|any\s+type|any\s+combination\s+of\s+colou?rs/i.test(clause)) {
      sawMana = true;
      const scoped = /commander(?:'|’)s\s+colou?r\s+identity/i.test(clause);
      for (const color of scoped && deckColors.length > 0 ? deckColors : COLORS) produced.add(color);
      continue;
    }

    for (const symbol of clause.matchAll(/\{([WUBRGC])\}/g)) {
      sawMana = true;
      const code = symbol[1];
      if (code !== 'C') produced.add(code as PoolColor);
    }
  }

  if (!sawMana) return null;
  return COLORS.filter(color => produced.has(color));
}

/**
 * The colour identity the play engine should see for this card.
 *
 * Only non-creature lands and artifacts are re-read from oracle text. A
 * creature keeps its printed identity — a mana dork's identity is normally the
 * colour it taps for anyway, and widening a commander to five colours because
 * its text contains the word "add" would break deck legality everywhere.
 */
export function playIdentityOf(card: PoolCard, deckColors: readonly PoolColor[] = []): PoolColor[] {
  const line = card.typeLine.toLowerCase();
  if (!line.includes('land') && !line.includes('artifact')) return card.colorIdentity;
  if (line.includes('creature')) return card.colorIdentity;
  const produced = producedFromOracle(card.oracleText, deckColors);
  if (produced === null) return card.colorIdentity;
  return produced;
}

/** Convenience name for the same rewrite, used by the deck builder on lands. */
export const landProduces = playIdentityOf;

function keep(row: Row): boolean {
  if (row.object !== 'card') return false;
  if (str(row.lang) !== 'en') return false;
  if (EXCLUDED_LAYOUTS.has(str(row.layout))) return false;
  if (row.digital === true) return false;
  if (str(row.set_type) === 'funny') return false;
  if (str(row.border_color) === 'silver') return false;

  const legalities = row.legalities as Record<string, string> | undefined;
  if (!legalities || legalities.commander !== 'legal') return false;

  const line = str(row.type_line);
  if (!line) return false;
  // A "Card" with no real type, and the conspiracy/dungeon side objects.
  if (/\b(Conspiracy|Dungeon|Plane|Phenomenon|Stickers|Attraction)\b/.test(line)) return false;

  const games = Array.isArray(row.games) ? (row.games as string[]) : [];
  if (games.length > 0 && games.indexOf('paper') === -1) return false;

  return true;
}

function toPoolCard(row: Row): PoolCard {
  const typeLine = str(row.type_line);
  const lower = typeLine.toLowerCase();
  const oracleText = oracleFor(row);
  const keywords = Array.isArray(row.keywords)
    ? (row.keywords as string[]).map(k => k.toLowerCase())
    : [];

  const card: PoolCard = {
    id: str(row.id),
    name: str(row.name),
    manaCost: manaCostFor(row),
    cmc: typeof row.cmc === 'number' ? row.cmc : 0,
    typeLine,
    oracleText,
    power: powerFor(row),
    toughness: toughnessFor(row),
    colorIdentity: identityOf(row),
    keywords,
    isLand: lower.includes('land'),
    isCreature: lower.includes('creature'),
    isLegendaryCreature: lower.includes('legendary') && lower.includes('creature'),
    isBasic: lower.includes('basic') && lower.includes('land'),
    produces: [],
  };

  card.produces = playIdentityOf(card);
  return card;
}

/* -------------------------------------------------------------------------- */
/* Building and loading                                                       */
/* -------------------------------------------------------------------------- */

export interface BuildPoolOptions {
  source?: string;
  out?: string;
  onProgress?: (lines: number, kept: number) => void;
}

/** Read the bulk export once and write the slim pool. Streamed: 202 MB never lands in memory. */
export async function buildPool(options: BuildPoolOptions = {}): Promise<CardPool> {
  const source = options.source ?? SCRYFALL_JSONL;
  const out = options.out ?? POOL_FILE;

  if (!fs.existsSync(source)) {
    throw new Error(
      `No card snapshot at ${source}. The harness never queries Supabase, so it needs the ` +
        `Scryfall bulk oracle export on disk. Download "Oracle Cards" from ` +
        `https://scryfall.com/docs/api/bulk-data and save it there as one JSON object per line.`
    );
  }

  const stat = fs.statSync(source);
  const cards: PoolCard[] = [];
  const seenNames = new Set<string>();
  let lines = 0;

  const stream = readline.createInterface({
    input: fs.createReadStream(source, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of stream) {
    const line = raw.trim().replace(/,$/, '');
    if (!line || line === '[' || line === ']') continue;
    lines += 1;

    let row: Row;
    try {
      row = JSON.parse(line) as Row;
    } catch {
      continue; // A truncated last line while a parallel download finishes.
    }

    if (!keep(row)) continue;
    const card = toPoolCard(row);
    if (!card.id || !card.name) continue;
    // Oracle export is one row per card, but a partner download can double up.
    if (seenNames.has(card.name)) continue;
    seenNames.add(card.name);
    cards.push(card);

    if (options.onProgress && lines % 5000 === 0) options.onProgress(lines, cards.length);
  }

  // Sorted by name so the file is stable and a diff between two builds is readable.
  cards.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));

  const pool: CardPool = {
    version: POOL_VERSION,
    builtFrom: { file: path.relative(HARNESS_ROOT, source), bytes: stat.size, mtimeMs: stat.mtimeMs, lines },
    cards,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pool));
  return pool;
}

let cached: CardPool | null = null;

/** The slim pool, built on first use and then reused for the whole process. */
export async function loadPool(options: { rebuild?: boolean; out?: string } = {}): Promise<CardPool> {
  const out = options.out ?? POOL_FILE;
  if (cached && !options.rebuild) return cached;

  if (!options.rebuild && fs.existsSync(out)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(out, 'utf8')) as CardPool;
      if (parsed.version === POOL_VERSION && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
        cached = parsed;
        return parsed;
      }
    } catch {
      // Fall through and rebuild rather than run on a half-written file.
    }
  }

  cached = await buildPool({ out });
  return cached;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const started = Date.now();
  const pool = await buildPool({
    onProgress: (lines, kept) => {
      process.stdout.write(`\r  read ${lines.toLocaleString()} rows, kept ${kept.toLocaleString()}   `);
    },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const lands = pool.cards.filter(c => c.isLand).length;
  const legends = pool.cards.filter(c => c.isLegendaryCreature).length;
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  console.log(`Pool built in ${seconds}s from ${pool.builtFrom.lines.toLocaleString()} rows.`);
  console.log(`  ${pool.cards.length.toLocaleString()} commander-legal cards`);
  console.log(`  ${legends.toLocaleString()} legendary creatures, ${lands.toLocaleString()} lands`);
  console.log(`  written to ${path.relative(HARNESS_ROOT, POOL_FILE)}`);
}
