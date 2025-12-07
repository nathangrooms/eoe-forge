import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Layers, 
  ShoppingCart, 
  ChevronRight,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  target_price_usd?: number;
  card?: {
    color_identity?: string[];
    colors?: string[];
    prices?: {
      usd?: string;
    };
    image_uris?: {
      small?: string;
    };
  };
}

interface UserDeck {
  id: string;
  name: string;
  format: string;
  colors: string[];
}

interface WishlistByDeckProps {
  wishlistItems: WishlistItem[];
  userDecks: UserDeck[];
  loading: boolean;
  onCardClick: (item: WishlistItem) => void;
  onBuyAll: (items: WishlistItem[]) => void;
  onNavigateToDeck: (deckId: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  W: 'bg-amber-100 border-amber-400',
  U: 'bg-blue-500 border-blue-600',
  B: 'bg-gray-800 border-gray-900',
  R: 'bg-red-500 border-red-600',
  G: 'bg-green-500 border-green-600',
};

export function WishlistByDeck({
  wishlistItems,
  userDecks,
  loading,
  onCardClick,
  onBuyAll,
  onNavigateToDeck,
}: WishlistByDeckProps) {
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);

  const getWishlistForDeck = (deck: UserDeck): WishlistItem[] => {
    return wishlistItems.filter(item => {
      const cardColors = item.card?.color_identity || item.card?.colors || [];
      // Colorless cards can go in any deck
      if (cardColors.length === 0) return true;
      // If deck has no colors, only colorless cards fit
      if (deck.colors.length === 0) return cardColors.length === 0;
      // Card colors must be subset of deck colors
      return cardColors.every(color => deck.colors.includes(color));
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (userDecks.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="text-lg font-medium mb-2">No decks yet</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Create decks to see which wishlist cards fit each deck
        </p>
        <Button onClick={() => window.location.href = '/decks'}>
          Create Your First Deck
        </Button>
      </Card>
    );
  }

  // Sort decks by how many wishlist cards match
  const decksWithWishlist = userDecks
    .map(deck => ({
      deck,
      items: getWishlistForDeck(deck),
    }))
    .filter(d => d.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);

  if (decksWithWishlist.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="text-lg font-medium mb-2">No matching cards</h3>
        <p className="text-muted-foreground text-sm">
          Your wishlist cards don't match any of your deck's color identities
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {decksWithWishlist.map(({ deck, items }) => {
        const totalValue = items.reduce((sum, item) => {
          return sum + (parseFloat(item.card?.prices?.usd || '0') * item.quantity);
        }, 0);
        const isExpanded = expandedDeck === deck.id;
        const priceDrops = items.filter(i => 
          i.target_price_usd && i.card?.prices?.usd && 
          parseFloat(i.card.prices.usd) <= i.target_price_usd
        ).length;

        return (
          <Card 
            key={deck.id}
            className={cn(
              "overflow-hidden transition-all",
              isExpanded && "ring-1 ring-primary/50"
            )}
          >
            <CardContent className="p-0">
              {/* Header */}
              <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedDeck(isExpanded ? null : deck.id)}
              >
                {/* Deck Preview */}
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  {items[0]?.card?.image_uris?.small ? (
                    <img 
                      src={items[0].card.image_uris.small} 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Layers className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>

                {/* Deck Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{deck.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {deck.format}
                    </Badge>
                    <div className="flex gap-0.5">
                      {deck.colors.map((color, i) => (
                        <div
                          key={i}
                          className={cn(
                            "w-4 h-4 rounded-full border",
                            COLOR_MAP[color] || 'bg-gray-400'
                          )}
                        />
                      ))}
                    </div>
                    {priceDrops > 0 && (
                      <Badge className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        {priceDrops} deal{priceDrops > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-500">
                    ${totalValue.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {items.length} card{items.length > 1 ? 's' : ''} needed
                  </div>
                </div>

                <ChevronRight className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90"
                )} />
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t bg-muted/20 p-4">
                  {/* Card Thumbnails */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {items.slice(0, 12).map((item) => {
                      const isBelowTarget = item.target_price_usd && item.card?.prices?.usd && 
                        parseFloat(item.card.prices.usd) <= item.target_price_usd;
                      
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "w-14 h-20 rounded overflow-hidden cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                            isBelowTarget && "ring-2 ring-emerald-500"
                          )}
                          onClick={() => onCardClick(item)}
                        >
                          {item.card?.image_uris?.small ? (
                            <img 
                              src={item.card.image_uris.small}
                              alt={item.card_name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-center p-1 text-muted-foreground">
                              {item.card_name.split(' ').slice(0, 2).join(' ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {items.length > 12 && (
                      <div className="w-14 h-20 rounded bg-muted flex items-center justify-center text-sm text-muted-foreground font-medium">
                        +{items.length - 12}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => onBuyAll(items)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-1.5" />
                      Buy All (${totalValue.toFixed(2)})
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateToDeck(deck.id)}
                    >
                      View Deck
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
