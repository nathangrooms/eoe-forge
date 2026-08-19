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
import { CardGrid, CardImage } from '@/components/cards';
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
  card?: any;
}

interface WishlistCardGridProps {
  items: WishlistItem[];
  /** Card width in px, straight from the shared size slider. */
  width: number;
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

/** Below this the card is a thumbnail; the action row would not fit. */
const ACTIONS_THRESHOLD = 132;

/**
 * Size changes size, not capability.
 *
 * The old compact mode gated BOTH the action overlay and the whole info footer
 * behind `viewMode === 'grid'`, so switching density silently removed every
 * affordance. Now the size is continuous and only the *layout* of the controls
 * responds to it — below `ACTIONS_THRESHOLD` the buy/menu row folds into a
 * single overlay button rather than disappearing.
 */
export function WishlistCardGrid({
  items,
  width,
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

  /* `readAmount` returns null for a missing price rather than 0, so a card we
     cannot price never reports itself as a deal at or below the target. */
  const isPriceBelowTarget = (item: WishlistItem) => {
    const current = readAmount(item.card?.prices?.usd);
    return Boolean(item.target_price_usd && current != null && current <= item.target_price_usd);
  };

  const handleSaveTarget = (item: WishlistItem) => {
    const price = parseFloat(targetValue);
    if (!Number.isNaN(price) && price > 0) onUpdateTargetPrice(item.id, price);
    setEditingTarget(null);
    setTargetValue('');
  };

  const roomy = width >= ACTIONS_THRESHOLD;

  return (
    <CardGrid width={width}>
      {items.map(item => {
        const belowTarget = isPriceBelowTarget(item);

        const menu = (
          <DropdownMenuContent align="end" className="border-0">
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
            {!roomy && (
              <>
                <DropdownMenuItem onClick={() => onBuy(item)}>
                  <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
                  Buy
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddToCollection(item)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Move to collection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
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
        );

        return (
          <div key={item.id} className="group/wish relative flex flex-col gap-1.5">
            <CardImage
              card={item.card ?? { name: item.card_name }}
              width={width}
              fill
              onClick={() => onCardClick(item)}
              title={item.card_name}
              imageClassName={cn(
                belowTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
            >
              {/*
               * NOTHING SITS ON THE TOP EDGE OF THE ART.
               *
               * Priority was pinned `left-1.5 top-1.5` and the deal/alert badge
               * `right-1.5 top-1.5` — straight across a Magic card's title bar
               * and its mana cost. At grid size "Tezzeret, Betrayer of Flesh"
               * read as "ret, Betrayer of Flesh". Priority, deal and alert are
               * facts about the wishlist *entry* rather than about the printing,
               * so they belong in the strip underneath. The only thing left on
               * the art is the copy count, along the bottom edge.
               */}
              {item.quantity > 1 && (
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                  ×{item.quantity}
                </span>
              )}

              {/* At thumbnail sizes the whole action set folds into one menu. */}
              {!roomy && (
                <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/wish:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-6 w-6"
                        aria-label={`Actions for ${item.card_name}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    {menu}
                  </DropdownMenu>
                </div>
              )}
            </CardImage>

            <div className="flex flex-col gap-0.5 px-0.5">
              <button
                type="button"
                className="truncate text-left text-xs font-medium text-foreground hover:underline"
                onClick={() => onCardClick(item)}
                title={item.card_name}
              >
                {item.card_name}
              </button>
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className="shrink-0 rounded bg-muted px-1 font-semibold text-foreground"
                    title={`${PRIORITY_LABEL[item.priority] ?? 'Med'} priority`}
                  >
                    {PRIORITY_LABEL[item.priority] ?? 'Med'}
                  </span>
                  {belowTarget && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary px-1 font-semibold text-primary-foreground"
                      title={`At or below your ${formatPrice(item.target_price_usd ?? 0)} target`}
                    >
                      <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
                      Deal
                    </span>
                  )}
                  {item.alert_enabled && item.target_price_usd && !belowTarget && (
                    <Bell
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-label={`Alert at ${formatPrice(item.target_price_usd)}`}
                    />
                  )}
                  <span className="truncate font-mono uppercase text-muted-foreground">
                    {item.card?.set_code || '—'}
                  </span>
                </span>
                {/* PriceTag, not formatPrice: a card we hold no price for used
                    to render "$0.00" here, which reads as worthless rather than
                    unknown. */}
                <PriceTag card={item.card} size="sm" className="shrink-0 font-semibold" />
              </div>
              {item.target_price_usd && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  Target {formatPrice(item.target_price_usd)}
                </div>
              )}

              {roomy && (
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
                    variant="ghost"
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
                    {menu}
                  </DropdownMenu>
                </div>
              )}
            </div>

            {editingTarget === item.id && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/95 p-3 shadow-lg shadow-black/40">
                <p className="text-sm font-medium">Target price</p>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value)}
                  placeholder="0.00"
                  className="h-8 border-0 bg-muted/50 text-sm"
                  aria-label="Target price"
                  autoFocus
                />
                <div className="flex w-full gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
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
    </CardGrid>
  );
}
