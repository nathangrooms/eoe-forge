import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  TrendingDown, 
  Bell, 
  BellOff,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  target_price_usd?: number;
  alert_enabled?: boolean;
  card?: {
    set_code?: string;
    type_line?: string;
    rarity?: string;
    prices?: {
      usd?: string;
      usd_foil?: string;
    };
    image_uris?: {
      small?: string;
      normal?: string;
    };
  };
}

interface WishlistListViewProps {
  items: WishlistItem[];
  onCardClick: (item: WishlistItem) => void;
  onBuy: (item: WishlistItem) => void;
  onAddToCollection: (item: WishlistItem) => void;
  onRemove: (itemId: string) => void;
  onUpdatePriority: (itemId: string, priority: string) => void;
  onUpdateTargetPrice: (itemId: string, price: number | null) => void;
  onToggleAlert: (itemId: string, enabled: boolean) => void;
}

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30', dot: 'bg-rose-500' },
  medium: { label: 'Medium', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  low: { label: 'Low', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', dot: 'bg-slate-500' },
};

export function WishlistListView({
  items,
  onCardClick,
  onBuy,
  onAddToCollection,
  onRemove,
  onUpdatePriority,
  onUpdateTargetPrice,
  onToggleAlert,
}: WishlistListViewProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState('');

  const isPriceBelowTarget = (item: WishlistItem) => {
    if (!item.target_price_usd || !item.card?.prices?.usd) return false;
    return parseFloat(item.card.prices.usd) <= item.target_price_usd;
  };

  const handleSaveTarget = (item: WishlistItem) => {
    const price = parseFloat(targetValue);
    if (!isNaN(price) && price > 0) {
      onUpdateTargetPrice(item.id, price);
    }
    setEditingTarget(null);
    setTargetValue('');
  };

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const currentPrice = parseFloat(item.card?.prices?.usd || '0');
        const isBelowTarget = isPriceBelowTarget(item);
        const isExpanded = expandedItem === item.id;
        const priorityConfig = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

        return (
          <Card 
            key={item.id}
            className={cn(
              "overflow-hidden transition-all hover:border-primary/50",
              isBelowTarget && "ring-1 ring-emerald-500/50"
            )}
          >
            <CardContent className="p-0">
              {/* Main Row */}
              <div className="flex items-center gap-3 p-3">
                {/* Card Image */}
                <div 
                  className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0 cursor-pointer"
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
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      N/A
                    </div>
                  )}
                </div>

                {/* Card Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 
                      className="font-medium truncate cursor-pointer hover:text-primary"
                      onClick={() => onCardClick(item)}
                    >
                      {item.card_name}
                    </h3>
                    {item.quantity > 1 && (
                      <Badge variant="outline" className="text-xs px-1.5">
                        ×{item.quantity}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs uppercase">
                      {item.card?.set_code || 'UNK'}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <div className={cn("w-2 h-2 rounded-full", priorityConfig.dot)} />
                      <span className="text-xs text-muted-foreground">{priorityConfig.label}</span>
                    </div>
                    {item.alert_enabled && item.target_price_usd && (
                      <div className="flex items-center gap-1 text-amber-500">
                        <Bell className="h-3 w-3" />
                        <span className="text-xs">${item.target_price_usd.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price & Actions */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={cn(
                      "font-bold",
                      isBelowTarget ? "text-emerald-500" : ""
                    )}>
                      ${currentPrice.toFixed(2)}
                    </div>
                    {isBelowTarget && (
                      <Badge className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        Below Target
                      </Badge>
                    )}
                  </div>

                  <Button 
                    size="sm" 
                    onClick={() => onBuy(item)}
                    className="bg-emerald-600 hover:bg-emerald-700 h-9"
                  >
                    <ShoppingCart className="h-4 w-4 mr-1.5" />
                    Buy
                  </Button>

                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onAddToCollection(item)}
                    className="h-9"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    className="h-9 px-2"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t bg-muted/30">
                  <div className="flex flex-wrap items-center gap-3 py-3">
                    {/* Priority Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Priority:</span>
                      <div className="flex gap-1">
                        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                          <Button
                            key={key}
                            size="sm"
                            variant={item.priority === key ? 'secondary' : 'ghost'}
                            className={cn("h-7 px-2 text-xs", item.priority === key && config.color)}
                            onClick={() => onUpdatePriority(item.id, key)}
                          >
                            <div className={cn("w-2 h-2 rounded-full mr-1.5", config.dot)} />
                            {config.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Target Price */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Target:</span>
                      {editingTarget === item.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                            className="h-7 w-20 text-sm"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => handleSaveTarget(item)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTarget(null)}>
                            ×
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingTarget(item.id);
                            setTargetValue(item.target_price_usd?.toString() || '');
                          }}
                        >
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {item.target_price_usd ? `$${item.target_price_usd.toFixed(2)}` : 'Set Target'}
                        </Button>
                      )}
                    </div>

                    {/* Alert Toggle */}
                    <Button
                      size="sm"
                      variant={item.alert_enabled ? 'secondary' : 'outline'}
                      className={cn("h-7 px-2 text-xs", item.alert_enabled && "text-amber-500")}
                      onClick={() => onToggleAlert(item.id, !item.alert_enabled)}
                    >
                      {item.alert_enabled ? (
                        <>
                          <Bell className="h-3 w-3 mr-1" />
                          Alert On
                        </>
                      ) : (
                        <>
                          <BellOff className="h-3 w-3 mr-1" />
                          Alert Off
                        </>
                      )}
                    </Button>

                    <div className="flex-1" />

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>

                  {/* Note */}
                  {item.note && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                      {item.note}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
