import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Send, ShoppingCart, Store, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  describeUnpricedLines,
  loadListingsFor,
  useCardLists,
  type ListingMatch,
  type ShoppingEntry,
} from '@/lib/shopping';
import { PlatformTotals } from './PlatformTotals';
import { ShoppingEntryRow } from './ShoppingEntryTile';
import { MarkBoughtPanel } from './MarkBoughtPanel';
import { ListExportPanel } from './ListExportPanel';

/**
 * The shopping list, leading the marketplace.
 *
 * Owner: "No add to shopping list anywhere, shopping list should be main thing
 * on marketplace maybe?" So the marketplace opens with the three things a
 * person came to a marketplace for: what they need to buy, what it costs at
 * each shop, and what is available right now.
 *
 * ABOUT "AVAILABLE NOW"
 * ---------------------
 * `listings` carries exactly one policy, `auth.uid() = user_id`, so a signed-in
 * player can only read their OWN listings. Verified against the live policy on
 * 19 Aug 2026, and CLAUDE.md records the same thing as a known gap. That means
 * this section can only ever match cards the player is selling to themselves
 * until that policy is deliberately loosened. Rather than render an empty panel
 * that reads as "nobody is selling any of this", it says what is actually true.
 */
export function MarketplaceShoppingLead({ className }: { className?: string }) {
  const load = useCardLists(state => state.load);
  const shopping = useCardLists(state => state.shopping);
  const wishlist = useCardLists(state => state.wishlist);
  const shortfalls = useCardLists(state => state.shortfalls);

  const [listings, setListings] = useState<ListingMatch[]>([]);
  const [buying, setBuying] = useState<ShoppingEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(
    () => useCardLists.getState().assembled(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopping, wishlist, shortfalls]
  );

  useEffect(() => {
    const ids = list.toBuy.map(entry => entry.cardId);
    if (ids.length === 0) {
      setListings([]);
      return;
    }
    loadListingsFor(ids)
      .then(setListings)
      .catch(error => console.error('Could not check what is for sale:', error));
  }, [list.toBuy]);

  const costLines = list.toBuy.map(entry => ({
    card: entry.card,
    quantity: entry.quantity,
    finish: entry.finish,
  }));
  const exportLines = list.toBuy.map(entry => ({
    name: entry.cardName,
    quantity: entry.quantity,
    setName: entry.card?.set_name ?? null,
  }));

  const copies = list.toBuy.reduce((sum, entry) => sum + entry.quantity, 0);
  const inTransit = [...list.arriving, ...list.arrived].reduce((sum, item) => sum + item.quantity, 0);
  const listedIds = new Set(listings.map(listing => listing.card_id));

  return (
    <section className={cn('min-w-0 space-y-4 rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden />
            What you need to buy
          </h2>
          <p className="text-sm text-muted-foreground">
            {copies > 0
              ? `${list.toBuy.length} ${list.toBuy.length === 1 ? 'card' : 'cards'}, ${copies} ${copies === 1 ? 'copy' : 'copies'} in total.`
              : 'Nothing on your shopping list yet.'}
            {inTransit > 0 && ` ${inTransit} already on the way.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {copies > 0 && (
            <Button size="sm" className="gap-2" onClick={() => setExporting(true)}>
              <Send className="h-4 w-4" />
              Take it to a shop
            </Button>
          )}
          <Button variant="secondary" size="sm" className="gap-2" asChild>
            <Link to="/shopping">
              Open the list
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {list.toBuy.length === 0 ? (
        <p className="rounded-lg bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
          Cards land here from your wishlist, from decks that are short of something, and from the
          add button on any card page.
        </p>
      ) : (
        <>
          <PlatformTotals lines={costLines} size="sm" />

          <div className="space-y-1.5">
            {list.toBuy.slice(0, 8).map(entry => (
              <div key={entry.key} className="relative">
                <ShoppingEntryRow entry={entry} onBuy={setBuying} />
                {listedIds.has(entry.cardId) && (
                  <span className="pointer-events-none absolute right-2 top-1 rounded-full bg-foreground px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-background">
                    For sale here
                  </span>
                )}
              </div>
            ))}
          </div>

          {list.toBuy.length > 8 && (
            <Button variant="secondary" size="sm" asChild className="w-full">
              <Link to="/shopping">See all {list.toBuy.length} cards</Link>
            </Button>
          )}

          <div className="rounded-lg bg-muted/25 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Store className="h-4 w-4 text-muted-foreground" aria-hidden />
              Available here right now
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {listings.length > 0
                ? `${listings.length} of the cards on your list are listed in the marketplace.`
                : 'None of these are listed. Marketplace listings are only visible to the person who made them at the moment, so this can only ever find your own.'}
            </p>
          </div>
        </>
      )}

      {inTransit > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" aria-hidden />
          {inTransit} {inTransit === 1 ? 'card is' : 'cards are'} bought and not here yet.{' '}
          <Link to="/collection" className="underline underline-offset-4 hover:text-foreground">
            See them on your collection
          </Link>
        </p>
      )}

      <MarkBoughtPanel entry={buying} onOpenChange={open => !open && setBuying(null)} />
      <ListExportPanel
        open={exporting}
        onOpenChange={setExporting}
        lines={exportLines}
        unpricedNote={describeUnpricedLines(costLines)}
      />
    </section>
  );
}
