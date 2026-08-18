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
  MoreHorizontal,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
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
    prices?: { usd?: string; usd_foil?: string };
    image_uris?: { small?: string; normal?: string };
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

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

/**
 * Density changes size, not capability.
 *
 * Compact mode previously gated BOTH the action overlay and the whole info
 * footer behind `viewMode === 'grid'`, so switching density silently removed
 * every affordance — no price, no buy, no remove, no reprioritise.
 */
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

  const isPriceBelowTarget = (item: WishlistItem) =>
    Boolean(
      item.target_price_usd &&
        item.card?.prices?.usd &&
        toNumber(item.card.prices.usd) <= item.target_price_usd
    );

  const handleSaveTarget = (item: WishlistItem) => {
    const price = parseFloat(targetValue);
    if (!Number.isNaN(price) && price > 0) onUpdateTargetPrice(item.id, price);
    setEditingTarget(null);
    setTargetValue('');
  };

  const minWidth = viewMode === 'grid' ? 160 : 108;

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
    >
      {items.map(item => {
        const currentPrice = toNumber(item.card?.prices?.usd);
        const belowTarget = isPriceBelowTarget(item);

        return (
          <div
            key={item.id}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors',
              belowTarget ? 'border-foreground' : 'border-border hover:border-foreground/40'
            )}
          >
            <button
              type="button"
              className="relative block w-full bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onCardClick(item)}
              aria-label={`${item.card_name} details`}
            >
              <div className="aspect-[5/7] w-full">
                {item.card?.image_uris?.normal ? (
                  <img
                    src={item.card.image_uris.normal}
                    alt={item.card_name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center">
                    <span className="text-xs text-muted-foreground">{item.card_name}</span>
                  </div>
                )}
              </div>

              {/* Badges sit over card art, so black/white is the honest ground. */}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {PRIORITY_LABEL[item.priority] ?? 'Med'}
              </span>
              {item.quantity > 1 && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  ×{item.quantity}
                </span>
              )}
              {belowTarget && (
                <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  Deal
                </span>
              )}
              {item.alert_enabled && item.target_price_usd && (
                <span
                  className="absolute bottom-1.5 right-1.5 rounded bg-black/80 p-1 text-white"
                  title={`Alert at ${formatPrice(item.target_price_usd)}`}
                >
                  <Bell className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </button>

            {/* Info + actions at EVERY density. */}
            <div className="flex flex-1 flex-col gap-1 p-2">
              <button
                type="button"
                className="truncate text-left text-xs font-medium text-card-foreground hover:underline"
                onClick={() => onCardClick(item)}
                title={item.card_name}
              >
                {item.card_name}
              </button>
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="truncate font-mono uppercase text-muted-foreground">
                  {item.card?.set_code || '—'}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-card-foreground">
                  {formatPrice(currentPrice)}
                </span>
              </div>
              {item.target_price_usd && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  Target {formatPrice(item.target_price_usd)}
                </div>
              )}

              <div className="mt-1 flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 flex-1 px-2 text-xs"
                  onClick={() => onBuy(item)}
                >
                  <ShoppingCart className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Buy
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => onAddToCollection(item)}
                  aria-label={`Move ${item.card_name} to collection`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`More actions for ${item.card_name}`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(['high', 'medium', 'low'] as const).map(priority => (
                      <DropdownMenuItem
                        key={priority}
                        onClick={() => onUpdatePriority(item.id, priority)}
                        className="capitalize"
                      >
                        {priority} priority
                        {item.priority === priority && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingTarget(item.id);
                        setTargetValue(item.target_price_usd?.toString() ?? '');
                      }}
                    >
                      <TrendingDown className="mr-2 h-4 w-4" aria-hidden="true" />
                      Set target price
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleAlert(item.id, !item.alert_enabled)}>
                      {item.alert_enabled ? (
                        <>
                          <BellOff className="mr-2 h-4 w-4" aria-hidden="true" />
                          Disable alert
                        </>
                      ) : (
                        <>
                          <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                          Enable alert
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {editingTarget === item.id && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/95 p-3">
                <p className="text-sm font-medium">Target price</p>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm"
                  aria-label="Target price"
                  autoFocus
                />
                <div className="flex w-full gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1"
                    onClick={() => setEditingTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" className="h-8 flex-1" onClick={() => handleSaveTarget(item)}>
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
