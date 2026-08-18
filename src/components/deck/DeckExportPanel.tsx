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
import { Copy, Download, Loader2 } from 'lucide-react';
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
 */
interface DeckExportPanelProps {
  deckId: string;
  deckName: string;
}

export function DeckExportPanel({ deckId, deckName }: DeckExportPanelProps) {
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckExportFormat>('text');

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

  const text = rows.length > 0 ? serializeDeck(rows, format, deckName) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Copied', 'Decklist copied to clipboard');
    } catch {
      showError('Copy failed', 'Your browser blocked clipboard access');
    }
  };

  const handleDownload = () => {
    const option = DECK_EXPORT_FORMATS.find(o => o.value === format);
    const blob = new Blob([text], {
      type: format === 'csv' ? 'text/csv' : 'text/plain',
    });
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
    </div>
  );
}

export default DeckExportPanel;
