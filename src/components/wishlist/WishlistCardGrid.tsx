import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  TrendingDown, 
  Bell, 
  BellOff,
  ExternalLink,
  MoreHorizontal,
  Check
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

interface WishlistCardGridProps {
  items: WishlistItem[];
  viewMode: 'grid' | 'compact';
  onCardClick: (item: WishlistItem) => void;
  onBuy: (item: WishlistItem) => void;
  onAddToCollection: (item: WishlistItem) => void;
  onRemove: (itemId: string) => void;
  onUpdatePriority: (itemId: string, priority: string) => void;
  onUpdateTargetPrice: (itemId: string, price: number | null) => void;
  onToggleAlert: (itemId: string, enabled: boolean) => void;
}

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  medium: { label: 'Medium', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  low: { label: 'Low', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
};

export function WishlistCardGrid({
  items,
  viewMode,
  onCardClick,
  onBuy,
  onAddToCollection,
  onRemove,
  onUpdatePriority,
  onUpdateTargetPrice,
  onToggleAlert,
}: WishlistCardGridProps) {
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

  const gridClasses = viewMode === 'grid' 
    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
    : "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2";

  return (
    <div className={gridClasses}>
      {items.map((item) => {
        const currentPrice = parseFloat(item.card?.prices?.usd || '0');
        const isBelowTarget = isPriceBelowTarget(item);
        const priorityConfig = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

        return (
          <div
            key={item.id}
            className={cn(
              "group relative rounded-lg overflow-hidden border border-border/50 bg-card/50 hover:border-primary/50 transition-all hover:shadow-lg",
              isBelowTarget && "ring-2 ring-emerald-500/50"
            )}
          >
            {/* Card Image */}
            <div 
              className={cn(
                "relative cursor-pointer bg-muted",
                viewMode === 'grid' ? "aspect-[5/7]" : "aspect-[5/7]"
              )}
              onClick={() => onCardClick(item)}
            >
              {item.card?.image_uris?.normal ? (
                <img
                  src={item.card.image_uris.normal}
                  alt={item.card_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center">
                  <span className="text-xs text-muted-foreground">{item.card_name}</span>
                </div>
              )}

              {/* Priority Badge */}
              <Badge 
                className={cn(
                  "absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0",
                  priorityConfig.color
                )}
              >
                {priorityConfig.label}
              </Badge>

              {/* Price Drop Badge */}
              {isBelowTarget && (
                <Badge className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[10px] px-1.5 py-0">
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                  Deal
                </Badge>
              )}

              {/* Alert Indicator */}
              {item.alert_enabled && item.target_price_usd && (
                <div className="absolute bottom-1.5 right-1.5">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Bell className="h-3 w-3 text-amber-500" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Alert at ${item.target_price_usd.toFixed(2)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              {/* Quantity Badge */}
              {item.quantity > 1 && (
                <Badge 
                  className="absolute bottom-1.5 left-1.5 bg-background/80 text-foreground text-[10px] px-1.5 py-0"
                >
                  ×{item.quantity}
                </Badge>
              )}

              {/* Hover Actions - Grid View Only */}
              {viewMode === 'grid' && (
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                  <Button 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); onBuy(item); }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-8"
                  >
                    <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                    Buy ${currentPrice.toFixed(2)}
                  </Button>
                  <div className="flex gap-1.5 w-full">
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={(e) => { e.stopPropagation(); onAddToCollection(item); }}
                      className="flex-1 h-8"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 px-2"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => onUpdatePriority(item.id, 'high')}>
                          <div className="w-2 h-2 rounded-full bg-rose-500 mr-2" />
                          High Priority
                          {item.priority === 'high' && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUpdatePriority(item.id, 'medium')}>
                          <div className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
                          Medium Priority
                          {item.priority === 'medium' && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUpdatePriority(item.id, 'low')}>
                          <div className="w-2 h-2 rounded-full bg-slate-500 mr-2" />
                          Low Priority
                          {item.priority === 'low' && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          setEditingTarget(item.id);
                          setTargetValue(item.target_price_usd?.toString() || '');
                        }}>
                          <TrendingDown className="h-4 w-4 mr-2" />
                          Set Target Price
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleAlert(item.id, !item.alert_enabled)}>
                          {item.alert_enabled ? (
                            <>
                              <BellOff className="h-4 w-4 mr-2" />
                              Disable Alert
                            </>
                          ) : (
                            <>
                              <Bell className="h-4 w-4 mr-2" />
                              Enable Alert
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => onRemove(item.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>

            {/* Card Info - Grid View Only */}
            {viewMode === 'grid' && (
              <div className="p-2 space-y-1">
                <h3 
                  className="text-sm font-medium truncate cursor-pointer hover:text-primary"
                  onClick={() => onCardClick(item)}
                >
                  {item.card_name}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    {item.card?.set_code || 'UNK'}
                  </span>
                  <span className={cn(
                    "text-sm font-semibold",
                    isBelowTarget ? "text-emerald-500" : ""
                  )}>
                    ${currentPrice.toFixed(2)}
                  </span>
                </div>
                {item.target_price_usd && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingDown className="h-3 w-3" />
                    Target: ${item.target_price_usd.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {/* Target Price Editor Modal */}
            {editingTarget === item.id && (
              <div 
                className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-medium mb-2">Set Target Price</p>
                <div className="flex gap-2 w-full">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 mt-2 w-full">
                  <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setEditingTarget(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1 h-8" onClick={() => handleSaveTarget(item)}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
