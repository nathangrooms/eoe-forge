import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deckPowerFromStored } from '@/lib/deck/power';
import { usesPowerLevel } from '@/lib/deck/formats';

const CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export function useDashboardCache<T>(
  key: string[],
  fetchFn: () => Promise<T>,
  options?: {
    cacheTime?: number;
    staleTime?: number;
  }
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: key,
    queryFn: fetchFn,
    gcTime: options?.cacheTime ?? CACHE_TIME,
    staleTime: options?.staleTime ?? STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
  };

  const refetch = () => {
    return queryClient.refetchQueries({ queryKey: key });
  };

  return {
    ...query,
    invalidate,
    refetch
  };
}

// Specific dashboard data hooks with caching
export function useCachedCollectionStats() {
  return useDashboardCache(
    ['dashboard', 'collection-stats'],
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_collections')
        .select('quantity, foil, price_usd')
        .eq('user_id', user.id);

      if (error) throw error;

      const totalCards = data?.reduce((sum, item) => sum + item.quantity + item.foil, 0) || 0;
      const totalValue = data?.reduce((sum, item) => 
        sum + ((item.price_usd || 0) * (item.quantity + item.foil)), 0
      ) || 0;
      const uniqueCards = data?.length || 0;

      return { totalCards, totalValue, uniqueCards };
    }
  );
}

export function useCachedDeckStats() {
  return useDashboardCache(
    ['dashboard', 'deck-stats'],
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_decks')
        .select('id, format, edh_analysis')
        .eq('user_id', user.id);

      if (error) throw error;

      const totalDecks = data?.length || 0;

      /*
       * Averaged over scored Commander decks only.
       *
       * This used to average the raw `power_level` column across *every* deck
       * including Standard and Modern — formats that have no power level — so
       * the dashboard and the /decks header reported different averages for the
       * same collection. Both now average the canonical score over the same
       * population: decks whose format uses a power level and that have one.
       */
      const scored = (data ?? [])
        .filter(deck => usesPowerLevel(deck.format))
        .map(deck =>
          deckPowerFromStored(
            (deck.edh_analysis as { deckmatrix?: unknown } | null)?.deckmatrix,
            null
          )
        )
        .filter((power): power is NonNullable<typeof power> => power !== null);

      const avgPowerLevel =
        scored.length > 0
          ? scored.reduce((sum, power) => sum + power.score, 0) / scored.length
          : null;

      const formatBreakdown = data?.reduce((acc, deck) => {
        acc[deck.format] = (acc[deck.format] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      return { totalDecks, avgPowerLevel, scoredDecks: scored.length, formatBreakdown };
    }
  );
}

export function useCachedRecentActivity() {
  return useDashboardCache(
    ['dashboard', 'recent-activity'],
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    { staleTime: 30 * 1000 } // More frequent updates for activity
  );
}
