import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search,
  Plus,
  Minus,
  DollarSign,
  Star,
  Eye,
  Image
} from 'lucide-react';
import { Card as CardType } from '@/types/collection';
import { useCardSearch } from '@/hooks/useCardSearch';

// Transform hook card to our CardType
const transformCard = (card: any): CardType => ({
  id: card.id,
  oracle_id: card.oracle_id || card.id,
  name: card.name,
  set_code: card.set || 'UNK',
  collector_number: card.collector_number,
  colors: card.colors || [],
  color_identity: card.color_identity || [],
  cmc: card.cmc || 0,
  type_line: card.type_line || '',
  oracle_text: card.oracle_text,
  keywords: card.keywords || [],
  legalities: card.legalities || {},
  image_uris: card.image_uris,
  is_legendary: card.type_line?.includes('Legendary') || false,
  prices: card.prices,
  rarity: (card.rarity || 'common') as CardType['rarity']
});
import { formatPrice } from '@/features/collection/value';
import { useCollectionStore } from '@/features/collection/store';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface CardSearchProps {
  onCardSelect?: (card: CardType) => void;
}

export function CardSearch({ onCardSelect }: CardSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<CardType[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const addCard = useCollectionStore(state => state.addCard);
  
  const { cards, loading } = useCardSearch(searchQuery, selectedFilters);

  const handleAddCard = async (card: any, quantity = 1) => {
    const transformedCard = transformCard(card);
    const success = await addCard(transformedCard.id, quantity);
    if (success) {
      showSuccess('Card Added', `Added ${quantity}x ${transformedCard.name} to collection`);
    } else {
      showError('Failed to Add', 'Could not add card to collection');
    }
  };

  const handleCardClick = (card: any) => {
    if (onCardSelect) {
      onCardSelect(transformCard(card));
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Search Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for cards... (e.g., Lightning Bolt, t:instant, cmc=3)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Quick Search Examples */}
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Lightning Bolt',
              't:creature',
              'c:red',
              'cmc=3',
              'pow>=4',
              'o:draw'
            ].map((example) => (
              <Button
                key={example}
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery(example)}
                className="text-xs"
              >
                {example}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      <div className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(12)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : cards.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {cards.length} cards
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cards.map((card) => (
                <Card 
                  key={card.id} 
                  className="group hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
                  onClick={() => handleCardClick(card)}
                >
                  <CardContent className="p-0">
                    {/* Card Image */}
                    <div className="aspect-[5/7] bg-muted relative overflow-hidden">
                      {card.image_uris?.normal ? (
                        <img
                          src={card.image_uris.normal}
                          alt={card.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = 'none';
                            img.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      
                      {/* Fallback for missing images */}
                      <div className={`absolute inset-0 flex items-center justify-center bg-muted ${card.image_uris?.normal ? 'hidden' : ''}`}>
                        <div className="text-center p-4">
                          <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-xs font-medium text-center">{card.name}</p>
                          <p className="text-xs text-muted-foreground">{(card.set || 'UNK').toUpperCase()}</p>
                        </div>
                      </div>

                      {/* Overlay Actions */}
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
                            handleCardClick(card);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Rarity Indicator */}
                      <div className="absolute top-2 right-2">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            card.rarity === 'mythic' ? 'bg-orange-500/20 text-orange-600 border-orange-500' :
                            card.rarity === 'rare' ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500' :
                            card.rarity === 'uncommon' ? 'bg-gray-400/20 text-gray-600 border-gray-400' :
                            'bg-gray-300/20 text-gray-500 border-gray-300'
                          }`}
                        >
                          {card.rarity.charAt(0).toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {/* Card Info */}
                    <div className="p-3 space-y-2">
                      <div>
                        <h3 className="font-medium text-sm leading-tight line-clamp-2">{card.name}</h3>
                        <p className="text-xs text-muted-foreground">{(card.set || 'UNK').toUpperCase()}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1">
                          {/* Mana Cost */}
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {card.cmc} CMC
                          </span>
                        </div>

                        {/* Price */}
                        <div className="flex items-center space-x-1 text-xs">
                          {card.prices?.usd && (
                            <div className="flex items-center text-green-600">
                              <DollarSign className="h-3 w-3" />
                              <span>{formatPrice(parseFloat(card.prices.usd))}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Type Line */}
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {card.type_line}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : searchQuery ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">No cards found</p>
              <p className="text-muted-foreground">
                Try adjusting your search or use different keywords
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">Search for cards</p>
              <p className="text-muted-foreground">
                Use the search box above to find Magic cards
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}