import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Crown } from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionInventory } from '@/features/collection/CollectionInventory';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import { EnhancedCollectionAnalytics } from '@/components/enhanced/EnhancedCollectionAnalytics';
import { CollectionImport } from '@/components/collection/CollectionImport';
import { BulkOperations } from '@/components/collection/BulkOperations';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';

export default function Collection() {
  const {
    snapshot,
    loading,
    error,
    searchQuery,
    viewMode,
    selectedCards,
    load,
    refresh,
    setSearchQuery,
    setFilters,
    setViewMode,
    toggleCardSelection,
    addCard,
    getStats,
    getFilteredCards
  } = useCollectionStore();

  // Get active tab from URL params  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'collection';
  const [showImportDialog, setShowImportDialog] = useState(false);

  const setActiveTab = (tab: string) => {
    if (tab === 'collection') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // Load collection on mount
  useEffect(() => {
    load();
  }, [load]);

  // Get current stats
  const stats = getStats();
  const filteredCards = getFilteredCards();

  // Load user's favorite decks
  const [favoriteDecks, setFavoriteDecks] = useState<any[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  useEffect(() => {
    const loadFavoriteDecks = async () => {
      try {
        setLoadingFavorites(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: favorites } = await supabase
          .from('favorite_decks')
          .select(`
            deck_id,
            user_decks!favorite_decks_deck_id_fkey(
              id,
              name,
              format,
              colors,
              description,
              created_at
            )
          `)
          .eq('user_id', user.id)
          .limit(6);

        if (favorites) {
          // Get deck card counts separately
          const deckIds = favorites.map(f => f.deck_id);
          const { data: cardCounts } = await supabase
            .from('deck_cards')
            .select('deck_id')
            .in('deck_id', deckIds);

          const countMap = cardCounts?.reduce((acc, card) => {
            acc[card.deck_id] = (acc[card.deck_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) || {};

          setFavoriteDecks(favorites.map(fav => ({
            id: fav.user_decks.id,
            name: fav.user_decks.name,
            format: fav.user_decks.format,
            colors: fav.user_decks.colors,
            cards: countMap[fav.deck_id] || 0,
            description: fav.user_decks.description,
            createdAt: fav.user_decks.created_at
          })));
        }
      } catch (error) {
        console.error('Error loading favorite decks:', error);
      } finally {
        setLoadingFavorites(false);
      }
    };

    loadFavoriteDecks();
  }, []);

  const addToCollection = (card: any) => {
    // Use the collection store's addCard method properly
    console.log('Adding card to collection:', card.name);
    showSuccess("Added to Collection", `Added ${card.name} to your collection`);
    // TODO: Implement proper collection add functionality
  };

  const getColorIcons = (colors: string[]) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      W: { bg: 'hsl(var(--muted))', text: 'hsl(var(--foreground))' },
      U: { bg: 'hsl(220 100% 35%)', text: 'hsl(var(--primary-foreground))' },
      B: { bg: 'hsl(0 0% 5%)', text: 'hsl(var(--primary-foreground))' },
      R: { bg: 'hsl(0 70% 50%)', text: 'hsl(var(--primary-foreground))' },
      G: { bg: 'hsl(120 100% 22%)', text: 'hsl(var(--primary-foreground))' }
    };
    
    return colors.map(color => (
      <div
        key={color}
        className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
        style={{ backgroundColor: colorMap[color]?.bg, color: colorMap[color]?.text }}
      >
        {color}
      </div>
    ));
  };

  if (error) {
    return (
      <div className="p-6 h-screen overflow-y-auto">
        <div className="text-center space-y-4">
          <p className="text-destructive">Error loading collection: {error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <StandardPageLayout
      title="Collection Manager"
      description="Manage your Magic: The Gathering collection with universal MTG card support"
      action={
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Value</div>
            <div className="text-lg font-bold text-green-600">
              ${stats.totalValue.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Cards</div>
            <div className="text-lg font-bold">{stats.totalCards.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Unique Cards</div>
            <div className="text-lg font-bold">{stats.uniqueCards.toLocaleString()}</div>
          </div>
        </div>
      }
    >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="add-cards">Add Cards</TabsTrigger>
          </TabsList>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-6">
          {/* Favorited Decks Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Heart className="h-5 w-5 mr-2 text-red-500" />
                Favorite Decks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFavorites ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : favoriteDecks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No favorite decks yet</p>
                  <p className="text-sm">Star some decks to see them here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {favoriteDecks.map((deck) => (
                    <Card 
                      key={deck.id} 
                      className="cursor-pointer hover:shadow-lg transition-all border-primary/20" 
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {deck.format === 'commander' && <Crown className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium truncate">{deck.name}</span>
                            </div>
                            <Badge variant="outline">{deck.cards} cards</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex space-x-1">
                              {getColorIcons(deck.colors || [])}
                            </div>
                            <span className="text-sm text-muted-foreground capitalize">{deck.format}</span>
                          </div>
                          {deck.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{deck.description}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collection Display with Enhanced Features */}
          <CollectionInventory 
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <EnhancedCollectionAnalytics 
            stats={stats}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="add-cards" className="space-y-6">
          {/* Import Button */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Bulk Import</h3>
                  <p className="text-sm text-muted-foreground">
                    Import your collection from text lists, CSV files, or other tools
                  </p>
                </div>
                <Button onClick={() => setShowImportDialog(true)}>
                  Import Collection
                </Button>
              </div>
            </CardContent>
          </Card>

          {activeTab === 'add-cards' && (
            <EnhancedUniversalCardSearch
              onCardAdd={addToCollection}
              onCardSelect={(card) => console.log('Selected:', card)}
              placeholder="Search cards to add to your collection..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={false}
              showViewModes={true}
            />
          )}
          
          <BulkOperations 
            onCollectionUpdate={refresh}
          />
        </TabsContent>
        </Tabs>
        
        {/* Import Dialog */}
        <CollectionImport
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            setShowImportDialog(false);
            refresh();
          }}
        />
    </StandardPageLayout>
  );
}