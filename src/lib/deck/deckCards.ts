import { supabase } from '@/integrations/supabase/client';
import type { Card as EngineCard } from '@/lib/deckbuilder/types';
import { categorizeCard } from './cardCategories';

/**
 * Deck card loading with real card metadata.
 *
 * The deck detail page used to select only the `deck_cards` columns, which
 * carry nothing but a name and a quantity. Every downstream consumer then
 * tested `card.type_line`, `card.cmc` and `card.prices` — all `undefined` —
 * so a 100-card deck rendered as a commander and nothing else, average mana
 * value was always 0.0 and deck value was always $0.
 *
 * This module is the one place that joins `cards`, so no deck surface can
 * regress to the metadata-free query again.
 */

export interface DeckCardDetail {
  name: string;
  type_line: string;
  mana_cost: string | null;
  cmc: number;
  colors: string[];
  color_identity: string[];
  image_uris: Record<string, string> | null;
  prices: Record<string, string | null> | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  rarity: string | null;
  set_code: string | null;
  legalities: Record<string, string> | null;
  is_legendary: boolean;
  keywords: string[];
  /** Role tags from `public.derive_card_tags`. Read by archetype detection. */
  tags: string[];
}

export interface DeckCardRow {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
  /** Joined metadata. `null` when the printing is missing from the local card table. */
  card: DeckCardDetail | null;
}

const CARD_COLUMNS =
  'name, type_line, mana_cost, cmc, colors, color_identity, image_uris, prices, oracle_text, power, toughness, rarity, set_code, legalities, is_legendary, keywords, tags';

/**
 * Scryfall serves images at a deterministic path keyed on the card id, so a
 * card missing from the local table still gets art rather than a grey box.
 */
export function scryfallImageUrl(
  cardId: string | null | undefined,
  size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'
): string | null {
  if (!cardId || cardId.length < 2) return null;
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return null;
  return `https://cards.scryfall.io/${size}/front/${cardId[0]}/${cardId[1]}/${cardId}.jpg`;
}

export function cardImage(
  row: Pick<DeckCardRow, 'card_id' | 'card'>,
  size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'
): string | null {
  const uris = row.card?.image_uris;
  if (uris) {
    const direct = uris[size] || uris.normal || uris.large || uris.small;
    if (direct) return direct;
  }
  return scryfallImageUrl(row.card_id, size);
}

function normalizeDetail(raw: any): DeckCardDetail | null {
  if (!raw) return null;
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
  };
}

/** Load a deck's cards with their joined `cards` metadata. */
export async function fetchDeckCards(deckId: string): Promise<DeckCardRow[]> {
  const { data, error } = await supabase
    .from('deck_cards')
    .select(
      `id, card_id, card_name, quantity, is_commander, is_sideboard, cards (${CARD_COLUMNS})`
    )
    .eq('deck_id', deckId);

  if (error) throw error;

  return ((data ?? []) as any[]).map(row => ({
    id: row.id,
    card_id: row.card_id,
    card_name: row.card_name,
    quantity: row.quantity ?? 1,
    is_commander: Boolean(row.is_commander),
    is_sideboard: Boolean(row.is_sideboard),
    card: normalizeDetail(Array.isArray(row.cards) ? row.cards[0] : row.cards),
  }));
}

/**
 * Fetch metadata for an arbitrary list of card ids. Used by the public deck
 * page, whose RPC payload carries only a partial card projection.
 */
export async function fetchCardsByIds(
  cardIds: string[]
): Promise<Map<string, DeckCardDetail>> {
  const map = new Map<string, DeckCardDetail>();
  const unique = Array.from(new Set(cardIds.filter(Boolean)));
  if (unique.length === 0) return map;

  // Chunked so a 100-card commander deck stays inside URL length limits.
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(`id, ${CARD_COLUMNS}`)
      .in('id', slice);

    if (error) throw error;
    for (const raw of (data ?? []) as any[]) {
      const detail = normalizeDetail(raw);
      if (detail) map.set(raw.id, detail);
    }
  }
  return map;
}

export interface DeckStats {
  totalCards: number;
  uniqueCards: number;
  /** Average mana value excluding lands — the community convention. */
  avgManaValue: number;
  totalValueUSD: number;
  /** Rows whose printing is not present in the local card table. */
  missingMetadata: number;
}

export function computeDeckStats(rows: DeckCardRow[]): DeckStats {
  let totalCards = 0;
  let nonLandCards = 0;
  let manaValueTotal = 0;
  let totalValueUSD = 0;
  let missingMetadata = 0;

  for (const row of rows) {
    if (row.is_sideboard) continue;
    totalCards += row.quantity;

    if (!row.card) {
      missingMetadata += 1;
      continue;
    }

    // Front face only, through the one categoriser. A plain
    // `.includes('land')` counted every modal double-faced spell with a land
    // on the back as a land, which is what made this page's average mana
    // value disagree with the builder's for the same deck.
    const isLand = categorizeCard(row.card.type_line) === 'lands';
    if (!isLand) {
      nonLandCards += row.quantity;
      manaValueTotal += row.card.cmc * row.quantity;
    }

    const usd = parseFloat(row.card.prices?.usd ?? '');
    if (!Number.isNaN(usd)) totalValueUSD += usd * row.quantity;
  }

  return {
    totalCards,
    uniqueCards: rows.filter(r => !r.is_sideboard).length,
    avgManaValue: nonLandCards > 0 ? manaValueTotal / nonLandCards : 0,
    totalValueUSD,
    missingMetadata,
  };
}

/**
 * Shape deck rows for the EDH power engine. Keeping this next to the loader
 * means the engine always receives real `color_identity`, `oracle_text` and
 * `is_legendary` values instead of a card spread from an unrelated index.
 */
export function toEngineCards(rows: DeckCardRow[]): EngineCard[] {
  return rows
    .filter(row => !row.is_sideboard)
    .map(row => ({
      id: row.card_id,
      oracle_id: row.card_id,
      name: row.card?.name || row.card_name,
      mana_cost: row.card?.mana_cost || '',
      cmc: row.card?.cmc ?? 0,
      type_line: row.card?.type_line || '',
      oracle_text: row.card?.oracle_text || '',
      colors: row.card?.colors ?? [],
      color_identity: row.card?.color_identity ?? [],
      power: row.card?.power ?? undefined,
      toughness: row.card?.toughness ?? undefined,
      keywords: row.card?.keywords ?? [],
      legalities: (row.card?.legalities ?? {}) as EngineCard['legalities'],
      image_uris: undefined,
      prices: { usd: row.card?.prices?.usd ?? '0' },
      set: row.card?.set_code || '',
      set_name: row.card?.set_code || '',
      collector_number: '',
      rarity: (row.card?.rarity as EngineCard['rarity']) || 'common',
      layout: 'normal',
      is_legendary:
        row.card?.is_legendary ??
        (row.card?.type_line || '').toLowerCase().includes('legendary'),
      // The authoritative role tags, straight from the row. This was an empty
      // set, so every engine consumer that branches on `tags` — the commander
      // synergy score, every template quota — saw a deck of untagged cards.
      tags: new Set<string>(row.card?.tags ?? []),
      derived: {
        mv: row.card?.cmc ?? 0,
        colorPips: {},
        producesMana: false,
        etbTapped: false,
      },
    }));
}

/** Shape a deck row for the shared card modal / analytics components. */
export function toCardObject(row: DeckCardRow) {
  return {
    id: row.card_id,
    name: row.card?.name || row.card_name,
    mana_cost: row.card?.mana_cost || '',
    cmc: row.card?.cmc ?? 0,
    type_line: row.card?.type_line || '',
    oracle_text: row.card?.oracle_text || '',
    colors: row.card?.colors ?? [],
    color_identity: row.card?.color_identity ?? [],
    power: row.card?.power ?? undefined,
    toughness: row.card?.toughness ?? undefined,
    rarity: row.card?.rarity || 'common',
    set: row.card?.set_code || '',
    set_name: row.card?.set_code || '',
    legalities: row.card?.legalities ?? {},
    keywords: row.card?.keywords ?? [],
    image_uris: {
      small: cardImage(row, 'small') ?? undefined,
      normal: cardImage(row, 'normal') ?? undefined,
      large: cardImage(row, 'large') ?? undefined,
      art_crop: cardImage(row, 'art_crop') ?? undefined,
    },
    prices: { usd: row.card?.prices?.usd ?? undefined },
    quantity: row.quantity,
    is_commander: row.is_commander,
  };
}
