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
import { AddToListButton } from '@/components/shopping';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { CATEGORY_LABEL, categorizeCard } from '@/lib/deck/cardCategories';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { CardPlayability, ManaProfile } from '@/lib/deck/playability';
import { PlayabilityMeter } from './PlayabilityMeter';
import { describeGapsShort, formatAmount, readAmount, totalPrices } from '@/lib/pricing';

/**
 * A real sortable decklist.
 *
 * The old List tab was a `{qty}x {name}` stack with a price column that was
 * always blank, section headings that printed internal object keys, and no way
 * to sort anything.
 *
 * Playability is a first-class column here, not an afterthought: the owner
 * called it "one of the most important things" on this page, and a sortable
 * column is the only way to answer "what in this deck can I not cast?" in one
 * action. It is optional on the props, so the public deck page — which has no
 * mana profile to hand — keeps rendering exactly as before.
 */

type SortKey =
  | 'name'
  | 'quantity'
  | 'cmc'
  | 'playability'
  | 'type'
  | 'rarity'
  | 'set'
  | 'price';
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

const BASE_COLUMNS: Column[] = [
  { key: 'quantity', label: 'Qty', numeric: true, className: 'w-16' },
  { key: 'name', label: 'Name' },
  { key: 'cmc', label: 'MV', numeric: true, className: 'w-16' },
];

const PLAYABILITY_COLUMN: Column = {
  key: 'playability',
  label: 'Playability',
  numeric: true,
  className: 'w-40',
};

const TAIL_COLUMNS: Column[] = [
  { key: 'type', label: 'Type', className: 'hidden md:table-cell' },
  { key: 'rarity', label: 'Rarity', className: 'hidden lg:table-cell w-28' },
  { key: 'set', label: 'Set', className: 'hidden lg:table-cell w-20' },
  { key: 'price', label: 'Price', numeric: true, className: 'w-28' },
];

/**
 * The dollar price of one copy, or null when we do not have one.
 *
 * Null rather than 0 on purpose. Measured on the live `cards` table, the
 * smallest stored `usd` is 0.01 and not one row holds a zero, so a zero here
 * always means "no price" and printing it would tell a player the card is
 * worthless. 5,186 of 52,130 printings have no `usd` at all, so this is not a
 * rare branch.
 */
function priceOf(row: DeckCardRow): number | null {
  return readAmount(row.card?.prices?.usd);
}

interface DeckCardTableProps {
  rows: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /**
   * Castability for a row, from the memoised engine. Omit it and the column is
   * not rendered at all — better than a column of dashes.
   */
  playabilityFor?: (row: DeckCardRow) => CardPlayability | null;
  /** Required alongside `playabilityFor`; the tooltip explains from it. */
  manaProfile?: ManaProfile;
  /** Shown when `rows` is empty. The filtered list wants a different sentence. */
  emptyMessage?: string;
  className?: string;
}

export function DeckCardTable({
  rows,
  onCardClick,
  playabilityFor,
  manaProfile,
  emptyMessage = 'No cards in this section.',
  className,
}: DeckCardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const showPlayability = Boolean(playabilityFor && manaProfile);

  const columns = useMemo(
    () =>
      showPlayability
        ? [...BASE_COLUMNS, PLAYABILITY_COLUMN, ...TAIL_COLUMNS]
        : [...BASE_COLUMNS, ...TAIL_COLUMNS],
    [showPlayability]
  );

  const sorted = useMemo(() => {
    const compare = (a: DeckCardRow, b: DeckCardRow, key: SortKey): number => {
      switch (key) {
        case 'quantity':
          return a.quantity - b.quantity;
        case 'cmc':
          return (a.card?.cmc ?? 0) - (b.card?.cmc ?? 0);
        case 'playability':
          return (playabilityFor?.(a)?.pct ?? 0) - (playabilityFor?.(b)?.pct ?? 0);
        case 'type':
          return (a.card?.type_line || '').localeCompare(b.card?.type_line || '');
        case 'rarity':
          return (
            (RARITY_ORDER[a.card?.rarity || ''] ?? -1) -
            (RARITY_ORDER[b.card?.rarity || ''] ?? -1)
          );
        case 'set':
          return (a.card?.set_code || '').localeCompare(b.card?.set_code || '');
        case 'price':
          // Unpriced rows sort below every real price, exactly where a 0 used
          // to put them, so the sort order does not change under anyone.
          return (priceOf(a) ?? -1) - (priceOf(b) ?? -1);
        case 'name':
        default:
          return (a.card?.name || a.card_name).localeCompare(b.card?.name || b.card_name);
      }
    };

    const copy = [...rows];
    copy.sort((a, b) => {
      // Rows with no castability figure — lands, and anything whose printing is
      // unsynced — sink to the bottom in *both* directions. Sorting by
      // playability asks a question about spells; forty lands ahead of the
      // answer is not an answer.
      if (sortKey === 'playability') {
        const pa = playabilityFor?.(a)?.pct ?? null;
        const pb = playabilityFor?.(b)?.pct ?? null;
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
      }
      return sortDir === 'asc' ? compare(a, b, sortKey) : compare(b, a, sortKey);
    });
    return copy;
  }, [rows, sortKey, sortDir, playabilityFor]);

  /**
   * The deck's dollar value, and the count of copies it could not price.
   *
   * The old sum added a 0 for every card we have no price for, so a decklist
   * with unpriced cards showed a confident figure that was quietly too low and
   * nothing on screen said so. This keeps the two facts together.
   */
  const total = totalPrices(
    rows.map(row => ({ prices: row.card?.prices, quantity: row.quantity })),
    'USD'
  );
  const totalCards = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalMissing = describeGapsShort(total);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text sorts open A→Z; the numeric ones open with the interesting end
      // first, and for playability the interesting end is the *worst* card.
      setSortDir(
        key === 'name' || key === 'type' || key === 'set' || key === 'playability'
          ? 'asc'
          : 'desc'
      );
    }
  };

  if (rows.length === 0) {
    return (
      <p className={cn('px-4 py-10 text-center text-base text-muted-foreground', className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      {/* 15px rather than the primitive's 14px. The owner's most repeated note
          across this project is that everything is too small, and this is the
          table they will read a hundred rows of. */}
      <Table className="text-[15px]">
        {/* `border-0` on the row is not enough here. `TableHeader` carries
            `[&_tr]:border-b`, and a descendant selector outranks a plain
            utility class no matter what tailwind-merge does to the row's own
            className — so the header kept its hairline while the body rows lost
            theirs. Killing it has to happen on the same element that sets it. */}
        <TableHeader className="[&_tr]:border-b-0">
          {/* The primitive draws a hairline under every row. Design law 2 rules
              those out, so this table separates rows by surface tint instead —
              a faint zebra — and the header by a tinted ground. */}
          <TableRow className="border-0 bg-muted/30 hover:bg-muted/30">
            {columns.map(column => {
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
                      '-mx-2 h-8 gap-1 px-2 text-xs font-semibold uppercase tracking-wide',
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
          {sorted.map((row, index) => {
            const category = categorizeCard(row.card?.type_line, {
              isCommander: row.is_commander,
              isSideboard: row.is_sideboard,
            });
            const price = priceOf(row);
            return (
              <TableRow
                key={row.id}
                className={cn(
                  'group border-0',
                  index % 2 === 1 && 'bg-muted/20',
                  onCardClick && 'cursor-pointer'
                )}
                onClick={() => onCardClick?.(row)}
              >
                <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{row.card?.name || row.card_name}</span>
                    <span className="flex items-center gap-1.5">
                      {/* Revealed on hover rather than stamped on all ninety
                          nine rows: the same reveal the search results use, and
                          the same button, so the action reads identically. */}
                      <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
                        <AddToListButton
                          card={{ id: row.card_id, name: row.card?.name || row.card_name }}
                          kind="shopping"
                          display="icon"
                          variant="ghost"
                        />
                        <AddToListButton
                          card={{ id: row.card_id, name: row.card?.name || row.card_name }}
                          kind="proxy"
                          display="icon"
                          variant="ghost"
                        />
                      </span>
                      {row.card?.mana_cost ? (
                        <ManaCost cost={row.card.mana_cost} size="sm" />
                      ) : null}
                    </span>
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
                {showPlayability && (
                  <TableCell className="text-right">
                    <span className="flex justify-end">
                      <PlayabilityMeter
                        card={playabilityFor?.(row) ?? null}
                        profile={manaProfile as ManaProfile}
                      />
                    </span>
                  </TableCell>
                )}
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
                  {price != null ? (
                    formatAmount(price * row.quantity, 'USD')
                  ) : (
                    <span className="text-muted-foreground" title="No price for this printing">
                      No price
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {/* Separated by surface tint, not a rule — design law 2 rules out
              hairlines, `border-t-2` included. */}
          <TableRow className="border-0 bg-muted/60 font-medium hover:bg-muted/60">
            <TableCell className="text-right tabular-nums">{totalCards}</TableCell>
            <TableCell>Total</TableCell>
            <TableCell />
            {showPlayability && <TableCell />}
            <TableCell className="hidden md:table-cell" />
            <TableCell className="hidden lg:table-cell" />
            <TableCell className="hidden lg:table-cell" />
            <TableCell className="text-right tabular-nums">
              {total.pricedCopies > 0 ? (
                formatAmount(total.amount, 'USD')
              ) : (
                <span className="font-normal text-muted-foreground">No prices yet</span>
              )}
              {totalMissing && (
                <span
                  className="block text-[0.7rem] font-normal text-muted-foreground"
                  title={`${totalMissing} in this total had no price, so the real figure is higher.`}
                >
                  {totalMissing}
                </span>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export default DeckCardTable;
