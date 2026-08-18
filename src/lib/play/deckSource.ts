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

  const { data: legends, error: legendError } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .eq('is_legendary', true)
    .ilike('type_line', 'Legendary Creature%')
    .eq('legalities->>commander' as never, 'legal')
    .not('image_uris', 'is', null)
    .order('name')
    .limit(240);

  if (legendError) throw legendError;

  const legendRows = (legends ?? []) as CardRow[];
  if (legendRows.length === 0) {
    throw new Error('No commander-legal legendary creatures found in the card database.');
  }

  const commanderRow = pick(legendRows, 1, seed)[0];
  const commander = toPlayCard(commanderRow);
  const identity = commander.colorIdentity ?? [];

  const { data: pool, error: poolError } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .eq('legalities->>commander' as never, 'legal')
    .containedBy('color_identity', identity.length > 0 ? identity : [])
    .not('type_line', 'ilike', '%Land%')
    .gte('cmc', 1)
    .lte('cmc', 5)
    .not('image_uris', 'is', null)
    .order('name')
    .limit(400);

  if (poolError) throw poolError;

  const poolRows = ((pool ?? []) as CardRow[]).filter(row => row.id !== commanderRow.id);
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

  const basicNames =
    identity.length > 0
      ? identity.map(color => BASIC_FOR_COLOR[color]).filter(Boolean)
      : ['Wastes'];

  const { data: basics, error: basicsError } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .in('name', basicNames.length > 0 ? basicNames : ['Wastes'])
    .not('image_uris', 'is', null)
    .order('name')
    .limit(60);

  if (basicsError) throw basicsError;

  // One printing per basic land name, so the deck does not become a set showcase.
  const basicByName = new Map<string, PlayCard>();
  for (const row of (basics ?? []) as CardRow[]) {
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
