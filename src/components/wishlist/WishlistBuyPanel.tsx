import { useMemo } from 'react';
import { ClipboardList, ExternalLink, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';

interface BuyPanelItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  card?: any;
}

interface WishlistBuyPanelProps {
  /** The rows currently on screen — filtering the list refigures the basket. */
  items: BuyPanelItem[];
  /** True when a search or filter is narrowing the list. */
  filtered: boolean;
  /** Card ids a deck of yours is actually short of. */
  neededByDeck: Set<string>;
  onCopyBuyList: (items: BuyPanelItem[]) => void;
}

const BANDS: { key: string; label: string }[] = [
  { key: 'high', label: 'High priority' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

/**
 * The path from "I want this" to "I own this".
 *
 * A wishlist that only offers a per-card Buy button makes you open ninety-four
 * tabs. This is the whole basket: what the rows on screen cost, what the split
 * by priority is, which of them a deck is actually waiting on, and one action
 * that puts the list on the clipboard in the format a mass-entry box accepts.
 *
 * Every figure is the sum of the market prices on the rows above — filter the
 * list and the basket changes with it.
 */
export function WishlistBuyPanel({
  items,
  filtered,
  neededByDeck,
  onCopyBuyList,
}: WishlistBuyPanelProps) {
  const summary = useMemo(() => {
    const priceOf = (item: BuyPanelItem) => toNumber(item.card?.prices?.usd) * (item.quantity ?? 1);

    const total = items.reduce((sum, item) => sum + priceOf(item), 0);
    const copies = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    const unpriced = items.filter(item => toNumber(item.card?.prices?.usd) <= 0).length;

    /* Only worth showing when the list actually splits. With every row at the
       same priority the band tile just restates the headline total. */
    const allBands = BANDS.map(band => {
      const rows = items.filter(item => item.priority === band.key);
      // A band whose only card has no price used to print "$0.00", which reads
      // as "these cards are free" rather than "we cannot price them". The count
      // of priced rows is what tells the two apart.
      const pricedRows = rows.filter(item => toNumber(item.card?.prices?.usd) > 0);
      return {
        ...band,
        count: rows.length,
        pricedCount: pricedRows.length,
        total: pricedRows.reduce((sum, item) => sum + priceOf(item), 0),
      };
    }).filter(band => band.count > 0);
    const bands = allBands.length > 1 ? allBands : [];

    /* Median and concentration: the two figures that answer "can I chip away at
       this" versus "is it four cards holding the whole bill". Both are computed
       from the same priced rows, never estimated. */
    const priced = items.map(priceOf).filter(value => value > 0).sort((a, b) => a - b);
    const median = priced.length
      ? priced.length % 2
        ? priced[(priced.length - 1) / 2]
        : (priced[priced.length / 2 - 1] + priced[priced.length / 2]) / 2
      : 0;
    const topTen = priced.slice(-10).reduce((a, b) => a + b, 0);
    const pricedTotal = priced.reduce((a, b) => a + b, 0);

    const forDecks = items.filter(item => neededByDeck.has(item.card_id));
    const dearest = [...items]
      .sort((a, b) => priceOf(b) - priceOf(a))
      .slice(0, 8)
      .filter(item => toNumber(item.card?.prices?.usd) > 0);

    return {
      total,
      copies,
      unpriced,
      median,
      topShare: pricedTotal > 0 ? topTen / pricedTotal : 0,
      bands,
      forDeckCount: forDecks.length,
      forDeckTotal: forDecks.reduce((sum, item) => sum + priceOf(item), 0),
      dearest,
    };
  }, [items, neededByDeck]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {filtered ? 'Buying what is on screen' : 'Buying the whole wishlist'}
          </h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {formatPrice(summary.total)}
            </span>
            <span className="text-sm text-muted-foreground">
              {summary.copies} cop{summary.copies === 1 ? 'y' : 'ies'} across {items.length} card
              {items.length === 1 ? '' : 's'}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Market price per printing, multiplied by the quantity you want
            {/* Says what the total leaves out, in words that agree with
                themselves: it read "1 card has no price recorded and count as
                nothing" for a single card, and "counts as nothing" reads as if
                the card is worth nothing rather than unknown. */}
            {summary.unpriced > 0 &&
              ` · ${summary.unpriced} card${summary.unpriced === 1 ? ' is' : 's are'} not in this total because we have no price for ${summary.unpriced === 1 ? 'it' : 'them'} yet`}
          </p>
        </div>

        <Button className="shrink-0" onClick={() => onCopyBuyList(items)}>
          <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
          Copy {items.length} line{items.length === 1 ? '' : 's'} & open mass entry
          <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {summary.forDeckCount > 0 && (
          <div className="min-w-[12rem] flex-1 rounded-lg bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <Layers className="h-3 w-3" aria-hidden="true" />
              A deck is short of
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {summary.forDeckCount} card{summary.forDeckCount === 1 ? '' : 's'}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatPrice(summary.forDeckTotal)} of the total
            </p>
          </div>
        )}

        <div className="min-w-[12rem] flex-1 rounded-lg bg-muted/30 p-3">
          <p className="text-[0.7rem] text-muted-foreground">Median card</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {formatPrice(summary.median)}
          </p>
          <p className="text-xs text-muted-foreground">
            half the list costs less than this
          </p>
        </div>

        <div className="min-w-[12rem] flex-1 rounded-lg bg-muted/30 p-3">
          <p className="text-[0.7rem] text-muted-foreground">Dearest ten</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {Math.round(summary.topShare * 100)}%
          </p>
          <p className="text-xs text-muted-foreground">of the total sits in ten cards</p>
        </div>

        {summary.bands.map(band => (
          <div key={band.key} className="min-w-[12rem] flex-1 rounded-lg bg-muted/30 p-3">
            <p className="text-[0.7rem] text-muted-foreground">{band.label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {band.pricedCount > 0 ? formatPrice(band.total) : 'No price'}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {band.count} card{band.count === 1 ? '' : 's'}
              {band.pricedCount < band.count &&
                `, ${band.count - band.pricedCount} not priced`}
            </p>
          </div>
        ))}
      </div>

      {summary.dearest.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Where the money goes
          </p>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {summary.dearest.map(item => (
              <div key={item.id} className="min-w-0">
                <CardImage card={item.card} size="sm" fill quality="normal" />
                <p
                  className={cn(
                    'mt-1 truncate text-[0.65rem] font-semibold tabular-nums text-foreground'
                  )}
                >
                  {formatPrice(toNumber(item.card?.prices?.usd) * (item.quantity ?? 1))}
                </p>
                <p className="truncate text-[0.65rem] text-muted-foreground" title={item.card_name}>
                  {item.card_name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
