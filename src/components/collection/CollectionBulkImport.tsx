import { useEffect, useState } from 'react';
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
import { useAuth } from '@/components/AuthProvider';
import { resolveParsedLines } from '@/lib/decklist';
import { StorageAPI, fileCardsIntoContainer } from '@/lib/api/storageAPI';

/**
 * Rows per write. The read side of this file chunks its `.in()` lists at 150
 * because a URL has a length; a request body is roomier, and 200 keeps one
 * statement's worth of work to something the 8 second timeout can finish.
 */
const WRITE_CHUNK = 200;

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
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'arena' | 'csv' | 'txt'>('arena');
  const [failures, setFailures] = useState<string[]>([]);
  const [imported, setImported] = useState<ImportedCard[]>([]);

  /* WHERE THE CARDS GO. Owner: "might want to have import collection -> deck ->
     storage options too."

     One paste, three destinations. Collection is the default because it is what
     this page has always done and what most pastes are for. The other two exist
     because a list of cards is a list of cards: the same paste is equally a
     deck you were sent and a box you just sorted. */
  const [destination, setDestination] = useState<'collection' | 'deck' | 'storage'>('collection');
  const [targetId, setTargetId] = useState<string>('');
  const [decks, setDecks] = useState<Array<{ id: string; name: string }>>([]);
  const [containers, setContainers] = useState<Array<{ id: string; name: string }>>([]);

  /* The pickers load only when they are asked for. Somebody importing to their
     collection, which is most people, pays for neither list. */
  useEffect(() => {
    if (destination === 'deck' && decks.length === 0 && user) {
      void supabase
        .from('user_decks')
        .select('id, name')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .then(({ data }) => setDecks((data ?? []) as Array<{ id: string; name: string }>));
    }
    if (destination === 'storage' && containers.length === 0) {
      void StorageAPI.listContainers()
        .then(rows => setContainers(rows.map(c => ({ id: c.id, name: c.name }))))
        .catch(() => setContainers([]));
    }
  }, [destination, decks.length, containers.length, user]);

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

      /* ONE QUERY FOR THE WHOLE LIST, not one per line.
         --------------------------------------------------------------
         This used to ask Scryfall for every line and then ask Supabase whether
         we already held it, so a 99 card paste was around 200 round trips. That
         is the per-row pattern behind two outages on this project, and one of
         them was found this week as a lookup inside a loop over every card of
         every deck: 421 requests for a single page visit.

         `resolveParsedLines` is the resolver the proxy paste already uses. It
         sends the whole list to `resolve_card_names` in one statement and comes
         back with a printing per line, having already tried a set-and-collector
         match, an exact name, a front face, and a trigram search for typos. It
         is strictly better at matching than the old `!"name"` query as well as
         being one request instead of a hundred. */
      const resolved = await resolveParsedLines(
        parsed.map((line, i) => ({
          line: i + 1,
          raw: line.raw,
          name: line.name,
          quantity: line.quantity,
          section: 'main' as const,
          setCode: line.set,
        }))
      );

      /* And one read of what is already held, rather than one per card. Only
         needed when the collection is the target: a deck and a box merge on
         their own side. */
      const wantedIds =
        destination === 'collection'
          ? (resolved.map(r => r.card?.id).filter(Boolean) as string[])
          : [];
      const held = new Map<string, { id: string; quantity: number; foil: number }>();
      for (let i = 0; i < wantedIds.length; i += 150) {
        const { data } = await supabase
          .from('user_collections')
          .select('id, card_id, quantity, foil')
          .eq('user_id', user.id)
          .in('card_id', wantedIds.slice(i, i + 150));
        for (const row of data ?? []) {
          held.set((row as any).card_id, {
            id: (row as any).id,
            quantity: (row as any).quantity ?? 0,
            foil: (row as any).foil ?? 0,
          });
        }
      }

      /* AND ONE WRITE PER SHAPE, not one write per line.
         --------------------------------------------------------------
         The read side of this file was already right and its comment above says
         why. The write side was not: it inserted or updated once per line,
         sequentially, so a 100 line paste was 100 writes on top of the reads.
         Everything is decided here in one pass over the lines, in hand, and
         then written in one statement per shape. */

      /** Rows to write, and the lines each of them stands for. */
      const deckRows: { card_id: string; card_name: string; quantity: number }[] = [];
      const storageRows: { card_id: string; qty: number; foil: boolean }[] = [];
      const collectionRows = new Map<
        string,
        {
          card: any;
          existingId: string | null;
          quantity: number;
          foil: number;
        }
      >();
      /** Which pasted lines a card id is carrying, so a failed write names them. */
      const linesFor = new Map<string, string[]>();

      for (const [index, line] of parsed.entries()) {
        const card = resolved[index]?.card ?? null;

        if (!card) {
          errors.push(`${line.raw} — no match found`);
          setProgress(p => ({ ...p, done: p.done + 1 }));
          continue;
        }

        linesFor.set(card.id, [...(linesFor.get(card.id) ?? []), line.raw]);

        if (destination === 'deck') {
          deckRows.push({ card_id: card.id, card_name: card.name, quantity: line.quantity });
        } else if (destination === 'storage') {
          storageRows.push({ card_id: card.id, qty: line.quantity, foil: line.foil });
        } else {
          /* A paste can name the same card twice. Accumulate, so the second
             line adds to the first rather than overwriting it — which is what
             the sequential version did by re-reading its own running map. */
          const existing = held.get(card.id) ?? null;
          const running = collectionRows.get(card.id) ?? {
            card,
            existingId: existing?.id ?? null,
            quantity: existing?.quantity ?? 0,
            foil: existing?.foil ?? 0,
          };
          running.quantity += line.foil ? 0 : line.quantity;
          running.foil += line.foil ? line.quantity : 0;
          collectionRows.set(card.id, running);
        }

        added++;
        landed.push({
          id: card.id,
          name: card.name,
          quantity: line.quantity,
          foil: line.foil,
          card,
        });
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }

      /** A write that failed takes its lines out of the count and names them. */
      const writeFailed = (cardIds: Iterable<string>, reason: string) => {
        for (const cardId of cardIds) {
          for (const raw of linesFor.get(cardId) ?? []) {
            errors.push(`${raw} — ${reason}`);
            added--;
          }
          for (let i = landed.length - 1; i >= 0; i -= 1) {
            if (landed[i].id === cardId) landed.splice(i, 1);
          }
        }
      };

      if (destination === 'deck' && deckRows.length > 0) {
        for (let i = 0; i < deckRows.length; i += WRITE_CHUNK) {
          const slice = deckRows.slice(i, i + WRITE_CHUNK);
          const { error } = await supabase.from('deck_cards').insert(
            slice.map(row => ({
              deck_id: targetId,
              card_id: row.card_id,
              card_name: row.card_name,
              quantity: row.quantity,
              is_commander: false,
            }))
          );
          if (error) writeFailed(slice.map(row => row.card_id), 'import failed');
        }
      }

      if (destination === 'storage' && storageRows.length > 0) {
        /* One call for the whole paste. `fileCardsIntoContainer` batches its
           own reads and writes, and it was being called once per line. */
        const filed = await fileCardsIntoContainer(targetId, storageRows);
        for (const failure of filed.failed) {
          writeFailed([failure.card_id], failure.reason);
        }
      }

      if (destination === 'collection' && collectionRows.size > 0) {
        const updates = [...collectionRows.entries()]
          .filter(([, row]) => row.existingId)
          .map(([cardId, row]) => ({
            id: row.existingId as string,
            user_id: user.id,
            card_id: cardId,
            card_name: row.card.name,
            /* The resolver answers with `set_code`. This read `card.set`, which
               is not a key it returns, so every NEW collection row was written
               with no set code at all. */
            set_code: row.card.set_code ?? row.card.set ?? '',
            quantity: row.quantity,
            foil: row.foil,
            price_usd: parseFloat(row.card.prices?.usd || '0'),
            updated_at: new Date().toISOString(),
          }));

        const inserts = [...collectionRows.entries()]
          .filter(([, row]) => !row.existingId)
          .map(([cardId, row]) => ({
            user_id: user.id,
            card_id: cardId,
            card_name: row.card.name,
            set_code: row.card.set_code ?? row.card.set ?? '',
            quantity: row.quantity,
            foil: row.foil,
            condition: 'near_mint',
            price_usd: parseFloat(row.card.prices?.usd || '0'),
          }));

        for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
          const slice = updates.slice(i, i + WRITE_CHUNK);
          const { error } = await supabase
            .from('user_collections')
            .upsert(slice, { onConflict: 'id' });
          if (error) writeFailed(slice.map(row => row.card_id), error.message);
        }

        for (let i = 0; i < inserts.length; i += WRITE_CHUNK) {
          const slice = inserts.slice(i, i + WRITE_CHUNK);
          const { error } = await supabase.from('user_collections').insert(slice);
          if (error) writeFailed(slice.map(row => row.card_id), error.message);
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

  const needsTarget = destination !== 'collection';
  const targets = destination === 'deck' ? decks : containers;

  return (
    <div className="space-y-4">
      {/* WHERE IT GOES, before what it looks like. Owner: "might want to have
          import collection -> deck -> storage options too." The same pasted
          list is equally a collection, a deck somebody sent you, or a box you
          have just sorted, and only the destination differs. */}
      <div className="space-y-2">
        <Label>Import into</Label>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'collection', label: 'My collection' },
            { id: 'deck', label: 'A deck' },
            { id: 'storage', label: 'A storage box' },
          ] as const).map(option => (
            <Button
              key={option.id}
              type="button"
              variant={destination === option.id ? 'default' : 'secondary'}
              size="sm"
              onClick={() => {
                setDestination(option.id);
                setTargetId('');
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {needsTarget && (
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="mt-2 border-0 bg-muted/40">
              <SelectValue
                placeholder={destination === 'deck' ? 'Choose a deck' : 'Choose a box'}
              />
            </SelectTrigger>
            <SelectContent>
              {targets.map(target => (
                <SelectItem key={target.id} value={target.id}>
                  {target.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {needsTarget && targets.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {destination === 'deck'
              ? 'You have no decks yet.'
              : 'You have no storage boxes yet.'}
          </p>
        )}
      </div>

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
          <Button
            onClick={handleImport}
            /* A destination that needs a target and has none would write into
               nothing, so the button waits rather than failing halfway. */
            disabled={importing || !importText.trim() || (needsTarget && !targetId)}
          >
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
