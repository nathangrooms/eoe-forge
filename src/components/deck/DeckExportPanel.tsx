import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Copy, Download, ExternalLink, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  DECK_EXPORT_FORMATS,
  serializeDeck,
  type DeckExportFormat,
} from '@/lib/deck/deckSerialize';

/**
 * Deck export, in the page.
 *
 * This was `DeckExportDialog` — a `max-w-2xl` overlay holding a format select
 * and a scrolling textarea. `/deck/:id/export` now owns it, so the serialized
 * list gets the whole column, the URL is shareable, and Back leaves it.
 *
 * ## The merge
 *
 * There were three exporters. This one reads the deck from the database, so it
 * is right whatever any page is holding, and it had plain text, Arena, Magic
 * Online and CSV. `EnhancedDeckExport` had JSON, Moxfield and the four content
 * switches; `DeckImportExport`'s export half was a straight duplicate of the
 * first four. All six formats and all four switches are here now, over one row
 * type and one serialiser, and the two hand-rolled copies are gone.
 *
 * ## The three site links came back
 *
 * `DeckImportExport` also carried a row of three buttons that opened Moxfield,
 * Archidekt and Deckstats with the list already in the URL, and the merge lost
 * them: they were the only controls on either old page with no home on the new
 * one. They are here, over the same three addresses.
 *
 * One thing did change. The old row sent whichever format the select was on, so
 * choosing CSV or JSON and then pressing Moxfield handed a spreadsheet to a
 * decklist parser. These always send the plain-text list, which is the one
 * every deck site reads.
 */
interface DeckExportPanelProps {
  deckId: string;
  deckName: string;
  /** Written into the formats that carry a comment header. */
  format?: string;
  description?: string | null;
}

export function DeckExportPanel({
  deckId,
  deckName,
  format: deckFormat,
  description,
}: DeckExportPanelProps) {
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckExportFormat>('text');
  const [includeCommander, setIncludeCommander] = useState(true);
  const [includeSideboard, setIncludeSideboard] = useState(true);
  const [includePrices, setIncludePrices] = useState(false);
  const [groupByType, setGroupByType] = useState(false);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    fetchDeckCards(deckId)
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch(err => {
        console.error('Export load failed:', err);
        if (!cancelled) setError('Could not load this deck for export.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const hasSideboard = rows.some(row => row.is_sideboard);
  const hasCommander = rows.some(row => row.is_commander);
  /* Grouping is a text layout, so the switch is only offered where it does
     something. A control that would be ignored is not drawn. */
  const canGroup = format === 'text' || format === 'moxfield';

  const text =
    rows.length > 0
      ? serializeDeck(rows, format, deckName, {
          includeCommander,
          includeSideboard,
          includePrices,
          groupByType: canGroup && groupByType,
          format: deckFormat,
          description,
        })
      : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Copied', 'Decklist copied to clipboard');
    } catch {
      showError('Copy failed', 'Your browser blocked clipboard access');
    }
  };

  /* The plain-text list, whatever the select is showing. See the docblock. */
  const plainText =
    rows.length > 0
      ? serializeDeck(rows, 'text', deckName, {
          includeCommander,
          includeSideboard,
          /* Prices in a decklist a site is about to parse are noise at best and
             a parse failure at worst, so they are never sent. */
          includePrices: false,
          groupByType: false,
          format: deckFormat,
          description,
        })
      : '';

  const handleDownload = () => {
    const option = DECK_EXPORT_FORMATS.find(o => o.value === format);
    const blob = new Blob([text], { type: option?.mime ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${deckName.replace(/[^\w\-. ]+/g, '_')}.${option?.extension ?? 'txt'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 rounded-xl bg-card p-4 shadow-sm md:p-5">
      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="deck-export-format">Format</Label>
        <Select value={format} onValueChange={value => setFormat(value as DeckExportFormat)}>
          <SelectTrigger id="deck-export-format" aria-label="Export format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DECK_EXPORT_FORMATS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The four content switches, from the exporter that had them. Each one
          is offered only where the deck gives it something to do: a deck with
          no sideboard is not asked whether to include one. */}
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {hasCommander && (
          <ExportSwitch
            id="export-commander"
            label="Include commander"
            checked={includeCommander}
            onCheckedChange={setIncludeCommander}
          />
        )}
        {hasSideboard && (
          <ExportSwitch
            id="export-sideboard"
            label="Include sideboard"
            checked={includeSideboard}
            onCheckedChange={setIncludeSideboard}
          />
        )}
        <ExportSwitch
          id="export-prices"
          label="Include prices"
          checked={includePrices}
          onCheckedChange={setIncludePrices}
        />
        {canGroup && (
          <ExportSwitch
            id="export-group"
            label="Group by type"
            checked={groupByType}
            onCheckedChange={setGroupByType}
          />
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading decklist…
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center rounded-lg bg-muted/30 px-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          This deck has no cards yet.
        </div>
      ) : (
        <Textarea
          readOnly
          value={text}
          aria-label="Serialized decklist"
          className="h-[28rem] resize-y font-mono text-xs"
        />
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={handleCopy} disabled={!text}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
        <Button onClick={handleDownload} disabled={!text}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </div>

      {plainText && (
        /* Surface and spacing, not the `border-t` the old row drew. */
        <div className="space-y-2 rounded-lg bg-muted/30 p-4">
          <p className="text-sm font-medium">Open this list somewhere else</p>
          <div className="flex flex-wrap gap-2">
            {DECK_SITES.map(site => (
              <Button
                key={site.label}
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.open(
                    `${site.importUrl}${encodeURIComponent(plainText)}`,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {site.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Where a decklist can be handed on to, and the address each one takes it at.
 *
 * These are links out with the reader's own list, which is the opposite of
 * reading data in: nothing is fetched from any of them and nothing they publish
 * is stored. `THIRD-PARTY-NOTICES.md` governs ingestion and none of it applies
 * here.
 */
const DECK_SITES = [
  { label: 'Moxfield', importUrl: 'https://www.moxfield.com/decks/new?import=' },
  { label: 'Archidekt', importUrl: 'https://archidekt.com/decks/new?import=' },
  { label: 'Deckstats', importUrl: 'https://deckstats.net/decks/new?import=' },
];

/** One switch and its label, so the four read identically. */
function ExportSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

export default DeckExportPanel;
