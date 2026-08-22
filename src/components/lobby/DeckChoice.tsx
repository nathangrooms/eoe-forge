import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorIdentity } from '@/components/ui/mana-cost';
import type { DeckSummary } from '@/lib/play/deckSource';

/**
 * Picking the deck you are sitting down with.
 *
 * ONE of these, used when a table is opened and again when a deck is changed at
 * the table, because they are the same choice made at two moments. Two pickers
 * would drift, and the way they would drift is the one that matters: only one
 * of them would keep filtering out the empty decks.
 *
 * EMPTY DECKS ARE NOT OFFERED. This account holds nine saved decks with no
 * cards in them. Elsewhere in play mode an empty deck quietly becomes a seeded
 * one, which is right for a goldfish. Online it is not: you are sitting down
 * opposite a person expecting the deck you named. The database agrees and
 * refuses the seat, so offering the choice would only move the refusal later.
 */

export interface DeckChoiceProps {
  id?: string;
  decks: DeckSummary[];
  loading: boolean;
  value: string | null;
  disabled?: boolean;
  onChange: (deckId: string) => void;
}

/** The decks that can actually be played. Exported so callers agree on it. */
export function playableDecks(decks: DeckSummary[]): DeckSummary[] {
  return decks.filter(deck => (deck.cardCount ?? 0) > 0);
}

export function DeckChoice({ id, decks, loading, value, disabled, onChange }: DeckChoiceProps) {
  const playable = playableDecks(decks);

  if (loading) {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Reading your decks
      </p>
    );
  }

  if (playable.length === 0) {
    return (
      <p className="mt-2 text-sm text-foreground">
        None of your decks have cards in them yet. Add cards to one and it will show up
        here.
      </p>
    );
  }

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="mt-1 h-10 bg-muted/40">
        <SelectValue placeholder="Choose a deck" />
      </SelectTrigger>
      <SelectContent>
        {playable.map(deck => (
          <SelectItem key={deck.id} value={deck.id}>
            <span className="flex items-center gap-2">
              <ColorIdentity colors={deck.colors} size="xs" />
              <span className="truncate">{deck.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {deck.cardCount} cards
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
