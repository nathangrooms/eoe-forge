import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useCollectionStore } from '@/stores/collectionStore';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Database, 
  TrendingUp, 
  Layers, 
  Clock,
  Search,
  Sparkles
} from 'lucide-react';

export default function Cards() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const collection = useCollectionStore();
  const { user } = useAuth();
  const [dbStats, setDbStats] = useState<{
    totalCards: number;
    totalSets: number;
    lastUpdated: string | null;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Fetch database stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get card count
        const { count: cardCount } = await supabase
          .from('cards')
          .select('*', { count: 'exact', head: true });

        // Get unique sets count
        const { data: setsData } = await supabase
          .from('cards')
          .select('set_code')
          .limit(10000);
        
        const uniqueSets = new Set(setsData?.map(c => c.set_code) || []);

        // Get sync status - check both possible IDs for backwards compatibility
        const { data: syncData } = await supabase
          .from('sync_status')
          .select('last_sync')
          .eq('id', 'scryfall_cards')
          .maybeSingle();

        setDbStats({
          totalCards: cardCount || 0,
          totalSets: uniqueSets.size,
          lastUpdated: syncData?.last_sync || null
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  const addToCollection = async (card: any) => {
    if (!user) {
      showError('Authentication Required', 'Please sign in to add cards to your collection');
      return;
    }

    try {
      // Add to local store for immediate UI update
      collection.addCard({
        id: card.id || Math.random().toString(),
        name: card.name,
        setCode: card.set?.toUpperCase() || 'UNK',
        collectorNumber: card.collector_number || '1',
        quantity: 1,
        foil: 0,
        condition: 'near_mint',
        language: 'en',
        tags: [],
        cmc: card.cmc || 0,
        type_line: card.type_line || '',
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        oracle_text: card.oracle_text || '',
        power: card.power,
        toughness: card.toughness,
        keywords: card.keywords || [],
        mechanics: card.mechanics || [],
        rarity: card.rarity || 'common',
        priceUsd: parseFloat(card.prices?.usd || '0'),
        priceFoilUsd: parseFloat(card.prices?.usd_foil || '0'),
        synergyScore: 0.5,
        synergyTags: [],
        archetype: []
      });

      // Persist to database
      const { data: existing } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        // Update quantity if already exists
        await supabase
          .from('user_collections')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
      } else {
        // Add new card
        await supabase
          .from('user_collections')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            set_code: card.set?.toUpperCase() || 'UNK',
            quantity: 1,
            condition: 'near_mint'
          });
      }

      showSuccess("Added to Collection", `Added ${card.name} to your collection`);
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Failed to add card', 'Please try again');
    }
  };

  const addToWishlist = async (card: any) => {
    if (!user) {
      showError('Authentication Required', 'Please sign in to add cards to your wishlist');
      return;
    }

    try {
      // Check if card already exists in wishlist
      const { data: existing } = await supabase
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        // Update quantity if already exists
        const { error } = await supabase
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);

        if (error) throw error;
        showSuccess('Updated Wishlist', `Increased quantity of ${card.name}`);
      } else {
        // Add new item
        const { error } = await supabase
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium'
          });

        if (error) throw error;
        showSuccess('Added to Wishlist', `${card.name} added to your wishlist`);
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist', 'Please try again');
    }
  };

  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <StandardPageLayout
      title="Card Database"
      description="Search through every Magic: The Gathering card ever printed"
    >
      <div className="space-y-6">

        {/* Unified Search Component */}
        <EnhancedUniversalCardSearch
          onCardAdd={addToCollection}
          onCardSelect={(card) => console.log('Selected:', card)}
          onCardWishlist={addToWishlist}
          placeholder="Search by name, type, text, or use Scryfall syntax..."
          showFilters={true}
          showAddButton={true}
          showWishlistButton={true}
          showViewModes={true}
          showPresets={true}
          initialQuery={initialQuery}
        />
      </div>
    </StandardPageLayout>
  );
}
