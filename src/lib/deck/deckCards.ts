import { supabase } from '@/integrations/supabase/client';
import type { Card as EngineCard } from '@/lib/deckbuilder/types';
import { deckAverageManaValue } from './curve';

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
  /**
   * Four columns the catalogue has always carried and no deck surface read.
   *
   * They are on the same row as everything above, so they cost no request:
   * `CARD_COLUMNS` is one projection inside the one join `fetchDeckCards`
   * already makes. Each answers a question a deck tab was asking and getting
   * wrong, or not asking because it had no way to.
   *
   * - `oracle_id` makes every other printing of a card joinable, which is how
   *   the Value tab can say what the deck costs at the cheapest printing rather
   *   than only at the one this row points at, and how the price record finds a
   *   history written against a different printing of the same card.
   * - `edhrec_rank` is how often the card is actually played. The card page and
   *   the commander wall both print it and no deck surface did.
   * - `is_reserved` is the one fact that changes a buying decision: a
   *   reserved-list card is not going to be reprinted cheaper.
   * - `produced_mana` is which colours a source makes, per printing. The
   *   castability engine derives its own answer; this is what lets the Mana tab
   *   name the lands behind a colour count instead of only counting them.
   *
   * Optional, and that is not laziness. `fetchDeckCards` and `fetchCardsByIds`
   * always fill them, because they select them. Four other places in the
   * product build this shape by hand out of a payload that has no such
   * columns — a precon list from `precon-api`, the optimistic row
   * `deckMutations` writes before the catalogue answers, the public deck page's
   * RPC projection — and for those the honest value is "we do not know", which
   * is `undefined`, not `null` standing in for "this card has no oracle id".
   * Read them with a `??` and the two cases collapse correctly anyway.
   */
  oracle_id?: string | null;
  edhrec_rank?: number | null;
  is_reserved?: boolean;
  produced_mana?: string[];
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
  'name, type_line, mana_cost, cmc, colors, color_identity, image_uris, prices, oracle_text, power, toughness, rarity, set_code, legalities, is_legendary, keywords, tags, oracle_id, edhrec_rank, is_reserved, produced_mana';

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
    oracle_id: raw.oracle_id ?? null,
    /* `numeric` and `integer` both arrive as numbers here, but a null rank is a
       card the sync has not reached rather than the most-played card in Magic,
       so it stays null instead of becoming 0. */
    edhrec_rank:
      raw.edhrec_rank === null || raw.edhrec_rank === undefined
        ? null
        : Number(raw.edhrec_rank),
    is_reserved: Boolean(raw.is_reserved),
    produced_mana: raw.produced_mana ?? [],
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
  /**
   * Average mana value, over the ninety-nine. Lands and the commander are both
   * out — see the note in `computeDeckStats`.
   */
  avgManaValue: number;
  totalValueUSD: number;
  /**
   * Copies `totalValueUSD` could not price, and therefore does NOT include.
   *
   * The sum already skipped them rather than adding a guessed zero, which is
   * right, but nothing counted them, so the figure understated the deck by an
   * unstated amount. The Value tab on the same page has always said "2 cards
   * unpriced" beside its own total; the header said "$425" and nothing else.
   */
  unpricedCopies: number;
  /** Rows whose printing is not present in the local card table. */
  missingMetadata: number;
}

export function computeDeckStats(rows: DeckCardRow[]): DeckStats {
  let totalCards = 0;
  let totalValueUSD = 0;
  let unpricedCopies = 0;
  let missingMetadata = 0;

  for (const row of rows) {
    if (row.is_sideboard) continue;
    totalCards += row.quantity;

    if (!row.card) {
      missingMetadata += 1;
      /* A row with no card row is also a row with no price, and it was
         previously counted as neither. */
      unpricedCopies += row.quantity;
      continue;
    }

    const usd = parseFloat(row.card.prices?.usd ?? '');
    if (Number.isNaN(usd)) unpricedCopies += row.quantity;
    else totalValueUSD += usd * row.quantity;
  }

  return {
    totalCards,
    uniqueCards: rows.filter(r => !r.is_sideboard).length,
    /**
     * THE COMMANDER IS NOT IN THE AVERAGE, AND THIS FIELD USED TO PUT IT THERE.
     *
     * This was a local loop that skipped lands and counted everything else,
     * including the commander row — so on a Commander deck it returned a
     * different number from the four other implementations of this figure,
     * every one of which excludes the commander:
     *
     *     deckAverageManaValue      (lib/deck/curve.ts)      the metric strip
     *     ManaCurve's local avgCmc                           the Mana tab header
     *     castability.avgManaValue  (engine/power/score.ts)  PowerScore, the AI brief
     *     ManaCurveAnalyzer         (lib/magic/mana-curve.ts)
     *
     * Those four are right and this was wrong. The commander is available in
     * every game whatever you draw, so counting it says nothing about what the
     * deck draws, which is the only question an average mana value answers.
     *
     * It was not a harmless field either. `PreconDeckView` prints it as
     * "Avg MV", so a precon read one number and the same list on `/deck/:id`
     * read another. It calls the canonical function now and there is one
     * answer. Do not reimplement this loop: `deckAverageManaValue` takes
     * anything with `quantity`, `is_commander`, `is_sideboard` and a `card`.
     */
    avgManaValue: deckAverageManaValue(rows),
    totalValueUSD,
    unpricedCopies,
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
      /* The real oracle id when the printing has synced. It used to be the
         printing id, which made every printing of one card a different card to
         anything deduping on this field. */
      oracle_id: row.card?.oracle_id ?? row.card_id,
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
