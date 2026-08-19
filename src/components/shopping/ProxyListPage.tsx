import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Minus, Plus, Printer, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CardGrid, CardImage, CardSizeSlider, cardDetailPath, useCardSize } from '@/components/cards';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import {
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
  type PaperSize,
  type ProxyQuality,
} from '@/components/deck-builder/proxy-print';
import { ProxySheet } from '@/components/deck-builder/ProxySheet';
import { useCardLists } from '@/lib/shopping';
import { EmptyPanel } from './ShoppingListPage';
import { ListCardBadges } from './ListCardBadges';

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
  const setQuantity = useCardLists(state => state.setQuantity);
  const remove = useCardLists(state => state.remove);

  const [cardWidth, setCardWidth] = useCardSize('proxies', 170);
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
   * The list rows carry their `cards` row already, joined when the list was
   * read, and that row holds `image_uris` and `faces`. So unlike a deck card,
   * which the deck store strips down to four image sizes and no faces, a proxy
   * list entry can answer both questions the sheet asks without a second fetch.
   */
  const printable = useMemo(
    () =>
      proxies.map(item => ({
        ...(item.card ?? { name: item.card_name }),
        name: item.card_name,
        quantity: item.quantity,
      })),
    [proxies]
  );

  const slots = useMemo(() => buildProxySlots(printable, quality), [printable, quality]);
  const pages = Math.ceil(slots.length / PROXY_PER_PAGE);
  const extraFaces = slots.filter(slot => slot.faceLabel === 'Back').length;
  const missingArt = slots.filter(slot => !slot.imageUrl).length;

  const imageUrls = useMemo(
    () => [...new Set(slots.map(slot => slot.imageUrl).filter((u): u is string => Boolean(u)))],
    [slots]
  );

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
      showSuccess('Sent to the printer', `${slots.length} cards across ${pages} ${pages === 1 ? 'sheet' : 'sheets'}.`);
    } catch (error: any) {
      showError('Could not print', error?.message ?? 'Please try again.');
    } finally {
      setPrinting(false);
      setProgress(0);
    }
  }, [imageUrls, pages, slots.length]);

  return (
    <StandardPageLayout
      title="Proxy list"
      description="Cards you want to print and play with. Real art, real card size."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="gap-2" asChild>
            <Link to="/shopping">
              <ShoppingCart className="h-4 w-4" />
              Shopping list
            </Link>
          </Button>
          <Button size="sm" className="gap-2" onClick={print} disabled={slots.length === 0 || printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printing ? `Getting the art ready ${progress}%` : 'Print these'}
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
        <EmptyPanel
          icon={Printer}
          title="Your proxy list is empty"
          body="Add cards from any card page or search result, then print the sheet and cut them out. The deck builder can still make proxies for a whole deck."
          action={
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" asChild>
                <Link to="/cards">Find cards</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/decks">Open a deck</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{slots.length}</p>
              <p className="text-xs text-muted-foreground">
                cards to print, {pages} {pages === 1 ? 'sheet' : 'sheets'}
              </p>
            </div>

            <div className="text-sm text-muted-foreground">
              {CARD_W_MM} by {CARD_H_MM} mm, nine to a {PAPER[paper].label} sheet, about{' '}
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
                  Cut lines
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              On the list
            </h2>
            <CardSizeSlider storageKey="proxies" value={cardWidth} onValueChange={setCardWidth} />
          </div>

          <CardGrid width={cardWidth}>
            {proxies.map(item => {
              const href = cardDetailPath({ id: item.card_id, name: item.card_name }) ?? '#';
              return (
                <div key={item.id} className="flex min-w-0 flex-col gap-2">
                  <Link
                    to={href}
                    aria-label={`Open ${item.card_name}`}
                    className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardImage card={item.card ?? { name: item.card_name }} width={cardWidth} fill interactive>
                      <ListCardBadges quantity={item.quantity} finish={item.finish} />
                    </CardImage>
                  </Link>
                  <Link to={href} className="truncate text-sm font-medium text-foreground hover:underline">
                    {item.card_name}
                  </Link>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label={`Take ${item.card_name} off the proxy list`}
                      onClick={() => void remove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
            <div className="rounded-xl bg-muted/20 p-3">
              <ProxySheet ref={sheetRef} slots={slots} paper={paper} cutGuides={cutGuides} />
            </div>
          </div>
        </div>
      )}
    </StandardPageLayout>
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
