import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  askLabel,
  askToBeFriends,
  canAsk,
  findPlayers,
  lobbyErrorMessage,
  safeName,
  type FoundPlayer,
} from '@/lib/lobby';

/**
 * Finding somebody, and asking them.
 *
 * A right-hand slide-over, which is the approved pattern for an action taken
 * without leaving the page: the friends list stays on screen behind it and
 * keeps its place.
 *
 * ---------------------------------------------------------------------------
 * TWO CHARACTERS, AND A PAUSE
 * ---------------------------------------------------------------------------
 * The search runs on a 250ms debounce, which is the number the rest of this
 * product already uses, and it refuses to run at all under two characters. A
 * single letter over thirteen accounts is the whole member list, which is not a
 * search, it is a directory.
 *
 * ---------------------------------------------------------------------------
 * THE BUTTON SAYS WHERE YOU ALREADY STAND
 * ---------------------------------------------------------------------------
 * `find_players` returns the state with the row, so a result reads Add friend,
 * Asked, Accept or Already friends without a second question per person.
 * Asking somebody who already asked you IS saying yes, which is why Accept is a
 * live button here and not a note telling you to go and look somewhere else.
 *
 * Somebody who has blocked you is not in the results at all, and there is no
 * message saying so. Being told you were blocked is an invitation to make a
 * second account.
 */

const DEBOUNCE_MS = 250;

export interface FindPlayersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something changed, so the list behind this should be re-read. */
  onChanged: () => void;
}

export function FindPlayers({ open, onOpenChange, onChanged }: FindPlayersProps) {
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [looking, setLooking] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const look = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      setLooking(false);
      return;
    }
    setLooking(true);
    try {
      const found = await findPlayers(text);
      if (alive.current) setResults(found);
    } catch (caught) {
      if (alive.current) setError(lobbyErrorMessage(caught));
    } finally {
      if (alive.current) setLooking(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void look(draft), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, look]);

  /* A fresh panel every time it opens. Leaving the last search in it means
     somebody comes back to a list of people they already dealt with. */
  useEffect(() => {
    if (!open) return;
    setDraft('');
    setResults([]);
    setError(null);
    setNote(null);
  }, [open]);

  const ask = async (player: FoundPlayer) => {
    setAsking(player.userId);
    setError(null);
    setNote(null);
    try {
      const state = await askToBeFriends(player.userId);
      setResults(current =>
        current.map(row => (row.userId === player.userId ? { ...row, state } : row))
      );
      setNote(
        state === 'friend'
          ? `You and ${safeName(player.name)} are friends now.`
          : `Asked ${safeName(player.name)}. They will see it next time they are on.`
      );
      onChanged();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setAsking(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">Find somebody to play with</SheetTitle>

        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Find somebody</h2>
            <p className="text-sm text-muted-foreground">
              Search by the name they play under. They have to say yes before either of you
              can see anything.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Their name"
              aria-label="Their name"
              maxLength={40}
              className="bg-muted/40 pl-9"
            />
          </div>

          {draft.trim().length > 0 && draft.trim().length < 2 && (
            <p className="text-sm text-muted-foreground">Two letters at least.</p>
          )}

          {looking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Looking
            </p>
          )}

          {!looking && draft.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nobody by that name. Names are what somebody set in their settings, not their
              email address.
            </p>
          )}

          <ul className="space-y-2">
            {results.map(player => (
              <li
                key={player.userId}
                className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {safeName(player.name)}
                </span>
                <Button
                  size="sm"
                  variant={canAsk(player.state) ? 'default' : 'ghost'}
                  disabled={!canAsk(player.state) || asking === player.userId}
                  onClick={() => void ask(player)}
                >
                  {asking === player.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      {canAsk(player.state) && (
                        <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {askLabel(player.state)}
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>

          {note && <p className="text-sm text-foreground">{note}</p>}
          {error && <p className="text-sm text-foreground">{error}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
