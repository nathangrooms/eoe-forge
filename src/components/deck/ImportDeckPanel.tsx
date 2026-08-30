import { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Loader2, Upload } from 'lucide-react';
import { showError } from '@/components/ui/toast-helpers';
import {
  MAX_LINES,
  isSettled,
  mergeParsedLines,
  parseDeckList,
  resolveParsedLines,
  type ResolvedEntry,
} from '@/lib/decklist';
import type { IncomingCard } from '@/lib/deck/deckMutations';

/**
 * Paste a decklist into the deck you are looking at.
 *
 * ## Why a slide-over
 *
 * Import used to be half of a tab called Import/Export whose other half was a
 * second exporter. You pasted a hundred lines into a box with the deck they
 * were about to land in nowhere on screen. A right-hand panel keeps the deck
 * behind it, so "add to this deck" and "replace the decklist" are choices made
 * while looking at what they will do.
 *
 * ## One request, not a hundred
 *
 * The old importer called Scryfall's fuzzy endpoint once per line with a 100ms
 * sleep between calls, so a 99-card paste was 99 requests and about ten
 * seconds. `@/lib/decklist` resolves the whole list against our own catalogue
 * in a single `resolve_card_names` call — measured by that module at 120ms for
 * 99 names that match — and hands back the lines that matched nothing, with
 * suggestions, so a typo can be corrected instead of a card quietly vanishing.
 * Its own header names this importer as the last per-card loop in the product.
 * It is not one any more.
 *
 * ## What was dropped, and what was not
 *
 * The export half of that tab is gone: Text, CSV, Arena and MTGO, hand rolled,
 * beside a `/deck/:id/export` that produces the same four from one tested
 * serialiser. This is the only importer in the product and it stays whole.
 */

export interface ImportDeckPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckName: string;
  /** Cards for the maindeck, already matched to real printings. */
  onImport: (cards: IncomingCard[], mode: 'append' | 'replace') => Promise<void>;
  /** A `Commander` section in the paste sets the commander. */
  onCommander?: (card: IncomingCard) => Promise<void>;
}

export function ImportDeckPanel({
  open,
  onOpenChange,
  deckName,
  onImport,
  onCommander,
}: ImportDeckPanelProps) {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<ResolvedEntry[] | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  const parsed = text.trim() ? parseDeckList(text) : null;
  const lines = parsed ? mergeParsedLines(parsed.cards) : [];
  const unreadable = parsed?.unreadable ?? [];
  const tooLong = lines.length > MAX_LINES;

  /* Matching happens as you paste rather than behind the button, so the panel
     can say what it found before anything is written to the deck. */
  useEffect(() => {
    if (!open || lines.length === 0 || tooLong) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    const timer = setTimeout(() => {
      resolveParsedLines(lines)
        .then(result => {
          if (!cancelled) setEntries(result);
        })
        .catch(error => {
          console.error('Could not match that decklist:', error);
          if (!cancelled) setEntries(null);
        })
        .finally(() => {
          if (!cancelled) setReading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setReading(false);
    };
    // `lines` is rebuilt every render from `text`, so the text is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open, tooLong]);

  const matched = (entries ?? []).filter(entry => entry.card && isSettled(entry));
  const missed = (entries ?? []).filter(entry => !entry.card || !isSettled(entry));
  const copies = matched.reduce((sum, entry) => sum + entry.quantity, 0);

  const run = useCallback(
    async (mode: 'append' | 'replace') => {
      if (matched.length === 0) {
        showError('Nothing to import', 'None of those lines matched a card.');
        return;
      }

      setBusy(true);
      try {
        const commanderEntry = onCommander
          ? matched.find(entry => entry.line.section === 'commander')
          : undefined;

        const cards = matched
          .filter(entry => entry !== commanderEntry)
          .map(entry => ({ ...(entry.card as IncomingCard), quantity: entry.quantity }));

        if (commanderEntry) await onCommander?.(commanderEntry.card as IncomingCard);
        if (cards.length > 0) await onImport(cards as IncomingCard[], mode);

        setText('');
        setEntries(null);
        onOpenChange(false);
      } finally {
        setBusy(false);
      }
    },
    [matched, onCommander, onImport, onOpenChange]
  );

  return (
    <Sheet open={open} onOpenChange={next => (busy ? undefined : onOpenChange(next))}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetTitle className="sr-only">Import a decklist into {deckName}</SheetTitle>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Import a decklist</h2>
            <p className="text-sm text-muted-foreground">
              Paste from Moxfield, Archidekt, MTG Arena, Magic Online or a plain list. A
              Commander section sets the commander.
            </p>
          </div>

          <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={'1 Sol Ring\n1 Arcane Signet\n10 Forest'}
            className="min-h-[16rem] font-mono text-xs"
            aria-label="Decklist to import"
            disabled={busy}
          />

          {tooLong && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <p className="font-medium">That is {lines.length} lines</p>
              <p className="text-xs text-muted-foreground">
                {MAX_LINES} is as many as one lookup can answer inside the database&rsquo;s own
                time limit. Split the paste rather than having lines quietly ignored.
              </p>
            </div>
          )}

          {parsed && !tooLong && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {reading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : missed.length === 0 && unreadable.length === 0 ? (
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">
                  {reading
                    ? 'Matching against the catalogue…'
                    : `${matched.length} card${matched.length === 1 ? '' : 's'} · ${copies} cop${copies === 1 ? 'y' : 'ies'}`}
                </span>
                {matched.some(entry => entry.line.section === 'commander') && (
                  <Badge variant="secondary">Commander named</Badge>
                )}
                {matched.some(entry => entry.line.section === 'sideboard') && (
                  <Badge variant="secondary">Sideboard lines go to the maindeck</Badge>
                )}
              </div>

              {(missed.length > 0 || unreadable.length > 0) && !reading && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {unreadable.slice(0, 4).map(row => (
                    <li key={`u-${row.line}`}>
                      Line {row.line}: could not read &ldquo;{row.raw}&rdquo;
                    </li>
                  ))}
                  {missed.slice(0, 6).map(entry => (
                    <li key={entry.key}>
                      No card called &ldquo;{entry.query}&rdquo;
                      {entry.suggestions.length > 0
                        ? `. Did you mean ${entry.suggestions[0].name}?`
                        : ''}
                    </li>
                  ))}
                  {missed.length > 6 && <li>and {missed.length - 6} more</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => run('append')}
              disabled={busy || reading || matched.length === 0}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Add to this deck
            </Button>
            <Button onClick={() => run('replace')} disabled={busy || reading || matched.length === 0}>
              Replace the decklist
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Replacing clears the maindeck and keeps the commander and the sideboard. Lines that
            matched nothing are left out; nothing is guessed.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ImportDeckPanel;
