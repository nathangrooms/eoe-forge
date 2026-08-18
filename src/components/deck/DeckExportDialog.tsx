import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Download, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  DECK_EXPORT_FORMATS,
  serializeDeck,
  type DeckExportFormat,
} from '@/lib/deck/deckSerialize';

/**
 * Real deck export. The Decks page previously wired its "Export" menu item to
 * `console.log`, so the control did nothing at all — no file, no toast, no
 * error.
 */

interface DeckExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
}

export function DeckExportDialog({
  open,
  onOpenChange,
  deckId,
  deckName,
}: DeckExportDialogProps) {
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckExportFormat>('text');

  useEffect(() => {
    if (!open || !deckId) return;
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
  }, [open, deckId]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export “{deckName}”</DialogTitle>
          <DialogDescription>
            Choose a format, then copy the list or download it as a file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={format} onValueChange={value => setFormat(value as DeckExportFormat)}>
            <SelectTrigger aria-label="Export format">
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

          {loading ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading decklist…
            </div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-border px-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-border px-6 text-center text-sm text-muted-foreground">
              This deck has no cards yet.
            </div>
          ) : (
            <Textarea readOnly value={text} className="h-64 font-mono text-xs" />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCopy} disabled={!text}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button onClick={handleDownload} disabled={!text}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
