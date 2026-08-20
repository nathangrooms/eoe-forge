import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import {
  DECKLIST_FORMATS,
  countWithoutPrinting,
  countWrittenCards,
  countWrittenCopies,
  deckListFileName,
  writeDeckList,
  type DeckListFormat,
  type WriteCard,
} from '@/lib/decklist';

/**
 * Taking the proxy list somewhere else.
 *
 * WHY THE PRINTING IS ON EVERY LINE
 * ---------------------------------
 * The whole point of this list is which picture prints. Somebody who spent ten
 * minutes choosing borderless art and then exported a column of bare names has
 * exported a different list from the one on their screen. So every line names
 * the set and the collector number by default, in the shape Moxfield,
 * Archidekt and Arena all write. The switch turns that off for anything that
 * only understands a name, which is the other half of the same request.
 *
 * WHY COPYING COMES FIRST
 * -----------------------
 * A file the page starts downloading itself is refused outright inside some
 * embedded viewers, and it fails silently: no error, no file, nothing to react
 * to. Copying works everywhere. So copying is the wide button, saving a file is
 * the narrow one beside it, and the text is in a box you can select and copy by
 * hand if both let you down. That third route is not decoration, it is what the
 * failure path of the first two lands on.
 *
 * NO SECOND DIALECT
 * -----------------
 * Not a line of this file knows what a decklist looks like. `writeDeckList`
 * does, in `@/lib/decklist`, beside the parser that reads the same shapes back,
 * and its tests write every format and read it in again.
 */
export interface ProxyExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list, already carrying whichever printing each row prints. */
  cards: WriteCard[];
}

export function ProxyExportPanel({ open, onOpenChange, cards }: ProxyExportPanelProps) {
  const [format, setFormat] = useState<DeckListFormat>('text');
  const [namePrinting, setNamePrinting] = useState(true);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const spec = DECKLIST_FORMATS.find(f => f.id === format) ?? DECKLIST_FORMATS[0];
  const text = useMemo(
    () => writeDeckList(cards, format, { printing: namePrinting }),
    [cards, format, namePrinting]
  );

  const lines = useMemo(() => countWrittenCards(cards), [cards]);
  const copies = useMemo(() => countWrittenCopies(cards), [cards]);
  /* Rows the catalogue has nothing for, so there is no set code to write. One
     of these exists on production today, a Sol Ring whose id is old text. */
  const unnamed = useMemo(() => countWithoutPrinting(cards), [cards]);

  /* A tick that stays after the panel has been shut and opened again is a tick
     about a copy that happened to a different list. */
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      showSuccess('Copied', `${lines} ${lines === 1 ? 'line' : 'lines'} ready to paste.`);
    } catch {
      /* The browser refused the clipboard, which happens on an insecure origin
         and inside some embedded viewers. Selecting the text turns a dead end
         into two keystrokes. */
      box.current?.focus();
      box.current?.select();
      showError('Your browser would not let us copy', 'The text is selected. Copy it with your keyboard.');
    }
  };

  const save = () => {
    if (!text) return;
    const name = deckListFileName(format, 'deckmatrix-proxy-list');
    try {
      const url = URL.createObjectURL(
        new Blob([text], { type: spec.extension === 'csv' ? 'text/csv' : 'text/plain' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      /* Deliberately not "Saved". The click is all this page can see, and some
         viewers swallow it. Naming the file lets the reader go and look. */
      showSuccess('Sent to your downloads', name);
    } catch {
      showError('Could not save the file', 'Copy the text instead. That works everywhere.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Take your proxy list somewhere else</SheetTitle>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Take this list somewhere else</h2>
            <p className="text-sm text-muted-foreground">
              Copy it and paste it in, or save it as a file. Every line names the version you
              picked, so the art comes with it.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DECKLIST_FORMATS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormat(option.id)}
                aria-pressed={format === option.id}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm transition-colors',
                  format === option.id
                    ? 'bg-foreground text-background'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {option.name}
              </button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">{spec.instructions}</p>

          {/* Offered only where it changes something. MTGO has nowhere to put a
              version and the spreadsheet gives it its own columns, so on those
              two a switch would be a control that does nothing. */}
          {spec.canNamePrinting && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 pr-3">
                <Label htmlFor="name-printing" className="text-sm font-medium">
                  Name the exact version
                </Label>
                <p className="text-xs text-muted-foreground">
                  Turn this off for plain card names, for anything that cannot read a set code.
                </p>
              </div>
              <Switch id="name-printing" checked={namePrinting} onCheckedChange={setNamePrinting} />
            </div>
          )}

          <div className="rounded-lg bg-muted/30 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {lines} {lines === 1 ? 'card' : 'cards'}
              {copies !== lines ? `, ${copies} to print` : ''}
            </div>
            {/* A box rather than a block of text, because a box selects with one
                keystroke when the clipboard is refused. */}
            <Textarea
              ref={box}
              value={text || 'Nothing on the list yet.'}
              readOnly
              rows={12}
              spellCheck={false}
              aria-label="Your proxy list, ready to copy"
              className="resize-none border-0 bg-transparent px-0 font-mono text-sm leading-relaxed"
            />
          </div>

          {unnamed > 0 && namePrinting && spec.canNamePrinting && (
            <p className="text-xs text-muted-foreground">
              {unnamed} {unnamed === 1 ? 'card is' : 'cards are'} not in our card list, so{' '}
              {unnamed === 1 ? 'it goes' : 'they go'} out by name with no version.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} disabled={!text} className="flex-1 gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy the list'}
            </Button>
            <Button variant="secondary" onClick={save} disabled={!text} className="gap-2">
              <Download className="h-4 w-4" />
              Save a file
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Copying is the one that always works. Some browsers block a file a page tries to save on
            its own, and they do it quietly. If nothing turns up in your downloads, copy the list
            instead.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ProxyExportPanel;
