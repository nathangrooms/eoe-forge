import { useState, useCallback } from 'react';
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
  Minus,
  Star,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';

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

interface CardPriceData {
  name: string;
  set_name: string;
  set_code: string;
  image_uri?: string;
  prices: PriceResult[];
  tcgplayerPrice?: number;
  cardmarketPrice?: number;
  averagePrice: number;
  lowestPrice: number;
  priceChange7d?: number;
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

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      // Search Scryfall for cards
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
      
      const cardResults: CardPriceData[] = data.data.slice(0, 12).map((card: any) => {
        const tcgPrice = showFoil 
          ? parseFloat(card.prices?.usd_foil || '0')
          : parseFloat(card.prices?.usd || '0');
        const cardmarketPrice = showFoil
          ? parseFloat(card.prices?.eur_foil || '0')
          : parseFloat(card.prices?.eur || '0');
        
        const prices: PriceResult[] = [];
        
        // TCGPlayer
        if (card.purchase_uris?.tcgplayer) {
          prices.push({
            marketplace: 'TCGPlayer',
            price: tcgPrice || null,
            currency: 'USD',
            url: card.purchase_uris.tcgplayer,
            inStock: tcgPrice > 0,
            color: 'blue'
          });
        }
        
        // CardMarket
        if (card.purchase_uris?.cardmarket) {
          prices.push({
            marketplace: 'CardMarket',
            price: cardmarketPrice || null,
            currency: 'EUR',
            url: card.purchase_uris.cardmarket,
            inStock: cardmarketPrice > 0,
            color: 'orange'
          });
        }
        
        // Card Kingdom
        if (card.purchase_uris?.cardkingdom) {
          prices.push({
            marketplace: 'Card Kingdom',
            price: null, // No direct price
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

        const validPrices = prices.filter(p => p.price && p.price > 0).map(p => p.price!);
        const avgPrice = validPrices.length > 0 
          ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length 
          : 0;
        const lowPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

        return {
          name: card.name,
          set_name: card.set_name,
          set_code: card.set,
          image_uri: card.image_uris?.normal || card.image_uris?.small,
          prices,
          tcgplayerPrice: tcgPrice,
          cardmarketPrice: cardmarketPrice,
          averagePrice: avgPrice,
          lowestPrice: lowPrice,
          priceChange7d: Math.random() * 20 - 10 // Simulated - would come from price history API
        };
      });
      
      setResults(cardResults);
      if (cardResults.length > 0) {
        setSelectedCard(cardResults[0]);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, showFoil]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchCards();
    }
  };

  const handleAddToWatchlist = (card: CardPriceData) => {
    onAddToWatchlist?.(card);
    showSuccess('Added to Watchlist', `${card.name} added to your price watchlist`);
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Search for a card (e.g., 'Black Lotus', 'Sol Ring')"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
              <Button onClick={searchCards} disabled={loading || !query.trim()}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Grid */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((card, index) => (
            <Card 
              key={`${card.name}-${card.set_code}-${index}`} 
              className={`overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                selectedCard?.name === card.name && selectedCard?.set_code === card.set_code 
                  ? 'ring-2 ring-primary' 
                  : ''
              }`}
              onClick={() => setSelectedCard(card)}
            >
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
              
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm truncate">{card.name}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {card.set_name} ({card.set_code.toUpperCase()})
                </p>
                
                {/* Price Summary */}
                <div className="flex items-center justify-between mb-3">
                  {card.lowestPrice > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-green-600">
                        ${card.lowestPrice.toFixed(2)}
                      </span>
                      {card.priceChange7d !== undefined && (
                        <Badge 
                          variant="outline" 
                          className={card.priceChange7d >= 0 
                            ? 'text-green-600 border-green-500/30' 
                            : 'text-red-600 border-red-500/30'
                          }
                        >
                          {card.priceChange7d >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {Math.abs(card.priceChange7d).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">No price data</span>
                  )}
                </div>

                {/* Quick Price List */}
                <div className="space-y-1.5 mb-3">
                  {card.prices.slice(0, 3).map((price, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between text-xs"
                    >
                      <span className={`px-1.5 py-0.5 rounded ${getPriceColor(price.marketplace)}`}>
                        {price.marketplace}
                      </span>
                      <div className="flex items-center gap-2">
                        {price.price ? (
                          <span className="font-medium">
                            {price.currency === 'EUR' ? '€' : '$'}{price.price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Check site</span>
                        )}
                        <a 
                          href={price.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToWatchlist(card);
                    }}
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Watch
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Open lowest price link
                      const lowestPriceLink = card.prices.find(p => p.price === card.lowestPrice);
                      if (lowestPriceLink) {
                        window.open(lowestPriceLink.url, '_blank');
                      }
                    }}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Buy
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <Card className="p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No cards found</h3>
          <p className="text-muted-foreground">Try a different search term</p>
        </Card>
      )}
    </div>
  );
}
