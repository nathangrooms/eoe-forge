import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

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
        supabase.from('user_collections').select('quantity, foil, price_usd').eq('user_id', user.id),
        supabase.from('wishlist').select('quantity, card_id').eq('user_id', user.id),
        supabase.from('user_decks').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('favorite_decks').select('deck_id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      let collectionValue = 0;
      let totalCards = 0;
      for (const row of collectionRows ?? []) {
        if (!row) continue;
        const quantity = num(row.quantity);
        const foil = num(row.foil);
        // price_usd is the non-foil price, so foils are counted in the card
        // total but not in the valuation — same rule the collection page uses.
        collectionValue += quantity * num(row.price_usd);
        totalCards += quantity + foil;
      }

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

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  colors: string[];
  powerLevel: number;
  updatedAt: string;
  cardCount: number;
  commanderName: string | null;
  /**
   * The exact printing chosen for the commander. Carried alongside the name so
   * the dashboard can show *that* printing's art rather than whichever reprint a
   * name lookup happens to land on.
   */
  commanderCardId: string | null;
  isFavorite: boolean;
}

interface DeckRow {
  id: string;
  name: string;
  format: string;
  colors: string[] | null;
  power_level: number | null;
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
          .select('id, name, format, colors, power_level, updated_at')
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

      if (rows.length > 0) {
        const { data: cardRows } = await supabase
          .from('deck_cards')
          .select('deck_id, quantity, is_commander, is_sideboard, card_name, card_id')
          .in('deck_id', rows.map(row => row.id));

        for (const card of cardRows ?? []) {
          if (!card.is_sideboard) {
            cardCounts[card.deck_id] = (cardCounts[card.deck_id] ?? 0) + num(card.quantity, 1);
          }
          if (card.is_commander && !commanders[card.deck_id]) {
            commanders[card.deck_id] = { id: card.card_id ?? null, name: card.card_name };
          }
        }
      }

      setDecks(
        rows.map(row => ({
          id: row.id,
          name: row.name,
          format: row.format,
          colors: Array.isArray(row.colors) ? row.colors : [],
          powerLevel: num(row.power_level),
          updatedAt: row.updated_at,
          cardCount: cardCounts[row.id] ?? 0,
          commanderName: commanders[row.id]?.name ?? null,
          commanderCardId: commanders[row.id]?.id ?? null,
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
