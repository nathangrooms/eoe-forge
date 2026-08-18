import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { CATEGORY_LABEL, categorizeCard } from '@/lib/deck/cardCategories';
import type { DeckCardRow } from '@/lib/deck/deckCards';

/**
 * A real sortable decklist.
 *
 * The old List tab was a `{qty}x {name}` stack with a price column that was
 * always blank, section headings that printed internal object keys, and no way
 * to sort anything.
 */

type SortKey = 'name' | 'quantity' | 'cmc' | 'type' | 'rarity' | 'set' | 'price';
type SortDir = 'asc' | 'desc';

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
  special: 4,
  bonus: 5,
};

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'quantity', label: 'Qty', numeric: true, className: 'w-14' },
  { key: 'name', label: 'Name' },
  { key: 'cmc', label: 'MV', numeric: true, className: 'w-16' },
  { key: 'type', label: 'Type', className: 'hidden md:table-cell' },
  { key: 'rarity', label: 'Rarity', className: 'hidden lg:table-cell w-24' },
  { key: 'set', label: 'Set', className: 'hidden lg:table-cell w-20' },
  { key: 'price', label: 'Price', numeric: true, className: 'w-24' },
];

function priceOf(row: DeckCardRow): number {
  const usd = parseFloat(row.card?.prices?.usd ?? '');
  return Number.isNaN(usd) ? 0 : usd;
}

function compare(a: DeckCardRow, b: DeckCardRow, key: SortKey): number {
  switch (key) {
    case 'quantity':
      return a.quantity - b.quantity;
    case 'cmc':
      return (a.card?.cmc ?? 0) - (b.card?.cmc ?? 0);
    case 'type':
      return (a.card?.type_line || '').localeCompare(b.card?.type_line || '');
    case 'rarity':
      return (
        (RARITY_ORDER[a.card?.rarity || ''] ?? -1) - (RARITY_ORDER[b.card?.rarity || ''] ?? -1)
      );
    case 'set':
      return (a.card?.set_code || '').localeCompare(b.card?.set_code || '');
    case 'price':
      return priceOf(a) - priceOf(b);
    case 'name':
    default:
      return (a.card?.name || a.card_name).localeCompare(b.card?.name || b.card_name);
  }
}

interface DeckCardTableProps {
  rows: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  className?: string;
}

export function DeckCardTable({ rows, onCardClick, className }: DeckCardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (sortDir === 'asc' ? compare(a, b, sortKey) : compare(b, a, sortKey)));
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPrice = rows.reduce((sum, row) => sum + priceOf(row) * row.quantity, 0);
  const totalCards = rows.reduce((sum, row) => sum + row.quantity, 0);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'type' || key === 'set' ? 'asc' : 'desc');
    }
  };

  if (rows.length === 0) {
    return (
      <p className={cn('px-4 py-8 text-center text-sm text-muted-foreground', className)}>
        No cards in this section.
      </p>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map(column => {
              const active = sortKey === column.key;
              return (
                <TableHead
                  key={column.key}
                  className={cn(column.numeric && 'text-right', column.className)}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      '-mx-2 h-7 gap-1 px-2 text-xs font-medium',
                      column.numeric && 'ml-auto flex'
                    )}
                  >
                    {column.label}
                    {active ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </Button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(row => {
            const category = categorizeCard(row.card?.type_line, {
              isCommander: row.is_commander,
              isSideboard: row.is_sideboard,
            });
            const price = priceOf(row);
            return (
              <TableRow
                key={row.id}
                className={onCardClick ? 'cursor-pointer' : undefined}
                onClick={() => onCardClick?.(row)}
              >
                <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{row.card?.name || row.card_name}</span>
                    {row.card?.mana_cost ? (
                      <ManaCost cost={row.card.mana_cost} size="xs" />
                    ) : null}
                  </div>
                  {!row.card && (
                    <span className="text-xs text-muted-foreground">
                      Card data not synced
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.card ? row.card.cmc : '—'}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {row.card?.type_line || CATEGORY_LABEL[category]}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm capitalize text-muted-foreground">
                  {row.card?.rarity || '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm uppercase text-muted-foreground">
                  {row.card?.set_code || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {price > 0 ? `$${(price * row.quantity).toFixed(2)}` : '—'}
                </TableCell>
              </TableRow>
            );
          })}
          {/* Separated by surface tint, not a rule — design law 2 rules out
              hairlines, `border-t-2` included. */}
          <TableRow className="bg-muted/60 font-medium hover:bg-muted/60">
            <TableCell className="text-right tabular-nums">{totalCards}</TableCell>
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="hidden md:table-cell" />
            <TableCell className="hidden lg:table-cell" />
            <TableCell className="hidden lg:table-cell" />
            <TableCell className="text-right tabular-nums">
              {totalPrice > 0 ? `$${totalPrice.toFixed(2)}` : '—'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export default DeckCardTable;
