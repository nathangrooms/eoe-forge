import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, PackageCheck, Printer, RefreshCw, Send, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardGrid, CardGridSkeleton, CardSizeSlider, useCardSize } from '@/components/cards';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { Changed } from '@/components/motion';
import { useFlipOnChange, useLeavingList } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  describeUnpricedLines,
  paidTotals,
  proxyCandidatesFromShopping,
  useCardLists,
  type CardListItem,
  type ShoppingEntry,
} from '@/lib/shopping';
import { formatAmount } from '@/lib/pricing';
import { ListToProxiesPanel } from './ListToProxiesPanel';
import { PlatformTotals } from './PlatformTotals';
import { ShoppingEntryTile } from './ShoppingEntryTile';
import { ArrivingCards } from './ArrivingCards';
import { MarkBoughtPanel } from './MarkBoughtPanel';
import { ListExportPanel } from './ListExportPanel';
import { PastPurchases } from './PastPurchases';

/**
 * `/shopping` — everything you are going to buy, in one place.
 *
 * WHAT THIS PAGE IS
 * -----------------
 * Four sources merged into one list: cards added by hand, the wishlist, the
 * cards your decks are short of, and suggestions you accepted. Each card says
 * which of those wanted it, because "needed by 3 decks" and "you clicked add
 * once" are different buying decisions.
 *
 * And then the part that makes it more than a wishlist: what you have bought,
 * what has turned up, and what you already put away. A card you paid for three
 * weeks ago and never received is a fact this page holds, with its date.
 *
 * THE ORDER OF THE PAGE
 * ---------------------
 * Cost first, because the question is "can I afford this", then the cards
 * themselves large, then what is in the post. Anything already filed sits at the
 * bottom as a purchase record and never interrupts the buying.
 */

type Tab = 'buy' | 'coming' | 'bought';

export default function ShoppingListPage() {
  const load = useCardLists(state => state.load);
  const loading = useCardLists(state => state.loading);
  const loaded = useCardLists(state => state.loaded);
  const error = useCardLists(state => state.error);
  const shopping = useCardLists(state => state.shopping);
  const wishlist = useCardLists(state => state.wishlist);
  const shortfalls = useCardLists(state => state.shortfalls);

  const [cardWidth, setCardWidth] = useCardSize('shopping', 200);
  const [tab, setTab] = useState<Tab>('buy');
  const [buying, setBuying] = useState<ShoppingEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [proxying, setProxying] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // Recomputed from the three raw sources rather than read through the store's
  // selector, so React re-renders when any of them changes.
  const list = useMemo(
    () => useCardLists.getState().assembled(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopping, wishlist, shortfalls]
  );

  const costLines = useMemo(
    () => list.toBuy.map(entry => ({ card: entry.card, quantity: entry.quantity, finish: entry.finish })),
    [list.toBuy]
  );

  const exportLines = useMemo(
    () =>
      list.toBuy.map(entry => ({
        name: entry.cardName,
        quantity: entry.quantity,
        setName: entry.card?.set_name ?? null,
      })),
    [list.toBuy]
  );

  /* Playtesting the deck before buying into it is why people proxy, so the
     cards you are about to spend money on are exactly the ones worth printing
     first. Built from the same merged list the page is showing. */
  const proxyCandidates = useMemo(() => proxyCandidatesFromShopping(list.toBuy), [list.toBuy]);

  /**
   * The buying grid is the one list in the product that a player empties one
   * card at a time, so it is the one where a row vanishing between frames is
   * most obviously wrong. `useLeavingList` holds a bought card in place long
   * enough to be seen going; `useFlipOnChange` then slides the cards after it
   * up into the gap instead of letting them snap into it.
   *
   * The signature deliberately includes the leaving rows: while one is still on
   * its way out nothing has actually moved, so there is nothing to slide.
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const buyRows = useLeavingList(list.toBuy, entry => entry.key);
  useFlipOnChange(gridRef, buyRows.map(row => row.key).join(' '));

  const copies = list.toBuy.reduce((sum, entry) => sum + entry.quantity, 0);
  const inTransit = [...list.arriving, ...list.arrived].reduce((sum, item) => sum + item.quantity, 0);

  const tabs: { id: Tab; label: string; count: number; icon: typeof ShoppingCart }[] = [
    { id: 'buy', label: 'To buy', count: list.toBuy.length, icon: ShoppingCart },
    { id: 'coming', label: 'On the way', count: list.arriving.length + list.arrived.length, icon: Truck },
    { id: 'bought', label: 'Already bought', count: list.filed.length, icon: PackageCheck },
  ];

  return (
    <StandardPageLayout
      title="Shopping list"
      description="Everything you still need, from your decks, your wishlist and anywhere you pressed add."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {/* This used to be a link that only went to /proxies, which left a
              player with a forty card list and no way to print it short of
              typing it out again. It converts now. The proxy list itself is one
              click further on, inside the panel and in the left nav. */}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setProxying(true)}
            disabled={proxyCandidates.length === 0}
          >
            <Printer className="h-4 w-4" />
            Print as proxies
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => void load({ force: true })}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setExporting(true)} disabled={copies === 0}>
            <Send className="h-4 w-4" />
            Take it to a shop
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-foreground">{error}</p>
        )}

        {/* What it costs, per shop. First, because it is the question.
            Only on the buying tab: these are the prices of things not yet
            bought, and leaving them above the parcels would read as a claim
            about what those parcels cost. */}
        {tab === 'buy' && list.toBuy.length > 0 && <PlatformTotals lines={costLines} />}

        {/* On the parcels tab the money question is different: not what these
            will cost, but what they already did. Per currency, never added
            together, and saying how many were bought with no price kept. */}
        {tab === 'coming' && inTransit > 0 && <MoneyInThePost items={[...list.arriving, ...list.arrived]} />}

        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={cn(
                'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors',
                tab === item.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
              {item.count > 0 && <span className="tabular-nums opacity-70">{item.count}</span>}
            </button>
          ))}

          {tab === 'buy' && list.toBuy.length > 0 && (
            <CardSizeSlider
              storageKey="shopping"
              value={cardWidth}
              onValueChange={setCardWidth}
              className="ml-auto"
            />
          )}
        </div>

        {tab === 'buy' && (
          <>
            {!loaded && loading ? (
              <CardGridSkeleton width={cardWidth} count={10} />
            ) : list.toBuy.length === 0 ? (
              <EmptyBuyState hasAnything={shopping.length > 0 || inTransit > 0} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {list.toBuy.length} {list.toBuy.length === 1 ? 'card' : 'cards'}, {copies}{' '}
                  {copies === 1 ? 'copy' : 'copies'} in total.
                  {inTransit > 0 && ` ${inTransit} more already on the way.`}
                </p>
                <CardGrid ref={gridRef} width={cardWidth}>
                  {buyRows.map(row => (
                    <ShoppingEntryTile
                      key={row.key}
                      motionKey={row.key}
                      leaving={row.leaving}
                      entry={row.item}
                      width={cardWidth}
                      onBuy={setBuying}
                    />
                  ))}
                </CardGrid>
              </>
            )}
          </>
        )}

        {tab === 'coming' && (
          <>
            {list.arriving.length === 0 && list.arrived.length === 0 ? (
              <EmptyPanel
                icon={Truck}
                title="Nothing in the post"
                body="When you mark something as bought it moves here, with what you paid and the date, until you say it arrived."
              />
            ) : (
              <ArrivingCards arriving={list.arriving} arrived={list.arrived} />
            )}
          </>
        )}

        {tab === 'bought' && <PastPurchases items={list.filed} />}
      </div>

      <MarkBoughtPanel entry={buying} onOpenChange={open => !open && setBuying(null)} />
      <ListExportPanel
        open={exporting}
        onOpenChange={setExporting}
        lines={exportLines}
        unpricedNote={describeUnpricedLines(costLines)}
      />
      <ListToProxiesPanel
        open={proxying}
        onOpenChange={setProxying}
        candidates={proxyCandidates}
        sourceLabel="your shopping list"
        description="Everything you still need to buy. Print it and play the deck before you spend anything."
      />
    </StandardPageLayout>
  );
}

/**
 * What has been spent on cards that are bought and not yet put away.
 *
 * ONE TILE PER MONEY, AND IT SAYS WHICH
 * -------------------------------------
 * Both tiles used to be headed "Paid, waiting to arrive", so a player looking
 * at $18.90 beside €0.50 saw two boxes with the same title and no way to tell
 * what separated them. Caught on a screenshot rather than in review. They are
 * split by the money they were paid in, because nothing here converts one into
 * the other, so the heading is the money. The old heading was also not quite
 * true: this counts cards in hand but not filed as well as cards still in the
 * post.
 */
const MONEY_WORD: Record<'USD' | 'EUR', string> = { USD: 'dollars', EUR: 'euros' };

function MoneyInThePost({ items }: { items: CardListItem[] }) {
  const { totals, copiesWithNoPrice } = paidTotals(items);
  if (totals.length === 0 && copiesWithNoPrice === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {totals.map(total => (
        <div key={total.currency} className="min-w-0 rounded-xl bg-muted/30 px-4 py-3">
          <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            Paid in {MONEY_WORD[total.currency]}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
            <Changed value={total.amount}>{formatAmount(total.amount, total.currency)}</Changed>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {total.copies} {total.copies === 1 ? 'card' : 'cards'}
          </p>
        </div>
      ))}
      {copiesWithNoPrice > 0 && (
        <div className="min-w-0 rounded-xl bg-muted/30 px-4 py-3">
          <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">No price kept</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
            <Changed value={copiesWithNoPrice}>{copiesWithNoPrice}</Changed>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copiesWithNoPrice === 1 ? 'card is' : 'cards are'} missing from these totals
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyBuyState({ hasAnything }: { hasAnything: boolean }) {
  return (
    <EmptyPanel
      icon={ShoppingCart}
      title={hasAnything ? 'Nothing left to buy' : 'Your shopping list is empty'}
      body={
        hasAnything
          ? 'Everything your decks and your wishlist asked for is either bought or in your collection.'
          : 'Cards land here from your wishlist, from decks that are short of something, and from the add button on any card.'
      }
      action={
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" asChild>
            <Link to="/cards">Find cards</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/decks">Check your decks</Link>
          </Button>
        </div>
      }
    />
  );
}

export function EmptyPanel({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof ShoppingCart;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card px-6 py-16 text-center shadow-lg shadow-black/20">
      <Icon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading your list
    </div>
  );
}
