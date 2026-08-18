import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ManaCost } from '@/components/ui/mana-cost';
import { MoreHorizontal, Minus, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  copiesOf,
  formatPrice,
  valueOf,
  type BrowserCard,
} from './types';
import type { BrowserAction } from './actions';

interface TileProps {
  card: BrowserCard;
  onClick?: (card: BrowserCard) => void;
  actions: BrowserAction[];
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (rowId: string) => void;
  onQuantityChange?: (card: BrowserCard, delta: number) => void;
  showCondition: boolean;
}

/**
 * Grid tile. Shows the three facts that define a collection — copies, foil
 * count, condition — which the previous shared renderer never read off the row.
 */
export function CollectionCardTile({
  card,
  onClick,
  actions,
  selectionMode,
  selected,
  onToggleSelect,
  onQuantityChange,
  showCondition,
}: TileProps) {
  const copies = copiesOf(card);

  const handleActivate = () => {
    if (selectionMode) onToggleSelect(card.rowId);
    else onClick?.(card);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors',
        selected ? 'border-foreground' : 'border-border hover:border-foreground/40'
      )}
    >
      <button
        type="button"
        onClick={handleActivate}
        aria-label={`${card.name}${selectionMode ? ', toggle selection' : ', view details'}`}
        className="relative block w-full bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="aspect-[5/7] w-full">
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
              <span className="text-xs font-medium text-muted-foreground">{card.name}</span>
              <ManaCost cost={card.manaCost} size="xs" />
            </div>
          )}
        </div>

        {/* Copies owned. Over card art, so white-on-black is the honest ground. */}
        {copies > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            ×{copies}
          </span>
        )}
        {card.foil > 0 && (
          <span
            className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            title={`${card.foil} foil ${card.foil === 1 ? 'copy' : 'copies'}`}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {card.foil}
          </span>
        )}

        {selectionMode && (
          <span className="absolute bottom-1.5 left-1.5">
            <Checkbox
              checked={selected}
              aria-label={`Select ${card.name}`}
              className="bg-background"
              tabIndex={-1}
            />
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <div className="flex items-start justify-between gap-1">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground" title={card.name}>
            {card.name}
          </p>
          <ManaCost cost={card.manaCost} size="xs" className="shrink-0" />
        </div>

        <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span className="truncate font-mono uppercase" title={card.typeLine}>
            {card.setCode || '—'}
            {card.collectorNumber ? ` · ${card.collectorNumber}` : ''}
          </span>
          <span className="shrink-0 tabular-nums text-card-foreground">
            {formatPrice(valueOf(card))}
          </span>
        </div>

        {showCondition && (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="h-5 px-1 text-[10px] font-normal">
              {card.condition}
            </Badge>
            {onQuantityChange && (
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  aria-label={`Remove one copy of ${card.name}`}
                  onClick={() => onQuantityChange(card, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  aria-label={`Add one copy of ${card.name}`}
                  onClick={() => onQuantityChange(card, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="absolute bottom-1.5 right-1.5 h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Actions for ${card.name}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map(action => (
              <DropdownMenuItem
                key={action.id}
                onClick={() => action.onSelect(card)}
                className={cn('gap-2', action.destructive && 'text-destructive focus:text-destructive')}
              >
                {action.icon && <action.icon className="h-4 w-4" />}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
