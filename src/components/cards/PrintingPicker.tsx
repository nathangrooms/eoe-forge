import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CardGrid } from './CardGrid';
import { CardImage, CardImageSkeleton } from './CardImage';
import { fetchPrintings, printingTraits, DEFAULT_PRINTING_NOTE } from '@/lib/cards/printings';
import { formatUsd, rarityCode, rarityClass } from '@/lib/scryfall/card-utils';

/**
 * Every printing of one card, as real cards, big enough to tell apart.
 *
 * WHY THIS IS ONE COMPONENT AND NOT THREE
 * ---------------------------------------
 * Four surfaces ask the same question in the same words: the card page ("show
 * me the other art"), a collection row ("which one is in my box"), a listing
 * ("which one am I selling"), and anywhere a card gets added to something. They
 * were going to be three different lists with three different ideas of what a
 * printing looks like, so they are one.
 *
 * WHY THE CARDS ARE BIG AND WHY IT WRAPS
 * --------------------------------------
 * The owner, on the card page: *"other art variants should show straight away
 * too not hidden away"*, and the art is the whole subject. A horizontal strip
 * crops the last card at the edge, hides the rest behind a scroll nobody
 * performs, and shows six of forty. This wraps into the page's own grid at the
 * size real cards are read at, so what is on screen is a shelf of cards rather
 * than a filmstrip of thumbnails.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * Our own `cards` table, through `fetchPrintings`. It used to be Scryfall,
 * correctly, because the catalogue held roughly one printing per card and this
 * list would have had one entry in it. That changed on 19 Aug 2026. Reading
 * locally now matters for more than speed: the ids this returns are ids the
 * product can actually store on a collection row or a listing, which is the
 * entire point of letting somebody pick one.
 */

/** Which finish the prices and the chosen copy refer to. */
export type PrintingFinish = 'nonfoil' | 'foil';

export interface PrintingPickerProps {
  /** Preferred lookup. Every printing shares one oracle id. */
  oracleId?: string | null;
  /**
   * Shown while the list loads, and used alone if there is no oracle id. Lets a
   * caller that already holds the current printing render something real
   * immediately instead of a blank frame.
   */
  current?: any;
  /** Printing id currently chosen. Marked with a tick and a ring. */
  selectedId?: string | null;
  /**
   * Called with the whole printing row. Omit to render a read-only shelf, which
   * is what a card page wants when clicking navigates instead.
   */
  onSelect?: (printing: any) => void;
  /** Prices shown for this finish, and foil-only printings are marked. */
  finish?: PrintingFinish;
  onFinishChange?: (finish: PrintingFinish) => void;
  /** How many to show before "Show all". 0 means show every one. */
  initial?: number;
  /** Card width in px. The default is the size a card is legible at. */
  width?: number;
  heading?: string;
  /** One line under the heading. Pass null to say nothing. */
  note?: string | null;
  /** Draw the surrounding panel. Off when the caller already has one. */
  bare?: boolean;
  className?: string;
  /** Rendered under the heading, before the grid (a Cancel button, say). */
  headerSlot?: React.ReactNode;
}

/**
 * 200px, chosen against the resolution ladder rather than by eye.
 * `cardSizeForWidth` serves anything over 200 from Scryfall's 672px `large`
 * asset. A card with 137 printings is 137 of those, and at 200 the same shelf
 * is served from the 488px `normal` image at no visible cost, because the art
 * is being compared, not read.
 */
const PRINTING_WIDTH = 200;

/** Enough to fill two rows on a laptop, so "there are more" is obvious. */
const DEFAULT_INITIAL = 12;

function priceOf(printing: any, finish: PrintingFinish): number | null {
  const prices = (printing?.prices ?? {}) as Record<string, string | null>;
  const raw = finish === 'foil' ? (prices.usd_foil ?? prices.usd_etched) : prices.usd;
  const n = parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Scryfall lists which finishes a printing was actually made in. */
function finishesOf(printing: any): string[] {
  return Array.isArray(printing?.finishes) ? printing.finishes : [];
}

export function hasFinish(printing: any, finish: PrintingFinish): boolean {
  const finishes = finishesOf(printing);
  // An older row with no `finishes` is not evidence that a finish is missing,
  // so an empty list answers yes rather than hiding a printing somebody owns.
  if (finishes.length === 0) return true;
  return finish === 'foil'
    ? finishes.includes('foil') || finishes.includes('etched')
    : finishes.includes('nonfoil');
}

export function PrintingPicker({
  oracleId,
  current,
  selectedId,
  onSelect,
  finish = 'nonfoil',
  onFinishChange,
  initial = DEFAULT_INITIAL,
  width = PRINTING_WIDTH,
  heading = 'Printings and art variants',
  note,
  bare = false,
  className,
  headerSlot,
}: PrintingPickerProps) {
  const [printings, setPrintings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initial === 0);

  useEffect(() => {
    if (!oracleId) {
      // Nothing to look up. One printing is still a truthful answer when the
      // caller handed us the one it is showing.
      setPrintings(current ? [current] : []);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchPrintings(oracleId)
      .then(rows => {
        if (cancelled) return;
        setPrintings(rows);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        // Falling back to the printing in hand keeps the surface honest: it
        // shows what it knows and says the rest did not load.
        setPrintings(current ? [current] : []);
        setError(err instanceof Error ? err.message : 'Could not load printings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [oracleId, current]);

  const ordered = useMemo(() => {
    // Newest first. A player looking for "the one I opened" is looking at
    // recent sets, and the oldest printings are the ones nobody is choosing.
    const rows = [...printings].sort((a, b) =>
      String(b.released_at ?? '').localeCompare(String(a.released_at ?? ''))
    );
    // The chosen printing always shows, even when it is the 41st by date and
    // the list is collapsed. Otherwise the tick is offscreen and the panel
    // looks like nothing is selected.
    if (!selectedId) return rows;
    const at = rows.findIndex(p => p.id === selectedId);
    if (at <= 0) return rows;
    return [rows[at], ...rows.slice(0, at), ...rows.slice(at + 1)];
  }, [printings, selectedId]);

  /** Distinct artworks, which is a different number from printings. */
  const artworks = useMemo(() => {
    const ids = new Set(
      ordered.map(p => p.illustration_id ?? p.artist).filter(Boolean)
    );
    return ids.size;
  }, [ordered]);

  const shown = expanded || initial === 0 ? ordered : ordered.slice(0, initial);
  const hidden = ordered.length - shown.length;

  const select = useCallback(
    (printing: any) => {
      onSelect?.(printing);
    },
    [onSelect]
  );

  const body = (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-4 w-4" aria-hidden />
          {heading}
        </h2>
        <div className="flex items-center gap-3">
          {!loading && ordered.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {ordered.length} printing{ordered.length === 1 ? '' : 's'}
              {artworks > 1 ? `, ${artworks} different artworks` : ''}
            </p>
          )}
          {onFinishChange && (
            <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
              {(['nonfoil', 'foil'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onFinishChange(option)}
                  aria-pressed={finish === option}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    finish === option
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option === 'foil' ? 'Foil' : 'Regular'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {note !== null && (
        <p className="mb-3 text-xs text-muted-foreground">{note ?? DEFAULT_PRINTING_NOTE}</p>
      )}

      {headerSlot}

      {loading ? (
        <CardGrid width={width}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <CardImageSkeleton key={i} width={width} fill />
          ))}
        </CardGrid>
      ) : ordered.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {error
            ? `Could not load the other printings. ${error}`
            : 'We hold no printings of this card.'}
        </p>
      ) : (
        <>
          {error && (
            <p className="mb-3 text-xs text-muted-foreground">
              Showing what we have. The full list did not load.
            </p>
          )}

          <CardGrid width={width}>
            {shown.map(printing => {
              const active = printing.id === selectedId;
              const traits = printingTraits(printing);
              const price = priceOf(printing, finish);
              const missingFinish = !hasFinish(printing, finish);

              return (
                <div key={printing.id} data-printing={printing.id} className="min-w-0">
                  <CardImage
                    card={printing}
                    width={width}
                    fill
                    hideFlip
                    quality="normal"
                    onClick={onSelect ? () => select(printing) : undefined}
                    interactive={!!onSelect}
                    title={`${printing.set_name ?? printing.set_code} #${printing.collector_number}`}
                    imageClassName={cn(
                      'transition-all duration-200 motion-reduce:transition-none',
                      active && 'ring-2 ring-foreground',
                      missingFinish && 'opacity-60 grayscale'
                    )}
                  >
                    {active && (
                      <span className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    )}
                  </CardImage>

                  <div className="mt-1.5 space-y-0.5 px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">
                        {printing.set_code ?? printing.set}
                      </span>
                      <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground/70">
                        #{printing.collector_number}
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
                          {String(printing.released_at).slice(0, 4)}
                        </span>
                      )}
                    </div>
                    <p
                      className="truncate text-[0.7rem] text-muted-foreground"
                      title={printing.set_name}
                    >
                      {printing.set_name}
                    </p>
                    {traits.length > 0 && (
                      <p className="truncate text-[0.7rem] text-foreground/80" title={traits.join(', ')}>
                        {traits.join(' · ')}
                      </p>
                    )}
                    <p className="flex items-center gap-1 text-[0.7rem] tabular-nums text-foreground">
                      {finish === 'foil' && <Sparkles className="h-3 w-3" aria-hidden />}
                      {missingFinish
                        ? finish === 'foil'
                          ? 'No foil made'
                          : 'Foil only'
                        : formatUsd(price)}
                    </p>
                    {printing.artist && (
                      <p className="truncate text-[0.7rem] text-muted-foreground/70" title={printing.artist}>
                        {printing.artist}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardGrid>

          {hidden > 0 && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setExpanded(true)}>
              Show {hidden} more
            </Button>
          )}
        </>
      )}
    </>
  );

  if (bare) return <div className={cn('min-w-0', className)}>{body}</div>;

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      {body}
    </section>
  );
}

export default PrintingPicker;
