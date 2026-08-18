import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { deckListHash, deckPowerFromStored, type DeckPower } from '@/lib/deck/power';
import { ownedValueUSD } from '@/features/collection/value';

// The dashboard is the first screen a signed-in player sees, so everything it
// renders has to come from a real row. There is deliberately no seeded/demo
// data in this module: if a query returns nothing, the widget renders an empty
// state rather than inventing numbers.

export { logActivity } from '@/lib/activityLogger';

export interface DashboardSummary {
  displayName: string;
  collection: {
    totalValueUSD: number;
    totalCards: number;
    uniqueCards: number;
  };
  wishlist: {
    totalItems: number;
    totalDesired: number;
    valueUSD: number;
  };
  decks: {
    count: number;
    favoritesCount: number;
  };
}

const EMPTY_SUMMARY: DashboardSummary = {
  displayName: '',
  collection: { totalValueUSD: 0, totalCards: 0, uniqueCards: 0 },
  wishlist: { totalItems: 0, totalDesired: 0, valueUSD: 0 },
  decks: { count: 0, favoritesCount: 0 },
};

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

/**
 * Supabase types the embedded `cards(prices)` relation loosely, so the shape the
 * valuation actually needs is stated here rather than cast at every use.
 */
interface CollectionValueRow {
  quantity: number | null;
  foil: number | null;
  cards: { prices: unknown } | null;
}

function parseUsdPrice(prices: unknown): number {
  try {
    const parsed = typeof prices === 'string' ? JSON.parse(prices) : prices;
    const usd = parseFloat((parsed as { usd?: string } | null)?.usd ?? '');
    return isFinite(usd) ? usd : 0;
  } catch {
    return 0;
  }
}

export function useDashboardSummary() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [
        { data: profile },
        { data: collectionRows },
        { data: wishlistRows },
        { count: deckCount },
        { count: favoriteCount },
      ] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        // The join to `cards` is the point. Valuation reads live Scryfall prices
        // off the card row, never the denormalised `user_collections.price_usd`
        // snapshot — see `ownedValueUSD` for why.
        supabase
          .from('user_collections')
          .select('quantity, foil, cards(prices)')
          .eq('user_id', user.id),
        supabase.from('wishlist').select('quantity, card_id').eq('user_id', user.id),
        supabase.from('user_decks').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('favorite_decks').select('deck_id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      let collectionValue = 0;
      let totalCards = 0;
      for (const row of (collectionRows ?? []) as CollectionValueRow[]) {
        if (!row) continue;
        const quantity = num(row.quantity);
        const foil = num(row.foil);
        collectionValue += ownedValueUSD(row.cards?.prices, quantity, foil);
        totalCards += quantity + foil;
      }
      collectionValue = Math.round(collectionValue * 100) / 100;

      // Wishlist rows only store a card id, so prices come from the card table.
      const wishlistCardIds = Array.from(
        new Set((wishlistRows ?? []).map(row => row?.card_id).filter(Boolean) as string[])
      );

      const priceByCardId: Record<string, number> = {};
      if (wishlistCardIds.length > 0) {
        const { data: cardRows } = await supabase
          .from('cards')
          .select('id, prices')
          .in('id', wishlistCardIds);

        for (const card of cardRows ?? []) {
          priceByCardId[card.id] = parseUsdPrice(card.prices);
        }
      }

      let wishlistValue = 0;
      let wishlistDesired = 0;
      for (const row of wishlistRows ?? []) {
        if (!row?.card_id) continue;
        const quantity = num(row.quantity, 1);
        wishlistValue += num(priceByCardId[row.card_id]) * quantity;
        wishlistDesired += quantity;
      }

      setData({
        displayName: profile?.username?.trim() || user.email?.split('@')[0] || '',
        collection: {
          totalValueUSD: collectionValue,
          totalCards,
          uniqueCards: collectionRows?.length ?? 0,
        },
        wishlist: {
          totalItems: wishlistRows?.length ?? 0,
          totalDesired: wishlistDesired,
          valueUSD: wishlistValue,
        },
        decks: {
          count: deckCount ?? 0,
          favoritesCount: favoriteCount ?? 0,
        },
      });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      setError('Could not load your dashboard data.');
      setData(prev => prev ?? EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}

/**
 * How well a card would stand in as a deck's face, for the decks that have no
 * commander to do it.
 *
 * The first version took whichever row `deck_cards` returned first, which gave
 * the "Lyra Dawnbringer angel-tribal" deck a banner of Phoenix Down. Price alone
 * is not much better: it made the same deck a Polluted Delta, because a fetch
 * land is the most expensive card in a budget angel list. What a player means by
 * "the card this deck is about" is almost always its best legendary creature —
 * the card it would run as a commander — so that ranks first, any creature
 * second, everything else last, and price breaks ties inside each band.
 */
function faceRank(typeLine: string | null, isLegendary: boolean | null): number {
  const line = (typeLine ?? '').toLowerCase();
  const creature = line.includes('creature');
  if (creature && isLegendary) return 3;
  if (creature) return 2;
  if (line.includes('planeswalker')) return 2;
  return 1;
}

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  colors: string[];
  /**
   * The canonical EDH power score, or `null` when this deck has not been scored
   * against its current list. Previously this was `num(row.power_level)` — the
   * legacy integer column — so the dashboard stamped "5.0" on the art of a deck
   * the /decks tile was showing as 6.3 in the same session.
   */
  power: DeckPower | null;
  updatedAt: string;
  cardCount: number;
  commanderName: string | null;
  /**
   * The exact printing chosen for the commander. Carried alongside the name so
   * the dashboard can show *that* printing's art rather than whichever reprint a
   * name lookup happens to land on.
   */
  commanderCardId: string | null;
  /**
   * The card whose art represents the deck: the commander, or failing that the
   * card `faceRank` picks out of the list. A deck without a commander (60-card
   * formats, or an EDH list still missing its helm) is still a pile of Magic
   * cards, and its centrepiece is a far better banner than an empty rectangle —
   * or than whichever row `deck_cards` happened to return first.
   */
  faceCardId: string | null;
  isFavorite: boolean;
}

interface DeckRow {
  id: string;
  name: string;
  format: string;
  colors: string[] | null;
  edh_analysis: unknown;
  updated_at: string;
}

/**
 * Recently touched decks, newest first, enriched with the two facts a deck list
 * is useless without: how many cards are in it and (for Commander) who is at
 * the helm. Favourite state is folded in so the star toggle in the widget can
 * write straight back.
 */
export function useRecentDecks(limit = 6) {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecks = useCallback(async () => {
    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [{ data: deckRows, error: deckError }, { data: favoriteRows }] = await Promise.all([
        supabase
          .from('user_decks')
          .select('id, name, format, colors, edh_analysis, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(limit),
        supabase.from('favorite_decks').select('deck_id').eq('user_id', user.id),
      ]);

      if (deckError) throw deckError;

      const rows = (deckRows ?? []) as DeckRow[];
      const favoriteIds = new Set((favoriteRows ?? []).map(row => row.deck_id));

      const cardCounts: Record<string, number> = {};
      const commanders: Record<string, { id: string | null; name: string }> = {};
      const faces: Record<string, string> = {};
      /** Per-deck lists, so the stored score can be checked against the real deck. */
      const lists: Record<string, Array<{ name: string; quantity: number }>> = {};
      /** Candidate face cards for decks with no commander, in list order. */
      const candidates: Record<string, string[]> = {};

      if (rows.length > 0) {
        const { data: cardRows } = await supabase
          .from('deck_cards')
          .select('deck_id, quantity, is_commander, is_sideboard, card_name, card_id')
          .in('deck_id', rows.map(row => row.id));

        for (const card of cardRows ?? []) {
          if (!card.is_sideboard) {
            cardCounts[card.deck_id] = (cardCounts[card.deck_id] ?? 0) + num(card.quantity, 1);
            (lists[card.deck_id] ??= []).push({
              name: card.card_name,
              quantity: num(card.quantity, 1),
            });
            if (card.card_id) (candidates[card.deck_id] ??= []).push(card.card_id);
          }
          if (card.is_commander && !commanders[card.deck_id]) {
            commanders[card.deck_id] = { id: card.card_id ?? null, name: card.card_name };
          }
        }

        const needFace = rows.filter(row => !commanders[row.id]).map(row => row.id);
        const faceIds = Array.from(
          new Set(needFace.flatMap(deckId => (candidates[deckId] ?? []).slice(0, 120)))
        );

        if (faceIds.length > 0) {
          const { data: faceRows } = await supabase
            .from('cards')
            .select('id, prices, type_line, is_legendary')
            .in('id', faceIds);

          const scoreById = new Map<string, { rank: number; price: number }>();
          for (const card of faceRows ?? []) {
            scoreById.set(card.id, {
              rank: faceRank(card.type_line, card.is_legendary),
              price: parseUsdPrice(card.prices),
            });
          }

          for (const deckId of needFace) {
            let best: string | null = null;
            let bestRank = -1;
            let bestPrice = -1;
            for (const cardId of candidates[deckId] ?? []) {
              const score = scoreById.get(cardId);
              if (!score) continue;
              if (score.rank > bestRank || (score.rank === bestRank && score.price > bestPrice)) {
                bestRank = score.rank;
                bestPrice = score.price;
                best = cardId;
              }
            }
            // Every candidate unknown (a deck of unsynced cards) still gets a face.
            if (!best) best = candidates[deckId]?.[0] ?? null;
            if (best) faces[deckId] = best;
          }
        }
      }

      setDecks(
        rows.map(row => ({
          id: row.id,
          name: row.name,
          format: row.format,
          colors: Array.isArray(row.colors) ? row.colors : [],
          // Staleness is decided against the list we just loaded, so a deck
          // edited since it was scored is reported as outdated rather than
          // rendered as current.
          power: deckPowerFromStored(
            (row.edh_analysis as { deckmatrix?: unknown } | null)?.deckmatrix,
            deckListHash(lists[row.id] ?? [])
          ),
          updatedAt: row.updated_at,
          cardCount: cardCounts[row.id] ?? 0,
          commanderName: commanders[row.id]?.name ?? null,
          commanderCardId: commanders[row.id]?.id ?? null,
          faceCardId: commanders[row.id]?.id ?? faces[row.id] ?? null,
          isFavorite: favoriteIds.has(row.id),
        }))
      );
    } catch (err) {
      console.error('Error fetching recent decks:', err);
      setError('Could not load your decks.');
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  const toggleFavorite = useCallback(
    async (deckId: string): Promise<boolean> => {
      if (!user) return false;

      const wasFavorite = decks.find(deck => deck.id === deckId)?.isFavorite ?? false;

      // Optimistic: the star is a direct-manipulation control, so it must not
      // wait on a round trip. Rolled back below if the write fails.
      setDecks(prev =>
        prev.map(deck => (deck.id === deckId ? { ...deck, isFavorite: !wasFavorite } : deck))
      );

      try {
        if (wasFavorite) {
          const { error: deleteError } = await supabase
            .from('favorite_decks')
            .delete()
            .eq('user_id', user.id)
            .eq('deck_id', deckId);
          if (deleteError) throw deleteError;
        } else {
          const { error: insertError } = await supabase
            .from('favorite_decks')
            .insert({ user_id: user.id, deck_id: deckId });
          if (insertError) throw insertError;
        }
        return !wasFavorite;
      } catch (err) {
        console.error('Error toggling favorite:', err);
        setDecks(prev =>
          prev.map(deck => (deck.id === deckId ? { ...deck, isFavorite: wasFavorite } : deck))
        );
        throw err;
      }
    },
    [user, decks]
  );

  useEffect(() => {
    setLoading(true);
    fetchDecks();
  }, [fetchDecks]);

  return { decks, loading, error, toggleFavorite, refetch: fetchDecks };
}
