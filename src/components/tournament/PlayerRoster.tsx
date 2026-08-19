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
            placeholder="Add a player — or paste a whole list"
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
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/30 p-10 text-center">
          <UserPlus aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nobody has signed in yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Type names above one at a time, or paste the whole sign-in sheet in one go — one name
            per line.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tournament.players.map(player => {
            const view = viewFor(views, player);
            const registered = tournament.decks[player];
            const mismatch = formatMismatch(tournament.gameFormat, registered);
            const open = pickerFor === player;

            return (
              <li key={player} className="overflow-hidden rounded-xl bg-card shadow-sm">
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-3 p-3',
                    view.dropped && 'opacity-50'
                  )}
                >
                  <div className="w-[58px] shrink-0">
                    <CommanderPortrait view={view} size="sm" />
                  </div>

                  <div className="min-w-0 flex-1">
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
                      <p className="mt-0.5 text-xs italic text-muted-foreground/70">
                        No deck registered
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
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
          A dropped player keeps every result they have already played — they are simply excluded
          from all further pairings.
        </p>
      )}
    </section>
  );
}
