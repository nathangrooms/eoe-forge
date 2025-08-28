import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package,
  Heart,
  Crown
} from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionHeader } from '@/components/collection/CollectionHeader';
import { CardSearch } from '@/features/collection/CardSearch';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import { BulkOperations } from '@/components/collection/BulkOperations';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { showError } from '@/components/ui/toast-helpers';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

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
  const [activeFilters, setActiveFilters] = useState<Array<{type: string; value: string; label: string}>>([]);

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

  // Mock favorite decks
  const favoriteDecks = [
    { name: 'Spacecraft Control', cards: 60, colors: ['U', 'W'], format: 'Standard' },
    { name: 'Void Aggro', cards: 60, colors: ['B', 'R'], format: 'Standard' },
    { name: 'Station Commander', cards: 100, colors: ['U', 'G', 'W'], format: 'Commander' }
  ];

  const handleAddFilter = (filter: {type: string; value: string; label: string}) => {
    setActiveFilters(prev => [...prev, filter]);
    setFilters({ [filter.type]: filter.value });
  };

  const handleRemoveFilter = (filter: {type: string; value: string; label: string}) => {
    setActiveFilters(prev => prev.filter(f => f !== filter));
    setFilters({ [filter.type]: undefined });
  };

  const handleBulkAction = async (action: string) => {
    switch (action) {
      case 'import':
        // BulkOperations component handles this
        break;
      case 'export':
        // BulkOperations component handles this
        break;
      default:
        showError(`Action "${action}" not implemented yet`);
    }
  };

  const handleSearchWithFilters = () => {
    // Trigger search with current query and filters
    refresh();
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
    <div className="h-screen overflow-y-auto">
      <StandardSectionHeader
        title="Collection Manager"
        description="Manage your Magic: The Gathering collection with universal MTG card support"
        action={
          <div className="flex items-center space-x-4">
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
      />

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="collection">Collection</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="add-cards">Add Cards</TabsTrigger>
        </TabsList>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-6">
          {/* Collection Header with Search and Filters */}
          <CollectionHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            filters={activeFilters}
            onRemoveFilter={handleRemoveFilter}
            onBulkAction={handleBulkAction}
            onAddFilter={handleAddFilter}
            onSearchWithFilters={handleSearchWithFilters}
          />

          {/* Favorited Decks Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Heart className="h-5 w-5 mr-2 text-red-500" />
                Favorite Decks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {favoriteDecks.map((deck, index) => (
                  <Card 
                    key={index} 
                    className="cursor-pointer hover:shadow-lg transition-all border-primary/20" 
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {deck.format === 'Commander' && <Crown className="h-4 w-4 text-yellow-500" />}
                            <span className="font-medium">{deck.name}</span>
                          </div>
                          <Badge variant="outline">{deck.cards} cards</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex space-x-1">
                            {getColorIcons(deck.colors)}
                          </div>
                          <span className="text-sm text-muted-foreground">{deck.format}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Collection Display */}
          {loading ? (
            <CardGridSkeleton />
          ) : (
            <div className="space-y-4">
              {filteredCards.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">No cards found</h3>
                    <p className="text-muted-foreground">
                      {snapshot?.items.length === 0 
                        ? "Your collection is empty. Add some cards using the 'Add Cards' tab."
                        : "No cards match your current filters. Try adjusting your search criteria."
                      }
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className={viewMode === 'grid' 
                  ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
                  : "space-y-2"
                }>
                  {filteredCards.map((item) => (
                    <Card 
                      key={`${item.card_id}`} 
                      className="group hover:shadow-lg transition-all duration-200 cursor-pointer"
                      onClick={() => toggleCardSelection(item.card_id)}
                    >
                      <CardContent className="p-3">
                        {viewMode === 'grid' ? (
                          <div>
                            <div className="aspect-[5/7] bg-muted rounded mb-2 flex items-center justify-center overflow-hidden relative">
                              {item.card?.image_uris?.normal ? (
                                <img 
                                  src={item.card.image_uris.normal}
                                  alt={item.card.name}
                                  className="w-full h-full object-cover rounded"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="text-xs text-center p-2 text-muted-foreground">
                                  {item.card_name}
                                </div>
                              )}
                              {(item.quantity > 0 || item.foil > 0) && (
                                <Badge className="absolute top-1 right-1 text-xs">
                                  {item.quantity + item.foil}x
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium truncate">{item.card_name}</div>
                              <div className="text-xs text-muted-foreground">{item.set_code.toUpperCase()}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-3 p-2">
                            <div className="w-12 h-16 bg-muted rounded flex-shrink-0">
                              {item.card?.image_uris?.normal && (
                                <img 
                                  src={item.card.image_uris.normal}
                                  alt={item.card.name}
                                  className="w-full h-full object-cover rounded"
                                  loading="lazy"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.card_name}</div>
                              <div className="text-sm text-muted-foreground">{item.set_code.toUpperCase()}</div>
                              <div className="text-sm">
                                Regular: {item.quantity} | Foil: {item.foil}
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <CollectionAnalytics 
            stats={stats}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="add-cards" className="space-y-6">
          <CardSearch />
          
          <BulkOperations 
            onCollectionUpdate={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}