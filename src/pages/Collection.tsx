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
import { EnhancedCardSearch } from '@/features/collection/EnhancedCardSearch';
import { CollectionInventory } from '@/features/collection/CollectionInventory';
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

          {/* Collection Display with Enhanced Features */}
          <CollectionInventory 
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <CollectionAnalytics 
            stats={stats}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="add-cards" className="space-y-6">
          <EnhancedCardSearch />
          
          <BulkOperations 
            onCollectionUpdate={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}