import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search,
  Plus,
  Eye,
  Image,
  Filter,
  DollarSign,
  Star,
  Heart,
  ShoppingCart,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card as CardType } from '@/types/collection';
import { formatPrice } from '@/features/collection/value';
import { useCollectionStore } from '@/features/collection/store';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface EnhancedCardSearchProps {
  onCardSelect?: (card: CardType) => void;
}

export function EnhancedCardSearch({ onCardSelect }: EnhancedCardSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<CardType[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({
    color: '',
    type: '',
    rarity: '',
    format: '',
    priceMin: '',
    priceMax: '',
    cmcMin: '',
    cmcMax: ''
  });
  
  const addCard = useCollectionStore(state => state.addCard);
  
  // Transform database card to CardType
  const transformDbCard = (dbCard: any): CardType => ({
    id: dbCard.id,
    oracle_id: dbCard.oracle_id,
    name: dbCard.name,
    set_code: dbCard.set_code,
    collector_number: dbCard.collector_number,
    colors: dbCard.colors || [],
    color_identity: dbCard.color_identity || [],
    cmc: Number(dbCard.cmc) || 0,
    type_line: dbCard.type_line || '',
    oracle_text: dbCard.oracle_text,
    keywords: dbCard.keywords || [],
    legalities: (dbCard.legalities || {}) as Record<string, "legal"|"not_legal"|"restricted"|"banned">,
    image_uris: (dbCard.image_uris || {}) as CardType['image_uris'],
    is_legendary: dbCard.is_legendary || false,
    prices: (dbCard.prices || {}) as CardType['prices'],
    rarity: (dbCard.rarity || 'common') as CardType['rarity']
  });

  // Advanced search with filters
  const searchCards = async (query: string, page: number = 1) => {
    setIsLoading(true);
    try {
      let dbQuery = supabase
        .from('cards')
        .select('*');

      // Apply text search
      if (query.trim()) {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,oracle_text.ilike.%${query}%,type_line.ilike.%${query}%`);
      }

      // Apply filters
      if (filters.color) {
        dbQuery = dbQuery.contains('colors', [filters.color]);
      }
      
      if (filters.type) {
        dbQuery = dbQuery.ilike('type_line', `%${filters.type}%`);
      }
      
      if (filters.rarity) {
        dbQuery = dbQuery.eq('rarity', filters.rarity);
      }
      
      if (filters.format) {
        dbQuery = dbQuery.contains('legalities', { [filters.format]: 'legal' });
      }
      
      if (filters.cmcMin) {
        dbQuery = dbQuery.gte('cmc', parseInt(filters.cmcMin));
      }
      
      if (filters.cmcMax) {
        dbQuery = dbQuery.lte('cmc', parseInt(filters.cmcMax));
      }

      // Pagination
      const pageSize = 24;
      dbQuery = dbQuery
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order('name');

      const { data: cards, error } = await dbQuery;

      if (error) throw error;

      const transformedCards = (cards || []).map(transformDbCard);
      
      if (page === 1) {
        setSearchResults(transformedCards);
      } else {
        setSearchResults(prev => [...prev, ...transformedCards]);
      }
      
      setHasMore((cards || []).length === pageSize);
      setCurrentPage(page);
    } catch (error) {
      console.error('Search error:', error);
      showError('Search failed', 'Unable to search for cards');
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCards(searchQuery, 1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, filters]);

  const handleAddCard = async (card: CardType, quantity: number = 1) => {
    try {
      const success = await addCard(card.id, quantity, 0);
      if (success) {
        showSuccess('Card Added', `${card.name} added to your collection`);
      }
    } catch (error) {
      showError('Failed to add card', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading) {
      searchCards(searchQuery, currentPage + 1);
    }
  };

  const clearFilters = () => {
    setFilters({
      color: '',
      type: '',
      rarity: '',
      format: '',
      priceMin: '',
      priceMax: '',
      cmcMin: '',
      cmcMax: ''
    });
  };

  return (
    <div className="space-y-6">
      {/* Advanced Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Advanced Card Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search cards by name, text, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Quick Search Suggestions */}
          <div className="flex flex-wrap gap-2">
            {[
              'Lightning Bolt',
              'counterspell',
              'planeswalker',
              'legendary creature',
              'enters the battlefield'
            ].map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery(suggestion)}
                className="text-xs"
              >
                {suggestion}
              </Button>
            ))}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Select value={filters.color || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, color: value === "all" ? "" : value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Color</SelectItem>
                <SelectItem value="W">White</SelectItem>
                <SelectItem value="U">Blue</SelectItem>
                <SelectItem value="B">Black</SelectItem>
                <SelectItem value="R">Red</SelectItem>
                <SelectItem value="G">Green</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.type || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value === "all" ? "" : value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Type</SelectItem>
                <SelectItem value="Creature">Creature</SelectItem>
                <SelectItem value="Instant">Instant</SelectItem>
                <SelectItem value="Sorcery">Sorcery</SelectItem>
                <SelectItem value="Artifact">Artifact</SelectItem>
                <SelectItem value="Enchantment">Enchantment</SelectItem>
                <SelectItem value="Planeswalker">Planeswalker</SelectItem>
                <SelectItem value="Land">Land</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.rarity || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, rarity: value === "all" ? "" : value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Rarity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Rarity</SelectItem>
                <SelectItem value="common">Common</SelectItem>
                <SelectItem value="uncommon">Uncommon</SelectItem>
                <SelectItem value="rare">Rare</SelectItem>
                <SelectItem value="mythic">Mythic</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.format || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, format: value === "all" ? "" : value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Format</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="commander">Commander</SelectItem>
                <SelectItem value="pioneer">Pioneer</SelectItem>
                <SelectItem value="vintage">Vintage</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Min CMC"
              value={filters.cmcMin}
              onChange={(e) => setFilters(prev => ({ ...prev, cmcMin: e.target.value }))}
              type="number"
            />

            <Input
              placeholder="Max CMC"
              value={filters.cmcMax}
              onChange={(e) => setFilters(prev => ({ ...prev, cmcMax: e.target.value }))}
              type="number"
            />
          </div>

          {/* Filter Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground">
              {searchResults.length > 0 && `${searchResults.length} cards found`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      <div className="space-y-4">
        {isLoading && currentPage === 1 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[5/7] w-full" />
                <CardContent className="p-3">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-3 w-2/3 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && searchResults.length === 0 && (searchQuery || Object.values(filters).some(f => f)) && (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No cards found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search criteria or filters
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && searchResults.length === 0 && !searchQuery && !Object.values(filters).some(f => f) && (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Search for Magic cards</h3>
              <p className="text-muted-foreground">
                Use the search box and filters above to find cards
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && searchResults.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {searchResults.map((card) => (
                <Card key={card.id} className="group hover:shadow-lg transition-all duration-200 overflow-hidden">
                  <div className="aspect-[5/7] bg-muted relative overflow-hidden">
                    {card.image_uris?.normal ? (
                      <img 
                        src={card.image_uris.normal}
                        alt={card.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-center p-2 text-muted-foreground bg-muted">
                        <div>
                          <Image className="h-8 w-8 mx-auto mb-2" />
                          <p className="font-medium">{card.name}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Price overlay */}
                    {card.prices?.usd && (
                      <div className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                        ${formatPrice(parseFloat(card.prices.usd))}
                      </div>
                    )}
                    
                    {/* Rarity gem */}
                    <div className={`absolute top-2 left-2 w-3 h-3 rounded-full ${
                      card.rarity === 'mythic' ? 'bg-orange-500' :
                      card.rarity === 'rare' ? 'bg-yellow-500' :
                      card.rarity === 'uncommon' ? 'bg-gray-400' : 'bg-gray-600'
                    }`} />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center space-x-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddCard(card, 1);
                        }}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCardSelect?.(card);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div className="text-sm font-medium truncate">{card.name}</div>
                      <div className="text-xs text-muted-foreground">{card.set_code.toUpperCase()}</div>
                      <div className="text-xs line-clamp-2">{card.type_line}</div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex space-x-1">
                          {card.colors.map(color => (
                            <div
                              key={color}
                              className={`w-3 h-3 rounded-full text-xs font-bold flex items-center justify-center ${
                                color === 'W' ? 'bg-yellow-100 text-black' :
                                color === 'U' ? 'bg-blue-500 text-white' :
                                color === 'B' ? 'bg-gray-900 text-white' :
                                color === 'R' ? 'bg-red-500 text-white' :
                                color === 'G' ? 'bg-green-600 text-white' : 'bg-gray-400'
                              }`}
                            >
                              {color}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs font-medium">
                          {card.cmc} CMC
                        </div>
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          onClick={() => handleAddCard(card, 1)}
                          className="flex-1 text-xs h-7"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add 1x
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddCard(card, 4)}
                          className="text-xs h-7"
                        >
                          4x
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="text-center pt-4">
                <Button 
                  variant="outline" 
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Load More Cards'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}