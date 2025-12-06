import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { 
  ExternalLink, 
  TrendingUp, 
  TrendingDown,
  Star,
  ShoppingCart,
  Sparkles,
  DollarSign,
  BarChart3,
  Clock,
  Package,
  Info
} from 'lucide-react';
import { CardPriceData } from './PriceSearchPanel';

interface CardPriceDetailProps {
  card: CardPriceData;
  isOpen: boolean;
  onClose: () => void;
  showFoil?: boolean;
  onAddToWatchlist?: (card: CardPriceData) => void;
}

interface PrintingPrice {
  id: string;
  set_name: string;
  set_code: string;
  price: number | null;
  foilPrice: number | null;
  rarity: string;
  released_at: string;
  tcgplayerUrl?: string;
}

export function CardPriceDetail({ 
  card, 
  isOpen, 
  onClose, 
  showFoil = false,
  onAddToWatchlist 
}: CardPriceDetailProps) {
  const [allPrintings, setAllPrintings] = useState<PrintingPrice[]>([]);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [priceStats, setPriceStats] = useState<{
    lowest: number;
    highest: number;
    average: number;
    median: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && card) {
      loadAllPrintings();
    }
  }, [isOpen, card]);

  const loadAllPrintings = async () => {
    if (!card.scryfallData?.prints_search_uri) return;
    
    setLoadingPrintings(true);
    try {
      const response = await fetch(card.scryfallData.prints_search_uri);
      if (!response.ok) throw new Error('Failed to fetch printings');
      
      const data = await response.json();
      
      const printings: PrintingPrice[] = data.data.map((print: any) => ({
        id: print.id,
        set_name: print.set_name,
        set_code: print.set,
        price: parseFloat(print.prices?.usd || '0') || null,
        foilPrice: parseFloat(print.prices?.usd_foil || '0') || null,
        rarity: print.rarity,
        released_at: print.released_at,
        tcgplayerUrl: print.purchase_uris?.tcgplayer
      })).filter((p: PrintingPrice) => {
        const relevantPrice = showFoil ? p.foilPrice : p.price;
        return relevantPrice && relevantPrice > 0;
      }).sort((a: PrintingPrice, b: PrintingPrice) => {
        const priceA = showFoil ? (a.foilPrice || 0) : (a.price || 0);
        const priceB = showFoil ? (b.foilPrice || 0) : (b.price || 0);
        return priceA - priceB;
      });

      setAllPrintings(printings);

      // Calculate stats
      if (printings.length > 0) {
        const prices = printings.map(p => showFoil ? (p.foilPrice || 0) : (p.price || 0));
        const sorted = [...prices].sort((a, b) => a - b);
        const sum = prices.reduce((a, b) => a + b, 0);
        
        setPriceStats({
          lowest: sorted[0],
          highest: sorted[sorted.length - 1],
          average: sum / prices.length,
          median: sorted[Math.floor(sorted.length / 2)]
        });
      }
    } catch (error) {
      console.error('Error loading printings:', error);
    } finally {
      setLoadingPrintings(false);
    }
  };

  const displayPrice = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
  const rarityColors: Record<string, string> = {
    common: 'bg-gray-500/10 text-gray-600',
    uncommon: 'bg-gray-400/10 text-gray-500',
    rare: 'bg-yellow-500/10 text-yellow-600',
    mythic: 'bg-orange-500/10 text-orange-600',
    special: 'bg-purple-500/10 text-purple-600',
    bonus: 'bg-purple-500/10 text-purple-600'
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Price Details
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Card Info */}
          <div className="flex gap-4">
            {card.image_uri && (
              <img 
                src={card.image_uri} 
                alt={card.name}
                className="w-32 h-auto rounded-lg shadow-lg"
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold">{card.name}</h2>
              <p className="text-sm text-muted-foreground mb-2">
                {card.set_name} ({card.set_code.toUpperCase()})
              </p>
              
              {/* Current Price */}
              <div className="flex items-center gap-2 mb-3">
                {displayPrice && displayPrice > 0 ? (
                  <>
                    <span className="text-2xl font-bold text-green-600">
                      ${displayPrice.toFixed(2)}
                    </span>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                      TCGPlayer {showFoil ? 'Foil' : ''}
                    </Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground">No price data</span>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onAddToWatchlist?.(card)}
                >
                  <Star className="h-4 w-4 mr-1" />
                  Watch
                </Button>
                {card.tcgplayerUrl && (
                  <Button 
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    asChild
                  >
                    <a href={card.tcgplayerUrl} target="_blank" rel="noopener noreferrer">
                      <ShoppingCart className="h-4 w-4 mr-1" />
                      Buy on TCGPlayer
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Price Statistics */}
          {priceStats && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  Price Statistics (All Printings)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xs text-muted-foreground">Lowest</p>
                    <p className="text-lg font-bold text-green-600">${priceStats.lowest.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-muted-foreground">Highest</p>
                    <p className="text-lg font-bold text-red-600">${priceStats.highest.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-muted-foreground">Average</p>
                    <p className="text-lg font-bold text-blue-600">${priceStats.average.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-xs text-muted-foreground">Median</p>
                    <p className="text-lg font-bold text-purple-600">${priceStats.median.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Buy Links */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Buy Now
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {card.tcgplayerUrl && (
                <a 
                  href={card.tcgplayerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                      TCG
                    </div>
                    <div>
                      <p className="font-medium">TCGPlayer</p>
                      <p className="text-xs text-muted-foreground">Best for US buyers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {displayPrice && displayPrice > 0 && (
                      <span className="font-bold text-green-600">${displayPrice.toFixed(2)}</span>
                    )}
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </a>
              )}

              {card.cardmarketUrl && (
                <a 
                  href={card.cardmarketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center text-white font-bold text-xs">
                      CM
                    </div>
                    <div>
                      <p className="font-medium">CardMarket</p>
                      <p className="text-xs text-muted-foreground">Best for EU buyers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {card.cardmarketPrice && card.cardmarketPrice > 0 && (
                      <span className="font-bold text-green-600">€{card.cardmarketPrice.toFixed(2)}</span>
                    )}
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </a>
              )}

              {card.cardkingdomUrl && (
                <a 
                  href={card.cardkingdomUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white font-bold text-xs">
                      CK
                    </div>
                    <div>
                      <p className="font-medium">Card Kingdom</p>
                      <p className="text-xs text-muted-foreground">Reliable US seller</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              )}

              <a 
                href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg ' + card.set_name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-yellow-600 flex items-center justify-center text-white font-bold text-xs">
                    eBay
                  </div>
                  <div>
                    <p className="font-medium">eBay</p>
                    <p className="text-xs text-muted-foreground">Auctions & Buy It Now</p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>

          {/* All Printings with Prices */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                All Printings ({allPrintings.length})
                <Badge variant="outline" className="ml-auto">
                  Sorted by price
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPrintings ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : allPrintings.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {allPrintings.map((printing, index) => {
                    const price = showFoil ? printing.foilPrice : printing.price;
                    const isCheapest = index === 0;
                    
                    return (
                      <a
                        key={printing.id}
                        href={printing.tcgplayerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                          isCheapest ? 'border-green-500/50 bg-green-500/5' : 'border-border'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{printing.set_name}</p>
                            {isCheapest && (
                              <Badge className="bg-green-600 text-xs">Cheapest</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{printing.set_code.toUpperCase()}</span>
                            <Badge variant="outline" className={`text-xs ${rarityColors[printing.rarity] || ''}`}>
                              {printing.rarity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{printing.released_at}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isCheapest ? 'text-green-600' : ''}`}>
                            ${price?.toFixed(2)}
                          </span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Info className="h-8 w-8 mx-auto mb-2" />
                  <p>No printings with price data found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price Trend Note */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">About Price Data</p>
                <p>
                  Prices are sourced live from TCGPlayer via Scryfall. Historical price trends 
                  and additional market data coming soon.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
