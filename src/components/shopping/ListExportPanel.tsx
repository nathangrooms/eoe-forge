import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import {
  EXPORT_TARGETS,
  formatExport,
  type ExportFormat,
  type ExportLine,
} from '@/lib/shopping';

/**
 * Sending the list to a shop.
 *
 * This is why the owner wants the list at all, so the syntax has to be right.
 * Each format below was checked against the shop's own documentation rather
 * than guessed, and `src/lib/shopping/exportFormats.ts` records which page and
 * what it said. A malformed export fails on paste, after the player has already
 * left the app, which is the worst place for this feature to break.
 *
 * ONE OPTION, AND ONLY WHERE IT IS EARNED
 * ---------------------------------------
 * "Name the set" appears for Cardmarket alone, because Cardmarket is the only
 * one of the three whose set syntax is documented and whose set token is the
 * full expansion name, which is what we hold. TCGplayer's bracket token is a
 * set CODE in their own namespace, not Scryfall's, and a code that does not
 * line up makes the line silently fail to match. So we send the plain form
 * there and let the player pick the printing in the basket.
 */

export interface ListExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: ExportLine[];
  /** How many cards on the list we could not price, said out loud. */
  unpricedNote?: string | null;
}

export function ListExportPanel({ open, onOpenChange, lines, unpricedNote }: ListExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('tcgplayer');
  const [includeSet, setIncludeSet] = useState(false);
  const [copied, setCopied] = useState(false);

  const target = EXPORT_TARGETS.find(t => t.id === format)!;
  const text = useMemo(() => formatExport(lines, format, { includeSet }), [lines, format, includeSet]);
  const lineCount = text ? text.split('\n').length : 0;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      showSuccess('Copied', `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} ready to paste.`);
    } catch {
      showError('Could not copy', 'Select the text and copy it by hand.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">Send this list to a shop</SheetTitle>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Take this list to a shop</h2>
            <p className="text-sm text-muted-foreground">
              Copy it, open the shop, paste it in.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EXPORT_TARGETS.map(option => (
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

          <p className="text-sm text-muted-foreground">{target.instructions}</p>

          {target.supportsSet && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 pr-3">
                <Label htmlFor="include-set" className="text-sm font-medium">
                  Name the set
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cardmarket reads the set in brackets. Turn this off if a card comes back as not
                  found.
                </p>
              </div>
              <Switch id="include-set" checked={includeSet} onCheckedChange={setIncludeSet} />
            </div>
          )}

          <div className="rounded-lg bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {lineCount} {lineCount === 1 ? 'card' : 'cards'}
              </span>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {text || 'Nothing on the list yet.'}
            </pre>
          </div>

          {unpricedNote && <p className="text-xs text-muted-foreground">{unpricedNote}</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} disabled={!text} className="flex-1 gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy the list'}
            </Button>
            {target.url && (
              <Button variant="secondary" asChild className="gap-2">
                <a href={target.url} target="_blank" rel="noopener noreferrer">
                  Open {target.name}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Quantity first, then the card name, one card per line. That is the shape all three shops
            read. Two versions of the same card become one line, because every one of these shops
            matches on the name.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
