import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CardImage } from './CardImage';
import { formatUsd, rarityClass, rarityCode, scryfallUrl, tcgplayerUrl } from '@/lib/scryfall/card-utils';
import { ExternalLink, Layers, ShoppingCart } from 'lucide-react';

/**
 * Every printing of a card, side by side.
 *
 * This used to be a stack of bordered rows each holding a 60 px crop of the
 * `small` (146 px) Scryfall image — the exact combination the product is being
 * cleaned up to remove. Printings differ *visually*, so the art is now the
 * primary content of each row and comes through `CardImage`, which requests a
 * resolution that matches how large it is actually drawn.
 */

interface CardPrintingComparisonProps {
  cardName: string;
  oracleId?: string;
}

type SortKey = 'released' | 'price' | 'set';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'released', label: 'Newest first' },
  { value: 'price', label: 'Cheapest first' },
  { value: 'set', label: 'Set name' },
];

/** Borderless field skin — `SelectTrigger` ships with `border border-input`. */
const FIELD = 'border-0 bg-muted/50 focus:ring-1 focus:ring-ring focus:ring-offset-0';

const priceOf = (printing: any): number | null => {
  const usd = parseFloat(printing?.prices?.usd ?? '');
  return isNaN(usd) ? null : usd;
};

export function CardPrintingComparison({ cardName, oracleId }: CardPrintingComparisonProps) {
  const [printings, setPrintings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('released');

  const fetchPage = useCallback(async (url: string, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 404) {
          if (!append) setPrintings([]);
          setNextPage(null);
          setTotal(0);
          return;
        }
        throw new Error(payload?.details || `Scryfall returned ${response.status}`);
      }

      setPrintings(prev => (append ? [...prev, ...(payload?.data ?? [])] : payload?.data ?? []));
      setTotal(payload?.total_cards ?? payload?.data?.length ?? 0);
      setNextPage(payload?.has_more ? payload.next_page : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load printings');
      if (!append) {
        setPrintings([]);
        setTotal(0);
        setNextPage(null);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!cardName && !oracleId) return;
    const query = oracleId ? `oracleid:${oracleId}` : `!"${cardName}"`;
    void fetchPage(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`,
      false
    );
  }, [cardName, oracleId, fetchPage]);

  // Cheapest is computed once per result set, not on every render, and only
  // becomes authoritative once every page has been pulled in.
  const cheapest = useMemo(() => {
    const priced = printings.filter(p => priceOf(p) != null);
    if (!priced.length) return null;
    return priced.reduce((min, cur) => (priceOf(cur)! < priceOf(min)! ? cur : min));
  }, [printings]);

  const sorted = useMemo(() => {
    const list = [...printings];
    switch (sortKey) {
      case 'price':
        return list.sort((a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity));
      case 'set':
        return list.sort((a, b) => (a.set_name ?? '').localeCompare(b.set_name ?? ''));
      case 'released':
      default:
        return list.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));
    }
  }, [printings, sortKey]);

  const allLoaded = !nextPage;

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h4 className="text-sm font-medium text-foreground">
            Printings{' '}
            <span className="text-muted-foreground">
              ({printings.length}
              {!allLoaded && total ? ` of ${total}` : ''})
            </span>
          </h4>
        </div>

        {printings.length > 1 && (
          <Select value={sortKey} onValueChange={(v: SortKey) => setSortKey(v)}>
            <SelectTrigger className={cn(FIELD, 'h-8 w-[152px]')} aria-label="Sort printings">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-0 bg-popover shadow-xl shadow-black/40">
              {SORTS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {cheapest && (
        <p className="bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          Cheapest {allLoaded ? '' : 'so far '}: {cheapest.set_name} —{' '}
          <span className="text-foreground">{formatUsd(priceOf(cheapest))}</span>
        </p>
      )}

      <div className="p-3">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[124px] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : printings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No printings found for this card.
          </p>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-2">
              {sorted.map(printing => {
                const isCheapest = cheapest && printing.id === cheapest.id;
                return (
                  <div
                    key={printing.id}
                    className={cn(
                      'flex gap-3 rounded-lg p-3 transition-colors',
                      isCheapest ? 'bg-accent' : 'bg-muted/20 hover:bg-accent'
                    )}
                  >
                    {/* Printings differ by art and frame — show them at a size
                        where that difference is actually visible. */}
                    <CardImage card={printing} width={92} hideFlip title={printing.set_name} />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs uppercase text-muted-foreground">
                          {printing.set}
                        </span>
                        <span
                          title={printing.rarity}
                          className={cn(
                            'inline-flex h-4 w-4 items-center justify-center rounded-sm bg-muted font-mono text-[10px]',
                            rarityClass(printing.rarity)
                          )}
                        >
                          {rarityCode(printing.rarity)}
                        </span>
                        {isCheapest && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                            Cheapest
                          </span>
                        )}
                      </div>

                      <p className="truncate text-sm font-medium text-foreground">
                        {printing.set_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        #{printing.collector_number}
                        {printing.released_at
                          ? ` · ${new Date(printing.released_at).getFullYear()}`
                          : ''}
                      </p>

                      <p className="text-xs tabular-nums text-foreground">
                        {formatUsd(priceOf(printing))}
                        {printing.prices?.usd_foil && (
                          <span className="text-muted-foreground">
                            {' '}
                            · ${parseFloat(printing.prices.usd_foil).toFixed(2)} foil
                          </span>
                        )}
                      </p>

                      <div className="flex gap-2 pt-1">
                        <Button variant="secondary" size="sm" asChild className="h-7 text-xs">
                          <a href={scryfallUrl(printing)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1 h-3 w-3" />
                            View
                          </a>
                        </Button>
                        <Button variant="secondary" size="sm" asChild className="h-7 text-xs">
                          <a href={tcgplayerUrl(printing)} target="_blank" rel="noopener noreferrer">
                            <ShoppingCart className="mr-1 h-3 w-3" />
                            Buy
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {nextPage && (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={() => fetchPage(nextPage, true)}
                >
                  {loadingMore
                    ? 'Loading…'
                    : `Show all ${total.toLocaleString()} printings`}
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
