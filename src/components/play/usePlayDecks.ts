/**
 * Every deck you could sit down with, read once, for all four modes.
 *
 * ---------------------------------------------------------------------------
 * THREE QUERIES, WHATEVER THE DECK COUNT
 * ---------------------------------------------------------------------------
 * CLAUDE.md records two outages and a disk IO warning from per row queries, one
 * of them a lookup inside a loop over every card of every deck: 421 requests on
 * a single page visit. `DeckAPI.getDeckSummaries()` is the surviving example of
 * that shape, one `compute_deck_summary` RPC per deck, and it is deliberately
 * NOT what this uses.
 *
 *   1. `user_decks`   id, name, format, colors and the stored power analysis
 *   2. `deck_cards`   every entry for every one of those decks, in one `.in()`
 *   3. `cards`        every commander face at once, in one `.in()`
 *
 * Three round trips for one deck and three for fifty. The card count, the
 * commander, the colours and the power score all fall out of those three, and
 * the power score is read from `user_decks.edh_analysis` rather than recomputed,
 * with `deckListHash` deciding staleness from rows query two already returned.
 *
 * ---------------------------------------------------------------------------
 * ONE READ, FOUR MODES, AND THE LOBBY
 * ---------------------------------------------------------------------------
 * `PlayableDeck` extends the `DeckSummary` the lobby and `resolveDeckDetailed`
 * already take, so the same rows feed the deck wall, the seat picker, the
 * online entry rule and the table dealer. There is no second deck list.
 *
 * It is cached under one React Query key, so walking mode, deck, table and back
 * again re-reads nothing, and opening the lobby after a game re-reads nothing.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toGameFormat, type DeckSummary } from '@/lib/play/deckSource';
import { deckListHash, deckPowerFromStored, type DeckPower } from '@/lib/deck/power';
import {
  faceRank,
  formatLabel,
  usdPrice,
  type PlayableDeck as PlayableDeckShape,
} from './playDeckView';

/**
 * The rows a deck wall draws, and the shape `resolveDeckDetailed` already
 * takes. One type, so a deck chosen on the wall is the deck dealt at the table
 * with no re-reading and no second lookup.
 */
export interface PlayDeckOption
  extends DeckSummary,
    Omit<PlayableDeckShape, 'format' | 'colors' | 'power'> {
  cardCount: number;
  colors: string[];
  /** The canonical score, rehydrated from `user_decks.edh_analysis`. */
  power: DeckPower | null;
}

/** Only what a face needs. `faces` is here because a commander may be double faced. */
const FACE_COLUMNS =
  'id, name, type_line, mana_cost, color_identity, rarity, layout, image_uris, faces, prices, is_legendary';

/** Candidate faces considered per deck when it has no commander set. */
const STAND_IN_LIMIT = 100;

export async function listPlayDecks(userId: string): Promise<PlayDeckOption[]> {
  const { data: deckRows, error } = await supabase
    .from('user_decks')
    .select('id, name, format, colors, edh_analysis')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = deckRows ?? [];
  if (rows.length === 0) return [];

  /* Query two. Every entry of every deck, once. The count, the commander and
     the hash that decides whether the stored power score still applies all come
     out of this one response. */
  const { data: entries, error: entryError } = await supabase
    .from('deck_cards')
    .select('deck_id, card_id, card_name, quantity, is_commander, is_sideboard')
    .in('deck_id', rows.map(row => row.id));

  /* A failed count costs the badges, never the deck list. The wall is still the
     reader's real decks and they can still sit down with one. */
  if (entryError) console.warn('[play] could not read deck cards:', entryError);

  const counts = new Map<string, number>();
  const commanders = new Map<string, { id: string | null; name: string }>();
  const standIns = new Map<string, string[]>();
  const hashEntries = new Map<string, Array<{ name: string; quantity: number }>>();

  for (const entry of entries ?? []) {
    if (!entry.is_sideboard) {
      counts.set(entry.deck_id, (counts.get(entry.deck_id) ?? 0) + (entry.quantity ?? 1));

      const list = hashEntries.get(entry.deck_id) ?? [];
      list.push({ name: entry.card_name ?? '', quantity: Number(entry.quantity ?? 1) });
      hashEntries.set(entry.deck_id, list);

      if (entry.card_id) {
        const candidates = standIns.get(entry.deck_id) ?? [];
        if (candidates.length < STAND_IN_LIMIT) {
          candidates.push(entry.card_id);
          standIns.set(entry.deck_id, candidates);
        }
      }
    }
    if (entry.is_commander && !commanders.has(entry.deck_id)) {
      commanders.set(entry.deck_id, { id: entry.card_id ?? null, name: entry.card_name });
    }
  }

  /* Query three. Every face the wall might draw, in one request: each deck's
     commander, plus the stand in candidates for the decks that have none. */
  const faceIds = new Set<string>();
  for (const row of rows) {
    const commanderId = commanders.get(row.id)?.id;
    if (commanderId) faceIds.add(commanderId);
    else for (const id of standIns.get(row.id) ?? []) faceIds.add(id);
  }

  let faceRows: Array<Record<string, unknown>> = [];
  if (faceIds.size > 0) {
    const { data, error: faceError } = await supabase
      .from('cards')
      .select(FACE_COLUMNS)
      .in('id', [...faceIds]);
    if (faceError) console.warn('[play] could not read commander faces:', faceError);
    faceRows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const byId = new Map(faceRows.map(row => [row.id as string, row]));

  return rows.map(row => {
    const commanderId = commanders.get(row.id)?.id ?? null;
    let face = commanderId ? byId.get(commanderId) ?? null : null;

    if (!face) {
      let bestRank = -1;
      let bestPrice = -1;
      for (const id of standIns.get(row.id) ?? []) {
        const candidate = byId.get(id);
        if (!candidate) continue;
        const rank = faceRank(
          (candidate.type_line as string | null) ?? null,
          (candidate.is_legendary as boolean | null) ?? null
        );
        const price = usdPrice(candidate.prices);
        if (rank > bestRank || (rank === bestRank && price > bestPrice)) {
          bestRank = rank;
          bestPrice = price;
          face = candidate;
        }
      }
    }

    const colors =
      Array.isArray(row.colors) && row.colors.length
        ? (row.colors as string[])
        : ((face?.color_identity as string[] | null) ?? []);

    /* The stored score, with staleness decided against the list as it stands
       now. A number that no longer describes the deck is shown struck through
       and labelled by `PowerScoreBadge`, never as the deck's power. */
    const stored =
      row.edh_analysis && typeof row.edh_analysis === 'object' && !Array.isArray(row.edh_analysis)
        ? (row.edh_analysis as Record<string, unknown>).deckmatrix
        : null;
    const listed = hashEntries.get(row.id) ?? [];
    const power = deckPowerFromStored(stored, listed.length > 0 ? deckListHash(listed) : null);

    return {
      id: row.id,
      name: row.name,
      format: toGameFormat(row.format),
      formatLabel: formatLabel(row.format),
      colors,
      cardCount: counts.get(row.id) ?? 0,
      commanderName: commanders.get(row.id)?.name ?? null,
      faceCard: face,
      power,
    };
  });
}

/** One key, so every play surface shares the cache rather than re-reading. */
export function playDecksKey(userId: string | undefined): unknown[] {
  return ['play-decks', userId ?? null];
}

export function usePlayDecks(userId: string | undefined): UseQueryResult<PlayDeckOption[]> {
  return useQuery({
    queryKey: playDecksKey(userId),
    queryFn: () => listPlayDecks(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
