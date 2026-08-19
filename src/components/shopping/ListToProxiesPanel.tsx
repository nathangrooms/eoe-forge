import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { CardGrid, CardImage } from '@/components/cards';
import { resolveParsedLines, type ParsedCardLine } from '@/lib/decklist';
import {
  showListItemCount,
  useCardLists,
  type BulkListItem,
  type ProxyCandidate,
} from '@/lib/shopping';
import { cn } from '@/lib/utils';

/**
 * A list you already keep, turned into proxies in one action.
 *
 * The owner: *"no way to convert wishlist or shopping list to proxy"*, and the
 * reason it matters is the reason people proxy at all. You proxy an expensive
 * deck to play it before you buy it, so the wishlist and the shopping list are
 * exactly the lists that want printing. Somebody with a forty card shopping
 * list wants forty proxies, not forty clicks.
 *
 * WHY THERE IS A PANEL AND NOT JUST A BUTTON
 * ------------------------------------------
 * Because forty cards is a lot to add by accident. The panel shows the cards,
 * lets any of them be left out, and states the number out loud on the button
 * before anything is written. It is a right-hand slide-over rather than a page,
 * because the list you are converting stays on screen behind it.
 *
 * ONE REQUEST, ALWAYS
 * -------------------
 * Two calls at most, whatever the size of the list. Rows whose card is not in
 * our catalogue are looked up by name in a single batch through
 * `resolve_card_names`, and the whole selection is written with one
 * `card_list_add_many`. A card already on the proxy list gains copies instead
 * of gaining a second row, which the database does rather than the interface.
 */

export interface ListToProxiesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everything on the source list, in the order it is shown on its own page. */
  candidates: ProxyCandidate[];
  /** What the cards came from, in a player's words. "your shopping list". */
  sourceLabel: string;
  /** One line under the heading saying what is about to be printed. */
  description?: string;
}

/** A candidate after we have tried to find art for it. */
interface Row extends ProxyCandidate {
  selected: boolean;
  /** True once a name lookup has replaced a card we do not hold. */
  recovered: boolean;
}

export function ListToProxiesPanel({
  open,
  onOpenChange,
  candidates,
  sourceLabel,
  description,
}: ListToProxiesPanelProps) {
  const addMany = useCardLists(state => state.addMany);

  const [rows, setRows] = useState<Row[]>([]);
  const [looking, setLooking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<number | null>(null);

  /* The panel takes a fresh copy of the list every time it opens rather than
     tracking it live. Half way through choosing which twenty of forty cards to
     print is the worst moment for the grid to reorder underneath the cursor. */
  useEffect(() => {
    if (!open) return;
    setAdded(null);
    setRows(candidates.map(row => ({ ...row, selected: true, recovered: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Find art for the rows that have none.
   *
   * Roughly one wishlist row in eight carries a `card_id` the catalogue has
   * never held, from old imports and text-typed decks. Those rows have a name
   * and nothing else, and a proxy of a card with no art prints as plain text.
   * The name lookup that the paste box already uses fixes most of them, and it
   * takes ONE request for all of them together.
   */
  useEffect(() => {
    if (!open) return;
    const orphans = candidates.filter(row => !row.card?.id);
    if (orphans.length === 0) return;

    let cancelled = false;
    setLooking(true);

    const asked: ParsedCardLine[] = orphans.map((row, i) => ({
      line: i + 1,
      raw: row.cardName,
      name: row.cardName,
      quantity: row.quantity,
      section: 'main',
    }));

    resolveParsedLines(asked)
      .then(found => {
        if (cancelled) return;
        const byKey = new Map<string, any>();
        orphans.forEach((row, i) => {
          const hit = found[i];
          // A near match is a guess. Guessing which card somebody meant is one
          // thing on a paste they are reviewing line by line and another on a
          // bulk convert, so only a real match is taken.
          if (!hit?.card?.id) return;
          if (hit.status !== 'exact' && hit.status !== 'face' && hit.status !== 'printing') return;
          byKey.set(row.key, hit.card);
        });
        if (byKey.size === 0) return;
        setRows(current =>
          current.map(row => {
            const card = byKey.get(row.key);
            if (!card) return row;
            return { ...row, card, cardId: card.id, oracleId: card.oracle_id ?? row.oracleId, recovered: true };
          })
        );
      })
      .catch(error => {
        // Not fatal. Those cards can still be printed, as readable text, which
        // is what the proxy page already says happens when there is no art.
        console.error('Could not look up cards with no catalogue row:', error);
      })
      .finally(() => {
        if (!cancelled) setLooking(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = useMemo(() => rows.filter(row => row.selected), [rows]);
  const copies = useMemo(() => chosen.reduce((sum, row) => sum + Math.max(1, row.quantity), 0), [chosen]);
  const withoutArt = useMemo(() => chosen.filter(row => !row.card?.id).length, [chosen]);

  const toggle = useCallback((key: string) => {
    setRows(current =>
      current.map(row => (row.key === key ? { ...row, selected: !row.selected } : row))
    );
  }, []);

  const setAll = useCallback((selected: boolean) => {
    setRows(current => current.map(row => ({ ...row, selected })));
  }, []);

  const commit = useCallback(async () => {
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      const items: BulkListItem[] = chosen.map(row => ({
        card_id: row.cardId,
        card_name: row.card?.name ?? row.cardName,
        oracle_id: row.oracleId ?? row.card?.oracle_id ?? null,
        quantity: Math.max(1, row.quantity),
      }));
      await addMany({ kind: 'proxy', items, source: 'manual' });
      setAdded(copies);
      showSuccess('On your proxy list', `${showListItemCount(copies)} from ${sourceLabel}.`);
    } catch (error: any) {
      showError('Could not add those', error?.message ?? 'Please try again.');
    } finally {
      setAdding(false);
    }
  }, [addMany, chosen, copies, sourceLabel]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetTitle className="sr-only">Print these as proxies</SheetTitle>

        <div className="space-y-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Printer className="h-5 w-5" aria-hidden />
              Print these as proxies
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {description ?? `Everything on ${sourceLabel}, ready to print and play with.`}
            </p>
          </div>

          {added !== null ? (
            <div className="space-y-4 rounded-xl bg-card p-5 shadow-lg shadow-black/20">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4" aria-hidden />
                {showListItemCount(added)} added to your proxy list.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="gap-2">
                  <Link to="/proxies" onClick={() => onOpenChange(false)}>
                    <Printer className="h-4 w-4" aria-hidden />
                    Open your proxy list
                  </Link>
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Stay here
                </Button>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-xl bg-muted/20 p-4 text-sm text-muted-foreground">
              There is nothing on {sourceLabel} yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{copies}</p>
                  <p className="text-xs text-muted-foreground">
                    {copies === 1 ? 'card to print' : 'cards to print'}, from {chosen.length} of{' '}
                    {rows.length} on the list
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAll(true)} disabled={adding}>
                    Everything
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAll(false)} disabled={adding}>
                    Nothing
                  </Button>
                  <Button onClick={commit} disabled={chosen.length === 0 || adding} className="gap-2">
                    {adding ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Printer className="h-4 w-4" aria-hidden />
                    )}
                    Add {copies} to the proxy list
                  </Button>
                </div>
              </div>

              {looking && (
                <p className="text-sm text-muted-foreground">
                  Looking up the cards we do not hold a version of yet.
                </p>
              )}

              {!looking && withoutArt > 0 && (
                <p className="text-sm text-muted-foreground">
                  {withoutArt === 1
                    ? 'One of these has no art we can print, so it comes out as readable text.'
                    : `${withoutArt} of these have no art we can print, so they come out as readable text.`}
                </p>
              )}

              <p className="text-sm text-muted-foreground">
                These are for playtesting at your own table. They are free, they are not real cards,
                and they are not legal at any event. Do not sell them.
              </p>

              <CardGrid width={130}>
                {rows.map(row => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => toggle(row.key)}
                    aria-pressed={row.selected}
                    className="min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardImage
                      card={row.card ?? { name: row.cardName }}
                      width={130}
                      fill
                      quality="normal"
                      imageClassName={cn(
                        'transition-opacity',
                        !row.selected && 'opacity-35 grayscale'
                      )}
                    >
                      {row.selected && (
                        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                          <Check className="h-3 w-3" aria-hidden />
                        </span>
                      )}
                      {row.quantity > 1 && (
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                          {row.quantity}
                        </span>
                      )}
                    </CardImage>
                    <span
                      className={cn(
                        'mt-1.5 block truncate text-xs',
                        row.selected ? 'text-foreground' : 'text-muted-foreground'
                      )}
                      title={row.card?.name ?? row.cardName}
                    >
                      {row.card?.name ?? row.cardName}
                    </span>
                  </button>
                ))}
              </CardGrid>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ListToProxiesPanel;
