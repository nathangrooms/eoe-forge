import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIELD, MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Download, FileText, Loader2, CheckCircle, Info } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { CardImage } from '@/components/cards/CardImage';
import { ProxySheet } from './ProxySheet';
import {
  BLEED_MM,
  CARD_H_MM,
  CARD_W_MM,
  PAPER,
  PRINT_DIALOG_HINT,
  PROXY_PER_PAGE,
  PROXY_QUALITY,
  bleedRect,
  buildProxySlots,
  cropMarkSegments,
  hydrateProxyPrintings,
  isolateForPrint,
  mergePrinting,
  preloadProxyImages,
  proxyDpi,
  sheetMargins,
  sheetPlan,
  showSheetPlan,
  type HydrateResult,
  type PaperSize,
  type ProxyQuality,
} from './proxy-print';

interface DeckProxyGeneratorProps {
  deckCards: any[];
  deckName: string;
  commander?: any;
}

/**
 * Printable proxies.
 *
 * This used to emit a PDF of *text boxes* — `drawTextCard` drew a name, a type
 * line and wrapped oracle text with jsPDF vector calls, and no card image was
 * ever placed on a page. The `quality` control was wired to nothing, because
 * there was no image whose resolution it could pick. Proxies exist to be cut out
 * and played with, so the art is the entire point; the text renderer survives
 * only as the fallback for a printing that genuinely has no image.
 *
 * The printable artefact is the DOM sheet in `ProxySheet`, driven by the mm
 * geometry in `proxy-print.ts`. The PDF export draws the same images at the same
 * millimetre positions, so the two outputs cannot disagree about card size.
 */
export function DeckProxyGenerator({ deckCards, deckName, commander }: DeckProxyGeneratorProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [quality, setQuality] = useState<ProxyQuality>('large');
  const [cutGuides, setCutGuides] = useState(true);
  const [busy, setBusy] = useState<null | 'print' | 'pdf'>(null);
  const [progress, setProgress] = useState(0);
  const [hydrating, setHydrating] = useState(true);
  const [printings, setPrintings] = useState<HydrateResult | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Combine commander with deck cards for full list
  const baseCards = useMemo(() => {
    const cards = [...deckCards];
    if (commander && !cards.some(c => c.name === commander.name)) {
      cards.unshift({ ...commander, quantity: 1, isCommander: true });
    }
    return cards;
  }, [deckCards, commander]);

  /**
   * Deck cards are re-read from the `cards` table before anything is printed.
   *
   * The deck store drops `card_faces` when it maps a Scryfall payload and keeps
   * only `{small,normal,large,art_crop}` of `image_uris`, so a deck card can
   * offer neither a print-resolution front nor a back face. Worse, it writes
   * `image_uris: apiCard.image_uris || {}` and Scryfall puts no top-level images
   * on a transform card, so every DFC in a deck arrives here with no image at
   * all. `hydrateProxyPrintings` fetches the real printing row for each id.
   */
  useEffect(() => {
    let cancelled = false;
    if (baseCards.length === 0) {
      setPrintings(null);
      setHydrating(false);
      return;
    }
    setHydrating(true);
    hydrateProxyPrintings(baseCards)
      .then(result => {
        if (!cancelled) setPrintings(result);
      })
      .catch(error => {
        console.error('Proxy printing lookup failed:', error);
        if (!cancelled) {
          // Not fatal: whatever art the deck card already carries still prints.
          showError('Could not load full-resolution art', 'Printing from the deck data instead.');
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseCards]);

  const allCards = useMemo(
    () => (printings ? baseCards.map(card => mergePrinting(card, printings)) : baseCards),
    [baseCards, printings]
  );

  const getCardId = useCallback((card: any) => card.id || card.name, []);

  // Initialize selected cards when deck cards change
  useEffect(() => {
    setSelectedCards(new Set(baseCards.map(c => c.id || c.name)));
  }, [baseCards]);

  const toggleCard = (cardId: string) => {
    const newSelected = new Set(selectedCards);
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      newSelected.add(cardId);
    }
    setSelectedCards(newSelected);
  };

  const selectAll = () => setSelectedCards(new Set(allCards.map(c => c.id || c.name)));
  const clearAll = () => setSelectedCards(new Set());

  /**
   * Thumbnails in the selection list are drawn by the shared `CardImage`, which
   * reads `image_uris` / `card_faces` / the `faces` column itself. All this has
   * to do is preserve the last-resort fallbacks the old hand-rolled <img> had:
   * a bare `image` string on decks stored before `image_uris` existed, and the
   * Scryfall named-card endpoint for a card carrying no image data at all.
   * `getBestCardImage` only reaches `image_url` after exhausting every real
   * printing image, so this never overrides a proper asset.
   */
  const withThumbnailFallback = (card: any) => ({
    ...card,
    image_url:
      card.image_url ??
      card.image ??
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=small`,
  });

  const selectedList = useMemo(
    () => allCards.filter(c => selectedCards.has(getCardId(c))),
    [allCards, selectedCards, getCardId]
  );

  /**
   * The slots are the source of truth for every count shown.
   *
   * `sum(quantity)` is not the number of cards you print: a transform or MDFC
   * card occupies two slots because paper does not flip. The old UI derived its
   * page count from `sum(quantity)` and so under-reported on any deck holding
   * double-faced cards.
   */
  const slots = useMemo(() => buildProxySlots(selectedList, quality), [selectedList, quality]);
  /* One count of cards and sheets, shared by the stats, the hint, the buttons
     and the toast, so no two of them can say different numbers. */
  const plan = sheetPlan(slots.length);
  const totalPages = plan.sheets;
  const extraFaces = slots.filter(s => s.faceLabel === 'Back').length;
  const missingArt = slots.filter(s => !s.imageUrl).length;

  const imageUrls = useMemo(
    () => Array.from(new Set(slots.map(s => s.imageUrl).filter((u): u is string => Boolean(u)))),
    [slots]
  );

  /* Decoding before print now lives in `proxy-print.ts` beside the rest of the
     sheet's rules, because the standalone proxy list prints the same sheet and
     two copies of this would drift into two answers about when it is safe. */
  const preloadImages = useCallback(
    (urls: string[]) => preloadProxyImages(urls, setProgress),
    []
  );

  const printSheet = async () => {
    if (slots.length === 0) {
      showError('No cards selected', 'Please select at least one card');
      return;
    }
    /*
     * The sheet is the only thing `isolateForPrint` knows how to isolate, and
     * while hydration is in flight the preview renders a spinner instead of it,
     * so `sheetRef.current` is null. `isolateForPrint(null)` is a no-op that
     * returns a no-op — which means `window.print()` would have gone ahead and
     * printed the entire application UI. Refusing here is the backstop; the
     * button is also disabled while `hydrating`.
     */
    if (!sheetRef.current) {
      showError('Sheet not ready', 'Wait for the printings to finish loading.');
      return;
    }
    setBusy('print');
    setProgress(0);
    try {
      await preloadImages(imageUrls);

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

      /* Chrome fires `afterprint` when the dialog closes, but Safari and some
         Linux builds never fire it. Without a second path the app would be left
         with its own UI still hidden. */
      window.setTimeout(cleanup, 1000);
    } catch (error) {
      console.error('Print failed:', error);
      showError('Print failed', String(error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  /**
   * PDF export — the same sheet, drawn deterministically.
   *
   * Worth keeping alongside the print dialog because the dialog's "Fit to page"
   * default silently rescales an otherwise correct stylesheet, and a PDF cannot
   * be rescaled by accident. It draws at the same mm coordinates as the CSS grid
   * from the same image URLs, so the two outputs are the same sheet.
   *
   * jsPDF is the installed dependency now rather than a `<script>` appended to
   * `<head>` from cdnjs. Dynamic `import()` keeps it out of the main bundle
   * exactly as the CDN load did, without the remote-code and offline exposure.
   */
  const generatePdf = async () => {
    if (slots.length === 0) {
      showError('No cards selected', 'Please select at least one card');
      return;
    }
    setBusy('pdf');
    setProgress(0);

    try {
      const { jsPDF } = await import('jspdf');
      const paper = PAPER[paperSize];
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paper.pdfFormat });
      const { xMm, yMm } = sheetMargins(paperSize);

      // One fetch per distinct printing, reused across copies of the same card.
      const cache = new Map<string, { data: string; format: 'JPEG' | 'PNG' }>();
      const load = async (url: string) => {
        const hit = cache.get(url);
        if (hit) return hit;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} fetching card image`);
        const blob = await response.blob();
        const data: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        /* Handing jsPDF the encoded bytes means it embeds the original JPEG/PNG
           rather than re-encoding through a canvas, so the PDF carries the full
           271 or 300 dpi asset instead of a generation-loss copy. */
        const entry = { data, format: blob.type.includes('png') ? ('PNG' as const) : ('JPEG' as const) };
        cache.set(url, entry);
        return entry;
      };

      /*
       * Bleed and crop marks, from the same rectangles the CSS sheet uses, so
       * the file and the printout cannot disagree about where a cut line is.
       * Drawn first on every page: the band goes under the nine cards and only
       * its outer 1.5 mm ever shows.
       */
      const drawCutLayer = () => {
        if (!cutGuides) return;
        const band = bleedRect(paperSize);
        doc.setFillColor(0, 0, 0);
        doc.rect(band.xMm, band.yMm, band.wMm, band.hMm, 'F');
        for (const mark of cropMarkSegments(paperSize)) {
          if (mark.tone === 'onBleed') doc.setFillColor(255, 255, 255);
          else doc.setFillColor(138, 138, 138);
          doc.rect(mark.xMm, mark.yMm, mark.wMm, mark.hMm, 'F');
        }
      };

      drawCutLayer();

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (i > 0 && i % PROXY_PER_PAGE === 0) {
          doc.addPage();
          drawCutLayer();
        }

        const posOnPage = i % PROXY_PER_PAGE;
        const x = xMm + (posOnPage % 3) * CARD_W_MM;
        const y = yMm + Math.floor(posOnPage / 3) * CARD_H_MM;

        let drewImage = false;
        if (slot.imageUrl) {
          try {
            const { data, format } = await load(slot.imageUrl);
            doc.addImage(data, format, x, y, CARD_W_MM, CARD_H_MM);
            drewImage = true;
          } catch (error) {
            console.warn(`Proxy image failed for ${slot.card?.name}:`, error);
          }
        }
        if (!drewImage) drawTextProxy(doc, x, y, slot.card);

        setProgress(Math.round(((i + 1) / slots.length) * 100));
      }

      doc.save(`${deckName.replace(/[^a-z0-9]/gi, '_')}_proxies.pdf`);
      showSuccess(
        'Proxies exported',
        `${showSheetPlan(plan)}.`
      );
    } catch (error) {
      console.error('Generation failed:', error);
      showError('Generation failed', String(error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const exportText = () => {
    const textList = selectedList.map(c => `${c.quantity || 1}x ${c.name}`).join('\n');
    const blob = new Blob([textList], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName}-proxies.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Exported', 'Card list exported');
  };

  const margins = sheetMargins(paperSize);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-primary" />
            Proxy Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Full card art at {CARD_W_MM} by {CARD_H_MM} mm, the real size, {PROXY_PER_PAGE} per{' '}
            {PAPER[paperSize].label} sheet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Settings Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Paper</Label>
              <Select value={paperSize} onValueChange={v => setPaperSize(v as PaperSize)}>
                <SelectTrigger className={cn(FIELD, 'h-8 text-xs')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAPER) as PaperSize[]).map(key => (
                    <SelectItem key={key} value={key}>
                      {PAPER[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Art resolution</Label>
              <Select value={quality} onValueChange={v => setQuality(v as ProxyQuality)}>
                <SelectTrigger className={cn(FIELD, 'h-8 text-xs')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/*
                    DPI, because that is the print decision and it is computed
                    from the asset's real pixel width. This used to also print
                    "~65 kB / ~99 kB / ~737 kB" — one sampled card's file size
                    passed off as every card's. Real spread across ten printings
                    is 65-104 / 101-164 / 316-1549 kB, so the label was wrong by
                    a third on the JPEG tiers and by 2x on the PNG. A number
                    that cannot be computed from the data does not get shown.
                  */}
                  {(Object.keys(PROXY_QUALITY) as ProxyQuality[]).map(key => (
                    <SelectItem key={key} value={key}>
                      {PROXY_QUALITY[key].label} · {proxyDpi(key)} dpi
                      {PROXY_QUALITY[key].note ? ` · ${PROXY_QUALITY[key].note}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-end">
              <div className="flex items-center gap-2 text-xs">
                <Switch id="cut-guides" checked={cutGuides} onCheckedChange={setCutGuides} className="scale-75" />
                <label htmlFor="cut-guides" className="cursor-pointer">
                  Cut guides
                </label>
              </div>
            </div>
          </div>

          {/*
            Stats — every number here is counted off the sheet that will print.

            These were five hand-built pads, `p-2 rounded bg-muted/30` with a
            16px bold value, which is a sixteenth of the size the same kind of
            figure gets on the deck page and on My Decks. It was the last metric
            row in the deck folder still drawing its own tile, and it was on a
            sub page, which is exactly where the owner said the theming stopped.
            `MetricRow` now, so a print figure is a 24px number on the shared
            tile like every other figure in the product.

            `on="card"` because this sits inside a raised `CardContent`: the
            page-level tile is `bg-card`, and a `bg-card` tile on a `bg-card`
            panel is not a subtle tile, it is no tile at all.
          */}
          <MetricRow
            on="card"
            columns={5}
            metrics={[
              {
                id: 'selected',
                label: 'Selected',
                value: selectedCards.size.toLocaleString(),
                raw: selectedCards.size,
                suffix: `/ ${allCards.length}`,
              },
              {
                id: 'slots',
                label: 'Cards to print',
                value: slots.length.toLocaleString(),
                raw: slots.length,
                subtext: 'copies, not names',
              },
              {
                id: 'pages',
                label: 'Sheets',
                value: totalPages.toLocaleString(),
                raw: totalPages,
                subtext: `${PROXY_PER_PAGE} per ${PAPER[paperSize].label}`,
              },
              {
                id: 'faces',
                label: 'Extra faces',
                value: extraFaces.toLocaleString(),
                raw: extraFaces,
                subtext: 'backs of double-faced cards',
              },
              {
                id: 'dpi',
                label: 'Print dpi',
                value: String(proxyDpi(quality)),
                raw: proxyDpi(quality),
                subtext: 'at real card size',
              },
            ]}
          />

          {/* Selection controls + output */}
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear
            </Button>
            {selectedCards.size === allCards.length && allCards.length > 0 && (
              <Badge variant="secondary" className="bg-muted text-foreground text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                All
              </Badge>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportText} disabled={slots.length === 0}>
              <FileText className="h-3 w-3 mr-1" />
              List
            </Button>
            {/*
              Both outputs wait on hydration. Until the printing rows land, a
              deck card carries at best a `normal` image and every transform
              card carries none at all, so exporting now would silently produce
              a PDF of text proxies where the art exists — and printing now
              would find no sheet mounted to isolate at all. `List` is exempt:
              it only needs names and quantities, which the deck already has.
            */}
            <Button
              variant="outline"
              size="sm"
              onClick={generatePdf}
              disabled={slots.length === 0 || busy !== null || hydrating}
            >
              {busy === 'pdf' ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {progress}%
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-1" />
                  PDF ({slots.length})
                </>
              )}
            </Button>
            <Button
              onClick={printSheet}
              disabled={slots.length === 0 || busy !== null || hydrating}
              size="sm"
            >
              {busy === 'print' ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {progress}%
                </>
              ) : (
                <>
                  <Printer className="h-3 w-3 mr-1" />
                  {/* The last thing read before paper is spent says how much
                      paper. `Print` on its own said nothing. */}
                  Print {slots.length} on {totalPages} {totalPages === 1 ? 'sheet' : 'sheets'}
                </>
              )}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="space-y-0.5">
              <p>{PRINT_DIALOG_HINT}</p>
              <p>
                {showSheetPlan(plan)}. {PAPER[paperSize].label} leaves {margins.xMm.toFixed(1)} mm left and right
                and {margins.yMm.toFixed(1)} mm top and bottom.
                {cutGuides && ` Cut marks sit in the margin and the block prints on ${BLEED_MM} mm of black, so a cut that misses by a hair keeps black rather than showing white paper.`}
                {extraFaces > 0 && ` ${extraFaces} back face${extraFaces === 1 ? '' : 's'} printed separately.`}
                {missingArt > 0 &&
                  (missingArt === 1
                    ? ' 1 card has no art and prints as a text proxy.'
                    : ` ${missingArt} cards have no art and print as text proxies.`)}
              </p>
              {/*
                Wizards' Fan Content Policy requires fan content to be free, so
                a proxy sheet must never sit behind a payment and nothing here
                may suggest these are sellable or legal at an event. It is on
                the screen with the print button rather than in a help article,
                because the person about to press print is the person who needs
                to read it.
              */}
              <p>
                These are for playtesting at your own table. They are free, they are not real cards, and they are
                not legal at any event. Do not sell them.
              </p>
            </div>
          </div>

          {/*
            Card list. 56 px thumbnails in a 300 px box was the "everything is
            tiny" complaint in miniature — at that width `CardImage` drops to
            the 146 px `small` asset and the art is unreadable, which makes the
            checkbox the only way to tell rows apart. 88 px moves it up to the
            488 px `normal` asset, still one request per card.
          */}
          <ScrollArea className="h-[460px] rounded-lg bg-muted/20">
            <div className="p-2 space-y-1">
              {allCards.map((card, index) => (
                <div
                  key={`${getCardId(card)}-${index}`}
                  className={`flex items-center justify-between p-1.5 rounded transition-colors cursor-pointer ${
                    selectedCards.has(getCardId(card)) ? 'bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleCard(getCardId(card))}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                      checked={selectedCards.has(getCardId(card))}
                      onCheckedChange={() => toggleCard(getCardId(card))}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                    {/* `CardImage` owns the ratio and the resolution; `hideFlip`
                        because a flip button is larger than this thumbnail, and
                        both faces get their own slot on the sheet anyway. */}
                    <CardImage card={withThumbnailFallback(card)} width={88} hideFlip title={card.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {card.name}
                        {card.isCommander && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            CMD
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs ml-2">
                    {card.quantity || 1}x
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/*
        The preview is the print sheet itself under a `transform: scale()`, not a
        second rendering of it, so nothing can look right here and print wrong.
        It takes the full width it is given — the owner's standing complaint is
        that cards draw too small, and on a wide screen this puts each card past
        400 px.
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sheet preview</CardTitle>
          <CardDescription className="text-xs">
            {hydrating
              ? 'Loading full-resolution art…'
              : slots.length === 0
                ? 'Select cards to preview the printed sheet.'
                : `${totalPages} ${totalPages === 1 ? 'sheet' : 'sheets'}, exactly as they will print.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hydrating ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching printings…
            </div>
          ) : slots.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Nothing selected.
            </div>
          ) : (
            <ProxySheet ref={sheetRef} slots={slots} paper={paperSize} cutGuides={cutGuides} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * jsPDF fallback for a printing with no image, mirroring `.proxy-text` in
 * `proxy-sheet.css`. Kept deliberately plain — black on white, no filled bars —
 * because it is printed, and toner spent on decoration is toner not spent on
 * legibility. This is all that survives of the old `drawTextCard`, which drew
 * *every* proxy this way.
 */
function drawTextProxy(doc: any, x: number, y: number, card: any) {
  const pad = 3.5;
  doc.setDrawColor(0);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, CARD_W_MM, CARD_H_MM, 3, 3);

  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const name: string = card?.name ?? 'Unknown card';
  doc.text(doc.splitTextToSize(name, CARD_W_MM - pad * 2 - 14), x + pad, y + pad + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const cost = String(card?.mana_cost ?? '').replace(/[{}]/g, ' ').trim();
  if (cost) doc.text(cost, x + CARD_W_MM - pad, y + pad + 4, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const typeLine: string = card?.type_line ?? 'Unknown type';
  doc.text(doc.splitTextToSize(typeLine, CARD_W_MM - pad * 2), x + pad, y + 18);
  doc.setLineWidth(0.2);
  doc.line(x + pad, y + 20, x + CARD_W_MM - pad, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const oracle: string = card?.oracle_text ?? '';
  if (oracle) {
    const lines: string[] = doc.splitTextToSize(oracle, CARD_W_MM - pad * 2);
    // Clipped rather than allowed to overflow the card edge; the sheet is a
    // fixed grid and an overrun would print across the neighbouring card.
    doc.text(lines.slice(0, 22), x + pad, y + 25);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('TEXT PROXY · NO ART', x + pad, y + CARD_H_MM - pad);

  if (card?.power != null && card?.toughness != null) {
    doc.setFontSize(11);
    doc.text(`${card.power}/${card.toughness}`, x + CARD_W_MM - pad, y + CARD_H_MM - pad, { align: 'right' });
  } else if (card?.loyalty != null) {
    doc.setFontSize(11);
    doc.text(String(card.loyalty), x + CARD_W_MM - pad, y + CARD_H_MM - pad, { align: 'right' });
  }
}
