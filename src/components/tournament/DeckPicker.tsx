/**
 * DeckMatrix — registering a decklist against a seat.
 *
 * Expands in place under the player it belongs to. Not an overlay: attaching
 * decks is a pass down the roster, and a panel that has to be dismissed between
 * every player turns an eight-player pod into sixteen clicks.
 *
 * Decks are shown as their commanders, whole and at a size you can actually
 * recognise, because that is how a player identifies their own deck in a list
 * of nine Commander decks.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Library, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardImage } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import { formatLabel } from '@/lib/deck/formats';
import type { DeckOption } from './useEventDecks';

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

export interface DeckPickerProps {
  decks: DeckOption[];
  loading: boolean;
  /** The deck currently registered to this seat, if any. */
  selectedDeckId?: string;
  onSelect: (deck: DeckOption) => void;
  onClear: () => void;
  onClose: () => void;
  playerName: string;
}

export function DeckPicker({
  decks,
  loading,
  selectedDeckId,
  onSelect,
  onClear,
  onClose,
  playerName,
}: DeckPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return decks;
    return decks.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        (d.commanderName ?? '').toLowerCase().includes(q) ||
        d.format.toLowerCase().includes(q)
    );
  }, [decks, query]);

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Register a deck for {playerName}
        </p>
        <div className="flex items-center gap-1">
          {selectedDeckId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              Remove deck
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={onClose}
            aria-label="Close deck picker"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {decks.length > 6 && (
        <div className="relative mb-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search decks or commanders"
            className="h-9 border-0 bg-background pl-9 text-sm"
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="aspect-[488/680] w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Library aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No decks in your library yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Players can still be entered without one. Register a deck later and the standings pick
            up its commander automatically.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-1">
            <Link to="/decks/new">Build a deck</Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      ) : (
        <div className="grid max-h-[22rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-6">
          {filtered.map(deck => (
            <DeckChoice
              key={deck.id}
              deck={deck}
              selected={deck.id === selectedDeckId}
              onSelect={() => onSelect(deck)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckChoice({
  deck,
  selected,
  onSelect,
}: {
  deck: DeckOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const pips = Array.from(new Set((deck.colors ?? []).map(c => c.toUpperCase())))
    .filter(c => WUBRG.includes(c))
    .sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="group flex flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <div className="relative">
        {deck.commanderCard ? (
          <CardImage
            card={deck.commanderCard}
            size="sm"
            fill
            imageClassName={cn(!selected && 'opacity-90 group-hover:opacity-100')}
          />
        ) : (
          <div
            className="flex aspect-[488/680] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted shadow-md shadow-black/20"
            aria-hidden="true"
          >
            {pips.length > 0 ? (
              <span className="flex flex-wrap items-center justify-center gap-1">
                {pips.map(c => (
                  <ManaPip key={c} symbol={c} size="sm" />
                ))}
              </span>
            ) : (
              <Library className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}

        {selected && (
          <span className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-md">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{deck.name}</p>
        <p className="truncate text-[0.65rem] text-muted-foreground">
          {formatLabel(deck.format)} · {deck.cardCount} cards
        </p>
      </div>
    </button>
  );
}
