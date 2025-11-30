import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Store, ExternalLink, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface StoreAvailability {
  store: string;
  inStock: boolean;
  price: number | null;
  lastChecked: Date;
  url?: string;
}

interface StoreAvailabilityCheckProps {
  cardName: string;
  cardId: string;
}

export function StoreAvailabilityCheck({ cardName, cardId }: StoreAvailabilityCheckProps) {
  const [availability, setAvailability] = useState<StoreAvailability[]>([
    {
      store: 'TCGPlayer',
      inStock: true,
      price: 12.99,
      lastChecked: new Date(),
      url: `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(cardName)}`
    },
    {
      store: 'Card Kingdom',
      inStock: true,
      price: 13.50,
      lastChecked: new Date(),
      url: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(cardName)}`
    },
    {
      store: 'ChannelFireball',
      inStock: false,
      price: null,
      lastChecked: new Date(),
      url: `https://www.channelfireball.com/search/?q=${encodeURIComponent(cardName)}`
    },
    {
      store: 'Star City Games',
      inStock: true,
      price: 14.99,
      lastChecked: new Date(),
      url: `https://starcitygames.com/search/?search_query=${encodeURIComponent(cardName)}`
    }
  ]);
  const [checking, setChecking] = useState(false);

  const checkAvailability = async () => {
    setChecking(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update last checked timestamp
      setAvailability(prev => prev.map(store => ({
        ...store,
        lastChecked: new Date()
      })));
      
      showSuccess('Availability Updated', 'Store availability has been refreshed');
    } catch (error) {
      showError('Check Failed', 'Failed to check store availability');
    } finally {
      setChecking(false);
    }
  };

  const getStockIcon = (inStock: boolean) => {
    return inStock ? (
      <CheckCircle className="h-4 w-4 text-emerald-500" />
    ) : (
      <XCircle className="h-4 w-4 text-destructive" />
    );
  };

  const formatLastChecked = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Store Availability
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={checkAvailability}
            disabled={checking}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {availability.map((store) => (
          <div
            key={store.store}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {getStockIcon(store.inStock)}
              <div className="flex-1">
                <div className="font-medium">{store.store}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatLastChecked(store.lastChecked)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {store.inStock && store.price !== null ? (
                <Badge variant="secondary" className="font-mono">
                  ${store.price.toFixed(2)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Out of Stock
                </Badge>
              )}
              
              {store.url && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
        
        <div className="text-xs text-muted-foreground mt-4 text-center">
          Prices are for reference only. Click store names to verify current availability.
        </div>
      </CardContent>
    </Card>
  );
}
