import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ArrowRight, X, Heart, ShoppingCart } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { showSuccess } from '@/components/ui/toast-helpers';

interface CardReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardToReplace?: any;
}

export function CardReplacementModal({ isOpen, onClose, cardToReplace }: CardReplacementModalProps) {
  const { addCard, removeCard } = useDeckStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReplacement, setSelectedReplacement] = useState<any>(null);
  const [addToWishlist, setAddToWishlist] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedReplacement(null);
      setAddToWishlist(false);
    }
  }, [isOpen]);

  const searchCards = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec`
      );
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching cards:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery) {
        searchCards(searchQuery);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleReplace = async () => {
    if (!selectedReplacement || !cardToReplace) return;

    const originalQuantity = cardToReplace.quantity || 1;
    const originalCategory = cardToReplace.category || 'other';
    
    // Determine the category for the new card based on type line
    const getCategory = (typeLine: string): string => {
      const lower = typeLine?.toLowerCase() || '';
      if (lower.includes('creature')) return 'creatures';
      if (lower.includes('instant')) return 'instants';
      if (lower.includes('sorcery')) return 'sorceries';
      if (lower.includes('artifact')) return 'artifacts';
      if (lower.includes('enchantment')) return 'enchantments';
      if (lower.includes('planeswalker')) return 'planeswalkers';
      if (lower.includes('land')) return 'lands';
      return 'other';
    };
    
    const newCategory = getCategory(selectedReplacement.type_line);
    
    // Get fresh state and perform operations
    const deckState = useDeckStore.getState();
    
    // Remove all copies of the old card
    deckState.updateCardQuantity(cardToReplace.id, 0);

    // Add new card with the same quantity as the original
    const newCard = {
      id: selectedReplacement.id,
      name: selectedReplacement.name,
      cmc: selectedReplacement.cmc || 0,
      type_line: selectedReplacement.type_line || '',
      colors: selectedReplacement.color_identity || selectedReplacement.colors || [],
      color_identity: selectedReplacement.color_identity || [],
      mana_cost: selectedReplacement.mana_cost,
      quantity: originalQuantity,
      category: newCategory as any,
      mechanics: selectedReplacement.keywords || [],
      image_uris: selectedReplacement.image_uris,
      prices: selectedReplacement.prices,
      oracle_text: selectedReplacement.oracle_text,
      keywords: selectedReplacement.keywords || [],
      set: selectedReplacement.set,
      rarity: selectedReplacement.rarity
    };

    console.log('Replacing card:', cardToReplace.name, 'with', newCard.name, 'quantity:', originalQuantity);
    
    deckState.addCard(newCard);
    
    // Trigger immediate save to database
    if (deckState.currentDeckId) {
      console.log('Triggering save after replacement');
      setTimeout(() => {
        useDeckStore.getState().updateDeck(deckState.currentDeckId!);
      }, 100);
    }

    // Add to wishlist if requested
    if (addToWishlist) {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          await supabase
            .from('wishlist')
            .insert({
              user_id: user.id,
              card_id: selectedReplacement.id,
              card_name: selectedReplacement.name,
              priority: 'high',
              note: `Replacement for ${cardToReplace.name}`,
              quantity: originalQuantity
            });
        }
      } catch (error) {
        console.error('Error adding to wishlist:', error);
      }
    }

    showSuccess('Card Replaced', `${cardToReplace.name} replaced with ${selectedReplacement.name}`);
    onClose();
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-400',
      U: 'bg-blue-400',
      B: 'bg-gray-800',
      R: 'bg-red-400',
      G: 'bg-green-400'
    };
    
    return (
      <div className="flex gap-1">
        {colors.map(color => (
          <div 
            key={color}
            className={`w-3 h-3 rounded-full ${colorMap[color] || 'bg-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Replace Card
          </DialogTitle>
        </DialogHeader>

        {/* Cards Side by Side */}
        <div className="flex gap-6 mb-6">
          {/* Original Card */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Current Card</h3>
            {cardToReplace && (
              <Card className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {cardToReplace.image_uris?.normal && (
                      <img 
                        src={cardToReplace.image_uris.normal} 
                        alt={cardToReplace.name}
                        className="w-20 h-auto rounded border"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{cardToReplace.name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{cardToReplace.type_line}</p>
                      <div className="flex items-center gap-2 mb-2">
                        {cardToReplace.mana_cost && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {cardToReplace.mana_cost}
                          </Badge>
                        )}
                        <Badge variant="secondary">CMC {cardToReplace.cmc}</Badge>
                        {getColorIndicator(cardToReplace.colors)}
                      </div>
                      {cardToReplace.prices?.usd && (
                        <p className="text-sm text-green-600">${cardToReplace.prices.usd}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Transfer Animation */}
          <div className="flex items-center justify-center min-w-[100px]">
            <div className="relative">
              <ArrowRight className={`h-8 w-8 ${selectedReplacement ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
              {selectedReplacement && (
                <div className="absolute -top-2 -right-2">
                  <div className="h-4 w-4 bg-primary rounded-full animate-ping" />
                  <div className="absolute inset-0 h-4 w-4 bg-primary rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* Replacement Card */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Replacement Card</h3>
            {selectedReplacement ? (
              <Card className="relative overflow-hidden border-primary">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {selectedReplacement.image_uris?.normal && (
                      <img 
                        src={selectedReplacement.image_uris.normal} 
                        alt={selectedReplacement.name}
                        className="w-20 h-auto rounded border"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{selectedReplacement.name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{selectedReplacement.type_line}</p>
                      <div className="flex items-center gap-2 mb-2">
                        {selectedReplacement.mana_cost && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {selectedReplacement.mana_cost}
                          </Badge>
                        )}
                        <Badge variant="secondary">CMC {selectedReplacement.cmc}</Badge>
                        {getColorIndicator(selectedReplacement.color_identity || selectedReplacement.colors)}
                      </div>
                      {selectedReplacement.prices?.usd && (
                        <p className="text-sm text-green-600">${selectedReplacement.prices.usd}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedReplacement(null)}
                    className="absolute top-2 right-2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-2 border-muted">
                <CardContent className="p-8 text-center">
                  <Search className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Search for a replacement card</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Search Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for replacement cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="mt-2 text-muted-foreground">Searching cards...</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.slice(0, 12).map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedReplacement(card)}
                    className={`group bg-card border rounded-lg p-3 hover:border-primary hover:shadow-md transition-all text-left ${
                      selectedReplacement?.id === card.id ? 'border-primary ring-2 ring-primary/20' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      {card.image_uris?.small && (
                        <img 
                          src={card.image_uris.small} 
                          alt={card.name}
                          className="w-16 h-auto rounded border group-hover:shadow-sm"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm group-hover:text-primary truncate">
                          {card.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {card.type_line}
                        </p>
                        <div className="flex items-center gap-2">
                          {card.mana_cost && (
                            <Badge variant="outline" className="text-xs font-mono">
                              {card.cmc}
                            </Badge>
                          )}
                          {getColorIndicator(card.color_identity || card.colors)}
                        </div>
                        {card.prices?.usd && (
                          <p className="text-xs text-green-600 mt-1">${card.prices.usd}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchQuery && !loading && searchResults.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No cards found matching "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wishlist"
              checked={addToWishlist}
              onChange={(e) => setAddToWishlist(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="wishlist" className="text-sm flex items-center gap-1">
              <Heart className="h-4 w-4" />
              Add to wishlist
            </label>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleReplace}
              disabled={!selectedReplacement}
              className="flex items-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" />
              Replace Card
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}