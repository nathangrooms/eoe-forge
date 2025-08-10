import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopNavigation } from '@/components/TopNavigation';
import { CollectionHeader } from '@/components/collection/CollectionHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCardSearch } from '@/hooks/useCardSearch';
import { CardPreview } from '@/components/deck-builder/CardPreview';
import { 
  Heart,
  Plus,
  TrendingUp,
  DollarSign,
  Star,
  Filter
} from 'lucide-react';

interface FilterChip {
  type: string;
  value: string;
  label: string;
}

export default function Cards() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'binder'>('grid');
  const [filters, setFilters] = useState<FilterChip[]>([]);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  // Build search filters from filter chips
  const searchFilters = {
    sets: filters.filter(f => f.type === 'set').map(f => f.value),
    types: filters.filter(f => f.type === 'type').map(f => f.value),
    colors: filters.filter(f => f.type === 'color').map(f => f.value),
    format: filters.find(f => f.type === 'format')?.value,
    rarity: filters.find(f => f.type === 'rarity')?.value,
    cmc: filters.find(f => f.type === 'cmc')?.value
  };

  const { cards, loading } = useCardSearch(searchQuery, searchFilters);

  const handleRemoveFilter = (filterToRemove: FilterChip) => {
    setFilters(prev => prev.filter(f => f !== filterToRemove));
  };

  const handleBulkAction = (action: string) => {
    console.log('Bulk action:', action, 'on', selectedCards.size, 'cards');
    // Implement bulk actions
  };

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const addToWishlist = (cardId: string) => {
    console.log('Add to wishlist:', cardId);
    // Implement wishlist functionality
  };

  const addToCollection = (cardId: string) => {
    console.log('Add to collection:', cardId);
    // Implement collection functionality
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation />
      
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* Collection Header */}
        <CollectionHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={filters}
          onRemoveFilter={handleRemoveFilter}
          onBulkAction={handleBulkAction}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex">
            {/* Main Card Grid/List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : cards.length > 0 ? (
                <div className={
                  viewMode === 'grid' 
                    ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
                    : viewMode === 'table'
                    ? "space-y-2"
                    : "grid grid-cols-3 md:grid-cols-9 gap-1" // Binder view
                }>
                  {cards.map((card) => (
                    <div key={card.id} className="relative group">
                      {viewMode === 'table' ? (
                        <Card className={`cursor-pointer transition-all ${selectedCards.has(card.id) ? 'ring-2 ring-primary' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center space-x-4">
                              <input
                                type="checkbox"
                                checked={selectedCards.has(card.id)}
                                onChange={() => toggleCardSelection(card.id)}
                                className="rounded"
                              />
                              
                              <div className="w-12 h-16 bg-muted rounded overflow-hidden">
                                {card.image_uris?.small && (
                                  <img 
                                    src={card.image_uris.small} 
                                    alt={card.name}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{card.name}</div>
                                <div className="text-sm text-muted-foreground">{card.type_line}</div>
                                <div className="flex items-center space-x-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {card.set?.toUpperCase()}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {card.rarity}
                                  </Badge>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="font-medium">${card.prices?.usd || 'N/A'}</div>
                                <div className="text-xs text-muted-foreground">CMC {card.cmc}</div>
                              </div>

                              <div className="flex space-x-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addToWishlist(card.id)}
                                >
                                  <Heart className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => addToCollection(card.id)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className={viewMode === 'binder' ? 'aspect-[5/7]' : ''}>
                          <CardPreview
                            card={card}
                            variant={viewMode === 'grid' ? 'grid' : 'grid'}
                            showAddButton={true}
                          />
                          
                          {/* Selection overlay for grid/binder */}
                          <div 
                            className={`absolute inset-0 bg-primary/20 border-2 border-primary rounded-lg transition-opacity ${
                              selectedCards.has(card.id) ? 'opacity-100' : 'opacity-0'
                            }`}
                            onClick={() => toggleCardSelection(card.id)}
                          >
                            <div className="absolute top-2 left-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                              <span className="text-primary-foreground text-xs">✓</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No cards found for "{searchQuery}"</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Enter a search term to find cards</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Supports Scryfall syntax like "t:creature cmc:3"
                  </p>
                </div>
              )}
            </div>

            {/* Card Inspector Drawer - Right Side */}
            <div className="w-80 border-l bg-background/95 hidden lg:block">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Card Inspector</h3>
                <p className="text-sm text-muted-foreground">Click a card to inspect</p>
              </div>
              
              <div className="p-4">
                <div className="text-center text-muted-foreground py-8">
                  Select a card to view details, market data, and synergies
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar for Selection Actions */}
        {selectedCards.size > 0 && (
          <div className="border-t bg-background/95 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedCards.size} card{selectedCards.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedCards(new Set())}>
                  Clear Selection
                </Button>
                <Button size="sm" onClick={() => handleBulkAction('add-to-collection')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Collection
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkAction('add-to-wishlist')}>
                  <Heart className="h-4 w-4 mr-2" />
                  Add to Wishlist
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}