import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ManaCost } from '@/components/ui/mana-cost';
import { ArrowDown, ArrowUp, MoreHorizontal, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import {
  copiesOf,
  formatPriceOrUnknown,
  imageCardOf,
  valueOf,
  type BrowserCard,
  type SortDirection,
  type SortKey,
} from './types';
import type { BrowserAction } from './actions';

interface Column {
  key: string;
  label: string;
  sortKey?: SortKey;
  className?: string;
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'art', label: '', className: 'w-12' },
  { key: 'qty', label: 'Qty', sortKey: 'quantity', numeric: true, className: 'w-16' },
  { key: 'name', label: 'Name', sortKey: 'name' },
  { key: 'cost', label: 'Cost', sortKey: 'cmc', className: 'w-28 hidden md:table-cell' },
  { key: 'type', label: 'Type', className: 'hidden lg:table-cell' },
  { key: 'set', label: 'Set', sortKey: 'set', className: 'w-24 hidden sm:table-cell' },
  { key: 'rarity', label: 'Rarity', sortKey: 'rarity', className: 'w-24 hidden lg:table-cell' },
  { key: 'condition', label: 'Cond.', className: 'w-20 hidden md:table-cell' },
  { key: 'price', label: 'Unit', sortKey: 'price', numeric: true, className: 'w-24' },
  { key: 'value', label: 'Total', sortKey: 'value', numeric: true, className: 'w-24' },
];

interface CollectionTableProps {
  cards: BrowserCard[];
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  onCardClick?: (card: BrowserCard) => void;
  actions: BrowserAction[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (rowId: string) => void;
  showCondition: boolean;
}

/**
 * The sortable table collectors live in. Previously "list" mode was a stack of
 * Cards with no header row and no sorting at all.
 */
export function CollectionTable({
  cards,
  sortKey,
  sortDir,
  onSort,
  onCardClick,
  actions,
  selectionMode,
  selectedIds,
  onToggleSelect,
  showCondition,
}: CollectionTableProps) {
  const columns = COLUMNS.filter(c => c.key !== 'condition' || showCondition);

  return (
    <div className="overflow-x-auto rounded-lg bg-card shadow-lg shadow-black/20">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr>
            {selectionMode && <th scope="col" className="w-10 px-2" />}
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground',
                  col.numeric && 'text-right',
                  col.className
                )}
                aria-sort={
                  col.sortKey === sortKey
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                {col.sortKey ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.sortKey!)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-foreground',
                      col.sortKey === sortKey && 'text-foreground'
                    )}
                  >
                    {col.label}
                    {col.sortKey === sortKey &&
                      (sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
            {actions.length > 0 && <th scope="col" className="w-10 px-2" />}
          </tr>
        </thead>
        <tbody>
          {cards.map(card => {
            const selected = selectedIds.has(card.rowId);
            return (
              <tr
                key={card.rowId}
                className={cn(
                  // Rows are separated by an alternating surface tint, not a rule.
                  'transition-colors odd:bg-muted/20 hover:bg-muted/50',
                  selected && 'bg-muted'
                )}
              >
                {selectionMode && (
                  <td className="px-2">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggleSelect(card.rowId)}
                      aria-label={`Select ${card.name}`}
                    />
                  </td>
                )}
                <td className="py-1.5 pl-3 pr-0">
                  <CardImage
                    card={imageCardOf(card)}
                    width={36}
                    hideFlip
                    onClick={() =>
                      selectionMode ? onToggleSelect(card.rowId) : onCardClick?.(card)
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="font-medium">{copiesOf(card)}</span>
                  {card.foil > 0 && (
                    <span
                      className="ml-1 inline-flex items-center text-muted-foreground"
                      title={`${card.foil} foil`}
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      {card.foil}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      selectionMode ? onToggleSelect(card.rowId) : onCardClick?.(card)
                    }
                    className="max-w-[22ch] truncate text-left font-medium hover:underline sm:max-w-none"
                  >
                    {card.name}
                  </button>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <ManaCost cost={card.manaCost} size="xs" />
                </td>
                <td className="hidden max-w-[24ch] truncate px-3 py-2 text-muted-foreground lg:table-cell">
                  {card.typeLine}
                </td>
                <td className="hidden px-3 py-2 font-mono text-xs uppercase text-muted-foreground sm:table-cell">
                  {card.setCode || '—'}
                  {card.collectorNumber ? ` ${card.collectorNumber}` : ''}
                </td>
                <td className="hidden px-3 py-2 capitalize text-muted-foreground lg:table-cell">
                  {card.rarity}
                </td>
                {showCondition && (
                  <td className="hidden px-3 py-2 md:table-cell">
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {card.condition}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatPriceOrUnknown(card.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatPriceOrUnknown(valueOf(card))}
                </td>
                {actions.length > 0 && (
                  <td className="px-2">
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
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
