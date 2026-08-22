import { Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FIELD } from '@/components/listing';
import { cn } from '@/lib/utils';
import { showError } from '@/components/ui/toast-helpers';
import type { DeckCardRow } from '@/lib/deck/deckCards';

/**
 * The controls that change a card in a deck, in one place.
 *
 * ## There is no edit mode, so these are never behind one
 *
 * The decklist used to exist twice: a read-only grid on `/deck/:id` and an
 * editable one on `/deck-builder`. The read-only one had the better shell —
 * the shared filter bar, the shared count line, castability, the true 5:7 card
 * ratio — and the editable one had the controls. Rather than pick, the controls
 * moved to the better grid, as optional props.
 *
 * Optional matters: pass none of them and the grid and the table render exactly
 * as they did, which is what the public deck page does, and is the test that
 * this change added something rather than changing something.
 */

export interface DeckCardEditing {
  onSetQuantity: (row: DeckCardRow, quantity: number) => void;
  onRemoveOne: (row: DeckCardRow) => void;
  onDeleteAll: (row: DeckCardRow) => void;
  onReplace: (row: DeckCardRow) => void;
  /** Copies this format allows of this card. `Infinity` for basic lands. */
  limitFor: (row: DeckCardRow) => number;
}

function describeLimit(row: DeckCardRow, limit: number): string {
  const name = row.card?.name || row.card_name;
  return `${name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} here.`;
}

/** A typed number of copies, refused above the format's limit. */
export function QuantityInput({
  row,
  editing,
  className,
}: {
  row: DeckCardRow;
  editing: DeckCardEditing;
  className?: string;
}) {
  return (
    <Input
      type="number"
      min={0}
      value={row.quantity}
      onClick={event => event.stopPropagation()}
      onChange={event => {
        const parsed = Math.floor(Number(event.target.value));
        if (!Number.isFinite(parsed)) return;
        const next = Math.max(0, parsed);
        const limit = editing.limitFor(row);
        if (next > limit) {
          showError('Copy limit', describeLimit(row, limit));
          editing.onSetQuantity(row, limit);
          return;
        }
        editing.onSetQuantity(row, next);
      }}
      /* One of these sits on every card in the deck. `Input` draws a border by
         default, so a hundred-card decklist is a hundred hairlines on the
         busiest screen in the product. `FIELD` is the borderless field the rest
         of the shared vocabulary uses. */
      className={cn(FIELD, 'tabular-nums', className)}
      aria-label={`Copies of ${row.card?.name || row.card_name}`}
    />
  );
}

/**
 * The cluster that sits over a card in the grid: one fewer, how many, one more,
 * replace, and remove every copy.
 *
 * Revealed on hover and on focus, so it is reachable from the keyboard, and
 * `pointer-events` only while revealed so it never intercepts a click meant for
 * the card underneath.
 */
export function DeckCardOverlay({
  row,
  editing,
}: {
  row: DeckCardRow;
  editing: DeckCardEditing;
}) {
  const limit = editing.limitFor(row);

  const increment = () => {
    if (row.quantity + 1 > limit) {
      showError('Copy limit', describeLimit(row, limit));
      return;
    }
    editing.onSetQuantity(row, row.quantity + 1);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/75 p-2 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 motion-reduce:transition-none"
      onClick={event => event.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          onClick={() => editing.onRemoveOne(row)}
          title="Remove one copy"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <QuantityInput row={row} editing={editing} className="h-8 w-14 text-center" />
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          onClick={increment}
          title="Add one copy"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          onClick={() => editing.onReplace(row)}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Replace
        </Button>
        <Button
          size="icon"
          variant="destructive"
          className="h-7 w-7"
          onClick={() => editing.onDeleteAll(row)}
          title="Remove all copies"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Replace and remove, for a table row. Revealed on hover, like the list buttons. */
export function DeckRowActions({
  row,
  editing,
}: {
  row: DeckCardRow;
  editing: DeckCardEditing;
}) {
  return (
    <span
      className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
      onClick={event => event.stopPropagation()}
    >
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => editing.onReplace(row)}
        title="Replace"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => editing.onDeleteAll(row)}
        title="Remove all copies"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
