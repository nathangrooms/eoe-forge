import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Heart,
  Images,
  Loader2,
  Minus,
  Plus,
  Printer,
  Share2,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CardGrid, CardImage, CardSizeSlider, cardDetailPath, useCardSize } from '@/components/cards';
import { usePagedItems } from '@/hooks/usePagination';
import { Pager } from '@/components/ui/pagination';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import {
  BLEED_MM,
  CARD_H_MM,
  CARD_W_MM,
  PAPER,
  PRINT_DIALOG_HINT,
  PROXY_PER_PAGE,
  PROXY_QUALITY,
  buildProxySlots,
  isolateForPrint,
  preloadProxyImages,
  proxyDpi,
  sheetPlan,
  showSheetPlan,
  type PaperSize,
  type ProxyQuality,
} from '@/components/deck-builder/proxy-print';
import { ProxySheet } from '@/components/deck-builder/ProxySheet';
import { type WriteCard } from '@/lib/decklist';
import {
  countProxyCopies,
  proxyCandidatesFromShopping,
  proxyCandidatesFromWishlist,
  showListItemCount,
  useCardLists,
  type CardListItem,
  type ProxyCandidate,
} from '@/lib/shopping';
import { ChangeArtPanel } from './ChangeArtPanel';
import { ListCardBadges } from './ListCardBadges';
import { ProxyExportPanel } from './ProxyExportPanel';
import { ListToProxiesPanel } from './ListToProxiesPanel';
import { PasteCardList } from './PasteCardList';
import { useProxyArt, type ProxyArt, type RowArtState } from './useProxyArt';

/**
 * `/proxies` — a proxy list of your own, printed with real card art.
 *
 * Owner: "Maybe Proxies should be its own feature in left nav, not just hidden
 * in deck page (can stay there). Would be cool if on card pages, we could add
 * them to a proxy list too. Then proxy list page we can print with real images."
 *
 * WHAT IS SHARED WITH THE SHOPPING LIST, AND WHAT IS NOT
 * -----------------------------------------------------
 * Shared: the tables, the add-from-anywhere button, the nav entry, dedupe and
 * the security rules. A proxy list and a shopping list are the same primitive.
 * Different: the ending. Shopping has bought, on the way, arrived and filed.
 * Proxies have none of that; a proxy list is print, done, and the database
 * refuses to put a proxy row into a buying state at all.
 *
 * WHY THIS DOES NOT DRAW ITS OWN SHEET
 * ------------------------------------
 * The printable sheet already exists and is correct: `ProxySheet` plus
 * `proxy-print.ts` render real card art at 63 x 88 mm, nine to a page, with the
 * geometry shared between the screen preview, the print stylesheet and the PDF
 * so they cannot disagree about card size. This page selects cards and hands
 * them over. The deck builder's generator keeps working exactly as it did.
 */
export default function ProxyListPage() {
  const load = useCardLists(state => state.load);
  const loading = useCardLists(state => state.loading);
  const loaded = useCardLists(state => state.loaded);
  const proxies = useCardLists(state => state.proxies);
  const shopping = useCardLists(state => state.shopping);
  const wishlist = useCardLists(state => state.wishlist);
  const shortfalls = useCardLists(state => state.shortfalls);
  const setQuantity = useCardLists(state => state.setQuantity);
  const remove = useCardLists(state => state.remove);
  const clear = useCardLists(state => state.clear);

  const [cardWidth, setCardWidth] = useCardSize('proxies', 170);
  const [pasting, setPasting] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** The row whose art is being changed, by list row id. */
  const [changingArt, setChangingArt] = useState<string | null>(null);
  const [bringing, setBringing] = useState<null | 'shopping' | 'wishlist'>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [quality, setQuality] = useState<ProxyQuality>('large');
  const [cutGuides, setCutGuides] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Which printing each row prints, and how many others it could have picked.
   *
   * Counting the alternatives is one request for the whole list. Picking one
   * writes itself, after a short pause, and says so on the card and at the top
   * of the list. See `useProxyArt`.
   */
  const art = useProxyArt(proxies);

  /** The printing a row prints right now: this session's pick, or the saved one. */
  const printingFor = useCallback(
    (item: CardListItem) => art.chosen[item.id] ?? item.card,
    [art.chosen]
  );

  /**
   * The list rows carry their `cards` row already, joined when the list was
   * read, and that row holds `image_uris` and `faces`. So unlike a deck card,
   * which the deck store strips down to four image sizes and no faces, a proxy
   * list entry can answer both questions the sheet asks without a second fetch.
   *
   * A printing picked in this session takes the joined row's place, so the
   * sheet below shows the new art the instant it is chosen rather than after
   * the write lands. The name stays the row's own: a face matched row is filed
   * under the half the player typed.
   */
  const printable = useMemo(
    () =>
      proxies.map(item => ({
        ...(printingFor(item) ?? { name: item.card_name }),
        name: item.card_name,
        quantity: item.quantity,
      })),
    [proxies, printingFor]
  );

  /**
   * The same list, written down instead of drawn.
   *
   * It reads the SAME `printingFor` the sheet reads, so an export taken a
   * second after picking new art names the art that is on screen rather than
   * the one that was there before. The set code and collector number are the
   * whole reason this exists: a proxy list is a list of pictures, and a column
   * of bare names is a different list.
   *
   * The name is the catalogue's, not the row's. They differ only when a row was
   * matched on one half of a double faced card, and the catalogue name is the
   * one a lookup somewhere else will find. A row the catalogue has nothing for
   * keeps the name it was saved under, which is all we have.
   */
  const exportCards = useMemo<WriteCard[]>(
    () =>
      proxies.map(item => {
        const printing = printingFor(item);
        return {
          name: printing?.name ?? item.card_name,
          quantity: Math.max(1, item.quantity),
          setCode: printing?.set_code ?? null,
          setName: printing?.set_name ?? null,
          collectorNumber: printing?.collector_number ?? null,
          finish: item.finish,
        };
      }),
    [proxies, printingFor]
  );

  const slots = useMemo(() => buildProxySlots(printable, quality), [printable, quality]);
  /* One count, read by the headline, the button and the toast. `slots` and not
     `sum(quantity)`: a double faced card is two physical cards. */
  const plan = useMemo(() => sheetPlan(slots.length), [slots.length]);
  const pages = plan.sheets;
  const extraFaces = slots.filter(slot => slot.faceLabel === 'Back').length;
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
  const pagedProxies = usePagedItems(proxies, { pageSize: 60 });

  const missingArt = slots.filter(slot => !slot.imageUrl).length;

  const imageUrls = useMemo(
    () => [...new Set(slots.map(slot => slot.imageUrl).filter((u): u is string => Boolean(u)))],
    [slots]
  );

  /*
   * The two lists a player already keeps, offered here as well as on their own
   * pages. Somebody who came looking for the proxy page should not have to know
   * that the button is on the OTHER page. Both come out of the same store this
   * page is already reading, so offering them costs no extra query.
   */
  const fromShopping = useMemo(
    () => proxyCandidatesFromShopping(useCardLists.getState().assembled().toBuy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopping, wishlist, shortfalls]
  );
  const fromWishlist = useMemo(() => proxyCandidatesFromWishlist(wishlist), [wishlist]);

  /*
   * COPIES, NOT ROWS, EVERYWHERE A NUMBER IS SHOWN
   * ----------------------------------------------
   * These buttons used to be labelled with `fromShopping.length`, which is how
   * many distinct cards the list holds. The panel they open counts COPIES, and
   * copies is also what gets written. A shopping list of six cards where one is
   * wanted three times read "Your shopping list, 6 cards" and then offered "Add
   * 12 to the proxy list" on the very next screen. Same for the emptying
   * confirmation, which counted rows while the headline above it counted cards
   * to print. One number, counted one way, on every surface.
   */
  const shoppingCopies = useMemo(() => countProxyCopies(fromShopping), [fromShopping]);
  const wishlistCopies = useMemo(() => countProxyCopies(fromWishlist), [fromWishlist]);
  const copiesOnList = useMemo(
    () => proxies.reduce((sum, item) => sum + Math.max(1, item.quantity), 0),
    [proxies]
  );

  const bringingList: ProxyCandidate[] =
    bringing === 'shopping' ? fromShopping : bringing === 'wishlist' ? fromWishlist : [];

  /* Looked up fresh rather than held in state, so the panel is reading the same
     row the grid behind it is. A row that gets removed while its art panel is
     open closes the panel instead of describing a card that has gone. */
  const changing = changingArt ? proxies.find(item => item.id === changingArt) ?? null : null;
  const changingOracle = changing ? changing.oracle_id ?? changing.card?.oracle_id ?? null : null;
  const changingVersions = changingOracle ? art.counts.get(changingOracle) ?? 0 : 0;

  const clearAll = useCallback(async () => {
    setClearing(true);
    const going = copiesOnList;
    try {
      await clear('proxy');
      setConfirmingClear(false);
      showSuccess('Proxy list emptied', `${showListItemCount(going)} taken off.`);
    } catch (error: any) {
      showError('Could not empty the list', error?.message ?? 'Please try again.');
    } finally {
      setClearing(false);
    }
  }, [clear, copiesOnList]);

  const print = useCallback(async () => {
    if (slots.length === 0) return;
    if (!sheetRef.current) {
      showError('The sheet is not ready', 'Give the card art a moment to load.');
      return;
    }
    setPrinting(true);
    setProgress(0);
    try {
      await preloadProxyImages(imageUrls, setProgress);

      const restore = isolateForPrint(sheetRef.current);
      let restored = false;
      const cleanup = () => {
        if (restored) return;
        restored = true;
        restore();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
      /* Chrome fires `afterprint` when the dialog closes; Safari and some Linux
         builds never do. Without a second path the app is left with its own
         interface still hidden. */
      window.setTimeout(cleanup, 1000);
      showSuccess('Sent to the printer', `${showSheetPlan(plan)}.`);
    } catch (error: any) {
      showError('Could not print', error?.message ?? 'Please try again.');
    } finally {
      setPrinting(false);
      setProgress(0);
    }
  }, [imageUrls, plan, slots.length]);

  return (
    <StandardPageLayout
      title="Proxy list"
      description="Cards you want to print and play with. Real art, real card size."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <BringInButtons
            fromShopping={shoppingCopies}
            fromWishlist={wishlistCopies}
            onBring={setBringing}
          />
          {proxies.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => setPasting(open => !open)}
              aria-expanded={pasting}
            >
              <ClipboardPaste className="h-4 w-4" />
              {pasting ? 'Hide the paste box' : 'Paste a list'}
            </Button>
          )}
          {/* The way back out. A list you can paste in and never get out of is
              a list held hostage, and the versions chosen here are worth more
              than the names: they are the only record of which art prints. */}
          {proxies.length > 0 && (
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => setExporting(true)}>
              <Share2 className="h-4 w-4" />
              Export
            </Button>
          )}
          {/* The last thing read before paper is spent says how much paper.
              "Print these" said nothing about the size of the job. */}
          <Button size="sm" className="gap-2" onClick={print} disabled={slots.length === 0 || printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printing
              ? `Getting the art ready ${progress}%`
              : slots.length === 0
                ? 'Print'
                : `Print ${slots.length} on ${pages} ${pages === 1 ? 'sheet' : 'sheets'}`}
          </Button>
        </div>
      }
    >
      {!loaded && loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading your proxy list
        </div>
      ) : proxies.length === 0 ? (
        /*
         * The empty state used to read "Add cards from any card page or search
         * result", which described a control that did not exist. An empty page
         * that tells you to do something the product cannot do is worse than an
         * empty page. It is the paste box now, because pasting a list is the
         * thing you can actually do, and it is the way most people will.
         */
        <div className="space-y-4">
          <PasteCardList kind="proxy" />

          {(fromShopping.length > 0 || fromWishlist.length > 0) && (
            <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
              <p className="text-sm text-foreground">
                You already keep lists of cards you do not own yet. Bring one straight over.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {fromShopping.length > 0 && (
                  <Button variant="secondary" size="sm" className="gap-2" onClick={() => setBringing('shopping')}>
                    <ShoppingCart className="h-4 w-4" />
                    Your shopping list, {showListItemCount(shoppingCopies)}
                  </Button>
                )}
                {fromWishlist.length > 0 && (
                  <Button variant="secondary" size="sm" className="gap-2" onClick={() => setBringing('wishlist')}>
                    <Heart className="h-4 w-4" />
                    Your wishlist, {showListItemCount(wishlistCopies)}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              A deck you already have in DeckMatrix does not need pasting. Open it and use Proxies
              in the deck tools to print the whole thing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/decks">Open a deck</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/cards">Search for cards</Link>
              </Button>
              {/* Only when the bring-in row above is not already offering it,
                  so the same words are not on the page twice. */}
              {fromShopping.length === 0 && fromWishlist.length === 0 && (
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/shopping">Your shopping list</Link>
                </Button>
              )}
            </div>
          </div>
          <PlaytestOnlyNote />
        </div>
      ) : (
        <div className="space-y-6">
          {pasting && <PasteCardList kind="proxy" onAdded={() => setPasting(false)} />}
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{slots.length}</p>
              <p className="text-xs text-muted-foreground">
                cards to print, {pages} {pages === 1 ? 'sheet' : 'sheets'}
                {pages > 1 && plan.onLast < PROXY_PER_PAGE ? `, ${plan.onLast} on the last one` : ''}
              </p>
            </div>

            <div className="text-sm text-muted-foreground">
              {CARD_W_MM} by {CARD_H_MM} mm, the real size, nine to a {PAPER[paper].label} sheet, about{' '}
              {proxyDpi(quality)} dots per inch.
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Choice
                label="Paper"
                value={paper}
                options={(Object.keys(PAPER) as PaperSize[]).map(key => ({
                  value: key,
                  label: PAPER[key].label,
                }))}
                onChange={next => setPaper(next as PaperSize)}
              />
              <Choice
                label="Quality"
                value={quality}
                options={(Object.keys(PROXY_QUALITY) as ProxyQuality[]).map(key => ({
                  value: key,
                  label: PROXY_QUALITY[key].label,
                }))}
                onChange={next => setQuality(next as ProxyQuality)}
              />
              <div className="flex items-center gap-2">
                <Switch id="cut-guides" checked={cutGuides} onCheckedChange={setCutGuides} />
                <Label htmlFor="cut-guides" className="text-sm">
                  Cut marks
                </Label>
              </div>
            </div>
          </div>

          {(extraFaces > 0 || missingArt > 0) && (
            <p className="text-sm text-muted-foreground">
              {extraFaces > 0 &&
                `${extraFaces} extra ${extraFaces === 1 ? 'card' : 'cards'} for the backs of double faced cards, because paper does not flip. `}
              {missingArt > 0 &&
                `${missingArt} ${missingArt === 1 ? 'card has' : 'cards have'} no art, so ${missingArt === 1 ? 'it prints' : 'they print'} as readable text instead.`}
            </p>
          )}

          <PlaytestOnlyNote />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              On the list
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {/*
                In place, never a centred dialog that dims the page. The button
                becomes the question and the question carries the number, so
                nobody empties forty cards thinking they clicked something else.
              */}
              {confirmingClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Take all {showListItemCount(copiesOnList)} off the list?
                  </span>
                  <Button size="sm" variant="secondary" onClick={clearAll} disabled={clearing} className="gap-2">
                    {clearing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Yes, empty it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)} disabled={clearing}>
                    Keep them
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setConfirmingClear(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Empty the list
                </Button>
              )}
              <CardSizeSlider storageKey="proxies" value={cardWidth} onValueChange={setCardWidth} />
            </div>
          </div>

          <ArtSaveLine art={art} />

          {pagedProxies.pageCount > 1 && (
            <Pager
              page={pagedProxies.page}
              pageCount={pagedProxies.pageCount}
              onPageChange={pagedProxies.setPage}
              total={pagedProxies.total}
              shown={pagedProxies.pageItems.length}
              pageSize={pagedProxies.pageSize}
              label="Proxy list pages"
              className="mb-3"
            />
          )}
          <CardGrid width={cardWidth}>
            {pagedProxies.pageItems.map(item => {
              const printing = printingFor(item);
              const href = cardDetailPath({
                id: printing?.id ?? item.card_id,
                name: item.card_name,
              }) ?? '#';
              const oracleId = item.oracle_id ?? item.card?.oracle_id ?? null;
              const versions = oracleId ? art.counts.get(oracleId) ?? 0 : 0;
              const rowState = art.rowState[item.id];
              return (
                <div key={item.id} className="flex min-w-0 flex-col gap-2">
                  <Link
                    to={href}
                    aria-label={`Open ${item.card_name}`}
                    className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardImage card={printing ?? { name: item.card_name }} width={cardWidth} fill interactive>
                      <ListCardBadges quantity={item.quantity} finish={item.finish} />
                    </CardImage>
                  </Link>
                  <Link to={href} className="truncate text-sm font-medium text-foreground hover:underline">
                    {item.card_name}
                  </Link>

                  {/* Which version is on the list, said in the words printed on
                      the card. Within one set the showcase, borderless and
                      extended art copies share a name and differ only by
                      number, so the number is not decoration.

                      The saving state shares this line rather than taking one
                      of its own. A line that appears when a card is saved makes
                      that card taller than the five beside it and knocks its
                      buttons out of the row, so the one card you just touched
                      is the one that looks broken. */}
                  <div className="flex min-h-[1rem] items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{describeVersion(printing, versions)}</span>
                    {rowState && <RowSaveLine state={rowState} />}
                  </div>

                  {/* The owner: "proxies need a button click that allows you to
                      change to alternative art work". Every row gets it, even
                      the ones we cannot count, because a count we failed to
                      read is not evidence there is only one version. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full gap-1.5"
                    onClick={() => setChangingArt(item.id)}
                    aria-label={`Change the art on ${item.card_name}`}
                  >
                    <Images className="h-3.5 w-3.5" aria-hidden />
                    Change art
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      aria-label={`One fewer ${item.card_name}`}
                      onClick={() => void setQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      aria-label={`One more ${item.card_name}`}
                      onClick={() => void setQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    {/* Named, not a bare icon. A trash can in the corner of a
                        card tile reads as decoration until you need it. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                      aria-label={`Take ${item.card_name} off the proxy list`}
                      onClick={() => void remove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardGrid>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                The sheet, exactly as it prints
              </h2>
              <p className="text-xs text-muted-foreground">{PRINT_DIALOG_HINT}</p>
            </div>
            {/*
              Said once, near the thing it describes. Nothing prints on a card:
              the ticks are in the margin and the black is under the block.
            */}
            {cutGuides && (
              <p className="mb-2 text-xs text-muted-foreground">
                The nine cards touch, so every cut inside the sheet is shared and a small miss just takes a
                sliver of the next card's border. The four cuts around the outside sit on {BLEED_MM} mm of
                black, so a miss there keeps black instead of showing white paper. The ticks in the margin
                mark every cut line at both ends. Nothing is printed on a card.
              </p>
            )}
            <div className="rounded-xl bg-muted/20 p-3">
              <ProxySheet ref={sheetRef} slots={slots} paper={paper} cutGuides={cutGuides} />
            </div>
          </div>
        </div>
      )}

      <ListToProxiesPanel
        open={bringing !== null}
        onOpenChange={open => !open && setBringing(null)}
        candidates={bringingList}
        sourceLabel={bringing === 'wishlist' ? 'your wishlist' : 'your shopping list'}
        description={
          bringing === 'wishlist'
            ? 'Everything you have your eye on. Print it and play the deck before you spend anything.'
            : 'Everything you still need to buy. Print it and play the deck before you spend anything.'
        }
      />

      <ProxyExportPanel
        open={exporting}
        onOpenChange={setExporting}
        cards={exportCards}
      />

      {/*
        The panel STAYS OPEN after a pick, unlike the one on the paste screen.
        Nothing is being reviewed here: the row is already saved, so the pick
        writes itself, and the reader needs to see that happen. Closing on the
        click would leave the only evidence being that the picture changed,
        which is exactly the doubt the deck optimiser's silent timer created.
      */}
      <ChangeArtPanel
        open={changing !== null}
        onOpenChange={open => !open && setChangingArt(null)}
        cardName={changing?.card_name ?? ''}
        oracleId={changing ? changing.oracle_id ?? changing.card?.oracle_id ?? null : null}
        current={changing ? printingFor(changing) : undefined}
        note={changingNote(changingVersions)}
        saveState={changing ? art.rowState[changing.id] ?? null : null}
        problem={art.problem}
        onPick={printing => changing && art.choose(changing, printing)}
      />
    </StandardPageLayout>
  );
}

/**
 * How many printings the shelf can actually put on screen.
 *
 * `fetchPrintings` asks for 400 and no more. That is invisible on almost every
 * card and glaring on a basic land: measured against the live catalogue on
 * 20 Aug 2026, Forest has 792 printings, Swamp 791, Plains 768, Island 741, and
 * basic land art is the single most likely thing somebody wants to change on a
 * proxy sheet. Counting 792 on the card and then quietly showing 400 would be
 * the app lying about what it has, so it says which 400 instead.
 *
 * If that limit ever moves, this number moves with it.
 */
const SHELF_LIMIT = 400;

/** What the art panel says above the shelf, given how much of it it can show. */
function changingNote(versions: number): string {
  const base =
    'Pick the version you want on the sheet. This is the art that gets printed, and it saves to your list on its own.';
  if (versions <= SHELF_LIMIT) return base;
  return `${base} This card has ${versions} versions and the newest ${SHELF_LIMIT} are shown.`;
}

/**
 * Which version of the card is on the list, and how many others exist.
 *
 * The count is what turns the button into an offer. "Change art" alone does not
 * say whether there is anything to change to; "34 versions" does. A card we
 * could not count says nothing rather than guessing at one, because a failed
 * lookup is not evidence that a card was printed once.
 */
function describeVersion(printing: any, versions: number): string {
  const set = String(printing?.set_code ?? printing?.set ?? '').toUpperCase();
  const number = printing?.collector_number ? ` #${printing.collector_number}` : '';
  const where = set ? `${set}${number}` : '';
  const many =
    versions > 1 ? `${versions} versions` : versions === 1 ? 'the only version' : '';
  if (where && many) return `${where}, ${many}`;
  return where || many;
}

/**
 * What just happened to one card's art, on the card itself.
 *
 * Said and left there for the rest of the session. A tick that fades after two
 * seconds is a tick nobody saw, which is the same problem as not showing one.
 */
function RowSaveLine({ state }: { state: RowArtState }) {
  if (state === 'error') {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1 text-foreground">
        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
        Art not saved
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Check className="h-3 w-3 shrink-0" aria-hidden />
        Art saved
      </span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
      Saving
    </span>
  );
}

/**
 * The rule stated out loud, above the cards it governs.
 *
 * There is no save button because there is nothing to save: the choice is
 * written for you. That is only an improvement if it is said, which is the
 * whole lesson of commit 43afae4. So the line is there before anything is
 * picked, not only after.
 */
function ArtSaveLine({ art }: { art: ProxyArt }) {
  if (art.state === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-1.5 text-sm text-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {art.problem ?? 'That did not save. Check your connection and try again.'}
        </p>
        <Button size="sm" variant="secondary" onClick={art.saveNow}>
          Try again
        </Button>
      </div>
    );
  }

  if (art.state === 'saving') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Saving your art {art.waiting > 1 ? 'choices' : 'choice'}.
      </p>
    );
  }

  if (art.state === 'saved') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        Art saved. It is what prints, and it is still here next time.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Any card can print a different version. Pick one and it saves on its own.
    </p>
  );
}

/**
 * The two lists a player already keeps, offered on the proxy page itself.
 *
 * Each button carries its own size, so nobody opens a panel to find out there
 * is nothing in it, and a list that is empty offers no button at all.
 */
function BringInButtons({
  fromShopping,
  fromWishlist,
  onBring,
}: {
  fromShopping: number;
  fromWishlist: number;
  onBring: (source: 'shopping' | 'wishlist') => void;
}) {
  if (fromShopping === 0 && fromWishlist === 0) {
    return (
      <Button variant="secondary" size="sm" className="gap-2" asChild>
        <Link to="/shopping">
          <ShoppingCart className="h-4 w-4" />
          Shopping list
        </Link>
      </Button>
    );
  }

  return (
    <>
      {fromShopping > 0 && (
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => onBring('shopping')}>
          <ShoppingCart className="h-4 w-4" />
          <span className="hidden sm:inline">Shopping list,</span>
          <span className="tabular-nums">{fromShopping}</span>
        </Button>
      )}
      {fromWishlist > 0 && (
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => onBring('wishlist')}>
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">Wishlist,</span>
          <span className="tabular-nums">{fromWishlist}</span>
        </Button>
      )}
    </>
  );
}

/**
 * What these sheets are for, said plainly and never hidden.
 *
 * Wizards' Fan Content Policy requires fan content to be free, so a proxy sheet
 * must never sit behind a payment and nothing in this product may suggest these
 * are sellable or legal at an event. The sentence is short and it is on the
 * page rather than in a help article, because the person about to press print
 * is the person who needs to read it.
 */
function PlaytestOnlyNote() {
  return (
    <p className="text-sm text-muted-foreground">
      These are for playtesting at your own table. They are free, they are not real cards, and they
      are not legal at any event. Do not sell them.
    </p>
  );
}

/*
 * Not generic, deliberately. A generic component called with explicit JSX type
 * arguments (`<Choice<PaperSize> …>`) type-checks and builds, but the dev
 * server's component tagger rewrites JSX attributes and chokes on the type
 * argument, so the page 500s in development while passing every other check.
 * A plain string prop with a cast at the two call sites costs nothing.
 */
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex overflow-hidden rounded-md bg-muted/40">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              'px-2.5 py-1 text-sm transition-colors',
              value === option.value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
