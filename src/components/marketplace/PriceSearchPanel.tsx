import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  ExternalLink, 
  TrendingUp, 
  TrendingDown, 
  Star,
  ShoppingCart,
  Sparkles,
  X,
  Loader2
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { CardPriceDetail } from './CardPriceDetail';

interface PriceResult {
  marketplace: string;
  price: number | null;
  currency: string;
  url: string;
  inStock: boolean;
  condition?: string;
  logo?: string;
  color: string;
}

export interface CardPriceData {
  id: string;
  name: string;
  set_name: string;
  set_code: string;
  image_uri?: string;
  prices: PriceResult[];
  tcgplayerPrice?: number;
  tcgplayerFoilPrice?: number;
  cardmarketPrice?: number;
  averagePrice: number;
  lowestPrice: number;
  priceChange7d?: number;
  tcgplayerUrl?: string;
  cardmarketUrl?: string;
  cardkingdomUrl?: string;
  scryfallData?: any;
}

interface PriceSearchPanelProps {
  onAddToWatchlist?: (card: CardPriceData) => void;
}

export function PriceSearchPanel({ onAddToWatchlist }: PriceSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CardPriceData[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardPriceData | null>(null);
  const [showFoil, setShowFoil] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Debounced auto-search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      if (query.length === 0) setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchCards();
    }, 400);

    return () => clearTimeout(timer);
  }, [query, showFoil]);

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      const cardResults: CardPriceData[] = data.data.slice(0, 16).map((card: any) => {
        const tcgPrice = parseFloat(card.prices?.usd || '0');
        const tcgFoilPrice = parseFloat(card.prices?.usd_foil || '0');
        const cardmarketPrice = parseFloat(card.prices?.eur || '0');
        
        const displayPrice = showFoil ? tcgFoilPrice : tcgPrice;
        
        const prices: PriceResult[] = [];
        
        // TCGPlayer - Primary source
        if (card.purchase_uris?.tcgplayer) {
          prices.push({
            marketplace: 'TCGPlayer',
            price: displayPrice || null,
            currency: 'USD',
            url: card.purchase_uris.tcgplayer,
            inStock: displayPrice > 0,
            color: 'blue'
          });
        }
        
        // CardMarket
        if (card.purchase_uris?.cardmarket) {
          const cmPrice = showFoil 
            ? parseFloat(card.prices?.eur_foil || '0')
            : cardmarketPrice;
          prices.push({
            marketplace: 'CardMarket',
            price: cmPrice || null,
            currency: 'EUR',
            url: card.purchase_uris.cardmarket,
            inStock: cmPrice > 0,
            color: 'orange'
          });
        }
        
        // Card Kingdom
        if (card.purchase_uris?.cardkingdom) {
          prices.push({
            marketplace: 'Card Kingdom',
            price: null,
            currency: 'USD',
            url: card.purchase_uris.cardkingdom,
            inStock: true,
            color: 'purple'
          });
        }
        
        // eBay
        prices.push({
          marketplace: 'eBay',
          price: null,
          currency: 'USD',
          url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg ' + card.set_name)}`,
          inStock: true,
          color: 'yellow'
        });

        return {
          id: card.id,
          name: card.name,
          set_name: card.set_name,
          set_code: card.set,
          image_uri: card.image_uris?.normal || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.normal,
          prices,
          tcgplayerPrice: tcgPrice,
          tcgplayerFoilPrice: tcgFoilPrice,
          cardmarketPrice: cardmarketPrice,
          averagePrice: displayPrice,
          lowestPrice: displayPrice,
          tcgplayerUrl: card.purchase_uris?.tcgplayer,
          cardmarketUrl: card.purchase_uris?.cardmarket,
          cardkingdomUrl: card.purchase_uris?.cardkingdom,
          scryfallData: card
        };
      });
      
      setResults(cardResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, showFoil]);

  const handleAddToWatchlist = (card: CardPriceData) => {
    onAddToWatchlist?.(card);
    showSuccess('Added to Watchlist', `${card.name} added to your price watchlist`);
  };

  const handleCardClick = (card: CardPriceData) => {
    setSelectedCard(card);
    setShowDetailPanel(true);
  };

  const getPriceColor = (marketplace: string) => {
    const colors: Record<string, string> = {
      'TCGPlayer': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      'CardMarket': 'bg-orange-500/10 text-orange-600 border-orange-500/30',
      'Card Kingdom': 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      'eBay': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30'
    };
    return colors[marketplace] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-primary" />
            Search & Compare Prices
            <Badge variant="outline" className="ml-2 text-xs">
              Live TCGPlayer Data
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Start typing a card name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pr-10 text-base"
              />
              {loading ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
              ) : query ? (
                <button 
                  onClick={() => { setQuery(''); setResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  id="foil-toggle" 
                  checked={showFoil} 
                  onCheckedChange={setShowFoil}
                />
                <Label htmlFor="foil-toggle" className="text-sm">
                  <Sparkles className="h-4 w-4 inline mr-1 text-yellow-500" />
                  Foil
                </Label>
              </div>
            </div>
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-xs text-muted-foreground mt-2">Type at least 2 characters to search...</p>
          )}
        </CardContent>
      </Card>

      {/* Results Grid */}
      {loading && results.length === 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-64 w-full" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map((card) => {
            const displayPrice = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
            
            return (
              <Card 
                key={card.id} 
                className="overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:scale-[1.02] group"
                onClick={() => handleCardClick(card)}
              >
                <div className="relative">
                  {card.image_uri ? (
                    <img 
                      src={card.image_uri} 
                      alt={card.name}
                      className="w-full h-64 object-contain bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted flex items-center justify-center">
                      <Search className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Badge className="bg-primary text-primary-foreground">
                      Click for Price Details
                    </Badge>
                  </div>
                  
                  {showFoil && (
                    <Badge className="absolute top-2 right-2 bg-yellow-500">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Foil
                    </Badge>
                  )}
                </div>
                
                <CardContent className="p-3">
                  <h3 className="font-semibold text-sm truncate">{card.name}</h3>
                  <p className="text-xs text-muted-foreground mb-2 truncate">
                    {card.set_name}
                  </p>
                  
                  {/* TCGPlayer Price - Primary */}
                  <div className="flex items-center justify-between mb-2">
                    {displayPrice && displayPrice > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-green-600">
                          ${displayPrice.toFixed(2)}
                        </span>
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                          TCG
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No price data</span>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToWatchlist(card);
                      }}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Watch
                    </Button>
                    {card.tcgplayerUrl && (
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(card.tcgplayerUrl, '_blank');
                        }}
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Buy
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && results.length === 0 && query.length >= 2 && (
        <Card className="p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No cards found</h3>
          <p className="text-muted-foreground">Try a different search term</p>
        </Card>
      )}

      {/* Price Detail Panel */}
      {selectedCard && (
        <CardPriceDetail 
          card={selectedCard}
          isOpen={showDetailPanel}
          onClose={() => setShowDetailPanel(false)}
          showFoil={showFoil}
          onAddToWatchlist={handleAddToWatchlist}
        />
      )}
    </div>
  );
}
