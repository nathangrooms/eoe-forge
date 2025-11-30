import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, ExternalLink, TrendingUp, Star, ShoppingCart } from 'lucide-react';
import { showError } from '@/components/ui/toast-helpers';

interface CardPrinting {
  id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image_uris: any;
  prices: {
    usd?: string;
    usd_foil?: string;
  };
  released_at: string;
}

interface CardPrintingComparisonProps {
  cardName: string;
  oracleId?: string;
}

export function CardPrintingComparison({ cardName, oracleId }: CardPrintingComparisonProps) {
  const [printings, setPrintings] = useState<CardPrinting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrinting, setSelectedPrinting] = useState<string | null>(null);

  useEffect(() => {
    if (cardName) {
      loadPrintings();
    }
  }, [cardName, oracleId]);

  const loadPrintings = async () => {
    try {
      setLoading(true);
      
      // Search Scryfall for all printings of this card
      const searchQuery = oracleId 
        ? `oracleid:${oracleId}`
        : `!"${cardName}"`;
      
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery)}&unique=prints&order=released`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch printings');
      }

      const data = await response.json();
      
      // Transform the data
      const printingsData: CardPrinting[] = data.data.map((card: any) => ({
        id: card.id,
        set_code: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        image_uris: card.image_uris,
        prices: {
          usd: card.prices?.usd,
          usd_foil: card.prices?.usd_foil
        },
        released_at: card.released_at
      }));

      setPrintings(printingsData);
      
      // Auto-select cheapest printing
      if (printingsData.length > 0) {
        const cheapest = printingsData.reduce((min, current) => {
          const minPrice = parseFloat(min.prices.usd || '999999');
          const currentPrice = parseFloat(current.prices.usd || '999999');
          return currentPrice < minPrice ? current : min;
        });
        setSelectedPrinting(cheapest.id);
      }
    } catch (error) {
      console.error('Error loading printings:', error);
      showError('Error', 'Failed to load card printings');
    } finally {
      setLoading(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'mythic':
        return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
      case 'rare':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
      case 'uncommon':
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatPrice = (price?: string) => {
    if (!price) return 'N/A';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const getCheapestPrinting = () => {
    if (printings.length === 0) return null;
    return printings.reduce((min, current) => {
      const minPrice = parseFloat(min.prices.usd || '999999');
      const currentPrice = parseFloat(current.prices.usd || '999999');
      return currentPrice < minPrice ? current : min;
    });
  };

  const cheapest = getCheapestPrinting();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Available Printings ({printings.length})
        </CardTitle>
        {cheapest && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Cheapest: {cheapest.set_name} at {formatPrice(cheapest.prices.usd)}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-24 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : printings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No printings found</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {printings.map((printing) => (
                <div
                  key={printing.id}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    selectedPrinting === printing.id
                      ? 'bg-primary/5 border-primary'
                      : 'bg-card hover:bg-accent/50'
                  } ${printing.id === cheapest?.id ? 'ring-2 ring-emerald-500/30' : ''}`}
                  onClick={() => setSelectedPrinting(printing.id)}
                >
                  <div className="flex gap-4">
                    {/* Card Image */}
                    {printing.image_uris?.small && (
                      <img
                        src={printing.image_uris.small}
                        alt={`${cardName} - ${printing.set_name}`}
                        className="w-20 h-28 object-cover rounded border shadow-sm"
                      />
                    )}
                    
                    {/* Printing Details */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {printing.set_code.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className={getRarityColor(printing.rarity)}>
                              {printing.rarity}
                            </Badge>
                            {printing.id === cheapest?.id && (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                <Star className="h-3 w-3 mr-1" />
                                Cheapest
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-sm">{printing.set_name}</h4>
                          <p className="text-xs text-muted-foreground">
                            #{printing.collector_number} • {new Date(printing.released_at).getFullYear()}
                          </p>
                        </div>
                      </div>
                      
                      {/* Prices */}
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Normal: </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatPrice(printing.prices.usd)}
                          </span>
                        </div>
                        {printing.prices.usd_foil && (
                          <div>
                            <span className="text-muted-foreground text-xs">Foil: </span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {formatPrice(printing.prices.usd_foil)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://scryfall.com/card/${printing.set_code}/${printing.collector_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardName)}+${printing.set_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Buy
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
