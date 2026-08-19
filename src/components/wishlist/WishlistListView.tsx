import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { CardImage } from '@/components/cards';
import { formatPrice } from '@/components/collection/browser/types';
import { PriceTag } from '@/components/pricing';
import { readAmount } from '@/lib/pricing';
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
  /** The full card record, so the row can draw a real card thumbnail. */
  card?: any;
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

/** Priority is a contrast ramp on the monochrome ink, never a hue. */
const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-primary text-primary-foreground', dot: 'bg-foreground' },
  medium: { label: 'Medium', color: 'bg-muted text-foreground', dot: 'bg-muted-foreground' },
  low: { label: 'Low', color: 'bg-muted/60 text-muted-foreground', dot: 'bg-muted-foreground/50' },
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
    // null, not 0, for a price we do not have, so an unpriced card is never
    // announced as being below the target.
    const current = readAmount(item.card?.prices?.usd);
    if (!item.target_price_usd || current == null) return false;
    return current <= item.target_price_usd;
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
        const isBelowTarget = isPriceBelowTarget(item);
        const isExpanded = expandedItem === item.id;
        const priorityConfig = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

        return (
          <div
            key={item.id}
            className={cn(
              'overflow-hidden rounded-lg bg-card shadow-lg shadow-black/20 transition-colors',
              isBelowTarget && 'bg-muted'
            )}
          >
            <div>
              {/* Main Row */}
              <div className="flex items-center gap-3 p-3">
                <CardImage
                  card={item.card ?? { name: item.card_name }}
                  width={52}
                  hideFlip
                  onClick={() => onCardClick(item)}
                  className="shrink-0"
                />

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
                      <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
                        ×{item.quantity}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs uppercase text-muted-foreground">
                      {item.card?.set_code || 'UNK'}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className={cn("w-2 h-2 rounded-full", priorityConfig.dot)} />
                      <span className="text-xs text-muted-foreground">{priorityConfig.label}</span>
                    </div>
                    {item.alert_enabled && item.target_price_usd && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Bell className="h-3 w-3" aria-hidden="true" />
                        <span className="text-xs tabular-nums">{formatPrice(item.target_price_usd)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price & Actions */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {/* "$0.00" here used to mean "we have no price", which
                        reads as worthless. PriceTag says so in words. */}
                    <PriceTag card={item.card} className="font-bold" />
                    {isBelowTarget && (
                      <span className="inline-flex items-center rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                        <TrendingDown className="mr-1 h-3 w-3" aria-hidden="true" />
                        Below target
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => onBuy(item)}
                    className="h-9"
                  >
                    <ShoppingCart className="h-4 w-4 mr-1.5" />
                    Buy
                  </Button>

                  <Button 
                    size="sm" 
                    variant="secondary"
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
                <div className="bg-muted/30 px-3 pb-3 pt-0">
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
                            className="h-7 w-20 border-0 bg-muted/50 text-sm"
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
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingTarget(item.id);
                            setTargetValue(item.target_price_usd?.toString() || '');
                          }}
                        >
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {item.target_price_usd ? formatPrice(item.target_price_usd) : 'Set target'}
                        </Button>
                      )}
                    </div>

                    {/* Alert Toggle */}
                    <Button
                      size="sm"
                      variant={item.alert_enabled ? 'secondary' : 'ghost'}
                      className="h-7 px-2 text-xs"
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
