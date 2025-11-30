import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
        .select('id, format, power_level')
        .eq('user_id', user.id);

      if (error) throw error;

      const totalDecks = data?.length || 0;
      const avgPowerLevel = data?.reduce((sum, deck) => sum + deck.power_level, 0) / (totalDecks || 1);
      const formatBreakdown = data?.reduce((acc, deck) => {
        acc[deck.format] = (acc[deck.format] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      return { totalDecks, avgPowerLevel, formatBreakdown };
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
