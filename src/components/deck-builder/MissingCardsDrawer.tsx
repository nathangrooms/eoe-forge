import { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Plus, 
  Heart, 
  DollarSign,
  TrendingUp,
  Package,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface MissingCard {
  card_id: string;
  card_name: string;
  quantity: number;
  estimated_price?: number;
  rarity?: string;
  type_line?: string;
  set_name?: string;
  image_uri?: string;
}

interface MissingCardsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: string;
  deckName: string;
}

export function MissingCardsDrawer({ 
  isOpen, 
  onClose, 
  deckId, 
  deckName 
}: MissingCardsDrawerProps) {
  const [missingCards, setMissingCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    if (isOpen && deckId) {
      loadMissingCards();
    }
  }, [isOpen, deckId]);

  const loadMissingCards = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get deck cards that are not in user's collection
      const { data: deckCards, error: deckError } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity')
        .eq('deck_id', deckId)
        .eq('is_sideboard', false);

      if (deckError) throw deckError;

      if (!deckCards || deckCards.length === 0) {
        setMissingCards([]);
        return;
      }

      // Get user's collection
      const { data: userCards, error: collectionError } = await supabase
        .from('user_collections')
        .select('card_id, quantity')
        .eq('user_id', session.user.id);

      if (collectionError) throw collectionError;

      // Create a map of owned cards
      const ownedCardsMap = new Map<string, number>();
      userCards?.forEach(card => {
        ownedCardsMap.set(card.card_id, card.quantity);
      });

      // Find missing cards
      const missing: MissingCard[] = [];
      for (const deckCard of deckCards) {
        const owned = ownedCardsMap.get(deckCard.card_id) || 0;
        const needed = deckCard.quantity - owned;
        
        if (needed > 0) {
          // Get card details
          const { data: cardDetails, error: cardError } = await supabase
            .from('cards')
            .select('rarity, type_line, image_uris, prices')
            .eq('id', deckCard.card_id)
            .single();

          const prices = cardDetails?.prices as any;
          const estimatedPrice = prices?.usd 
            ? parseFloat(prices.usd) * needed
            : 0;

          const imageUris = cardDetails?.image_uris as any;
          missing.push({
            card_id: deckCard.card_id,
            card_name: deckCard.card_name,
            quantity: needed,
            estimated_price: estimatedPrice,
            rarity: cardDetails?.rarity,
            type_line: cardDetails?.type_line,
            image_uri: imageUris?.normal || imageUris?.large
          });
        }
      }

      setMissingCards(missing.sort((a, b) => (b.estimated_price || 0) - (a.estimated_price || 0)));
    } catch (error) {
      console.error('Error loading missing cards:', error);
      showError('Error', 'Failed to load missing cards');
    } finally {
      setLoading(false);
    }
  };

  const addToWishlist = async (card: MissingCard) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('wishlist')
        .upsert({
          user_id: session.user.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          priority: 'medium'
        }, {
          onConflict: 'user_id,card_id'
        });

      if (error) throw error;

      showSuccess('Added to Wishlist', `${card.card_name} added to your wishlist`);
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Error', 'Failed to add card to wishlist');
    }
  };

  const addToCollection = async (card: MissingCard) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('user_collections')
        .upsert({
          user_id: session.user.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          set_code: 'unknown', // Would need to determine set
          condition: 'near_mint'
        }, {
          onConflict: 'user_id,card_id'
        });

      if (error) throw error;

      showSuccess('Added to Collection', `${card.card_name} added to your collection`);
      
      // Remove from missing cards list
      setMissingCards(prev => prev.filter(c => c.card_id !== card.card_id));
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Error', 'Failed to add card to collection');
    }
  };

  const filteredCards = missingCards.filter(card => {
    const matchesSearch = card.card_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filter === 'all') return true;
    
    const price = card.estimated_price || 0;
    switch (filter) {
      case 'high': return price >= 10;
      case 'medium': return price >= 2 && price < 10;
      case 'low': return price < 2;
      default: return true;
    }
  });

  const totalValue = missingCards.reduce((sum, card) => sum + (card.estimated_price || 0), 0);

  const getRarityColor = (rarity?: string) => {
    switch (rarity) {
      case 'mythic': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'rare': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'uncommon': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl">Missing Cards from {deckName}</DrawerTitle>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-muted-foreground">
                  {missingCards.length} cards missing
                </span>
                <div className="flex items-center gap-1 text-sm">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-medium">${totalValue.toFixed(2)}</span>
                  <span className="text-muted-foreground">estimated</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="p-4 space-y-4">
          {/* Search and Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search missing cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'high', 'medium', 'low'] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f === 'all' ? 'All' : `$${f === 'high' ? '10+' : f === 'medium' ? '2-10' : '<2'}`}
                </Button>
              ))}
            </div>
          </div>

          {/* Missing Cards List */}
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border border-muted-foreground border-t-transparent" />
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No missing cards found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search or filters' : 'You own all cards in this deck!'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCards.map((card) => (
                  <Card key={card.card_id} className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Card Image */}
                      <div className="w-16 h-22 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
                        {card.image_uri ? (
                          <img 
                            src={card.image_uri} 
                            alt={card.card_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      {/* Card Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium truncate">{card.card_name}</h4>
                            <p className="text-sm text-muted-foreground truncate">
                              {card.type_line}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="text-sm font-medium">
                              Need {card.quantity}
                            </div>
                            {card.estimated_price && (
                              <div className="text-sm text-muted-foreground">
                                ${card.estimated_price.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {card.rarity && (
                              <Badge className={getRarityColor(card.rarity)}>
                                {card.rarity}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addToWishlist(card)}
                            >
                              <Heart className="h-3 w-3 mr-1" />
                              Wishlist
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => addToCollection(card)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Mark as Owned
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}