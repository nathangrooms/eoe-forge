import { useMemo, useState } from 'react';
import { ArrowRightLeft, ExternalLink, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
import { cn } from '@/lib/utils';
import type { StorageItemWithCard } from '@/types/storage';
import { BINDER_POCKETS, describeFill, subdivisionFor } from '@/lib/storage/subdivision';
import { BINDER_SURFACES } from './ContainerObject';

/**
 * A binder page you can actually file into.
 *
 * `ContainerObject` has drawn a binder as a nine-pocket page since the storage
 * overhaul, and the pockets were a picture: they showed the nine most valuable
 * cards in the whole binder, in value order, which is not where any of those
 * cards is. This is the same drawing with the pockets meaning what they look
 * like they mean. Pocket 4 holds the card that is in pocket 4.
 *
 * ## The click rule here
 *
 * This is a FILING surface, so a click files. Tapping an empty pocket asks
 * which card goes in it and offers the cards already in this binder; tapping a
 * card in a pocket offers to move it. Neither navigates away, because walking
 * off to a card page halfway through laying out a page is exactly the
 * complaint that started this work. The card's own page is still one click
 * away, through the small arrow on the card, which is the explicit affordance.
 * Same split as the search picker: body files, affordance opens.
 *
 * ## Honest fill
 *
 * "4 of 9 pockets used" is the one fraction in storage, and it is honest
 * because nine is a real property of the physical page rather than a capacity
 * somebody typed in. A binder as a whole gets a card count and no percentage,
 * because you can always add another page.
 */

interface BinderPageViewProps {
  /** What this page is called, already resolved by `slotLabel`. */
  pageLabel: string;
  /** Rows filed to this page, pocketed or not. */
  items: StorageItemWithCard[];
  /** Cards elsewhere in this binder that could be filed into a pocket. */
  candidates: StorageItemWithCard[];
  /** File one copy of `item` into `pocket`. One move, atomic. */
  onFileInPocket: (item: StorageItemWithCard, pocket: number) => Promise<void> | void;
  /** Open the move panel for a card already in a pocket. */
  onMoveItem: (item: StorageItemWithCard) => void;
}

export function BinderPageView({
  pageLabel,
  items,
  candidates,
  onFileInPocket,
  onMoveItem,
}: BinderPageViewProps) {
  const sub = subdivisionFor('binder');
  const [fillingPocket, setFillingPocket] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pockets = useMemo(() => {
    const map = new Map<number, StorageItemWithCard>();
    for (const item of items) if (item.pocket) map.set(item.pocket, item);
    return map;
  }, [items]);

  /** On this page but not in a pocket. A real, normal state, so it is drawn. */
  const onPageLoose = useMemo(() => items.filter(item => !item.pocket), [items]);

  const fillablePocket = fillingPocket != null && !pockets.has(fillingPocket);
  const choices = useMemo(
    () => [...onPageLoose, ...candidates].filter(item => !item.pocket),
    [onPageLoose, candidates]
  );

  const place = async (item: StorageItemWithCard) => {
    if (fillingPocket == null) return;
    setBusy(true);
    try {
      await onFileInPocket(item, fillingPocket);
      setFillingPocket(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={pageLabel} className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-card-foreground">{pageLabel}</h3>
        <p className="text-sm text-muted-foreground">{describeFill(sub, pockets.size)}</p>
      </div>

      {/* The page itself, at the geometry of the object on the shelf. */}
      <div
        className={cn(
          'mx-auto w-full max-w-3xl rounded-lg p-[2.5%]',
          BINDER_SURFACES.shell,
          BINDER_SURFACES.objectShadow
        )}
      >
        <div className="flex items-stretch gap-[2%]">
          {/* Rings down the spine, exactly as the shelf draws them. */}
          <div className="flex w-[3.5%] shrink-0 flex-col justify-evenly py-[4%]">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className={cn(
                  'aspect-square w-full rounded-full',
                  BINDER_SURFACES.hollow,
                  BINDER_SURFACES.well
                )}
                aria-hidden="true"
              />
            ))}
          </div>

          <div
            className={cn(
              'grid flex-1 grid-cols-3 gap-[2.5%] rounded-md p-[2.5%]',
              BINDER_SURFACES.page,
              BINDER_SURFACES.well
            )}
          >
            {Array.from({ length: BINDER_POCKETS }, (_, i) => i + 1).map(number => {
              const item = pockets.get(number);
              const selecting = fillingPocket === number;
              return (
                <div
                  key={number}
                  className={cn(
                    'group relative aspect-[488/680] overflow-hidden rounded-[5%]',
                    BINDER_SURFACES.hollow,
                    BINDER_SURFACES.well,
                    selecting && 'ring-2 ring-ring'
                  )}
                >
                  {item ? (
                    <>
                      {/* The card body moves the card. It does not navigate. */}
                      <button
                        type="button"
                        onClick={() => onMoveItem(item)}
                        title={`Move ${item.card?.name ?? 'this card'} out of pocket ${number}`}
                        className="absolute inset-[3.5%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CardImage
                          card={item.card ?? { name: 'Card' }}
                          size="sm"
                          quality="normal"
                          fill
                          hideFlip
                          interactive={false}
                          imageClassName="shadow-md shadow-black/50"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur">
                            <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                            Move
                          </span>
                        </span>
                      </button>
                      {/* The explicit way to the card's own page. */}
                      {item.card?.id && (
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="absolute right-[4%] top-[3%] z-10 h-6 w-6 rounded-full bg-background/85 p-0 opacity-0 shadow-md shadow-black/40 backdrop-blur transition-opacity hover:bg-background group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          <Link
                            to={`/cards/${encodeURIComponent(item.card.id)}`}
                            aria-label={`Open the page for ${item.card.name}`}
                            title={`Open the page for ${item.card.name}`}
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </Button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFillingPocket(selecting ? null : number)}
                      aria-label={`Put a card in pocket ${number}`}
                      title={`Put a card in pocket ${number}`}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Plus className="h-4 w-4 opacity-50" aria-hidden="true" />
                      <span className="text-[10px] tabular-nums opacity-60">{number}</span>
                    </button>
                  )}
                  <span
                    className={cn(BINDER_SURFACES.sheen, 'rounded-[5%]')}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Choosing what goes in the empty pocket, in place under the page. */}
      {fillablePocket && (
        <div className="mt-4 rounded-lg bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Which card goes in pocket {fillingPocket}?
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Never mind"
              onClick={() => setFillingPocket(null)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every card in this binder is already in a pocket. Add more cards and they will
              show up here.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {choices.map(item => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => place(item)}
                  title={`Put ${item.card?.name ?? 'this card'} in pocket ${fillingPocket}`}
                  className="shrink-0 rounded-lg transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <CardImage
                    card={item.card ?? { name: 'Card' }}
                    width={72}
                    hideFlip
                    interactive={false}
                    title={item.card?.name}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filed to this page, no pocket picked. Normal, so it is shown. */}
      {onPageLoose.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            On this page, no pocket yet
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {onPageLoose.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onMoveItem(item)}
                title={`Move ${item.card?.name ?? 'this card'}`}
                className="relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardImage
                  card={item.card ?? { name: 'Card' }}
                  width={72}
                  hideFlip
                  interactive={false}
                  title={item.card?.name}
                />
                {item.qty > 1 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground shadow-md shadow-black/40">
                    {item.qty}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
