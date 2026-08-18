/**
 * DeckMatrix — the tournament floor.
 *
 * Assembly only: this file owns the event state, the round clock and the
 * actions, and hands everything else to the pieces around it. The maths — match
 * points, the DCI tiebreaker chain, rematch-free Swiss pairing, bracket
 * generation — all still lives in `scoring.ts` and is untouched.
 *
 * The shape of the screen follows how an event is actually run:
 *
 *   events strip → the event you are running → the round in play → standings
 *
 * with live standings docked beside the pairings on a wide screen, because the
 * two questions asked between rounds are "who has reported?" and "who is on
 * top?" and they should not be two different screens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, ListOrdered, Medal, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useCardArt } from '@/hooks/useCardArt';

import {
  computeStandings,
  generateEliminationBracket,
  generatePairings,
  previousOpponents,
  randomiseSeating,
  totalRoundsFor,
  type MatchResult,
  type PlayerDeck,
  type Round,
  type Tournament,
} from './scoring';
import { loadTournaments, makeTimer, saveTournaments } from './storage';
import { buildPlayerViews } from './playerViews';
import { commanderNames, useMyDecks } from './useEventDecks';
import { EventEmptyState } from './EventEmptyState';
import { EventHeader } from './EventHeader';
import { EventRail } from './EventRail';
import { RoundBoard } from './RoundBoard';
import { StandingsRail, StandingsTable } from './StandingsTable';
import { PlayerRoster } from './PlayerRoster';
import { BracketBoard } from './BracketBoard';
import { Podium } from './Podium';

type View = 'pairings' | 'standings' | 'players' | 'bracket';

export function TournamentManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('pairings');
  /** null follows the live round; a number pins the board to a played round. */
  const [pinnedRound, setPinnedRound] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Storage is read in an effect, so the first paint has nothing yet. Without
   *  this the empty state flashes for a frame on every visit with saved events. */
  const [loaded, setLoaded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { decks, loading: decksLoading } = useMyDecks();

  useEffect(() => {
    const saved = loadTournaments();
    setTournaments(saved);
    setLoaded(true);
    if (saved.length === 0) return;

    // /tournament?event=<id> is how the create route hands control back.
    const requested = searchParams.get('event');
    const match = requested ? saved.find(t => t.id === requested) : null;
    setSelectedId((match ?? saved[0]).id);
    // Reading storage is a mount-time concern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives the round clock display.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const save = useCallback((updated: Tournament[]) => {
    setTournaments(updated);
    if (!saveTournaments(updated)) {
      showError('Could not save', 'This browser refused to store the event.');
    }
  }, []);

  // Falls back to the first event rather than showing nothing, so a stale or
  // missing id — a deleted event, a bad `?event=` — can never strand the page.
  const selected = tournaments.find(t => t.id === selectedId) ?? tournaments[0] ?? null;
  const selectedKey = selected?.id ?? null;

  const updateSelected = useCallback(
    (mutate: (t: Tournament) => Tournament) => {
      if (!selectedKey) return;
      save(tournaments.map(t => (t.id === selectedKey ? mutate(t) : t)));
    },
    [save, selectedKey, tournaments]
  );

  const standings = useMemo(
    () => (selected ? computeStandings(selected.players, selected.rounds, selected.dropped) : []),
    [selected]
  );

  // One batched artwork lookup for every commander on the roster, rather than
  // one request per pairing card.
  const art = useCardArt(commanderNames(selected?.decks ?? {}));
  const views = useMemo(
    () => (selected ? buildPlayerViews(selected, standings, art) : new Map()),
    [selected, standings, art]
  );

  const totalRounds = selected ? totalRoundsFor(selected) : 0;
  const liveRound = selected?.currentRound ?? 0;
  const shownRound = pinnedRound ?? liveRound;

  // A new event, or a round advancing, snaps the board back to the live round.
  useEffect(() => {
    setPinnedRound(null);
  }, [selectedKey, liveRound]);

  useEffect(() => {
    if (!selected) return;
    if (view === 'bracket' && selected.format !== 'single-elimination') setView('pairings');
  }, [selected, view]);

  /* ---------------- actions ---------------- */

  const selectEvent = (id: string) => {
    setSelectedId(id);
    setView('pairings');
    const next = new URLSearchParams(searchParams);
    next.set('event', id);
    setSearchParams(next, { replace: true });
  };

  const startTournament = () => {
    if (!selected) return;
    if (selected.players.length < 2) {
      showError('Not enough players', 'At least two players are needed to cut a pairing.');
      return;
    }

    const rounds: Round[] =
      selected.format === 'single-elimination'
        ? generateEliminationBracket(selected.players)
        : [
            {
              number: 1,
              matches: generatePairings(
                // Round 1 has no records to pair on, so seating is random —
                // otherwise the alphabetical tiebreak seats the same two players
                // against each other at the start of every single event.
                randomiseSeating(computeStandings(selected.players, [], selected.dropped)),
                new Set<string>(),
                1
              ),
              status: 'in-progress',
            },
          ];

    updateSelected(t => ({
      ...t,
      status: 'in-progress',
      rounds,
      currentRound: 1,
      timer: makeTimer(t.roundLengthMinutes),
    }));
    showSuccess('Event started', 'Round 1 pairings are up');
  };

  const recordMatchResult = (
    roundNumber: number,
    matchId: string,
    result: MatchResult,
    p1Score: number,
    p2Score: number
  ) => {
    updateSelected(t => ({
      ...t,
      rounds: t.rounds.map(round => {
        if (round.number !== roundNumber) return round;

        const matches = round.matches.map(match =>
          match.id === matchId
            ? {
                ...match,
                result,
                winner:
                  result === 'p1' ? match.player1 : result === 'p2' ? match.player2 : undefined,
                player1Score: p1Score,
                player2Score: p2Score,
                status: 'completed' as const,
              }
            : match
        );

        return {
          ...round,
          matches,
          status: matches.every(m => m.status === 'completed')
            ? ('completed' as const)
            : ('in-progress' as const),
        };
      }),
    }));
  };

  /**
   * Take a result back.
   *
   * One-click entry is only safe because this exists — a mis-tap used to be
   * permanent. Offered on the live round only: undoing a result from a round
   * that has already been paired off would invalidate the pairings built on it.
   */
  const clearMatchResult = (roundNumber: number, matchId: string) => {
    updateSelected(t => ({
      ...t,
      rounds: t.rounds.map(round =>
        round.number !== roundNumber
          ? round
          : {
              ...round,
              status: 'in-progress' as const,
              matches: round.matches.map(match =>
                match.id === matchId
                  ? {
                      ...match,
                      result: undefined,
                      winner: undefined,
                      player1Score: 0,
                      player2Score: 0,
                      status: 'pending' as const,
                    }
                  : match
              ),
            }
      ),
    }));
    showSuccess('Result cleared', 'That table is open again');
  };

  const advanceToNextRound = () => {
    if (!selected) return;

    const currentRound = selected.rounds.find(r => r.number === selected.currentRound);
    if (!currentRound || currentRound.status !== 'completed') {
      showError('Round still playing', 'Every table has to report before the next pairing.');
      return;
    }

    if (selected.format === 'single-elimination') {
      const nextRoundNum = selected.currentRound + 1;
      const nextRound = selected.rounds.find(r => r.number === nextRoundNum);

      if (!nextRound) {
        const winner = currentRound.matches[0].winner;
        updateSelected(t => ({ ...t, status: 'completed', winner }));
        showSuccess('Event complete', winner ? `${winner} takes it` : 'Bracket finished');
        return;
      }

      const winners = currentRound.matches.map(m => m.winner ?? 'TBD');
      updateSelected(t => ({
        ...t,
        currentRound: nextRoundNum,
        timer: makeTimer(t.roundLengthMinutes),
        rounds: t.rounds.map(round =>
          round.number !== nextRoundNum
            ? round
            : {
                ...round,
                status: 'in-progress' as const,
                matches: round.matches.map((match, idx) => ({
                  ...match,
                  player1: winners[idx * 2] ?? 'TBD',
                  player2: winners[idx * 2 + 1] ?? 'TBD',
                  status: 'pending' as const,
                })),
              }
        ),
      }));
      showSuccess('Round advanced', `Round ${nextRoundNum} is live`);
      return;
    }

    const activeCount = selected.players.filter(p => !selected.dropped.includes(p)).length;

    if (selected.currentRound >= totalRounds) {
      const winner = standings.find(s => !s.dropped)?.player;
      updateSelected(t => ({ ...t, status: 'completed', winner }));
      setView('standings');
      showSuccess('Event complete', winner ? `${winner} takes it` : 'Final standings locked');
      return;
    }

    if (activeCount < 2) {
      showError('Not enough players', 'At least two players must still be in the event.');
      return;
    }

    const nextRoundNum = selected.currentRound + 1;
    const matches = generatePairings(standings, previousOpponents(selected.rounds), nextRoundNum);

    updateSelected(t => ({
      ...t,
      rounds: [...t.rounds, { number: nextRoundNum, matches, status: 'in-progress' as const }],
      currentRound: nextRoundNum,
      timer: makeTimer(t.roundLengthMinutes),
    }));
    setView('pairings');
    showSuccess('Round advanced', `Round ${nextRoundNum} is live`);
  };

  const toggleDrop = (player: string) => {
    updateSelected(t => ({
      ...t,
      dropped: t.dropped.includes(player)
        ? t.dropped.filter(p => p !== player)
        : [...t.dropped, player],
    }));
  };

  const registerDeck = (player: string, deck: PlayerDeck | null) => {
    updateSelected(t => {
      const nextDecks = { ...t.decks };
      if (deck) nextDecks[player] = deck;
      else delete nextDecks[player];
      return { ...t, decks: nextDecks };
    });
  };

  const addPlayers = (names: string[]) =>
    updateSelected(t => ({
      ...t,
      players: [...t.players, ...names.filter(n => !t.players.includes(n))],
    }));

  const removePlayer = (player: string) =>
    updateSelected(t => {
      const nextDecks = { ...t.decks };
      delete nextDecks[player];
      return {
        ...t,
        players: t.players.filter(p => p !== player),
        dropped: t.dropped.filter(p => p !== player),
        decks: nextDecks,
      };
    });

  const deleteTournament = () => {
    if (!selected) return;
    const updated = tournaments.filter(t => t.id !== selected.id);
    save(updated);
    setSelectedId(updated[0]?.id ?? null);
    showSuccess('Event deleted', selected.name);
  };

  /* ---------------- round clock ---------------- */

  const timerRemaining = selected
    ? selected.timer.running && selected.timer.endsAt
      ? selected.timer.endsAt - now
      : selected.timer.remainingMs
    : 0;

  const startClock = () =>
    updateSelected(t => ({
      ...t,
      timer: { ...t.timer, running: true, endsAt: Date.now() + t.timer.remainingMs },
    }));

  const pauseClock = () =>
    updateSelected(t => ({
      ...t,
      timer: {
        running: false,
        endsAt: null,
        remainingMs: Math.max(0, (t.timer.endsAt ?? Date.now()) - Date.now()),
      },
    }));

  const resetClock = () => updateSelected(t => ({ ...t, timer: makeTimer(t.roundLengthMinutes) }));

  /* ---------------- render ---------------- */

  if (!loaded) return <div className="h-64 rounded-2xl bg-muted/20" aria-hidden="true" />;
  if (!selected) return <EventEmptyState decks={decks} loading={decksLoading} />;

  const currentRoundData = selected.rounds.find(r => r.number === selected.currentRound);
  const roundComplete = currentRoundData?.status === 'completed';
  const showRail = view === 'pairings' && selected.status === 'in-progress';

  return (
    <div className="space-y-4">
      <EventRail tournaments={tournaments} selectedId={selectedKey} onSelect={selectEvent} />

      <EventHeader
        tournament={selected}
        standings={standings}
        totalRounds={totalRounds}
        timerRemaining={timerRemaining}
        onStartClock={startClock}
        onPauseClock={pauseClock}
        onResetClock={resetClock}
        onStart={startTournament}
        onAdvance={advanceToNextRound}
        onDelete={deleteTournament}
        roundComplete={!!roundComplete}
      />

      {selected.status === 'completed' && (
        <Podium
          standings={standings}
          views={views}
          eventName={selected.name}
          gameFormat={selected.gameFormat}
          rounds={selected.rounds.length}
        />
      )}

      {selected.status === 'setup' ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-5">
            <PlayerRoster
              tournament={selected}
              views={views}
              decks={decks}
              decksLoading={decksLoading}
              onRegisterDeck={registerDeck}
              onToggleDrop={toggleDrop}
              onAddPlayers={addPlayers}
              onRemovePlayer={removePlayer}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-muted/30 p-4 text-sm">
            <Fact icon={Users} text={`${selected.players.length} signed in`} />
            <Fact
              icon={ListOrdered}
              text={`${totalRounds} round${totalRounds === 1 ? '' : 's'} scheduled`}
            />
            <Fact
              icon={Layers}
              text={`${selected.players.filter(p => selected.decks[p]).length} decks registered`}
            />
            {selected.format === 'swiss' && selected.players.length % 2 === 1 && (
              <span className="text-xs text-muted-foreground">
                Odd field — one bye is awarded each round.
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          <ViewSwitcher
            view={view}
            onChange={setView}
            showBracket={selected.format === 'single-elimination'}
          />

          <div
            className={cn('grid gap-4', showRail && 'xl:grid-cols-[minmax(0,1fr)_20rem]')}
          >
            <div className="min-w-0">
              {view === 'pairings' && (
                <RoundBoard
                  tournament={selected}
                  totalRounds={totalRounds}
                  views={views}
                  selectedRound={Math.max(1, shownRound)}
                  onSelectRound={setPinnedRound}
                  onRecord={recordMatchResult}
                  onClear={clearMatchResult}
                  onAdvance={advanceToNextRound}
                />
              )}

              {view === 'standings' && (
                <StandingsTable
                  standings={standings}
                  views={views}
                  finished={selected.status === 'completed'}
                />
              )}

              {view === 'players' && (
                <PlayerRoster
                  tournament={selected}
                  views={views}
                  decks={decks}
                  decksLoading={decksLoading}
                  onRegisterDeck={registerDeck}
                  onToggleDrop={toggleDrop}
                />
              )}

              {view === 'bracket' && selected.format === 'single-elimination' && (
                <BracketBoard tournament={selected} views={views} />
              )}
            </div>

            {showRail && (
              <aside className="hidden xl:block">
                <div className="sticky top-4">
                  <StandingsRail
                    standings={standings}
                    views={views}
                    onSeeAll={() => setView('standings')}
                  />
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Fact({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="text-foreground">{text}</span>
    </span>
  );
}

function ViewSwitcher({
  view,
  onChange,
  showBracket,
}: {
  view: View;
  onChange: (view: View) => void;
  showBracket: boolean;
}) {
  const items: Array<{ value: View; label: string; icon: typeof Swords }> = [
    { value: 'pairings', label: 'Pairings', icon: Swords },
    { value: 'standings', label: 'Standings', icon: Medal },
    { value: 'players', label: 'Players', icon: Users },
    ...(showBracket ? [{ value: 'bracket' as View, label: 'Bracket', icon: Trophy }] : []),
  ];

  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted/30 p-1 sm:w-auto sm:self-start">
      {items.map(item => {
        const Icon = item.icon;
        const active = view === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none motion-reduce:transition-none',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
