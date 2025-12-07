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
        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div>
                  {loadingStats ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <div className="text-xl font-bold">
                      {dbStats?.totalCards?.toLocaleString() || '0'}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Total Cards</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Layers className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  {loadingStats ? (
                    <Skeleton className="h-6 w-12" />
                  ) : (
                    <div className="text-xl font-bold">
                      {dbStats?.totalSets?.toLocaleString() || '0'}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Sets</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Clock className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  {loadingStats ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    <div className="text-sm font-medium">
                      {formatLastUpdated(dbStats?.lastUpdated || null)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Last Sync</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      Scryfall
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Data Source</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Tips */}
        <Card className="border-dashed border-muted-foreground/30 bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Search className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-foreground">Search Tips</p>
                <div className="text-muted-foreground grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                  <span><code className="text-xs bg-muted px-1 rounded">t:creature</code> — Find by type</span>
                  <span><code className="text-xs bg-muted px-1 rounded">c:blue</code> — Filter by color</span>
                  <span><code className="text-xs bg-muted px-1 rounded">cmc:3</code> — Mana value</span>
                  <span><code className="text-xs bg-muted px-1 rounded">o:draw</code> — Oracle text</span>
                  <span><code className="text-xs bg-muted px-1 rounded">set:neo</code> — Set code</span>
                  <span><code className="text-xs bg-muted px-1 rounded">r:mythic</code> — Rarity</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
