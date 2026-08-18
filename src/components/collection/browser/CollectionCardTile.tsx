import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ManaCost } from '@/components/ui/mana-cost';
import { Check, MoreHorizontal, Minus, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import { copiesOf, formatPrice, imageCardOf, valueOf, type BrowserCard } from './types';
import type { BrowserAction } from './actions';

interface TileProps {
  card: BrowserCard;
  /** Rendered width in px, straight from the size slider. Drives image quality. */
  width: number;
  onClick?: (card: BrowserCard) => void;
  actions: BrowserAction[];
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (rowId: string) => void;
  onQuantityChange?: (card: BrowserCard, delta: number) => void;
  showCondition: boolean;
}

/** Below this the card is a thumbnail and the text strip would be unreadable. */
const META_THRESHOLD = 132;

/**
 * Grid tile: the card at the resolution it is actually drawn at, with the three
 * facts that define a collection entry — copies, foil count, condition — carried
 * on the art rather than in a boxed caption underneath.
 */
export function CollectionCardTile({
  card,
  width,
  onClick,
  actions,
  selectionMode,
  selected,
  onToggleSelect,
  onQuantityChange,
  showCondition,
}: TileProps) {
  const copies = copiesOf(card);
  const showMeta = width >= META_THRESHOLD;

  const handleActivate = () => {
    if (selectionMode) onToggleSelect(card.rowId);
    else onClick?.(card);
  };

  return (
    <div className="group/tile flex flex-col gap-1.5">
      <CardImage
        card={imageCardOf(card)}
        width={width}
        fill
        onClick={handleActivate}
        title={`${card.name}${copies ? ` — ${copies} owned` : ''}`}
        imageClassName={cn(
          selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
        )}
      >
        {/* Copies owned — over card art, so a solid ink plate is the honest ground. */}
        {copies > 0 && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
            ×{copies}
          </span>
        )}
        {card.foil > 0 && (
          <span
            className="pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm"
            title={`${card.foil} foil ${card.foil === 1 ? 'copy' : 'copies'}`}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {card.foil}
          </span>
        )}

        {selectionMode && (
          <span
            className={cn(
              'pointer-events-none absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full transition-colors',
              selected ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white/70'
            )}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        )}

        {/* Price rides the art at thumbnail sizes, where there is no meta strip. */}
        {!showMeta && (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
            {formatPrice(valueOf(card))}
          </span>
        )}

        {actions.length > 0 && showMeta && (
          <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-6 w-6"
                  aria-label={`Actions for ${card.name}`}
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-0">
                {actions.map(action => (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={() => action.onSelect(card)}
                    className={cn(
                      'gap-2',
                      action.destructive && 'text-destructive focus:text-destructive'
                    )}
                  >
                    {action.icon && <action.icon className="h-4 w-4" />}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardImage>

      {showMeta && (
        <div className="flex flex-col gap-0.5 px-0.5">
          <div className="flex items-start justify-between gap-1">
            <p
              className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
              title={card.name}
            >
              {card.name}
            </p>
            <ManaCost cost={card.manaCost} size="xs" className="shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate font-mono uppercase" title={card.typeLine}>
              {card.setCode || '—'}
              {card.collectorNumber ? ` · ${card.collectorNumber}` : ''}
              {showCondition ? ` · ${card.condition}` : ''}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatPrice(valueOf(card))}
            </span>
          </div>

          {showCondition && onQuantityChange && (
            <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100">
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
  );
}
