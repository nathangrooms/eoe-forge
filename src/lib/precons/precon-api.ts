import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import {
  PRECON_INDEX,
  preconIndexEntry,
  type PreconCommanderRef,
} from '@/data/precon-index';
import {
  scryfallImageUrl,
  type DeckCardDetail,
  type DeckCardRow,
} from '@/lib/deck/deckCards';

/**
 * The precon catalogue, in one place.
 *
 * The `fetch-precons` edge function is the only source for *which* precons
 * exist and what is in them, but its list response carries name + set +
 * filename and nothing drawable. Everything visual — commander, colour
 * identity, card count, release date — comes from the generated
 * `precon-index`, which is joined onto the live list here so the page never has
 * to know there are two sources.
 */

/*
 * THE PROJECT URL COMES FROM THE CLIENT, NOT FROM import.meta.env.
 *
 * This read `import.meta.env.VITE_SUPABASE_URL` and fell back to an empty
 * string. That variable is not set in the deployed build, so the base became
 * the RELATIVE path "/functions/v1", the browser resolved it against
 * deckmatrix.com, the single-page app answered every path with index.html, and
 * `response.json()` died on "Unexpected token '<'". The page reported "Could
 * not load the precon catalogue" while the edge function was perfectly healthy.
 *
 * Nothing else in the app noticed because the Supabase client hardcodes the
 * same URL. This file was the only reader of that variable.
 */
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

export interface PreconListItem {
  id: string;
  name: string;
  set: string;
  filename: string;
}

export interface PreconCard {
  quantity: number;
  card_name: string;
  scryfall_id: string;
  is_commander: boolean;
}

export interface PreconDeck {
  name: string;
  set: string;
  format: string;
  cards: PreconCard[];
  totalCards: number;
}

/** A list item joined to everything the generated index knows about it. */
export interface PreconSummary extends PreconListItem {
  /** Total cards, or `null` for a precon the index has not been regenerated for. */
  total: number | null;
  /** Commander colour identity in WUBRG order. Empty when unknown. */
  ci: string[];
  /** ISO date of the commander's printing — the precon's release, near enough. */
  released: string | null;
  commanders: PreconCommanderRef[];
}

async function callPreconFunction<T>(path: string): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const response = await fetch(`${FUNCTIONS_BASE}/fetch-precons${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) throw new Error(`fetch-precons failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchPreconList(): Promise<PreconListItem[]> {
  const result = await callPreconFunction<{ precons?: PreconListItem[] }>('?action=list');
  return result.precons ?? [];
}

export async function fetchPreconDeck(id: string): Promise<PreconDeck> {
  return callPreconFunction<PreconDeck>(`?action=get&deck=${encodeURIComponent(id)}`);
}

/**
 * Join the live list to the generated index.
 *
 * A precon the index has never seen still comes through — it simply has no
 * commander, so the tile falls back to type rather than disappearing.
 */
export function summarizePrecons(items: PreconListItem[]): PreconSummary[] {
  return items.map(item => {
    const entry = preconIndexEntry(item.id);
    return {
      ...item,
      total: entry?.total ?? null,
      ci: entry?.ci ?? [],
      released: entry?.released ?? null,
      commanders: entry?.commanders ?? [],
    };
  });
}

/* ------------------------------------------------------------------ *
 * Commander card lookup
 * ------------------------------------------------------------------ */

/** Lean projection — tiles need art, identity and a cost, not oracle text. */
const COMMANDER_COLUMNS =
  'id, name, image_uris, faces, layout, color_identity, colors, mana_cost, type_line, cmc, prices, set_code, rarity';

/** Every distinct printing id and name the catalogue's commanders use. */
function commanderRefs(): PreconCommanderRef[] {
  const seen = new Set<string>();
  const refs: PreconCommanderRef[] = [];
  for (const entry of PRECON_INDEX) {
    for (const ref of entry.commanders) {
      const key = ref.scryfallId || ref.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

/** Card rows keyed by printing id *and* by lowercased name. */
export type CommanderCardMap = Map<string, any>;

async function selectCards(column: 'id' | 'name', values: string[]): Promise<any[]> {
  const rows: any[] = [];
  const CHUNK = 80;
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('cards')
      .select(COMMANDER_COLUMNS)
      .in(column, values.slice(i, i + CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as any[]));
  }
  return rows;
}

/**
 * Load every precon commander from the `cards` table in one pass.
 *
 * Roughly a third of the printings the decklists reference are not in the local
 * table — the table holds one row per card, not per printing — so anything the
 * printing id misses is retried by name, which closes the gap completely.
 */
export async function fetchCommanderCards(): Promise<CommanderCardMap> {
  const refs = commanderRefs();
  const map: CommanderCardMap = new Map();

  const ids = refs.map(r => r.scryfallId).filter(Boolean);
  const byId = await selectCards('id', ids);
  for (const row of byId) {
    map.set(row.id, row);
    map.set(row.name.toLowerCase(), row);
  }

  const missing = refs.filter(r => !map.has(r.scryfallId) && !map.has(r.name.toLowerCase()));
  if (missing.length > 0) {
    const byName = await selectCards(
      'name',
      Array.from(new Set(missing.map(r => r.name)))
    );
    for (const row of byName) {
      map.set(row.name.toLowerCase(), row);
      if (!map.has(row.id)) map.set(row.id, row);
    }
  }

  return map;
}

/**
 * A card object for `CardImage`, from the local table when we have it and from
 * Scryfall's deterministic image paths when we do not — so every commander in
 * the catalogue draws, table coverage or not.
 */
export function commanderCard(ref: PreconCommanderRef, cards?: CommanderCardMap): any {
  const found =
    cards?.get(ref.scryfallId) ?? cards?.get((ref.name ?? '').toLowerCase()) ?? null;
  if (found) return found;

  return {
    id: ref.scryfallId,
    name: ref.name,
    mana_cost: ref.cost,
    type_line: ref.type,
    layout: 'normal',
    image_uris: {
      large: scryfallImageUrl(ref.scryfallId, 'large') ?? undefined,
      normal: scryfallImageUrl(ref.scryfallId, 'normal') ?? undefined,
      small: scryfallImageUrl(ref.scryfallId, 'small') ?? undefined,
      art_crop: scryfallImageUrl(ref.scryfallId, 'art_crop') ?? undefined,
    },
  };
}

/**
 * Art crop for the banner treatment.
 *
 * The `cards` table stores a webp `art` variant alongside `art_crop` — same
 * 626×457, a little over half the bytes — so it is preferred where present.
 */
export function commanderArt(card: any, fallbackId?: string): string | null {
  const uris = card?.image_uris;
  const art = uris?.art;
  if (typeof art === 'string' && art) return art;
  const crop = uris?.art_crop;
  if (typeof crop === 'string' && crop) return crop;

  const faceCrop = Array.isArray(card?.faces) ? card.faces[0]?.image_uris?.art_crop : null;
  if (typeof faceCrop === 'string' && faceCrop) return faceCrop;

  return scryfallImageUrl(fallbackId ?? card?.id, 'art_crop');
}

/* ------------------------------------------------------------------ *
 * Decklist resolution
 * ------------------------------------------------------------------ */

/**
 * Deliberately not `fetchCardsByIds` from `lib/deck/deckCards`: its projection
 * omits `faces` and `layout`, so every double-faced card in a precon would lose
 * its back face and its flip control. This asks for both.
 */
const DECK_COLUMNS =
  'id, name, type_line, mana_cost, cmc, colors, color_identity, image_uris, faces, layout, prices, oracle_text, power, toughness, rarity, set_code, legalities, is_legendary, keywords, tags';

async function selectDeckCards(column: 'id' | 'name', values: string[]): Promise<any[]> {
  const rows: any[] = [];
  const unique = Array.from(new Set(values.filter(Boolean)));
  const CHUNK = 80;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('cards')
      .select(DECK_COLUMNS)
      .in(column, unique.slice(i, i + CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as any[]));
  }
  return rows;
}

function toDetail(raw: any): DeckCardDetail & { faces?: any; layout?: string; id?: string } {
  return {
    name: raw.name ?? '',
    type_line: raw.type_line ?? '',
    mana_cost: raw.mana_cost ?? null,
    cmc: Number(raw.cmc ?? 0),
    colors: raw.colors ?? [],
    color_identity: raw.color_identity ?? [],
    image_uris: raw.image_uris ?? null,
    prices: raw.prices ?? null,
    oracle_text: raw.oracle_text ?? null,
    power: raw.power ?? null,
    toughness: raw.toughness ?? null,
    rarity: raw.rarity ?? null,
    set_code: raw.set_code ?? null,
    legalities: raw.legalities ?? null,
    is_legendary: Boolean(raw.is_legendary),
    keywords: raw.keywords ?? [],
    tags: raw.tags ?? [],
    faces: raw.faces ?? null,
    layout: raw.layout ?? null,
    id: raw.id,
  };
}

/**
 * Turn a precon's raw card list into deck rows with real card metadata.
 *
 * Two lookups, because neither alone is enough: the decklists cite specific
 * printings, and a third of those printing ids are absent from the local table,
 * while a name lookup alone would silently pick the wrong card for the handful
 * of names that legitimately collide across a `//` split. Rows resolved by name
 * carry the *local* card id forward, so saving the deck writes a valid
 * `deck_cards.card_id` instead of a dangling printing id.
 */
export async function resolvePreconRows(cards: PreconCard[]): Promise<DeckCardRow[]> {
  const base: DeckCardRow[] = cards.map((card, index) => ({
    id: `${card.scryfall_id || card.card_name}-${index}`,
    card_id: card.scryfall_id,
    card_name: card.card_name,
    quantity: card.quantity,
    is_commander: card.is_commander,
    is_sideboard: false,
    card: null,
  }));

  const byId = new Map<string, any>();
  try {
    for (const raw of await selectDeckCards('id', base.map(row => row.card_id))) {
      byId.set(raw.id, raw);
    }
  } catch (error) {
    console.error('[precons] printing lookup failed', error);
  }

  const byName = new Map<string, any>();
  const unresolved = base.filter(row => !byId.has(row.card_id));
  if (unresolved.length > 0) {
    try {
      for (const raw of await selectDeckCards('name', unresolved.map(row => row.card_name))) {
        byName.set((raw.name ?? '').toLowerCase(), raw);
      }
    } catch (error) {
      console.error('[precons] name lookup failed', error);
    }
  }

  return base.map(row => {
    const direct = byId.get(row.card_id);
    if (direct) return { ...row, card: toDetail(direct) };

    const named = byName.get(row.card_name.toLowerCase());
    if (named) return { ...row, card_id: named.id ?? row.card_id, card: toDetail(named) };

    return row;
  });
}

/**
 * `CardImage` reads a Scryfall-shaped object; deck rows keep the card under
 * `.card`. This lifts the row into that shape without losing the printing id
 * that art falls back to.
 */
export function rowCard(row: DeckCardRow): any {
  if (!row.card) {
    return {
      id: row.card_id,
      name: row.card_name,
      layout: 'normal',
      image_uris: {
        large: scryfallImageUrl(row.card_id, 'large') ?? undefined,
        normal: scryfallImageUrl(row.card_id, 'normal') ?? undefined,
        small: scryfallImageUrl(row.card_id, 'small') ?? undefined,
      },
    };
  }
  return { id: row.card_id, ...(row.card as any) };
}
