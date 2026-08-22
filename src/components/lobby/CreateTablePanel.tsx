import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DeckSummary } from '@/lib/play/deckSource';
import { DeckChoice, playableDecks } from './DeckChoice';

/**
 * Opening a table, without leaving the lobby.
 *
 * A right-hand slide-over, which is the owner's approved pattern for an action
 * taken in context: the list of tables stays on screen behind it and keeps its
 * scroll position. Never a centred dialog.
 *
 * Three decisions and no more, because a lobby with a settings form in it is a
 * lobby nobody opens a table from:
 *
 *   which deck    only decks with cards in them. An empty deck is not offered
 *                 at all here, unlike the bot lobby where a seeded deck is a
 *                 reasonable substitute. Online, it is not: you are sitting
 *                 down opposite a person with the deck you chose.
 *   how many      two to four seats, which is what `game_tables` allows.
 *   who can see   listed in the lobby, or only reachable with the link.
 *
 * The name is prefilled from the account and can be changed, because the name
 * on a seat is what three other people will call you for an hour.
 */

export interface CreateTableValue {
  deckId: string | null;
  maxSeats: number;
  visibility: 'public' | 'link';
  displayName: string;
}

export interface CreateTablePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckSummary[];
  loadingDecks: boolean;
  creating: boolean;
  error?: string | null;
  defaultName: string;
  /**
   * The deck already chosen at step two of the play flow.
   *
   * Online does not get its own deck picker: it is the third step of one flow,
   * and the deck was chosen on the same wall every other mode uses. This is
   * that choice arriving, so the panel opens on it rather than asking again.
   */
  defaultDeckId?: string | null;
  onCreate: (value: CreateTableValue) => void;
}

const SEAT_COUNTS = [2, 3, 4];

export function CreateTablePanel({
  open,
  onOpenChange,
  decks,
  loadingDecks,
  creating,
  error,
  defaultName,
  defaultDeckId,
  onCreate,
}: CreateTablePanelProps) {
  // Only decks that can actually be played. `DeckChoice` filters the same way,
  // from the same function, so the list offered and the default chosen here can
  // never disagree.
  const playable = playableDecks(decks);

  const [deckId, setDeckId] = useState<string | null>(null);
  const [maxSeats, setMaxSeats] = useState(4);
  const [visibility, setVisibility] = useState<'public' | 'link'>('public');
  const [displayName, setDisplayName] = useState(defaultName);

  /* The deck carried in from step two wins over "the first one", and an
     explicit choice made here wins over both. A deck that arrived empty is not
     in `playable`, so it cannot be the default by accident. */
  const carried = defaultDeckId && playable.some(deck => deck.id === defaultDeckId)
    ? defaultDeckId
    : null;
  const chosen = deckId ?? carried ?? playable[0]?.id ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Open a table</SheetTitle>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Open a table</h2>
            <p className="text-sm text-muted-foreground">
              You get a link straight away. Send it to a friend and they land in your seat
              screen.
            </p>
          </div>

          <div>
            <label
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="lobby-name"
            >
              What to call you
            </label>
            <Input
              id="lobby-name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              maxLength={24}
              className="mt-1 bg-muted/40"
            />
          </div>

          <div>
            <label
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="lobby-deck"
            >
              Your deck
            </label>

            <DeckChoice
              id="lobby-deck"
              decks={decks}
              loading={loadingDecks}
              value={chosen}
              onChange={setDeckId}
            />
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Seats
            </p>
            <div className="mt-2 flex gap-2">
              {SEAT_COUNTS.map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMaxSeats(count)}
                  className={cn(
                    'flex-1 rounded-lg py-3 text-sm font-medium transition-transform duration-150',
                    'motion-safe:active:scale-[0.98]',
                    maxSeats === count
                      ? 'bg-foreground text-background'
                      : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Who can find it
            </p>
            <div className="mt-2 space-y-2">
              <VisibilityChoice
                selected={visibility === 'public'}
                title="Anyone in the lobby"
                blurb="Listed for every player looking for a game. You can still send the link."
                onSelect={() => setVisibility('public')}
              />
              <VisibilityChoice
                selected={visibility === 'link'}
                title="Only people with the link"
                blurb="Not listed anywhere. The only way in is the link you send."
                onSelect={() => setVisibility('link')}
              />
            </div>
          </div>

          {error && <p className="text-sm text-foreground">{error}</p>}

          <Button
            className="w-full"
            disabled={creating || !chosen || displayName.trim().length === 0}
            onClick={() =>
              onCreate({
                deckId: chosen,
                maxSeats,
                visibility,
                displayName: displayName.trim(),
              })
            }
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Setting up
              </>
            ) : (
              'Open the table'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VisibilityChoice({
  selected,
  title,
  blurb,
  onSelect,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg p-3 text-left transition-transform duration-150',
        'motion-safe:active:scale-[0.99]',
        selected ? 'bg-foreground/10' : 'bg-muted/40'
      )}
    >
      <p
        className={cn(
          'text-sm font-medium',
          selected ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
    </button>
  );
}
