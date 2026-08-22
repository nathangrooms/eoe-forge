import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, PackageCheck, Printer, RefreshCw, Send, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardSizeSlider } from '@/components/cards';
import { usePagedItems } from '@/hooks/usePagination';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import {
  EmptyState,
  ListingFrame,
  MetricRow,
  PageTabs,
  matchedLabel,
  resultSentence,
  useListingView,
  type ListingMode,
  type Metric,
} from '@/components/listing';
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

/**
 * One way to look at a shopping list, and that is the honest answer.
 *
 * `useListingView` still wants the modes declared, because the size slider and
 * the page size hang off the same object, and `ViewModeToggle` draws nothing
 * when a surface offers one mode. A page does not get a control it has no use
 * for, and it does not have to pretend to have three views to use the frame.
 */
const MODES: ListingMode[] = [
  { id: 'grid', label: 'Image grid', icon: LayoutGrid, layout: 'grid' },
];

export default function ShoppingListPage() {
  const load = useCardLists(state => state.load);
  const loading = useCardLists(state => state.loading);
  const loaded = useCardLists(state => state.loaded);
  const error = useCardLists(state => state.error);
  const shopping = useCardLists(state => state.shopping);
  const wishlist = useCardLists(state => state.wishlist);
  const shortfalls = useCardLists(state => state.shortfalls);

  /*
   * The surface name stays `shopping`, which is the key `useCardSize` has been
   * writing all along. What is new is that the page size is a preference now
   * rather than the constant 60 this file used to pass, so the pager offers the
   * same 24 / 48 / 96 choice as every other listing.
   */
  const view = useListingView({ surface: 'shopping', modes: MODES, defaultSize: 200 });
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
  /* PAGED, because drawing every row at once is what costs.

     Both lists fetch every row on purpose: the shopping page sums three
     currencies across the whole list and the proxy page counts sheets, and
     those figures have to be real. That read is one indexed query over the
     reader's own rows and is the cheap part. The expensive part follows it, a
     card tile each, every one pulling its own art, which on a 243 card list is
     243 images on first paint. Owner: "doesnt have pagnation ... this could
     throttle database".

     `usePagedItems` is written for exactly this shape and says so in its own
     doc: page in the browser only when the screen needs a figure computed over
     every row, and page at the database otherwise. */
  const paged = usePagedItems(buyRows, { pageSize: view.pageSize });

  useFlipOnChange(gridRef, paged.pageItems.map(row => row.key).join(' '));

  const copies = list.toBuy.reduce((sum, entry) => sum + entry.quantity, 0);
  const inTransit = [...list.arriving, ...list.arrived].reduce((sum, item) => sum + item.quantity, 0);

  /**
   * What is on this page, in the sentence every listing uses.
   *
   * It was "12 cards, 30 copies in total. 4 more already on the way." — one of
   * six phrasings of the same fact counted across the product. The figures are
   * the same ones; the shape is now the shape the collection, the wishlist and
   * card search all use.
   */
  const summary = resultSentence([
    matchedLabel(list.toBuy.length, list.toBuy.length, 'card'),
    { value: copies.toLocaleString(), label: copies === 1 ? 'copy' : 'copies' },
    inTransit > 0 && { value: inTransit.toLocaleString(), label: 'more on the way' },
  ]);

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

        {/*
          The three sections, in the control every page in this product uses.

          These were `rounded-full` pills with the selected one on
          `bg-foreground` — a fifth tab treatment, on a page one click from four
          others that each had their own. The card-size slider keeps its place
          at the far end of the same row through the `trailing` slot: the size
          control belongs at the right-hand end of the last control row above
          the results, and on a page with a filter bar that row is the filter
          bar's. This page has no filters, so a band of its own to hold one
          slider would be chrome.
        */}
        <PageTabs
          value={tab}
          onChange={next => setTab(next as Tab)}
          label="Shopping list sections"
          tabs={[
            {
              id: 'buy',
              label: 'To buy',
              icon: ShoppingCart,
              count: loaded ? list.toBuy.length : null,
            },
            {
              id: 'coming',
              label: 'On the way',
              icon: Truck,
              count: loaded ? list.arriving.length + list.arrived.length : null,
            },
            {
              id: 'bought',
              label: 'Already bought',
              shortLabel: 'Bought',
              icon: PackageCheck,
              count: loaded ? list.filed.length : null,
            },
          ]}
          trailing={
            tab === 'buy' && list.toBuy.length > 0 ? (
              <CardSizeSlider
                storageKey="shopping"
                value={view.size}
                onValueChange={view.setSize}
                showValue={false}
                className="hidden sm:flex"
              />
            ) : null
          }
        />

        {tab === 'buy' && (
          <ListingFrame
            view={view}
            gridRef={gridRef}
            count={paged.pageItems.length}
            loading={!loaded && loading}
            /* Unconditional: `ListingFrame` reserves the line and decides when
               it has something to say. */
            summary={summary}
            pager={{
              page: paged.page,
              pageCount: paged.pageCount,
              onPageChange: paged.setPage,
              total: paged.total,
              shown: paged.pageItems.length,
              label: 'Shopping list pages',
            }}
            empty={{
              icon: ShoppingCart,
              title:
                shopping.length > 0 || inTransit > 0
                  ? 'Nothing left to buy'
                  : 'Your shopping list is empty',
              description:
                shopping.length > 0 || inTransit > 0
                  ? 'Everything your decks and your wishlist asked for is either bought or in your collection.'
                  : 'Cards land here from your wishlist, from decks that are short of something, and from the add button on any card.',
              /* Two ways out rather than one, which is why this page used to
                 build its own panel. They are links, so they go in the
                 `actions` slot rather than through `action`, which takes a
                 click handler. */
              actions: (
                <>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/cards">Find cards</Link>
                  </Button>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/decks">Check your decks</Link>
                  </Button>
                </>
              ),
            }}
          >
            {paged.pageItems.map(row => (
              <ShoppingEntryTile
                key={row.key}
                motionKey={row.key}
                leaving={row.leaving}
                entry={row.item}
                width={view.size}
                onBuy={setBuying}
              />
            ))}
          </ListingFrame>
        )}

        {tab === 'coming' && (
          <>
            {list.arriving.length === 0 && list.arrived.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Nothing in the post"
                description="When you mark something as bought it moves here, with what you paid and the date, until you say it arrived."
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

  /*
   * The same tiles as `PlatformTotals` above it, because they were the same
   * three lines written out twice in two files. Both are `MetricRow` now, so
   * the money you are about to spend and the money you already spent are drawn
   * the same size on the same page.
   */
  const metrics: Metric[] = [
    ...totals.map(total => ({
      id: total.currency,
      label: `Paid in ${MONEY_WORD[total.currency]}`,
      value: formatAmount(total.amount, total.currency) ?? '—',
      raw: total.amount,
      subtext: `${total.copies} ${total.copies === 1 ? 'card' : 'cards'}`,
    })),
    copiesWithNoPrice > 0 && {
      id: 'unpriced',
      label: 'No price kept',
      value: copiesWithNoPrice.toLocaleString(),
      raw: copiesWithNoPrice,
      subtext: `${copiesWithNoPrice === 1 ? 'card is' : 'cards are'} missing from these totals`,
    },
  ].filter(Boolean) as Metric[];

  return <MetricRow metrics={metrics} columns={3} />;
}
