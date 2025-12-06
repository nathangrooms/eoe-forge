import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Flame,
  ArrowRight,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface TrendingCard {
  name: string;
  set_code: string;
  image_uri?: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  changeDirection: 'up' | 'down';
  purchaseUrl: string;
}

export function PriceTrendCard() {
  const [loading, setLoading] = useState(true);
  const [gainers, setGainers] = useState<TrendingCard[]>([]);
  const [losers, setLosers] = useState<TrendingCard[]>([]);
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers'>('gainers');

  useEffect(() => {
    loadTrendingCards();
  }, []);

  const loadTrendingCards = async () => {
    setLoading(true);
    try {
      // Fetch some popular/expensive cards to simulate trending
      // In production, this would come from a price history API
      const popularCards = [
        'Sol Ring', 'Mana Crypt', 'The One Ring', 'Sheoldred, the Apocalypse',
        'Ragavan, Nimble Pilferer', 'Force of Will', 'Cyclonic Rift', 'Smothering Tithe'
      ];

      const cardPromises = popularCards.slice(0, 6).map(async (name) => {
        try {
          const response = await fetch(
            `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
          );
          if (!response.ok) return null;
          const card = await response.json();
          
          const currentPrice = parseFloat(card.prices?.usd || '0');
          // Simulated previous price (would come from price history)
          const changePercent = (Math.random() * 30 - 15);
          const previousPrice = currentPrice / (1 + changePercent / 100);
          
          return {
            name: card.name,
            set_code: card.set,
            image_uri: card.image_uris?.small,
            currentPrice,
            previousPrice,
            changePercent: Math.abs(changePercent),
            changeDirection: changePercent >= 0 ? 'up' : 'down',
            purchaseUrl: card.purchase_uris?.tcgplayer || '#'
          } as TrendingCard;
        } catch {
          return null;
        }
      });

      const results = (await Promise.all(cardPromises)).filter(Boolean) as TrendingCard[];
      
      setGainers(results.filter(c => c.changeDirection === 'up').sort((a, b) => b.changePercent - a.changePercent));
      setLosers(results.filter(c => c.changeDirection === 'down').sort((a, b) => b.changePercent - a.changePercent));
    } catch (error) {
      console.error('Error loading trending cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const activeCards = activeTab === 'gainers' ? gainers : losers;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-orange-500" />
            Price Movers (7 Days)
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={loadTrendingCards}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mt-2">
          <Button
            variant={activeTab === 'gainers' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('gainers')}
            className={activeTab === 'gainers' ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Gainers
          </Button>
          <Button
            variant={activeTab === 'losers' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('losers')}
            className={activeTab === 'losers' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            <TrendingDown className="h-4 w-4 mr-1" />
            Losers
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : activeCards.length > 0 ? (
          <div className="space-y-3">
            {activeCards.map((card, index) => (
              <a
                key={`${card.name}-${index}`}
                href={card.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                {card.image_uri ? (
                  <img 
                    src={card.image_uri} 
                    alt={card.name}
                    className="h-12 w-auto rounded shadow-sm"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-9 bg-muted rounded flex items-center justify-center">
                    <Flame className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ${card.currentPrice.toFixed(2)}
                    <span className="mx-1">←</span>
                    ${card.previousPrice.toFixed(2)}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={activeTab === 'gainers' 
                      ? 'text-green-600 border-green-500/30 bg-green-500/10' 
                      : 'text-red-600 border-red-500/30 bg-red-500/10'
                    }
                  >
                    {activeTab === 'gainers' ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {card.changePercent.toFixed(1)}%
                  </Badge>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No {activeTab} to display</p>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            Price data from TCGPlayer & CardMarket. Trends are simulated for demo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
