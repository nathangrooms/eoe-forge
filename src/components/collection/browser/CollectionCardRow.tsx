import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColorIdentity, ManaCost } from '@/components/ui/mana-cost';
import { Minus, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import {
  copiesOf,
  formatPriceOrUnknown,
  imageCardOf,
  valueOf,
  type BrowserCard,
} from './types';
import type { BrowserAction } from './actions';

interface RowProps {
  card: BrowserCard;
  onClick?: (card: BrowserCard) => void;
  actions: BrowserAction[];
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (rowId: string) => void;
  onQuantityChange?: (card: BrowserCard, delta: number) => void;
  showCondition: boolean;
}

/** Roomy list row — real card thumbnail, full identity line, price. */
export function CollectionCardRow({
  card,
  onClick,
  actions,
  selectionMode,
  selected,
  onToggleSelect,
  onQuantityChange,
  showCondition,
}: RowProps) {
  const activate = () => (selectionMode ? onToggleSelect(card.rowId) : onClick?.(card));

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        selected ? 'bg-muted' : 'bg-card hover:bg-muted/50'
      )}
    >
      {selectionMode && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(card.rowId)}
          aria-label={`Select ${card.name}`}
        />
      )}

      <CardImage
        card={imageCardOf(card)}
        size="sm"
        width={52}
        onClick={activate}
        hideFlip
        className="shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={activate}
            className="truncate font-medium text-foreground hover:underline"
          >
            {card.name}
          </button>
          <ManaCost cost={card.manaCost} size="xs" />
          {!card.manaCost && <ColorIdentity colors={card.colorIdentity} size="xs" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{card.typeLine || '—'}</span>
          <span className="font-mono uppercase">
            {card.setCode || '—'}
            {card.collectorNumber ? ` ${card.collectorNumber}` : ''}
          </span>
          <span className="capitalize">{card.rarity}</span>
          {showCondition && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              {card.condition}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium tabular-nums text-foreground">
            {formatPriceOrUnknown(valueOf(card))}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {copiesOf(card)} × {formatPriceOrUnknown(card.unitPrice)}
            {card.foil > 0 && (
              <span className="ml-1 inline-flex items-center" title={`${card.foil} foil`}>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {card.foil}
              </span>
            )}
          </div>
        </div>

        {onQuantityChange && (
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`Remove one copy of ${card.name}`}
              onClick={() => onQuantityChange(card, -1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`Add one copy of ${card.name}`}
              onClick={() => onQuantityChange(card, 1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={`Actions for ${card.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-0"
              /*
               * A menu's clicks are the MENU's, and stop here.
               *
               * Radix renders this content through `createPortal`, and a React
               * portal keeps REACT-tree propagation even though the DOM node
               * lives under `document.body`. So a click on "Remove one copy"
               * bubbled up the React tree into the card's own `onClick` and
               * navigated to the card page: the action ran AND you were thrown
               * onto another screen. Measured in a browser, not reasoned about.
               *
               * This is the other half of the owner's report that storage
               * "often also goes to card page instead of adding properly" — it
               * was not only the search picker, it was every action menu on
               * every card in the collection browser.
               */
              onClick={event => event.stopPropagation()}
            >
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
        )}
      </div>
    </div>
  );
}
