import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CollectionHeader } from '@/components/collection/CollectionHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCardSearch } from '@/hooks/useCardSearch';
import { CardPreview } from '@/components/deck-builder/CardPreview';
import { useCollectionStore } from '@/stores/collectionStore';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { 
  Heart,
  Plus,
  TrendingUp,
  DollarSign,
  Star,
  Filter,
  Eye,
  Bookmark,
  BarChart3,
  Shield
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

  const handleAddFilter = (filter: FilterChip) => {
    setFilters(prev => [...prev.filter(f => f.type !== filter.type || f.value !== filter.value), filter]);
  };

  const handleSearchWithFilters = () => {
    // Trigger search with current query and filters - this will automatically update via useCardSearch
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

  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardInspector, setShowCardInspector] = useState(false);
  const collection = useCollectionStore();

  const addToWishlist = (cardId: string) => {
    showSuccess("Added to Wishlist", "Card added to your wishlist");
    // Implement wishlist functionality
  };

  const addToCollection = (card: any) => {
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
    showSuccess("Added to Collection", `Added ${card.name} to your collection`);
  };

  const inspectCard = (card: any) => {
    setSelectedCard(card);
    setShowCardInspector(true);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="p-6 border-b">
        <StandardSectionHeader
          title="Card Database"
          description="Search through every Magic: The Gathering card ever printed"
        />
      </div>
      
      {/* Collection Header */}
      <CollectionHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={filters}
          onRemoveFilter={handleRemoveFilter}
          onAddFilter={handleAddFilter}
          onSearchWithFilters={handleSearchWithFilters}
          onBulkAction={handleBulkAction}
        />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Main Card Grid/List */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <SearchResultsSkeleton />
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
                        <Card className={`cursor-pointer transition-all hover:bg-accent/20 ${selectedCards.has(card.id) ? 'ring-2 ring-primary' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center space-x-4">
                              <input
                                type="checkbox"
                                checked={selectedCards.has(card.id)}
                                onChange={() => toggleCardSelection(card.id)}
                                className="rounded"
                              />
                              
                              <div className="w-12 h-16 bg-muted rounded overflow-hidden cursor-pointer"
                                   onClick={() => inspectCard(card)}>
                                {card.image_uris?.small && (
                                  <img 
                                    src={card.image_uris.small} 
                                    alt={card.name}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate hover:text-primary cursor-pointer"
                                     onClick={() => inspectCard(card)}>{card.name}</div>
                                <div className="text-sm text-muted-foreground">{card.type_line}</div>
                                <div className="flex items-center space-x-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {card.set?.toUpperCase()}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs capitalize">
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
                                  onClick={() => inspectCard(card)}
                                  title="Inspect Card"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addToWishlist(card.id)}
                                  title="Add to Wishlist"
                                >
                                  <Heart className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => addToCollection(card)}
                                  title="Add to Collection"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className={viewMode === 'binder' ? 'aspect-[5/7] relative' : 'relative'}>
                          <div onClick={() => inspectCard(card)}>
                            <CardPreview
                              card={card}
                              variant={viewMode === 'grid' ? 'grid' : 'grid'}
                              showAddButton={false}
                            />
                          </div>
                          
                          {/* Hover actions overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                inspectCard(card);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCollection(card);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToWishlist(card.id);
                              }}
                            >
                              <Heart className="h-4 w-4" />
                            </Button>
                          </div>
                          
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
              {selectedCard ? (
                <div className="space-y-4">
                  <div className="aspect-[5/7] overflow-hidden rounded-lg">
                    {selectedCard.image_uris?.normal && (
                      <img 
                        src={selectedCard.image_uris.normal} 
                        alt={selectedCard.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">{selectedCard.name}</h4>
                    <p className="text-sm text-muted-foreground">{selectedCard.type_line}</p>
                    {selectedCard.oracle_text && (
                      <p className="text-sm">{selectedCard.oracle_text}</p>
                    )}
                    {selectedCard.prices?.usd && (
                      <div className="flex justify-between text-sm">
                        <span>Price:</span>
                        <span className="font-medium">${selectedCard.prices.usd}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button size="sm" onClick={() => addToCollection(selectedCard)} className="flex-1">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addToWishlist(selectedCard.id)}>
                      <Heart className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Select a card to view details, market data, and synergies
                </div>
              )}
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

      {/* Card Inspector Modal for Mobile */}
      <Dialog open={showCardInspector} onOpenChange={setShowCardInspector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCard?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedCard && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="prints">Prints</TabsTrigger>
                <TabsTrigger value="market">Market</TabsTrigger>
                <TabsTrigger value="synergy">Synergy</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-[5/7] overflow-hidden rounded-lg">
                    {selectedCard.image_uris?.normal && (
                      <img 
                        src={selectedCard.image_uris.normal} 
                        alt={selectedCard.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-lg">{selectedCard.name}</h4>
                      <p className="text-sm text-muted-foreground">{selectedCard.type_line}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {selectedCard.set?.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {selectedCard.rarity}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          CMC {selectedCard.cmc}
                        </Badge>
                      </div>
                    </div>
                    
                    {selectedCard.oracle_text && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm whitespace-pre-line">{selectedCard.oracle_text}</p>
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <Button onClick={() => addToCollection(selectedCard)} className="flex-1">
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Collection
                      </Button>
                      <Button variant="outline" onClick={() => addToWishlist(selectedCard.id)}>
                        <Heart className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="prints" className="space-y-4">
                <div className="text-center text-muted-foreground py-8">
                  <Bookmark className="h-8 w-8 mx-auto mb-2" />
                  Different printings and versions
                </div>
              </TabsContent>
              
              <TabsContent value="market" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Market Price</span>
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold">${selectedCard.prices?.usd || 'N/A'}</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Foil Price</span>
                      <Star className="h-4 w-4 text-yellow-500" />
                    </div>
                    <div className="text-2xl font-bold">${selectedCard.prices?.usd_foil || 'N/A'}</div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="synergy" className="space-y-4">
                <div className="text-center text-muted-foreground py-8">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2" />
                  Synergy analysis and deck suggestions
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}