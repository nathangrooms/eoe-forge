import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardPaste,
  Images,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { CardGrid, CardImage } from '@/components/cards';
import { cn } from '@/lib/utils';
import {
  MAX_LINES,
  commitResolvedList,
  isSettled,
  parseCardLine,
  resolveParsedLines,
  resolvePastedList,
  type ParsedCardLine,
  type ResolvedEntry,
} from '@/lib/decklist';
import { useCardLists, type ListKind } from '@/lib/shopping';
import { ChangeArtPanel } from './ChangeArtPanel';

/**
 * Pasting a list of cards.
 *
 * The owner: *"no way to paste a list in either (main way people will)"*. So
 * this is the front door of the proxy list, not something behind a menu, and
 * the empty page is mostly this box.
 *
 * WHY THERE IS A REVIEW STEP
 * --------------------------
 * Because a proxy sheet is a decision about ART. A name that matches forty
 * printings has forty possible sheets, and the one the catalogue picks by
 * default is not always the one somebody wants on the table. Committing
 * straight from the textarea would hide that choice behind a fait accompli, and
 * it would also hide the misses: a list of 99 that quietly became 96 is a list
 * whose owner finds out at the printer.
 *
 * So nothing is saved until the reader has seen three things: what matched,
 * what we guessed at, and what we could not find at all. The last two are
 * editable in place, and re-checking them is one more batch, not one request
 * per card.
 *
 * ONE QUERY, ALWAYS
 * -----------------
 * Checking a list is a single call to `resolve_card_names`. Fixing the leftovers
 * is a single call. Committing is a single call to `card_list_add_many`. The
 * only per-card request in the whole flow is opening the art picker, which is
 * one card at a time because a person is looking at one card at a time.
 */

export interface PasteCardListProps {
  kind?: ListKind;
  /** Called once cards land on the list, with how many rows were written. */
  onAdded?: (rows: number) => void;
  className?: string;
}

/** A resolved line plus what the reader has done to it since. */
interface ReviewRow extends ResolvedEntry {
  dropped: boolean;
  /** Editable text for a row that needs fixing. */
  draft: string;
}

const EXAMPLE = `4 Lightning Bolt
1 Sol Ring (LTC) 284
Commander
1 Atraxa, Praetors' Voice

Deck
1x Arcane Signet
Counterspell`;

export function PasteCardList({ kind = 'proxy', onAdded, className }: PasteCardListProps) {
  const load = useCardLists(state => state.load);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'checking' | 'fixing' | 'adding'>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [overLimit, setOverLimit] = useState(0);
  const [picking, setPicking] = useState<ReviewRow | null>(null);

  const live = useMemo(() => (rows ?? []).filter(row => !row.dropped), [rows]);
  const found = useMemo(() => live.filter(row => row.card && isSettled(row)), [live]);
  const guessed = useMemo(() => live.filter(row => row.status === 'near'), [live]);
  const missing = useMemo(() => live.filter(row => !row.card), [live]);

  /**
   * A guess is not a match.
   *
   * A near match is our reading of a misspelling, and reading it INTO the list
   * by default would be the app deciding quietly, which is the thing the review
   * step exists to stop. So it waits in the worth-a-look group with the card
   * shown, and one click accepts it.
   */
  const readyCards = found;
  const readyCopies = readyCards.reduce((sum, row) => sum + row.quantity, 0);

  const check = useCallback(async () => {
    if (!text.trim()) return;
    setBusy('checking');
    try {
      const result = await resolvePastedList(text);
      setOverLimit(result.overLimit);
      setRows(result.entries.map(entry => ({ ...entry, dropped: false, draft: entry.line.name })));
      if (result.entries.length === 0) {
        showError('No cards in that', 'We could not find a single card name in what you pasted.');
      }
    } catch (error: any) {
      showError('Could not check that list', error?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }, [text]);

  const patch = useCallback((key: string, change: Partial<ReviewRow>) => {
    setRows(current =>
      current ? current.map(row => (row.key === key ? { ...row, ...change } : row)) : current
    );
  }, []);

  /** Re-check every row the reader has retyped. One batch, however many there are. */
  const lookAgain = useCallback(async () => {
    const pending = live.filter(row => !isSettled(row));
    if (pending.length === 0) return;

    setBusy('fixing');
    try {
      const asked: ParsedCardLine[] = pending.map(row => {
        const parsed = parseCardLine(row.draft);
        return {
          line: row.line.line,
          raw: row.draft,
          name: parsed?.name ?? row.draft.trim(),
          quantity: parsed?.quantity ?? row.quantity,
          section: row.line.section,
          setCode: parsed?.setCode,
          collectorNumber: parsed?.collectorNumber,
          finish: parsed?.finish ?? row.line.finish,
          alternate: parsed?.alternate,
        };
      });

      const fresh = await resolveParsedLines(asked);
      setRows(current => {
        if (!current) return current;
        const byOldKey = new Map(pending.map((row, i) => [row.key, fresh[i]]));
        return current.map(row => {
          const next = byOldKey.get(row.key);
          if (!next) return row;
          /* The key is kept so the row does not jump about under the reader's
             cursor while they are still fixing the ones around it. */
          return { ...next, key: row.key, dropped: row.dropped, draft: next.line.name };
        });
      });
    } catch (error: any) {
      showError('Could not look those up', error?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }, [live]);

  const commit = useCallback(async () => {
    if (readyCards.length === 0) return;
    setBusy('adding');
    try {
      const written = await commitResolvedList({ kind, entries: readyCards });
      await load({ force: true });
      showSuccess(
        kind === 'proxy' ? 'On your proxy list' : 'On your shopping list',
        `${readyCopies} ${readyCopies === 1 ? 'card' : 'cards'} added.`
      );
      setText('');
      setRows(null);
      setOverLimit(0);
      onAdded?.(written);
    } catch (error: any) {
      showError('Could not add those', error?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }, [kind, load, onAdded, readyCards, readyCopies]);

  const startOver = useCallback(() => {
    setRows(null);
    setOverLimit(0);
  }, []);

  /* ----------------------------------------------------------- the paste box */

  if (!rows) {
    return (
      <section className={cn('rounded-xl bg-card p-5 shadow-lg shadow-black/20', className)}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ClipboardPaste className="h-5 w-5" aria-hidden />
            Paste a list
          </h2>
          <p className="text-sm text-muted-foreground">
            From a deck site, a text file, or straight out of your head.
          </p>
        </div>

        <Textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder={EXAMPLE}
          rows={12}
          spellCheck={false}
          aria-label="Paste your list of cards"
          className="w-full resize-y bg-muted/20 font-mono text-sm"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={check} disabled={!text.trim() || busy === 'checking'} className="gap-2">
            {busy === 'checking' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
            {busy === 'checking' ? 'Looking these up' : 'Check this list'}
          </Button>
          {text.trim() && (
            <Button variant="ghost" onClick={() => setText('')} disabled={busy !== null}>
              Clear
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            One card per line. Quantities, set codes and headings like Commander or Sideboard are
            all fine. Nothing is added until you have seen what we found.
          </p>
        </div>
      </section>
    );
  }

  /* -------------------------------------------------------------- the review */

  return (
    <section className={cn('space-y-6', className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-card p-5 shadow-lg shadow-black/20">
        <Tally value={readyCopies} label={readyCopies === 1 ? 'card ready' : 'cards ready'} />
        {guessed.length > 0 && (
          <Tally value={guessed.length} label={guessed.length === 1 ? 'to check' : 'to check'} />
        )}
        {missing.length > 0 && <Tally value={missing.length} label="not found" />}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={startOver} disabled={busy !== null}>
            Back to the box
          </Button>
          <Button onClick={commit} disabled={readyCards.length === 0 || busy !== null} className="gap-2">
            {busy === 'adding' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            Add {readyCopies} to the {kind === 'proxy' ? 'proxy' : 'shopping'} list
          </Button>
        </div>
      </div>

      {overLimit > 0 && (
        <p className="text-sm text-muted-foreground">
          That list was longer than {MAX_LINES} cards, so the last {overLimit} were not looked up.
          Paste them in a second go.
        </p>
      )}

      {(guessed.length > 0 || missing.length > 0) && (
        <div className="space-y-4 rounded-xl bg-card p-5 shadow-lg shadow-black/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertCircle className="h-4 w-4" aria-hidden />
              Worth a look
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={lookAgain}
              disabled={busy !== null}
              className="gap-2"
            >
              {busy === 'fixing' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              Look these up again
            </Button>
          </div>

          <div className="space-y-3">
            {[...guessed, ...missing].map(row => (
              <ProblemRow
                key={row.key}
                row={row}
                onDraft={value => patch(row.key, { draft: value })}
                onAccept={card =>
                  patch(row.key, { card, status: 'exact', draft: card.name, suggestions: [] })
                }
                onDrop={() => patch(row.key, { dropped: true })}
              />
            ))}
          </div>
        </div>
      )}

      {readyCards.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What we found
            </h3>
            <p className="text-xs text-muted-foreground">
              Click the art on any card to print a different version of it.
            </p>
          </div>

          <CardGrid width={220}>
            {readyCards.map(row => (
              <FoundCard
                key={row.key}
                row={row}
                onQuantity={next =>
                  next < 1 ? patch(row.key, { dropped: true }) : patch(row.key, { quantity: next })
                }
                onDrop={() => patch(row.key, { dropped: true })}
                onChangeArt={() => setPicking(row)}
              />
            ))}
          </CardGrid>
        </div>
      )}

      {/*
        The same panel the proxy list uses, told not to talk about saving.
        Nothing on this screen is saved yet: the whole point of the review step
        is that the list is committed in one statement at the end. So it closes
        on the pick and says nothing about writing, and the proxy list's copy of
        it stays open and says a great deal.
      */}
      <ChangeArtPanel
        open={picking !== null}
        onOpenChange={open => !open && setPicking(null)}
        cardName={picking?.card?.name ?? ''}
        oracleId={picking?.card?.oracle_id ?? null}
        current={picking?.card}
        note="Pick the version you want on the sheet. This is the art that gets printed."
        closeOnPick
        onPick={printing => picking && patch(picking.key, { card: printing })}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function FoundCard({
  row,
  onQuantity,
  onDrop,
  onChangeArt,
}: {
  row: ReviewRow;
  onQuantity: (next: number) => void;
  onDrop: () => void;
  onChangeArt: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CardImage
        card={row.card}
        width={220}
        fill
        interactive
        onClick={onChangeArt}
        title={`${row.card?.set_name ?? row.card?.set_code} number ${row.card?.collector_number}`}
      >
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {row.quantity}
        </span>
      </CardImage>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground" title={row.card?.name}>
          {row.card?.name}
        </p>
        <p className="truncate font-mono text-[0.7rem] uppercase text-muted-foreground">
          {row.card?.set_code} #{row.card?.collector_number}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          aria-label={`One fewer ${row.card?.name}`}
          onClick={() => onQuantity(row.quantity - 1)}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          aria-label={`One more ${row.card?.name}`}
          onClick={() => onQuantity(row.quantity + 1)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          onClick={onChangeArt}
        >
          <Images className="h-3.5 w-3.5" aria-hidden />
          <span className="tabular-nums">{row.printings || 1}</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={`Leave ${row.card?.name} off`}
          onClick={onDrop}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/**
 * A line that needs a person.
 *
 * The line as typed stays on screen and stays editable, because the reader is
 * the only one who knows what they meant. The nearest real names sit beside it
 * as cards, big enough to recognise, so accepting one is a click rather than a
 * spelling exercise.
 */
function ProblemRow({
  row,
  onDraft,
  onAccept,
  onDrop,
}: {
  row: ReviewRow;
  onDraft: (value: string) => void;
  onAccept: (card: any) => void;
  onDrop: () => void;
}) {
  const suggestions = row.suggestions ?? [];

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-lg bg-muted/20 p-3">
      <div className="min-w-[16rem] flex-1">
        <p className="mb-1 text-xs text-muted-foreground">
          {row.card
            ? `We think this line means ${row.card.name}. Line ${row.line.line} said:`
            : `Nothing matched line ${row.line.line}:`}
        </p>
        <Input
          value={row.draft}
          onChange={event => onDraft(event.target.value)}
          spellCheck={false}
          aria-label={`Card name on line ${row.line.line}`}
          className="bg-card font-mono text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Fix the spelling and use Look these up again, or pick one below.
        </p>
      </div>

      {row.card && (
        /* Not a <button> around the art: CardImage renders its own control for
           flipping a double faced card, and a button inside a button is invalid
           markup that React warns about and screen readers cannot describe. */
        <div className="w-[120px] shrink-0">
          <CardImage
            card={row.card}
            width={120}
            fill
            interactive
            onClick={() => onAccept(row.card)}
            title={`Use ${row.card.name}`}
          />
          <Button
            size="sm"
            variant="secondary"
            className="mt-1 w-full gap-1"
            onClick={() => onAccept(row.card)}
          >
            <Check className="h-3 w-3" aria-hidden />
            Use this
          </Button>
        </div>
      )}

      {suggestions
        .filter(s => s.id !== row.card?.id)
        .map(suggestion => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onDraft(suggestion.name)}
            className="w-[120px] shrink-0 rounded-xl text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate font-medium">{suggestion.name}</span>
            <span className="block">Use this name</span>
          </button>
        ))}

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Leave line ${row.line.line} off the list`}
        onClick={onDrop}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

export default PasteCardList;
