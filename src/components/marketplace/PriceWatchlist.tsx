import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Star,
  Trash2,
  ExternalLink,
  Bell,
  BellOff,
  TrendingUp,
  TrendingDown,
  Target,
  ShoppingCart
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { Link } from 'react-router-dom';
import { CardImage, cardDetailPath } from '@/components/cards';

interface WatchlistItem {
  id: string;
  /** The card this row watches. Rows saved before card links existed have none. */
  cardId?: string;
  name: string;
  set_code: string;
  image_uri?: string;
  currentPrice: number;
  targetPrice?: number;
  alertEnabled: boolean;
  addedAt: string;
  priceChange?: number;
  purchaseUrl: string;
}

interface PriceWatchlistProps {
  items?: WatchlistItem[];
  onRemove?: (id: string) => void;
  onUpdateTarget?: (id: string, targetPrice: number) => void;
  onToggleAlert?: (id: string) => void;
}

export function PriceWatchlist({
  items: externalItems,
  onRemove,
  onUpdateTarget,
  onToggleAlert
}: PriceWatchlistProps) {
  const [items, setItems] = useState<WatchlistItem[]>(externalItems || []);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState('');

  useEffect(() => {
    if (externalItems) {
      setItems(externalItems);
    } else {
      // Load from localStorage if no external items
      const saved = localStorage.getItem('price_watchlist');
      if (saved) {
        try {
          setItems(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse watchlist:', e);
        }
      }
    }
  }, [externalItems]);

  const handleRemove = (id: string) => {
    if (onRemove) {
      onRemove(id);
    } else {
      const updated = items.filter(item => item.id !== id);
      setItems(updated);
      localStorage.setItem('price_watchlist', JSON.stringify(updated));
    }
    showSuccess('Removed', 'Card removed from watchlist');
  };

  const handleSetTarget = (id: string) => {
    const price = parseFloat(targetValue);
    if (isNaN(price) || price <= 0) return;

    if (onUpdateTarget) {
      onUpdateTarget(id, price);
    } else {
      const updated = items.map(item =>
        item.id === id ? { ...item, targetPrice: price } : item
      );
      setItems(updated);
      localStorage.setItem('price_watchlist', JSON.stringify(updated));
    }

    setEditingTarget(null);
    setTargetValue('');
    showSuccess('Target Set', `Price alert set at $${price.toFixed(2)}`);
  };

  const handleToggleAlert = (id: string) => {
    if (onToggleAlert) {
      onToggleAlert(id);
    } else {
      const updated = items.map(item =>
        item.id === id ? { ...item, alertEnabled: !item.alertEnabled } : item
      );
      setItems(updated);
      localStorage.setItem('price_watchlist', JSON.stringify(updated));
    }
  };

  const alertCount = items.filter(item =>
    item.targetPrice && item.currentPrice <= item.targetPrice
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Star className="h-5 w-5 text-muted-foreground" />
            Price Watchlist
            {items.length > 0 && (
              <Badge variant="secondary">{items.length}</Badge>
            )}
          </CardTitle>
          {alertCount > 0 && (
            <Badge variant="default">
              <Target className="h-3 w-3 mr-1" />
              {alertCount} at target
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8">
            <Star className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">No cards in watchlist</h3>
            <p className="text-sm text-muted-foreground">
              Search for cards and add them to track prices
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const atTarget = item.targetPrice && item.currentPrice <= item.targetPrice;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
                    atTarget ? 'bg-muted' : 'bg-muted/20 hover:bg-muted/50'
                  }`}
                >
                  {/* The card is a link to the card page, the same as every
                      other card in the product. The watch controls beside it
                      stay controls. */}
                  <Link
                    to={cardDetailPath({ id: item.cardId, name: item.name }) ?? '#'}
                    className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open ${item.name}`}
                  >
                    <CardImage
                      card={{ name: item.name, image_uris: { large: item.image_uri } }}
                      width={46}
                      hideFlip
                      interactive
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      <Link
                        to={cardDetailPath({ id: item.cardId, name: item.name }) ?? '#'}
                        className="hover:underline"
                      >
                        {item.name}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {item.set_code.toUpperCase()}
                    </p>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">
                        ${item.currentPrice.toFixed(2)}
                      </span>

                      {item.priceChange !== undefined && (
                        <Badge
                          variant="secondary"
                          className="border-0 text-xs tabular-nums"
                        >
                          {item.priceChange >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                          )}
                          {Math.abs(item.priceChange).toFixed(1)}%
                        </Badge>
                      )}

                      {item.targetPrice && (
                        <Badge
                          variant="secondary"
                          className={atTarget ? 'border-0 text-foreground' : 'border-0 text-muted-foreground'}
                        >
                          <Target className="h-3 w-3 mr-0.5" />
                          ${item.targetPrice.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Target Price Editor */}
                  {editingTarget === item.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Target"
                        value={targetValue}
                        onChange={(e) => setTargetValue(e.target.value)}
                        className="w-20 h-8 text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => handleSetTarget(item.id)}
                      >
                        Set
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setEditingTarget(null)}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingTarget(item.id);
                          setTargetValue(item.targetPrice?.toString() || '');
                        }}
                        title="Set target price"
                      >
                        <Target className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleToggleAlert(item.id)}
                        title={item.alertEnabled ? 'Disable alerts' : 'Enable alerts'}
                      >
                        {item.alertEnabled ? (
                          <Bell className="h-4 w-4 text-primary" />
                        ) : (
                          <BellOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        asChild
                      >
                        <a
                          href={item.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Buy now"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </a>
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(item.id)}
                        title="Remove from watchlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
