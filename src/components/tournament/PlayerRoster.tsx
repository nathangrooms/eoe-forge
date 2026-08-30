/**
 * DeckMatrix — the roster.
 *
 * Both the sign-in sheet before an event starts and the drop sheet during it,
 * because they are the same list and a TO switching between two screens for one
 * job is how players get lost.
 *
 * Every row leads with the deck: whichever commander the player registered,
 * drawn as a whole card. That is the difference between this and a generic
 * bracket app — the roster of a Magic event is a list of decks with people
 * attached, and it should read that way.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Layers, Plus, RotateCcw, UserMinus, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatLabel } from '@/lib/deck/formats';
import { DeckRail } from '@/components/deck/DeckRail';
import { CommanderPortrait, RecordLine } from './PlayerIdentity';
import { viewFor, type PlayerView } from './playerViews';
import { DeckPicker } from './DeckPicker';
import { formatMismatch, registrationFor, type DeckOption } from './useEventDecks';
import type { PlayerDeck, Tournament } from './scoring';

export interface PlayerRosterProps {
  tournament: Tournament;
  views: Map<string, PlayerView>;
  decks: DeckOption[];
  decksLoading: boolean;
  onRegisterDeck: (player: string, deck: PlayerDeck | null) => void;
  onToggleDrop: (player: string) => void;
  /** Roster editing is only offered before the first pairing is cut. */
  onAddPlayers?: (names: string[]) => void;
  onRemovePlayer?: (player: string) => void;
}

/**
 * An event with nobody in it yet.
 *
 * This used to be a small centred paragraph, which on the create page left the
 * whole right-hand two thirds of a 1,680px screen as black. What belongs in
 * that space is not padding: it is the decks that are about to be registered,
 * at a size worth looking at. They are read from the signed-in user's own
 * library, so if the library is empty the strip is simply absent and nothing is
 * invented to fill it.
 */
function EmptyRoster({ decks, loading }: { decks: DeckOption[]; loading: boolean }) {
  /* Every deck, not only the ones with artwork on file. Filtering on the
     commander image and then counting the whole library is exactly how the
     heading came to read "2 decks in your library" above one card; `DeckRail`
     draws the ones with no art as a card-shaped panel carrying the deck's name,
     so there is nothing left to count wrongly. */
  const shown = decks.slice(0, 12);

  return (
    <div className="rounded-2xl bg-muted/30 p-6 sm:p-8">
      <div className="max-w-xl">
        <UserPlus aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        <h3 className="mt-2 text-lg font-semibold text-foreground">Nobody has signed in yet</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Type names above one at a time, or paste the whole sign-in sheet in one go, one name per
          line. Each player then registers a deck, and their commander follows them through the
          pairings, the standings and the podium.
        </p>
      </div>

      {!loading && shown.length > 0 && (
        <div className="mt-7">
          {/* No links on these tiles. The sign-in sheet above may be half
              typed, and a card that navigates away from it would throw the
              names out. */}
          <DeckRail
            label="Your decks, ready to register"
            decks={shown.map(deck => ({ id: deck.id, name: deck.name, card: deck.commanderCard }))}
            total={decks.length}
            purpose="ready to register"
          />
        </div>
      )}
    </div>
  );
}

/** Accepts one name, a pasted column, or a comma-separated line. */
function parseNames(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,;\t]+/)
        .map(n => n.trim())
        .filter(n => n.length > 0)
    )
  );
}

export function PlayerRoster({
  tournament,
  views,
  decks,
  decksLoading,
  onRegisterDeck,
  onToggleDrop,
  onAddPlayers,
  onRemovePlayer,
}: PlayerRosterProps) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const registeredCount = useMemo(
    () => tournament.players.filter(p => tournament.decks[p]).length,
    [tournament.players, tournament.decks]
  );

  const canEdit = !!onAddPlayers;

  /*
    Sign-in order before the event starts, standings order once it is running.

    Sign-in order is the right order for a sheet people are still being added
    to. It is the wrong order for a TO mid-event, where the roster is the drop
    sheet and the question is "who is this player and how are they doing" — that
    list came out 1, 6, 5, 3, 2, 4, which reads as no order at all. `rank` is
    already on the view, put there by the same standings the rest of the page
    uses, so this is a sort and not a second opinion about who is winning.
  */
  const rosterOrder = useMemo(() => {
    if (tournament.status === 'setup') return tournament.players;
    const last = tournament.players.length + 1;
    return [...tournament.players].sort(
      (a, b) => (views.get(a)?.rank ?? last) - (views.get(b)?.rank ?? last)
    );
  }, [tournament.players, tournament.status, views]);

  const submitDraft = () => {
    const names = parseNames(draft).filter(n => !tournament.players.includes(n));
    if (names.length === 0) {
      setDraft('');
      return;
    }
    onAddPlayers?.(names);
    setDraft('');
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          Roster
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {tournament.players.length} player{tournament.players.length === 1 ? '' : 's'}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {registeredCount} of {tournament.players.length} decks registered
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 p-2.5">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitDraft();
              }
            }}
            placeholder="Add a player, or paste a whole list"
            className="h-9 min-w-[12rem] flex-1 border-0 bg-background text-sm"
            aria-label="Add players"
          />
          <Button size="sm" className="h-9 gap-1.5" onClick={submitDraft} disabled={!draft.trim()}>
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </div>
      )}

      {tournament.players.length === 0 ? (
        <EmptyRoster decks={decks} loading={decksLoading} />
      ) : (
        /*
          Tiles, laid out against the width that is actually there.

          A roster entry is a 76px card, a name, a record and three small
          buttons. Stretched across a 1,400px row that content sat in the first
          400px and the remaining thousand was black, once per player down the
          page — the owner's "doesn't utilise full page width", on the screen
          where it showed worst. As tiles the same six players take two rows
          instead of six, the commander gets half again the size, and a phone
          still gets one per row because the floor is `min(100%, 22rem)`.

          `items-start` so the tile with its deck picker open grows on its own
          rather than stretching every tile beside it to match.
        */
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] items-start gap-3">
          {rosterOrder.map(player => {
            const view = viewFor(views, player);
            const registered = tournament.decks[player];
            const mismatch = formatMismatch(tournament.gameFormat, registered);
            const open = pickerFor === player;

            return (
              <li key={player} className="overflow-hidden rounded-xl bg-card shadow-sm">
                <div
                  className={cn('flex items-stretch gap-3 p-3', view.dropped && 'opacity-50')}
                >
                  {/* A roster is a list of decks with people attached, so the
                      deck has to be recognisable. 58px was not, and 76px was
                      still a thumbnail. `md` because the card is now drawn wide
                      enough that the smaller Scryfall asset shows its softness. */}
                  <div className="w-[112px] shrink-0">
                    <CommanderPortrait view={view} size="md" />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {player}
                      </span>
                      {view.rank && tournament.status !== 'setup' && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
                          Rank {view.rank}
                        </span>
                      )}
                      {view.dropped && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
                          Dropped
                        </span>
                      )}
                    </div>

                    {tournament.status !== 'setup' && (
                      <RecordLine standing={view.standing} className="mt-0.5 block" />
                    )}

                    {/* Both halves of this line name something with a page of
                        its own, and both used to be dead text: the deck name
                        goes to the deck, the commander to the card. Kept as its
                        own line rather than swapped for `DeckLine`, because the
                        format-mismatch warning has to travel with it. */}
                    {registered ? (
                      <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Layers aria-hidden="true" className="h-3 w-3 shrink-0" />
                        <Link
                          to={`/deck/${registered.deckId}`}
                          title={`Open ${registered.deckName}`}
                          className="truncate rounded font-medium text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                        >
                          {registered.deckName}
                        </Link>
                        {registered.commanderName && (
                          <Link
                            to={`/cards/${encodeURIComponent(registered.commanderName)}`}
                            title={`Open ${registered.commanderName}`}
                            className="truncate rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                          >
                            · {registered.commanderName}
                          </Link>
                        )}
                        {mismatch && (
                          <span
                            title={`Registered deck is ${formatLabel(registered.format)}; this event is ${tournament.gameFormat}.`}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {formatLabel(registered.format)} deck
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs italic text-muted-foreground/80">
                        No deck registered
                      </p>
                    )}

                  {/* Under the player rather than beside them: at tile width
                      there is no room for a right-hand column, and pinned to
                      the bottom the controls line up across a row of tiles
                      whose text runs to different lengths. */}
                  <div className="-ml-2.5 mt-auto flex flex-wrap items-center gap-1 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setPickerFor(open ? null : player)}
                    >
                      <Plus className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-45')} />
                      {registered ? 'Change deck' : 'Register deck'}
                    </Button>

                    {tournament.status !== 'setup' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => onToggleDrop(player)}
                      >
                        {view.dropped ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Re-enter
                          </>
                        ) : (
                          <>
                            <UserMinus className="h-3.5 w-3.5" />
                            Drop
                          </>
                        )}
                      </Button>
                    )}

                    {onRemovePlayer && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => onRemovePlayer(player)}
                        aria-label={`Remove ${player}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  </div>
                </div>

                {open && (
                  <div className="px-3 pb-3">
                    <DeckPicker
                      playerName={player}
                      decks={decks}
                      loading={decksLoading}
                      selectedDeckId={registered?.deckId}
                      onSelect={deck => {
                        onRegisterDeck(player, registrationFor(deck));
                        setPickerFor(null);
                      }}
                      onClear={() => {
                        onRegisterDeck(player, null);
                        setPickerFor(null);
                      }}
                      onClose={() => setPickerFor(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tournament.status !== 'setup' && tournament.players.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A dropped player keeps every result they have already played. They are simply excluded
          from all further pairings.
        </p>
      )}
    </section>
  );
}
