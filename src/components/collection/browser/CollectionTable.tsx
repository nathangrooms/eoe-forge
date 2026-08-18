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
import { ArrowDown, ArrowUp, MoreHorizontal, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  copiesOf,
  formatPrice,
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
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b border-border">
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
                  'border-b border-border last:border-0 transition-colors hover:bg-accent/50',
                  selected && 'bg-accent'
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
                    <Badge variant="outline" className="h-5 px-1 text-[10px] font-normal">
                      {card.condition}
                    </Badge>
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatPrice(card.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatPrice(valueOf(card))}
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
                      <DropdownMenuContent align="end">
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
