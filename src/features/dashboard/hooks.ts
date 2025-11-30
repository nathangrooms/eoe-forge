import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

export interface DashboardSummary {
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
  recent: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    at: string;
  }>;
  lastOpened: Array<{
    deckId: string;
    name: string;
    at: string;
  }>;
  buildQueue: {
    lastBuild: {
      deckName: string;
      power: number;
      timestamp: string;
    } | null;
    isBuilding: boolean;
  };
  status: {
    scryfallSyncAt: string | null;
    dbOk: boolean;
    apiOk: boolean;
  };
}

export function useDashboardSummary() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);

      // Fetch collection stats
      const { data: collectionData } = await supabase
        .from('user_collections')
        .select('quantity, foil, price_usd')
        .eq('user_id', user.id);

      // Calculate collection value and stats with null safety
      let collectionValue = 0;
      let totalCards = 0;
      const uniqueCards = collectionData?.length || 0;

      if (collectionData && Array.isArray(collectionData)) {
        collectionData.forEach(item => {
          if (!item) return;
          
          const price = typeof item.price_usd === 'number' && isFinite(item.price_usd) ? item.price_usd : 0;
          const quantity = typeof item.quantity === 'number' && isFinite(item.quantity) ? item.quantity : 0;
          const foil = typeof item.foil === 'number' && isFinite(item.foil) ? item.foil : 0;
          
          collectionValue += quantity * price;
          totalCards += quantity + foil;
        });
      }

      // Fetch wishlist data with card prices
      const { data: wishlistData } = await supabase
        .from('wishlist')
        .select(`
          quantity,
          card_id
        `)
        .eq('user_id', user.id);

      // Get unique card IDs for price lookup
      const cardIds = wishlistData?.map(item => item.card_id).filter(Boolean) || [];
      
      let wishlistCardPrices: Record<string, number> = {};
      if (cardIds.length > 0) {
        const { data: cardData } = await supabase
          .from('cards')
          .select('id, prices')
          .in('id', cardIds);
        
        cardData?.forEach(card => {
          try {
            const prices = typeof card.prices === 'string' ? JSON.parse(card.prices) : card.prices;
            if (prices && prices.usd) {
              wishlistCardPrices[card.id] = parseFloat(prices.usd);
            }
          } catch (e) {
            // Skip if prices can't be parsed
          }
        });
      }

      let wishlistValue = 0;
      let wishlistDesired = 0;
      
      if (wishlistData && Array.isArray(wishlistData)) {
        wishlistData.forEach(item => {
          if (!item || !item.card_id) return;
          
          const quantity = typeof item.quantity === 'number' && isFinite(item.quantity) ? item.quantity : 1;
          const price = typeof wishlistCardPrices[item.card_id] === 'number' && isFinite(wishlistCardPrices[item.card_id]) 
            ? wishlistCardPrices[item.card_id] 
            : 0;
          
          wishlistValue += price * quantity;
          wishlistDesired += quantity;
        });
      }

      // Fetch deck stats
      const { data: deckData } = await supabase
        .from('user_decks')
        .select('id')
        .eq('user_id', user.id);

      const { data: favoriteData } = await supabase
        .from('favorite_decks')
        .select('deck_id')
        .eq('user_id', user.id);

      // Fetch recent activity
      const { data: activityData } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const recentActivity = activityData?.map(activity => ({
        id: activity.id,
        type: activity.type,
        title: getActivityTitle(activity),
        subtitle: getActivitySubtitle(activity),
        at: activity.created_at
      })) || [];

      // Get last opened decks from localStorage
      const lastOpened = getLastOpenedDecks();

      // Fetch latest build log
      const { data: buildLogData } = await supabase
        .from('build_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Check system status
      const { data: syncStatus } = await supabase
        .from('sync_status')
        .select('last_sync')
        .eq('id', 'scryfall')
        .single();

      setData({
        collection: {
          totalValueUSD: collectionValue,
          totalCards,
          uniqueCards
        },
        wishlist: {
          totalItems: wishlistData?.length || 0,
          totalDesired: wishlistDesired,
          valueUSD: wishlistValue
        },
        decks: {
          count: deckData?.length || 0,
          favoritesCount: favoriteData?.length || 0
        },
        recent: recentActivity,
        lastOpened,
        buildQueue: {
          lastBuild: buildLogData ? {
            deckName: getDeckNameFromChanges(buildLogData.changes) || 'Unknown Deck',
            power: calculatePowerFromChanges(buildLogData.changes),
            timestamp: buildLogData.created_at
          } : null,
          isBuilding: false
        },
        status: {
          scryfallSyncAt: syncStatus?.last_sync || null,
          dbOk: true,
          apiOk: true
        }
      });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    
    fetchSummary();

    // Auto-refresh every 30 seconds when page is visible
    const interval = setInterval(() => {
      if (!document.hidden && mounted) {
        fetchSummary();
      }
    }, 30000);

    // Also refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && mounted) {
        fetchSummary();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  return { data, loading, error, refetch: fetchSummary };
}

export function useFavoriteDecks() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('favorite_decks')
        .select(`
          deck_id,
          user_decks!favorite_decks_deck_id_fkey (
            id,
            name,
            format,
            colors,
            power_level,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .limit(8);

      const formattedFavorites = await Promise.all(
        data?.map(async (fav) => {
          // Get commander art for the deck
          const { data: commanderCards } = await supabase
            .from('deck_cards')
            .select('card_id')
            .eq('deck_id', fav.deck_id)
            .eq('is_commander', true)
            .limit(1);

          let commanderArt = null;
          let commanderImage = null;
          if (commanderCards && commanderCards.length > 0) {
            const { data: cardData } = await supabase
              .from('cards')
              .select('image_uris')
              .eq('id', commanderCards[0].card_id)
              .single();
            
            try {
              const imageUris = typeof cardData?.image_uris === 'string'
                ? JSON.parse(cardData.image_uris)
                : cardData?.image_uris;
              commanderImage = imageUris?.normal || imageUris?.large || imageUris?.small || '/placeholder.svg';
              commanderArt = imageUris?.art_crop || '/placeholder.svg';
            } catch (e) {
              commanderArt = '/placeholder.svg';
              commanderImage = '/placeholder.svg';
            }
          }

          return {
            ...fav.user_decks,
            commanderArt,
            commanderImage
          };
        }).filter(Boolean) || []
      );

      setFavorites(formattedFavorites);
    } catch (error) {
      console.error('Error fetching favorite decks:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (deckId: string) => {
    if (!user) return;

    try {
      // Check if already favorited
      const { data: existing } = await supabase
        .from('favorite_decks')
        .select('deck_id')
        .eq('user_id', user.id)
        .eq('deck_id', deckId)
        .single();

      if (existing) {
        // Remove favorite
        await supabase
          .from('favorite_decks')
          .delete()
          .eq('user_id', user.id)
          .eq('deck_id', deckId);
      } else {
        // Add favorite
        await supabase
          .from('favorite_decks')
          .insert({ user_id: user.id, deck_id: deckId });

        // Log activity
        await logActivity('deck_favorited', 'deck', deckId);
      }

      // Refresh favorites
      fetchFavorites();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [user]);

  return { favorites, loading, toggleFavorite, refetch: fetchFavorites };
}

export async function logActivity(
  type: string, 
  entity: string, 
  entityId: string, 
  meta: any = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        type,
        entity,
        entity_id: entityId,
        meta
      });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

function getActivityTitle(activity: any): string {
  switch (activity.type) {
    case 'deck_created':
      return `Created "${activity.meta?.name || 'New Deck'}"`;
    case 'deck_updated':
      return `Updated "${activity.meta?.name || 'Deck'}"`;
    case 'deck_favorited':
      return `Favorited "${activity.meta?.name || 'Deck'}"`;
    case 'card_added':
      return `Added ${activity.meta?.count || 1} cards`;
    case 'collection_import':
      return `Imported ${activity.meta?.count || 0} cards`;
    case 'wishlist_added':
      return `Added to wishlist`;
    case 'listing_created':
      return `Listed card for sale`;
    case 'ai_build_run':
      return `AI build completed`;
    default:
      return 'Activity';
  }
}

function getActivitySubtitle(activity: any): string {
  switch (activity.type) {
    case 'deck_created':
    case 'deck_updated':
      return `${activity.meta?.format || 'Unknown'} • Power ${activity.meta?.power || 'N/A'}`;
    case 'card_added':
      return `To ${activity.meta?.target || 'collection'}`;
    case 'collection_import':
      return `From ${activity.meta?.source || 'file'}`;
    default:
      return activity.meta?.description || '';
  }
}

function getLastOpenedDecks(): Array<{ deckId: string; name: string; at: string }> {
  try {
    const stored = localStorage.getItem('lastOpenedDecks');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function trackDeckOpen(deckId: string, name: string) {
  try {
    const lastOpened = getLastOpenedDecks();
    const updated = [
      { deckId, name, at: new Date().toISOString() },
      ...lastOpened.filter(item => item.deckId !== deckId)
    ].slice(0, 5); // Keep only last 5

    localStorage.setItem('lastOpenedDecks', JSON.stringify(updated));
  } catch (error) {
    console.error('Error tracking deck open:', error);
  }
}

function getDeckNameFromChanges(changes: any): string {
  try {
    const parsedChanges = typeof changes === 'string' ? JSON.parse(changes) : changes;
    return parsedChanges?.deckName || parsedChanges?.name || 'AI Generated Deck';
  } catch {
    return 'AI Generated Deck';
  }
}

function calculatePowerFromChanges(changes: any): number {
  try {
    const parsedChanges = typeof changes === 'string' ? JSON.parse(changes) : changes;
    return parsedChanges?.powerLevel || parsedChanges?.power || 6.5;
  } catch {
    return 6.5;
  }
}