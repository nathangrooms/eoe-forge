import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CardRail } from './CardRail';
import { CardImage, CardImageSkeleton } from './CardImage';
import { formatUsd, rarityCode, rarityClass } from '@/lib/scryfall/card-utils';
import { Layers } from 'lucide-react';

/**
 * Every printing and art variant of a card, on screen the moment the page is.
 *
 * Owner, verbatim: *"other art variants should show straight away too not
 * hidden away"*. So this is not a tab and not a toggle — it is a row of real
 * card images directly under the card, and clicking one swaps the printing the
 * whole page is describing (art, set, collector number, artist, prices,
 * legality) without leaving the page.
 *
 * Scryfall is the source rather than our `cards` table on purpose: the local
 * table holds 34,088 rows across 33,037 distinct oracle ids, so it knows about
 * roughly one printing per card and would show a "variants" row of one.
 */

export interface CardPrintingsRowProps {
  /** Preferred lookup — `unique=prints` on the oracle id returns every variant. */
  oracleId?: string;
  cardName: string;
  /** Scryfall id of the printing currently being displayed. */
  activeId?: string;
  onSelect: (printing: any) => void;
  className?: string;
}

/**
 * 128, not 132, on purpose: `cardSizeForWidth` promotes anything over 128 to
 * `md`, which requests Scryfall's 672 px `large` asset. A Sol Ring row is 137
 * printings, so that one pixel doubles the bytes of the heaviest row on the
 * page for no visible gain at this size.
 */
/* Was 128, the same thumbnail size as the related rails. Art variants are the
   one place on this page where the ART is the entire point: the reason to look
   at six printings of a card is to choose between the illustrations. At 128 they
   were unreadable, which defeated the section. */
const PRINTING_WIDTH = 208;

export function CardPrintingsRow({
  oracleId,
  cardName,
  activeId,
  onSelect,
  className,
}: CardPrintingsRowProps) {
  const [printings, setPrintings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (url: string, append: boolean, signal?: AbortSignal) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(url, { signal });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        // 404 is Scryfall's "no cards matched", not a failure worth shouting about.
        if (res.status === 404) {
          if (!append) setPrintings([]);
          setNextPage(null);
          setTotal(0);
          setError(null);
          return;
        }
        throw new Error(payload?.details || `Scryfall returned ${res.status}`);
      }

      setPrintings(prev => (append ? [...prev, ...(payload?.data ?? [])] : (payload?.data ?? [])));
      setTotal(payload?.total_cards ?? payload?.data?.length ?? 0);
      setNextPage(payload?.has_more ? payload.next_page : null);
      setError(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Could not load printings');
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
    if (!oracleId && !cardName) return;
    const controller = new AbortController();
    const query = oracleId ? `oracleid:${oracleId}` : `!"${cardName}"`;
    void fetchPage(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`,
      false,
      controller.signal
    );
    return () => controller.abort();
  }, [oracleId, cardName, fetchPage]);

  /** Newest first reads better than Scryfall's ascending release order here. */
  const ordered = useMemo(
    () => [...printings].sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? '')),
    [printings]
  );

  const artVariants = useMemo(() => {
    const artists = new Set(ordered.map(p => p.illustration_id ?? p.artist).filter(Boolean));
    return artists.size;
  }, [ordered]);

  // Keep the selected printing in view when the page swaps it from elsewhere.
  useEffect(() => {
    if (!activeId || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-printing="${activeId}"]`);
    // `nearest`, not `center`: centring the active printing on first paint
    // scrolls the row for no reason and hides the earliest printings offscreen.
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId, ordered.length]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-4 w-4" aria-hidden />
          Printings &amp; art variants
        </h2>
        {!loading && ordered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {ordered.length}
            {total > ordered.length ? ` of ${total}` : ''} printing
            {ordered.length === 1 ? '' : 's'}
            {artVariants > 1 ? ` · ${artVariants} distinct artworks` : ''} · click one to view it
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <CardImageSkeleton key={i} width={PRINTING_WIDTH} />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-sm text-destructive">Could not load printings — {error}</p>
      ) : ordered.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Scryfall lists no printings for this card.
        </p>
      ) : (
        <>
          <CardRail scrollRef={scroller} label="Other printings of this card">
            {ordered.map(printing => {
              const active = printing.id === activeId;
              return (
                <div
                  key={printing.id}
                  data-printing={printing.id}
                  className="w-[208px] shrink-0 snap-start"
                >
                  <CardImage
                    card={printing}
                    width={PRINTING_WIDTH}
                    hideFlip
                    onClick={() => onSelect(printing)}
                    title={`${printing.set_name} #${printing.collector_number}`}
                    imageClassName={cn(
                      'transition-all duration-200',
                      active
                        ? 'ring-2 ring-foreground'
                        : 'opacity-75 hover:opacity-100 motion-reduce:transition-none'
                    )}
                  />
                  <div className="mt-1.5 space-y-0.5 px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">
                        {printing.set}
                      </span>
                      <span
                        title={printing.rarity}
                        className={cn(
                          'inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-muted font-mono text-[9px] leading-none',
                          rarityClass(printing.rarity)
                        )}
                      >
                        {rarityCode(printing.rarity)}
                      </span>
                      {printing.released_at && (
                        <span className="text-[0.7rem] tabular-nums text-muted-foreground/70">
                          {printing.released_at.slice(0, 4)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[0.7rem] text-muted-foreground" title={printing.set_name}>
                      {printing.set_name}
                    </p>
                    <p className="text-[0.7rem] tabular-nums text-foreground">
                      {formatUsd(
                        printing.prices?.usd ? parseFloat(printing.prices.usd) : null
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardRail>

          {nextPage && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={loadingMore}
              onClick={() => fetchPage(nextPage, true)}
            >
              {loadingMore ? 'Loading…' : `Show all ${total.toLocaleString()} printings`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export default CardPrintingsRow;
