import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Upload, FileText, Loader2, AlertCircle, Check } from 'lucide-react';
import { CardGrid, CardImage, cardDetailPath } from '@/components/cards';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { scryfallAPI } from '@/lib/api/scryfall';

/** A card that made it in, kept so the run can show its work. */
interface ImportedCard {
  id: string;
  name: string;
  quantity: number;
  foil: boolean;
  card: any;
}

export interface ImportOutcome {
  added: number;
  failures: string[];
}

interface CollectionImportPanelProps {
  /** Fires after a run that added at least one entry. */
  onImported?: (outcome: ImportOutcome) => void;
  onCancel?: () => void;
}

interface ParsedLine {
  quantity: number;
  name: string;
  set?: string;
  foil: boolean;
  raw: string;
}

/**
 * Arena / MTGO / plain-text grammar.
 *
 * Real Arena exports end with a collector number (`4 Lightning Bolt (2X2) 117`)
 * and may carry a `*F*` foil marker; the previous anchored regex swallowed both
 * into the card name so the exact-name lookup always missed.
 */
export function parseImportLine(raw: string, format: string): ParsedLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('deck') ||
    lower.startsWith('sideboard') ||
    lower.startsWith('commander') ||
    lower.startsWith('//')
  ) {
    return null;
  }

  if (format === 'csv') {
    const parts = trimmed.split(',').map(p => p.trim());
    if (!parts[0]) return null;
    return {
      name: parts[0].replace(/^"|"$/g, ''),
      quantity: parseInt(parts[1], 10) || 1,
      set: parts[2] ? parts[2].toLowerCase() : undefined,
      foil: /foil|true|yes/i.test(parts[3] ?? ''),
      raw: trimmed,
    };
  }

  let working = trimmed;
  const foil = /\*F\*/i.test(working);
  working = working.replace(/\*F\*/gi, '').trim();

  // Leading quantity: "4 ", "4x ", "4 x "
  const qtyMatch = working.match(/^(\d+)\s*x?\s+/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  if (qtyMatch) working = working.slice(qtyMatch[0].length);

  // Trailing "(SET) 117" or "(SET)"
  let set: string | undefined;
  const setMatch = working.match(/\(([A-Za-z0-9]{2,6})\)\s*[A-Za-z0-9\-★]*\s*$/);
  if (setMatch && setMatch.index !== undefined) {
    set = setMatch[1].toLowerCase();
    working = working.slice(0, setMatch.index).trim();
  }

  // Keep only the front face of a double-faced card name.
  const name = working.split(' // ')[0].trim();
  if (!name) return null;

  return { quantity, name, set, foil, raw: trimmed };
}

/**
 * The importer body. It used to be a dialog; a paste-review-commit flow with a
 * failure table underneath it is a page (`/collection/import`), so this is now
 * a plain section the route renders.
 */
export function CollectionImportPanel({ onImported, onCancel }: CollectionImportPanelProps) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'arena' | 'csv' | 'txt'>('arena');
  const [failures, setFailures] = useState<string[]>([]);
  const [imported, setImported] = useState<ImportedCard[]>([]);

  const handleImport = async () => {
    if (!importText.trim()) {
      showError('Nothing to import', 'Paste a card list first');
      return;
    }

    setImporting(true);
    setFailures([]);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showError('Sign in required', 'Please sign in to import cards');
        return;
      }

      const parsed = importText
        .split('\n')
        .map(line => parseImportLine(line, importFormat))
        .filter((line): line is ParsedLine => line !== null);

      if (parsed.length === 0) {
        showError('No cards found', 'Could not parse any cards from that input');
        return;
      }

      setProgress({ done: 0, total: parsed.length });
      setImported([]);

      let added = 0;
      const errors: string[] = [];
      /* What actually went in, so the run can SHOW it afterwards rather than
         asserting a number. Owner: "when import cards is pressed, it should load
         a preview of all those cards as a confirmation - these cards have been
         added." A count is a claim; the cards are the evidence. */
      const landed: ImportedCard[] = [];

      for (const line of parsed) {
        try {
          const query = line.set ? `!"${line.name}" set:${line.set}` : `!"${line.name}"`;
          const results = await scryfallAPI.searchCards(query, 1);
          const card = results.cards?.[0];

          if (!card) {
            errors.push(`${line.raw} — no match on Scryfall`);
            continue;
          }

          const { data: existing } = await supabase
            .from('user_collections')
            .select('id, quantity, foil')
            .eq('user_id', user.id)
            .eq('card_id', card.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('user_collections')
              .update({
                quantity: existing.quantity + (line.foil ? 0 : line.quantity),
                foil: (existing.foil ?? 0) + (line.foil ? line.quantity : 0),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
          } else {
            await supabase.from('user_collections').insert({
              user_id: user.id,
              card_id: card.id,
              card_name: card.name,
              set_code: card.set,
              quantity: line.foil ? 0 : line.quantity,
              foil: line.foil ? line.quantity : 0,
              condition: 'near_mint',
              price_usd: parseFloat(card.prices?.usd || '0'),
            });
          }

          added++;
          landed.push({
            id: card.id,
            name: card.name,
            quantity: line.quantity,
            foil: line.foil,
            card,
          });
        } catch (err) {
          console.error(`Error importing "${line.raw}":`, err);
          errors.push(`${line.raw} — import failed`);
        } finally {
          setProgress(p => ({ ...p, done: p.done + 1 }));
        }
      }

      setFailures(errors);
      setImported(landed);

      if (added > 0) {
        showSuccess(
          'Import complete',
          `Added ${added} entr${added === 1 ? 'y' : 'ies'}${
            errors.length ? `, ${errors.length} unresolved` : ''
          }`
        );
        if (errors.length === 0) setImportText('');
        onImported?.({ added, failures: errors });
      } else {
        showError('Import failed', 'No lines could be matched to a card');
      }
    } catch (err) {
      console.error('Import error:', err);
      showError('Import failed', 'An error occurred while importing cards');
    } finally {
      setImporting(false);
      setProgress({ done: 0, total: 0 });
    }
  };

  const lineCount = importText.split('\n').filter(l => l.trim()).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="import-format">Format</Label>
        <Select
          value={importFormat}
          onValueChange={value => setImportFormat(value as typeof importFormat)}
        >
          <SelectTrigger id="import-format" className="border-0 bg-muted/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="arena">Arena / MTGO</SelectItem>
            <SelectItem value="txt">Plain text</SelectItem>
            <SelectItem value="csv">CSV (name, qty, set, foil)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="import-text">Card list</Label>
        <Textarea
          id="import-text"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder={
            importFormat === 'csv'
              ? 'Lightning Bolt, 4, m11\nBlack Lotus, 1\nCounterspell, 2, mh2, foil'
              : '4 Lightning Bolt (2X2) 117\n1 Black Lotus\n2 Counterspell (MH2) 45 *F*'
          }
          className="min-h-[320px] border-0 bg-muted/40 font-mono text-sm"
        />
      </div>

      {/* THE CARDS THAT WENT IN, shown rather than counted. Owner: "when import
          cards is pressed, it should load a preview of all those cards as a
          confirmation - these cards have been added."

          A toast saying "Added 47 entries" asks you to take it on trust, and
          this import silently matched nothing at all until recently, which is
          exactly the failure a number cannot show you. Cards can. */}
      {imported.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Check className="h-4 w-4" aria-hidden="true" />
              Added to your collection
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {imported.length} card{imported.length === 1 ? '' : 's'}
            </span>
          </div>
          <CardGrid width={170}>
            {imported.map(entry => (
              <Link
                key={entry.id}
                to={cardDetailPath(entry.card)}
                className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative">
                  <CardImage card={entry.card} size="md" className="w-full" />
                  {(entry.quantity > 1 || entry.foil) && (
                    <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
                      {entry.quantity > 1 ? `×${entry.quantity}` : ''}
                      {entry.foil ? ' foil' : ''}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium">{entry.name}</p>
              </Link>
            ))}
          </CardGrid>
        </section>
      )}

      {failures.length > 0 && (
        <div className="space-y-2 rounded-lg bg-destructive/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {failures.length} line{failures.length === 1 ? '' : 's'} could not be matched
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
            {failures.map((failure, i) => (
              <li key={i}>{failure}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-sm text-muted-foreground">
          <FileText className="mr-2 inline h-4 w-4" aria-hidden="true" />
          {importing && progress.total > 0
            ? `${progress.done} / ${progress.total} processed`
            : `${lineCount} line${lineCount === 1 ? '' : 's'}`}
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={importing}>
              Cancel
            </Button>
          )}
          <Button onClick={handleImport} disabled={importing || !importText.trim()}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Import cards
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
