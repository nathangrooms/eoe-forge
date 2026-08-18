/**
 * DeckMatrix — where a playtest table gets its cards.
 *
 * `src/lib/game` is pure and knows nothing about Supabase. This file is the
 * boundary: it reads `user_decks` / `deck_cards` / `cards` and hands back the
 * flat `PlayDeck` shape the game core understands.
 *
 * Three sources, in order of preference:
 *
 *   1. a deck the user actually owns;
 *   2. a seeded deck built live from commander-legal cards, so the mode is
 *      demonstrable for an account with no decks — and so the bot always has
 *      something coherent to play;
 *   3. a small static list, used only when Supabase itself is unreachable.
 *      This project's Supabase has auto-paused before and taken every data call
 *      with it; a play surface that shows an error screen in that state is a
 *      play surface nobody can demo.
 *
 * Seeded decks are deterministic for a given seed — same seed, same 60 cards —
 * because the game core's shuffle is seeded too, and a playtest you cannot
 * reproduce is a playtest you cannot debug.
 *
 * ---------------------------------------------------------------------------
 * Why the seeded queries look the way they do
 * ---------------------------------------------------------------------------
 * Seeding a four-player pod used to fail about three times in four: Supabase
 * answered 500 and every seat fell back to the offline demo list. The cause was
 * a `statement_timeout` (SQLSTATE 57014 — `anon` gets 3s, `authenticated` 8s)
 * on the card-pool query, and the culprit was one clause:
 *
 *     .order('name')
 *
 * `cards_legal_commander_idx` is a partial index covering essentially the whole
 * table (33,373 of 34,088 rows), so ORDER BY forces Postgres to walk every one
 * of those rows through an unindexable `type_line NOT ILIKE '%Land%'`, an array
 * `<@` and a jsonb deref before it can sort and take 400. Measured on this
 * project's database:
 *
 *     with ORDER BY name    1155 ms, 8150 shared buffers
 *     without               2.5 ms,   299 shared buffers
 *
 * Four seats × three queries put a dozen of those in flight at once and the
 * slow ones tipped over the timeout. So the ordering moved into JavaScript,
 * where sorting 400 rows is free and determinism is preserved, and:
 *
 *   - pools are **cached per colour identity** for the life of the tab, so a
 *     four-seat pod issues a handful of queries rather than a dozen;
 *   - every read goes through `selectCardRows`, which **retries** a timeout or
 *     a dropped connection before giving up on the database;
 *   - the seeded queries ask for one column list *without* `faces`, because
 *     they already require a top-level `image_uris`, which makes the face
 *     fallback dead weight on every row.
 *
 * The one thing given up is that the *membership* of a pool now depends on the
 * scan order of a static card table rather than an explicit sort. The pick
 * within a pool is still fully seeded and reproducible.
 */

import { supabase } from '@/integrations/supabase/client';
import { shuffleWithRng } from '@/lib/game';
import type { Format, ManaColor, PlayCard, PlayDeck } from '@/lib/game';

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                */
/* -------------------------------------------------------------------------- */

interface CardRow {
  id: string;
  name: string;
  mana_cost?: string | null;
  cmc?: number | null;
  type_line?: string | null;
  power?: string | null;
  toughness?: string | null;
  color_identity?: string[] | null;
  keywords?: string[] | null;
  image_uris?: unknown;
  faces?: unknown;
  is_legendary?: boolean | null;
}

const CARD_COLUMNS =
  'id, name, mana_cost, cmc, type_line, power, toughness, color_identity, keywords, image_uris, faces, is_legendary';

/**
 * The seeded pools' column list.
 *
 * `faces` is the fallback the image reader uses for double-faced cards, whose
 * art hangs off the front face rather than the row. Every seeded query filters
 * on `image_uris is not null`, so no row it returns can ever reach that
 * fallback — and `faces` is the widest column on the table. Dropping it is a
 * straight cut to the bytes on the wire for no loss of card art.
 */
const SEED_CARD_COLUMNS =
  'id, name, mana_cost, cmc, type_line, power, toughness, color_identity, keywords, image_uris, is_legendary';

function readImage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const uris = value as Record<string, string | undefined>;
  return uris.normal ?? uris.large ?? uris.small ?? uris.png ?? undefined;
}

/** Double-faced cards carry no top-level `image_uris`; the front face has them. */
function imageFor(row: CardRow): string | undefined {
  const direct = readImage(row.image_uris);
  if (direct) return direct;
  if (Array.isArray(row.faces) && row.faces.length > 0) {
    const face = row.faces[0] as Record<string, unknown>;
    return readImage(face?.image_uris);
  }
  return undefined;
}

const MANA_COLORS: readonly string[] = ['W', 'U', 'B', 'R', 'G', 'C'];

function identityOf(row: CardRow): ManaColor[] {
  return (row.color_identity ?? []).filter((c): c is ManaColor => MANA_COLORS.includes(c));
}

export function toPlayCard(row: CardRow): PlayCard {
  return {
    cardId: row.id,
    name: row.name,
    manaCost: row.mana_cost ?? undefined,
    cmc: row.cmc ?? 0,
    typeLine: row.type_line ?? undefined,
    power: row.power ?? undefined,
    toughness: row.toughness ?? undefined,
    colorIdentity: identityOf(row),
    imageUrl: imageFor(row),
    keywords: (row.keywords ?? []).map(keyword => keyword.toLowerCase()),
  };
}

const GAME_FORMATS: readonly string[] = [
  'commander',
  'brawl',
  'oathbreaker',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'historic',
  'alchemy',
  'explorer',
  'penny',
  'limited',
  'custom',
];

/** `user_decks.format` is free text; the game core's `Format` is a union. */
export function toGameFormat(value: string | null | undefined): Format {
  const normalised = (value ?? '').toLowerCase().trim();
  if (GAME_FORMATS.indexOf(normalised) !== -1) return normalised as Format;
  if (normalised === 'edh' || normalised === 'commander/edh') return 'commander';
  return 'commander';
}

/* -------------------------------------------------------------------------- */
/* Talking to a database that sometimes says no                               */
/* -------------------------------------------------------------------------- */

/**
 * Failures that are worth asking again about.
 *
 *   57014  statement timeout — the one this file was losing pods to
 *   53300  too many connections
 *   57P01  the server told the backend to go away
 *   08003 / 08006  the connection went away on its own
 *   PGRST002  PostgREST could not reach the database yet (cold start)
 *
 * Anything else — a bad column, a policy refusal, a malformed filter — is a bug
 * in this file and retrying it just makes the same mistake three times.
 */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  '57014',
  '53300',
  '57P01',
  '08003',
  '08006',
  'PGRST002',
]);

const QUERY_ATTEMPTS = 3;
/** Backoff between attempts. Multiplied by the attempt number. */
const RETRY_BACKOFF_MS = 220;

interface QueryFailure {
  code?: string | null;
  message?: string | null;
}

function isTransient(error: unknown): boolean {
  if (!error) return false;
  // A network failure never reaches PostgREST at all, so it has no code.
  if (error instanceof TypeError) return true;
  const code = (error as QueryFailure).code;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  const message = (error as QueryFailure).message;
  return typeof message === 'string' && /timeout|timed out|fetch failed/i.test(message);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  const failure = error as QueryFailure | null;
  if (failure?.message) return failure.code ? `${failure.message} (${failure.code})` : failure.message;
  return 'Unknown database error.';
}

const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

/**
 * Run a card query, retrying the failures that are the database having a
 * moment rather than this file asking the wrong question.
 *
 * The builder is passed as a thunk on purpose: a PostgREST builder is a
 * one-shot thenable, so a retry has to construct a fresh one.
 */
async function selectCardRows(
  label: string,
  build: () => PromiseLike<{ data: unknown; error: unknown }>
): Promise<CardRow[]> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= QUERY_ATTEMPTS; attempt++) {
    if (attempt > 1) await wait(RETRY_BACKOFF_MS * (attempt - 1));

    try {
      const { data, error } = await build();
      if (!error) return (data ?? []) as CardRow[];
      lastError = error;
    } catch (thrown) {
      lastError = thrown;
    }

    if (!isTransient(lastError)) break;
    console.warn(`[play] ${label} attempt ${attempt}/${QUERY_ATTEMPTS} failed: ${describe(lastError)}`);
  }

  throw new Error(`${label} failed: ${describe(lastError)}`);
}

/**
 * Pools live as long as the tab does.
 *
 * A four-player pod builds four decks back to back and they overlap heavily —
 * the legend list is the same for every seat, and two bots on the same colours
 * want the same pool. Caching the in-flight promise (not just the result) also
 * collapses the burst: four seats asking at once make one request.
 *
 * A rejected load is evicted so a bad minute is not remembered forever.
 */
const poolCache = new Map<string, Promise<CardRow[]>>();

function cachedPool(key: string, load: () => Promise<CardRow[]>): Promise<CardRow[]> {
  const existing = poolCache.get(key);
  if (existing) return existing;

  const promise = load().catch(error => {
    poolCache.delete(key);
    throw error;
  });
  poolCache.set(key, promise);
  return promise;
}

/** Drop every cached pool. Exported for tests and for a manual "reshuffle". */
export function clearSeedPoolCache(): void {
  poolCache.clear();
}

/**
 * Client-side ordering, standing in for the `ORDER BY` that used to time the
 * pool queries out. Name first because that is what the old query sorted by;
 * `id` breaks ties so reprinted names cannot reorder between loads.
 */
function byName(a: CardRow, b: CardRow): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* The user's own decks                                                       */
/* -------------------------------------------------------------------------- */

export interface DeckSummary {
  id: string;
  name: string;
  format: Format;
  colors: string[];
  cardCount?: number;
}

export async function listPlayableDecks(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('user_decks')
    .select('id, name, format, colors')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(deck => ({
    id: deck.id,
    name: deck.name,
    format: toGameFormat(deck.format),
    colors: deck.colors ?? [],
  }));
}

/**
 * Expand a saved deck into individual physical cards. Quantity 4 becomes four
 * separate `PlayCard`s, because the game core tracks instances, not counts.
 */
export async function loadUserDeck(summary: DeckSummary): Promise<PlayDeck> {
  const { data: rows, error } = await supabase
    .from('deck_cards')
    .select('card_id, card_name, quantity, is_commander, is_sideboard')
    .eq('deck_id', summary.id);

  if (error) throw error;

  const entries = (rows ?? []).filter(row => !row.is_sideboard);
  if (entries.length === 0) {
    throw new Error(`"${summary.name}" has no cards in it yet.`);
  }

  const uniqueIds = Array.from(new Set(entries.map(entry => entry.card_id)));
  const { data: cardRows, error: cardsError } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .in('id', uniqueIds);

  if (cardsError) throw cardsError;

  const byId = new Map<string, PlayCard>();
  for (const row of (cardRows ?? []) as CardRow[]) byId.set(row.id, toPlayCard(row));

  const cards: PlayCard[] = [];
  const commanders: PlayCard[] = [];

  for (const entry of entries) {
    const card = byId.get(entry.card_id);
    if (!card) continue;
    if (entry.is_commander) {
      // A commander is one physical card regardless of a stray quantity.
      commanders.push(card);
      continue;
    }
    const copies = Math.max(1, entry.quantity ?? 1);
    for (let i = 0; i < copies; i++) cards.push(card);
  }

  if (cards.length === 0) {
    throw new Error(`"${summary.name}" has no playable cards — check the card database sync.`);
  }

  return {
    id: summary.id,
    name: summary.name,
    format: summary.format,
    cards,
    commanders,
    source: 'user-deck',
  };
}

/* -------------------------------------------------------------------------- */
/* Seeded decks                                                               */
/* -------------------------------------------------------------------------- */

const BASIC_FOR_COLOR: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export interface SeedDeckOptions {
  /** Same seed, same deck. Defaults to 1. */
  seed?: number;
  /** Total cards including lands. 60 keeps a demo game quick. */
  size?: number;
  /** Proportion of the deck that should be land. */
  landRatio?: number;
  name?: string;
}

function pick<T>(items: readonly T[], count: number, seed: number): T[] {
  return shuffleWithRng(items, { seed }).items.slice(0, count);
}

/** How many legendary creatures the commander is drawn from. */
const LEGEND_LIMIT = 300;
/** How many spells a colour identity's pool holds. 36 are needed; this is slack. */
const POOL_LIMIT = 480;

/**
 * Every commander-legal legendary creature with art, capped and cached.
 *
 * ~10 ms and 312 shared buffers without an `ORDER BY`; the same query sorted by
 * name reads 2,740 buffers to throw almost all of them away.
 */
function legendPool(): Promise<CardRow[]> {
  return cachedPool('legends', async () => {
    const rows = await selectCardRows('commander pool', () =>
      supabase
        .from('cards')
        .select(SEED_CARD_COLUMNS)
        .eq('is_legendary', true)
        .ilike('type_line', 'Legendary Creature%')
        .eq('legalities->>commander' as never, 'legal')
        .not('image_uris', 'is', null)
        .limit(LEGEND_LIMIT)
    );
    return rows.sort(byName);
  });
}

/**
 * Castable spells inside a colour identity, cached per identity.
 *
 * `containedBy` is the right predicate and is not the expensive part — it also
 * keeps the colourless artifacts every commander deck wants, which an
 * `overlaps` would have thrown away.
 */
function spellPool(identity: readonly ManaColor[]): Promise<CardRow[]> {
  const colors = [...identity].sort();
  return cachedPool(`spells:${colors.join('') || 'C'}`, async () => {
    const rows = await selectCardRows('spell pool', () =>
      supabase
        .from('cards')
        .select(SEED_CARD_COLUMNS)
        .eq('legalities->>commander' as never, 'legal')
        .containedBy('color_identity', colors)
        .not('type_line', 'ilike', '%Land%')
        .gte('cmc', 1)
        .lte('cmc', 5)
        .not('image_uris', 'is', null)
        .limit(POOL_LIMIT)
    );
    return rows.sort(byName);
  });
}

/** Every basic land, once, for the whole table. Sixteen rows, one query, cached. */
function basicPool(): Promise<CardRow[]> {
  const names = [...Object.values(BASIC_FOR_COLOR), 'Wastes'];
  return cachedPool('basics', async () => {
    const rows = await selectCardRows('basic lands', () =>
      supabase
        .from('cards')
        .select(SEED_CARD_COLUMNS)
        .in('name', names)
        .not('image_uris', 'is', null)
        .limit(120)
    );
    return rows.sort(byName);
  });
}

/**
 * Build a coherent commander-legal deck from the card database: pick a
 * legendary creature, then fill the list with cards inside its colour identity
 * and the basics to cast them.
 */
export async function buildSeedDeck(options: SeedDeckOptions = {}): Promise<PlayDeck> {
  const seed = options.seed ?? 1;
  const size = options.size ?? 60;
  const landCount = Math.round(size * (options.landRatio ?? 0.4));
  const spellCount = size - landCount;

  const legendRows = await legendPool();
  if (legendRows.length === 0) {
    throw new Error('No commander-legal legendary creatures found in the card database.');
  }

  const commanderRow = pick(legendRows, 1, seed)[0];
  const commander = toPlayCard(commanderRow);
  const identity = commander.colorIdentity ?? [];

  // The basics are wanted whatever the pool says, so both go out together.
  const [pool, basics] = await Promise.all([spellPool(identity), basicPool()]);

  const poolRows = pool.filter(row => row.id !== commanderRow.id);
  if (poolRows.length === 0) {
    throw new Error('No cards matched that commander’s colour identity.');
  }

  // Weight the curve towards creatures so the bot has a board to attack with.
  const creatures = poolRows.filter(row => (row.type_line ?? '').includes('Creature'));
  const others = poolRows.filter(row => !(row.type_line ?? '').includes('Creature'));

  const creatureTarget = Math.round(spellCount * 0.65);
  const chosenCreatures = pick(creatures.length > 0 ? creatures : poolRows, creatureTarget, seed + 1);
  const chosenOthers = pick(
    others.length > 0 ? others : poolRows,
    spellCount - chosenCreatures.length,
    seed + 2
  );

  const basicNames = new Set(
    identity.length > 0
      ? identity.map(color => BASIC_FOR_COLOR[color]).filter(Boolean)
      : ['Wastes']
  );

  // One printing per basic land name, so the deck does not become a set showcase.
  const basicByName = new Map<string, PlayCard>();
  for (const row of basics) {
    if (!basicNames.has(row.name)) continue;
    if (!basicByName.has(row.name)) basicByName.set(row.name, toPlayCard(row));
  }
  const basicList = Array.from(basicByName.values());

  const lands: PlayCard[] = [];
  if (basicList.length > 0) {
    for (let i = 0; i < landCount; i++) lands.push(basicList[i % basicList.length]);
  }

  const cards = [
    ...chosenCreatures.map(toPlayCard),
    ...chosenOthers.map(toPlayCard),
    ...lands,
  ];

  return {
    id: `seed-${seed}`,
    name: options.name ?? `${commander.name} (seeded)`,
    format: 'commander',
    cards,
    commanders: [commander],
    source: 'seeded',
  };
}

/* -------------------------------------------------------------------------- */
/* Offline fallback                                                           */
/* -------------------------------------------------------------------------- */

const FALLBACK_SPELLS: Array<Omit<PlayCard, 'cardId'> & { copies: number }> = [
  { name: 'Llanowar Elves', manaCost: '{G}', cmc: 1, typeLine: 'Creature — Elf Druid', power: '1', toughness: '1', colorIdentity: ['G'], copies: 4 },
  { name: 'Grizzly Bears', manaCost: '{1}{G}', cmc: 2, typeLine: 'Creature — Bear', power: '2', toughness: '2', colorIdentity: ['G'], copies: 4 },
  { name: 'Wall of Roots', manaCost: '{1}{G}', cmc: 2, typeLine: 'Creature — Plant Wall', power: '0', toughness: '5', colorIdentity: ['G'], keywords: ['defender'], copies: 3 },
  { name: 'Scaled Behemoth', manaCost: '{5}{G}', cmc: 6, typeLine: 'Creature — Serpent', power: '6', toughness: '6', colorIdentity: ['G'], keywords: ['hexproof'], copies: 2 },
  { name: 'Canopy Spider', manaCost: '{1}{G}', cmc: 2, typeLine: 'Creature — Spider', power: '1', toughness: '3', colorIdentity: ['G'], keywords: ['reach'], copies: 3 },
  { name: 'Rumbling Baloth', manaCost: '{3}{G}', cmc: 4, typeLine: 'Creature — Beast', power: '4', toughness: '4', colorIdentity: ['G'], copies: 4 },
  { name: 'Vorstclaw', manaCost: '{3}{G}', cmc: 4, typeLine: 'Creature — Elemental', power: '4', toughness: '4', colorIdentity: ['G'], copies: 3 },
  { name: 'Alpha Tyrranax', manaCost: '{4}{G}', cmc: 5, typeLine: 'Creature — Dinosaur', power: '6', toughness: '5', colorIdentity: ['G'], keywords: ['trample'], copies: 3 },
  { name: 'Wildsize', manaCost: '{1}{G}', cmc: 2, typeLine: 'Instant', colorIdentity: ['G'], copies: 4 },
  { name: 'Rancor', manaCost: '{G}', cmc: 1, typeLine: 'Enchantment — Aura', colorIdentity: ['G'], copies: 4 },
];

/**
 * The last resort. No images, no database — a typographic board that still
 * plays, so a paused Supabase degrades the demo rather than ending it.
 */
export function fallbackDeck(name = 'Offline Green'): PlayDeck {
  const cards: PlayCard[] = [];

  FALLBACK_SPELLS.forEach((entry, index) => {
    for (let copy = 0; copy < entry.copies; copy++) {
      cards.push({
        cardId: `fallback-${index}`,
        name: entry.name,
        manaCost: entry.manaCost,
        cmc: entry.cmc,
        typeLine: entry.typeLine,
        power: entry.power,
        toughness: entry.toughness,
        colorIdentity: entry.colorIdentity,
        keywords: entry.keywords,
      });
    }
  });

  for (let i = 0; i < 24; i++) {
    cards.push({
      cardId: 'fallback-forest',
      name: 'Forest',
      cmc: 0,
      typeLine: 'Basic Land — Forest',
      colorIdentity: ['G'],
    });
  }

  return {
    id: 'fallback',
    name,
    format: 'commander',
    cards,
    commanders: [
      {
        cardId: 'fallback-commander',
        name: 'Yeva, Nature’s Herald',
        manaCost: '{2}{G}{G}',
        cmc: 4,
        typeLine: 'Legendary Creature — Elf Shaman',
        power: '4',
        toughness: '4',
        colorIdentity: ['G'],
        keywords: ['flash'],
      },
    ],
    source: 'fallback',
  };
}

/**
 * Get a deck for a seat, degrading rather than failing: the requested deck, a
 * seeded one, then the offline list.
 */
export async function resolveDeck(
  summary: DeckSummary | null,
  seedOptions: SeedDeckOptions = {}
): Promise<PlayDeck> {
  if (summary) {
    try {
      return await loadUserDeck(summary);
    } catch (error) {
      console.warn('[play] falling back from user deck:', error);
    }
  }
  try {
    return await buildSeedDeck(seedOptions);
  } catch (error) {
    console.warn('[play] falling back to the offline deck:', error);
    return fallbackDeck(seedOptions.name);
  }
}
