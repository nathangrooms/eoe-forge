import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, TrendingDown, TrendingUp, Minus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface PriceData {
  marketplace: string;
  price: number | null;
  url: string;
  inStock: boolean;
  condition?: string;
  foil?: boolean;
  lastUpdated?: Date;
}

interface PriceComparisonProps {
  cardName?: string;
  cardId?: string;
  setCode?: string;
  foil?: boolean;
}

export function PriceComparison({ cardName, cardId, setCode, foil = false }: PriceComparisonProps) {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cardName || cardId) {
      loadPrices();
    }
  }, [cardName, cardId, foil]);

  const loadPrices = async () => {
    if (!cardName) return;
    
    setLoading(true);
    setError(null);

    try {
      // Fetch prices from Scryfall first (we have this data)
      const scryfallUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`;
      const scryfallResponse = await fetch(scryfallUrl);
      
      if (!scryfallResponse.ok) {
        throw new Error('Failed to fetch card data');
      }

      const scryfallData = await scryfallResponse.json();
      
      const priceData: PriceData[] = [];

      // TCGPlayer
      if (scryfallData.purchase_uris?.tcgplayer) {
        const tcgPrice = foil 
          ? scryfallData.prices?.usd_foil 
          : scryfallData.prices?.usd;
        
        priceData.push({
          marketplace: 'TCGPlayer',
          price: tcgPrice ? parseFloat(tcgPrice) : null,
          url: scryfallData.purchase_uris.tcgplayer,
          inStock: !!tcgPrice,
          foil: foil,
          lastUpdated: new Date(),
        });
      }

      // Card Kingdom
      if (scryfallData.purchase_uris?.cardkingdom) {
        priceData.push({
          marketplace: 'Card Kingdom',
          price: null, // Would need Card Kingdom API
          url: scryfallData.purchase_uris.cardkingdom,
          inStock: true,
          foil: foil,
        });
      }

      // CardMarket (Europe)
      if (scryfallData.purchase_uris?.cardmarket) {
        const cardmarketPrice = foil
          ? scryfallData.prices?.eur_foil
          : scryfallData.prices?.eur;
        
        priceData.push({
          marketplace: 'CardMarket',
          price: cardmarketPrice ? parseFloat(cardmarketPrice) : null,
          url: scryfallData.purchase_uris.cardmarket,
          inStock: !!cardmarketPrice,
          foil: foil,
          lastUpdated: new Date(),
        });
      }

      // eBay
      if (scryfallData.related_uris?.edhrec) {
        priceData.push({
          marketplace: 'eBay',
          price: null, // Would need eBay API
          url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cardName + ' mtg')}`,
          inStock: true,
          foil: foil,
        });
      }

      setPrices(priceData);
    } catch (err) {
      console.error('Error loading prices:', err);
      setError('Failed to load price comparison');
      toast.error('Failed to load prices');
    } finally {
      setLoading(false);
    }
  };

  const getLowestPrice = () => {
    const validPrices = prices.filter(p => p.price !== null && p.inStock);
    if (validPrices.length === 0) return null;
    return Math.min(...validPrices.map(p => p.price!));
  };

  const getAveragePrice = () => {
    const validPrices = prices.filter(p => p.price !== null && p.inStock);
    if (validPrices.length === 0) return null;
    return validPrices.reduce((sum, p) => sum + p.price!, 0) / validPrices.length;
  };

  const getPriceTrend = (price: number, average: number) => {
    const diff = ((price - average) / average) * 100;
    if (diff < -5) return { icon: TrendingDown, color: 'text-green-600', label: 'Below Avg' };
    if (diff > 5) return { icon: TrendingUp, color: 'text-red-600', label: 'Above Avg' };
    return { icon: Minus, color: 'text-muted-foreground', label: 'Average' };
  };

  const lowestPrice = getLowestPrice();
  const averagePrice = getAveragePrice();

  // Show placeholder if no card selected
  if (!cardName && !cardId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Price Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Select a card to compare prices across marketplaces
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Comparison</CardTitle>
          <CardDescription>Checking prices across marketplaces...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadPrices}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Price Comparison</CardTitle>
            <CardDescription>
              {foil && 'Foil '}Prices across major marketplaces
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={loadPrices}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {lowestPrice !== null && averagePrice !== null && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Lowest Price</p>
              <p className="text-2xl font-bold text-green-600">
                ${lowestPrice.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Price</p>
              <p className="text-2xl font-bold">
                ${averagePrice.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Price List */}
        <div className="space-y-2">
          {prices.map((priceData, index) => {
            const trend = priceData.price && averagePrice 
              ? getPriceTrend(priceData.price, averagePrice)
              : null;
            const TrendIcon = trend?.icon;

            return (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  priceData.price === lowestPrice && lowestPrice !== null
                    ? 'border-green-600 bg-green-50 dark:bg-green-950/20'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{priceData.marketplace}</p>
                      {priceData.price === lowestPrice && lowestPrice !== null && (
                        <Badge variant="default" className="text-xs">Best Deal</Badge>
                      )}
                    </div>
                    {!priceData.inStock && (
                      <p className="text-xs text-muted-foreground">Out of Stock</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {priceData.price !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="font-bold">
                          ${priceData.price.toFixed(2)}
                        </p>
                        {trend && TrendIcon && (
                          <div className={`flex items-center justify-end gap-1 text-xs ${trend.color}`}>
                            <TrendIcon className="h-3 w-3" />
                            <span>{trend.label}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Check Site</p>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                  >
                    <a
                      href={priceData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {prices.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No price data available</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Prices are approximate and may not reflect current market rates. 
          Always verify on the marketplace before purchasing.
        </p>
      </CardContent>
    </Card>
  );
}
