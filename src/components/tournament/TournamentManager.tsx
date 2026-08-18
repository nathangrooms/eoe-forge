import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  Trophy,
  Users,
  Play,
  Pause,
  Clock,
  CheckCircle,
  Plus,
  Swords,
  Crown,
  ChevronRight,
  Trash2,
  RotateCcw,
  Medal,
  UserMinus,
  Handshake,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  computeStandings,
  generateEliminationBracket,
  generatePairings,
  previousOpponents,
  recommendedSwissRounds,
  type Match,
  type MatchResult,
  type Round,
  type Standing,
  type Tournament,
} from './scoring';
import {
  loadTournaments,
  makeTimer,
  saveTournaments,
} from './storage';

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function TournamentManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const loaded = loadTournaments();
    setTournaments(loaded);
    if (loaded.length === 0) return;

    // /tournament?event=<id> is how the create route hands control back.
    const requested = searchParams.get('event');
    const match = requested ? loaded.find(t => t.id === requested) : null;
    setSelectedId((match ?? loaded[0]).id);

    if (requested) {
      const next = new URLSearchParams(searchParams);
      next.delete('event');
      setSearchParams(next, { replace: true });
    }
    // Reading storage is a mount-time concern; the params dance runs with it.
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
      showError('Failed to save', 'Could not save tournament data');
    }
  }, []);

  const selected = tournaments.find(t => t.id === selectedId) ?? null;

  const updateSelected = useCallback(
    (mutate: (t: Tournament) => Tournament) => {
      if (!selectedId) return;
      save(tournaments.map(t => (t.id === selectedId ? mutate(t) : t)));
    },
    [save, selectedId, tournaments]
  );

  const standings = useMemo(
    () => (selected ? computeStandings(selected.players, selected.rounds, selected.dropped) : []),
    [selected]
  );

  /* ---------------- actions ---------------- */

  const startTournament = () => {
    if (!selected) return;

    const rounds: Round[] =
      selected.format === 'single-elimination'
        ? generateEliminationBracket(selected.players)
        : [
            {
              number: 1,
              matches: generatePairings(
                computeStandings(selected.players, [], selected.dropped),
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
    showSuccess('Tournament started', 'Round 1 pairings generated');
  };

  const recordMatchResult = (
    roundNumber: number,
    matchId: string,
    result: MatchResult,
    p1Score: number,
    p2Score: number
  ) => {
    updateSelected(t => {
      const rounds = t.rounds.map(round => {
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
            : round.status,
        };
      });

      return { ...t, rounds };
    });

    showSuccess('Result recorded', result === 'draw' ? 'Match drawn' : 'Match complete');
  };

  const advanceToNextRound = () => {
    if (!selected) return;

    const currentRound = selected.rounds.find(r => r.number === selected.currentRound);
    if (!currentRound || currentRound.status !== 'completed') {
      showError('Round not complete', 'Finish all matches first');
      return;
    }

    if (selected.format === 'single-elimination') {
      const nextRoundNum = selected.currentRound + 1;
      const nextRound = selected.rounds.find(r => r.number === nextRoundNum);

      if (!nextRound) {
        const winner = currentRound.matches[0].winner;
        updateSelected(t => ({ ...t, status: 'completed', winner }));
        showSuccess('Tournament complete', winner ? `${winner} wins` : 'Bracket finished');
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
      showSuccess('Round advanced', `Round ${nextRoundNum} started`);
      return;
    }

    const activeCount = selected.players.filter(p => !selected.dropped.includes(p)).length;
    const totalRounds = recommendedSwissRounds(selected.players.length);

    if (selected.currentRound >= totalRounds) {
      const winner = standings.find(s => !s.dropped)?.player;
      updateSelected(t => ({ ...t, status: 'completed', winner }));
      showSuccess('Tournament complete', winner ? `${winner} wins` : 'Final standings locked');
      return;
    }

    if (activeCount < 2) {
      showError('Not enough players', 'At least two players must still be in the event');
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
    showSuccess('Round advanced', `Round ${nextRoundNum} started`);
  };

  const toggleDrop = (player: string) => {
    updateSelected(t => ({
      ...t,
      dropped: t.dropped.includes(player)
        ? t.dropped.filter(p => p !== player)
        : [...t.dropped, player],
    }));
  };

  const deleteTournament = (tournamentId: string) => {
    const updated = tournaments.filter(t => t.id !== tournamentId);
    save(updated);
    setSelectedId(updated[0]?.id ?? null);
    showSuccess('Deleted', 'Tournament removed');
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

  const currentRoundData = selected?.rounds.find(r => r.number === selected.currentRound);
  const isRoundComplete = currentRoundData?.status === 'completed';
  const totalSwissRounds = selected ? recommendedSwissRounds(selected.players.length) : 0;

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tournaments.length > 0 && (
          <Select value={selectedId ?? ''} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select tournament" />
            </SelectTrigger>
            <SelectContent>
              {tournaments.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button asChild className="ml-auto">
          <Link to="/tournament/new">
            <Plus className="mr-2 h-4 w-4" />
            New tournament
          </Link>
        </Button>
      </div>

      {/* Empty state */}
      {tournaments.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Trophy className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">No tournaments</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first tournament to get started. Events are stored in this browser only.
            </p>
            <Button asChild>
              <Link to="/tournament/new">
                <Plus className="mr-2 h-4 w-4" />
                Create tournament
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {selected && (
        <div className="space-y-6">
          {/* Tournament header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold text-foreground">{selected.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{selected.gameFormat}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {selected.format.replace('-', ' ')}
                    </Badge>
                    <Badge
                      variant={selected.status === 'in-progress' ? 'secondary' : 'outline'}
                      className="capitalize"
                    >
                      {selected.status === 'setup' && <Clock className="mr-1 h-3 w-3" />}
                      {selected.status === 'in-progress' && <Play className="mr-1 h-3 w-3" />}
                      {selected.status === 'completed' && <CheckCircle className="mr-1 h-3 w-3" />}
                      {selected.status.replace('-', ' ')}
                    </Badge>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {selected.players.length - selected.dropped.length} active
                      {selected.dropped.length > 0 && ` · ${selected.dropped.length} dropped`}
                    </span>
                    {selected.status === 'in-progress' && (
                      <span className="text-muted-foreground">
                        Round {selected.currentRound}
                        {selected.format === 'swiss' && ` of ${totalSwissRounds}`}
                      </span>
                    )}
                  </div>

                  {selected.winner && (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-border p-4">
                      <Crown className="h-6 w-6 text-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Champion</p>
                        <p className="text-xl font-semibold text-foreground">{selected.winner}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {selected.status === 'setup' && (
                    <Button onClick={startTournament}>
                      <Play className="mr-2 h-4 w-4" />
                      Start tournament
                    </Button>
                  )}
                  {selected.status === 'in-progress' && isRoundComplete && (
                    <Button onClick={advanceToNextRound}>
                      Next round
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteTournament(selected.id)}
                    aria-label="Delete tournament"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Round clock */}
              {selected.status === 'in-progress' && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Round clock
                  </span>
                  <span
                    className={cn(
                      'font-mono text-2xl tabular-nums',
                      timerRemaining <= 0 ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {formatClock(timerRemaining)}
                  </span>
                  {timerRemaining <= 0 && (
                    <Badge variant="outline" className="text-destructive">
                      Time called
                    </Badge>
                  )}
                  {selected.timer.running ? (
                    <Button variant="outline" size="sm" onClick={pauseClock}>
                      <Pause className="mr-1 h-3.5 w-3.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={startClock}>
                      <Play className="mr-1 h-3.5 w-3.5" />
                      Start
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={resetClock}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Reset to {selected.roundLengthMinutes}m
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs */}
          {selected.status !== 'setup' && (
            <Tabs defaultValue="matches" className="space-y-4">
              <TabsList>
                <TabsTrigger value="matches" className="gap-2">
                  <Swords className="h-4 w-4" />
                  Matches
                </TabsTrigger>
                <TabsTrigger value="standings" className="gap-2">
                  <Medal className="h-4 w-4" />
                  Standings
                </TabsTrigger>
                <TabsTrigger value="players" className="gap-2">
                  <Users className="h-4 w-4" />
                  Players
                </TabsTrigger>
                {selected.format === 'single-elimination' && (
                  <TabsTrigger value="bracket" className="gap-2">
                    <Trophy className="h-4 w-4" />
                    Bracket
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Matches */}
              <TabsContent value="matches" className="space-y-4">
                {selected.rounds.map(round => (
                  <Card key={round.number}>
                    <CardContent className="p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">Round {round.number}</h3>
                        {round.status === 'completed' && (
                          <Badge variant="outline">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Complete
                          </Badge>
                        )}
                        {round.number === selected.currentRound &&
                          round.status !== 'completed' && <Badge variant="secondary">Current</Badge>}
                      </div>

                      <div className="grid gap-3">
                        {round.matches.map(match => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isActive={
                              round.number === selected.currentRound && match.status !== 'completed'
                            }
                            allowDraw={selected.format === 'swiss'}
                            onRecordResult={(result, p1, p2) =>
                              recordMatchResult(round.number, match.id, result, p1, p2)
                            }
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Standings */}
              <TabsContent value="standings">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 text-left">
                            <th scope="col" className="p-3 font-medium">#</th>
                            <th scope="col" className="p-3 font-medium">Player</th>
                            <th scope="col" className="p-3 text-center font-medium">W–L–D</th>
                            <th scope="col" className="p-3 text-center font-medium">Points</th>
                            <th scope="col" className="p-3 text-center font-medium">OMW%</th>
                            <th scope="col" className="p-3 text-center font-medium">GW%</th>
                            <th scope="col" className="p-3 text-center font-medium">OGW%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((standing, idx) => (
                            <tr
                              key={standing.player}
                              className={cn(
                                'border-b border-border last:border-0',
                                standing.dropped && 'opacity-50'
                              )}
                            >
                              <td className="p-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                              <td className="p-3 font-medium text-foreground">
                                {standing.player}
                                {standing.byes > 0 && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {standing.byes} bye{standing.byes > 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {standing.dropped && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Dropped
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 text-center tabular-nums">
                                {standing.wins}–{standing.losses}–{standing.draws}
                              </td>
                              <td className="p-3 text-center font-semibold tabular-nums">
                                {standing.points}
                              </td>
                              <td className="p-3 text-center tabular-nums text-muted-foreground">
                                {standing.opponentMatchWinPct.toFixed(1)}%
                              </td>
                              <td className="p-3 text-center tabular-nums text-muted-foreground">
                                {standing.gameWinPct.toFixed(1)}%
                              </td>
                              <td className="p-3 text-center tabular-nums text-muted-foreground">
                                {standing.opponentGameWinPct.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="border-t border-border p-3 text-xs text-muted-foreground">
                      Win 3, draw 1, loss 0. Tiebreakers in order: match points, opponents&apos;
                      match-win percentage, own game-win percentage, opponents&apos; game-win
                      percentage. All percentages carry the 33% floor.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Players / drop */}
              <TabsContent value="players">
                <Card>
                  <CardContent className="p-4">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {selected.players.map(player => {
                        const isDropped = selected.dropped.includes(player);
                        return (
                          <div
                            key={player}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg border border-border p-3',
                              isDropped && 'opacity-60'
                            )}
                          >
                            <span className="truncate text-sm text-foreground">{player}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0"
                              onClick={() => toggleDrop(player)}
                            >
                              {isDropped ? (
                                <>
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                  Re-enter
                                </>
                              ) : (
                                <>
                                  <UserMinus className="mr-1 h-3.5 w-3.5" />
                                  Drop
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Dropped players keep their existing record but are excluded from all further
                      pairings.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bracket */}
              {selected.format === 'single-elimination' && (
                <TabsContent value="bracket">
                  <Card>
                    <CardContent className="p-6">
                      <ScrollArea className="w-full">
                        <div className="flex min-w-max gap-8 pb-4">
                          {selected.rounds.map((round, roundIdx) => (
                            <div key={round.number} className="flex flex-col gap-4">
                              <h4 className="text-center text-sm font-medium text-muted-foreground">
                                Round {round.number}
                              </h4>
                              <div
                                className="flex flex-col justify-around"
                                style={{
                                  gap: `${Math.pow(2, roundIdx) * 2}rem`,
                                  marginTop: `${Math.pow(2, roundIdx) - 1}rem`,
                                }}
                              >
                                {round.matches.map(match => (
                                  <div
                                    key={match.id}
                                    className={cn(
                                      'w-48 space-y-2 rounded-lg border border-border p-3',
                                      !match.winner &&
                                        round.number === selected.currentRound &&
                                        'ring-2 ring-ring'
                                    )}
                                  >
                                    {[
                                      { name: match.player1, score: match.player1Score },
                                      { name: match.player2, score: match.player2Score },
                                    ].map((side, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          'flex items-center justify-between gap-2 rounded p-2',
                                          match.winner === side.name && 'bg-accent'
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            'flex-1 truncate text-sm text-foreground',
                                            match.winner === side.name && 'font-semibold'
                                          )}
                                        >
                                          {side.name}
                                        </span>
                                        <span className="font-mono text-sm tabular-nums">
                                          {side.score}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          )}

          {/* Setup state */}
          {selected.status === 'setup' && (
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Players ({selected.players.length})
                </h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {selected.players.map(player => (
                    <div
                      key={player}
                      className="truncate rounded-lg border border-border p-3 text-sm text-foreground"
                    >
                      {player}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Match card
 * ------------------------------------------------------------------ */

function MatchCard({
  match,
  isActive,
  allowDraw,
  onRecordResult,
}: {
  match: Match;
  isActive: boolean;
  allowDraw: boolean;
  onRecordResult: (result: MatchResult, p1Score: number, p2Score: number) => void;
}) {
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [showScoreEntry, setShowScoreEntry] = useState(false);

  if (match.player2 === 'BYE') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{match.player1}</span>
          <Badge variant="outline">Bye</Badge>
        </div>
        <span className="text-sm text-muted-foreground">Awarded 2–0</span>
      </div>
    );
  }

  if (match.status === 'completed') {
    const isDraw = match.result === 'draw';

    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          {[
            { name: match.player1, score: match.player1Score, won: match.result === 'p1' },
            { name: match.player2, score: match.player2Score, won: match.result === 'p2' },
          ].map((side, i) => (
            <div
              key={i}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-lg p-3',
                side.won ? 'bg-accent' : 'bg-muted/50',
                i === 1 && 'flex-row-reverse'
              )}
            >
              {side.won && <Crown className="h-4 w-4 shrink-0 text-foreground" />}
              <span className={cn('truncate text-foreground', side.won && 'font-semibold')}>
                {side.name}
              </span>
              <Badge
                variant="outline"
                className={cn('tabular-nums', i === 0 ? 'ml-auto' : 'mr-auto')}
              >
                {side.score}
              </Badge>
            </div>
          ))}
        </div>
        {isDraw && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Drawn — 1 match point each
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border',
        isActive ? 'ring-2 ring-ring' : 'opacity-60'
      )}
    >
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1">
            <p className="mb-2 truncate font-medium text-foreground">{match.player1}</p>
            {isActive && !showScoreEntry && (
              <Button className="w-full" onClick={() => onRecordResult('p1', 2, 0)}>
                <Crown className="mr-2 h-4 w-4" />
                {match.player1} wins
              </Button>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <Swords className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">vs</span>
          </div>

          <div className="flex-1">
            <p className="mb-2 truncate font-medium text-foreground sm:text-right">
              {match.player2}
            </p>
            {isActive && !showScoreEntry && (
              <Button className="w-full" onClick={() => onRecordResult('p2', 0, 2)}>
                <Crown className="mr-2 h-4 w-4" />
                {match.player2} wins
              </Button>
            )}
          </div>
        </div>

        {/* A 1-1 time-limit or intentional draw is legal and common; the old UI
            disabled submission on equal scores and said "Matches cannot end in
            a tie". */}
        {isActive && !showScoreEntry && allowDraw && (
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => onRecordResult('draw', 1, 1)}
          >
            <Handshake className="mr-2 h-4 w-4" />
            Draw
          </Button>
        )}
      </div>

      {isActive && (
        <div className="border-t border-border bg-muted/30 p-3">
          {!showScoreEntry ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowScoreEntry(true)}
            >
              Enter exact game scores instead
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs text-muted-foreground">Games won by each player</p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {[
                  { name: match.player1, value: p1Score, set: setP1Score },
                  { name: match.player2, value: p2Score, set: setP2Score },
                ].map((side, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="max-w-[80px] truncate text-sm font-medium text-foreground">
                      {side.name}
                    </span>
                    <div className="flex items-center rounded-lg border border-border bg-background">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 rounded-r-none p-0"
                        onClick={() => side.set(Math.max(0, side.value - 1))}
                        aria-label={`Decrease ${side.name} score`}
                      >
                        −
                      </Button>
                      <span className="w-10 text-center font-mono text-lg font-semibold tabular-nums">
                        {side.value}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 rounded-l-none p-0"
                        onClick={() => side.set(side.value + 1)}
                        aria-label={`Increase ${side.name} score`}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowScoreEntry(false);
                    setP1Score(0);
                    setP2Score(0);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={p1Score === p2Score && !allowDraw}
                  onClick={() => {
                    const result: MatchResult =
                      p1Score > p2Score ? 'p1' : p2Score > p1Score ? 'p2' : 'draw';
                    onRecordResult(result, p1Score, p2Score);
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Submit result
                </Button>
              </div>

              {p1Score === p2Score && (
                <p className="text-center text-xs text-muted-foreground">
                  {allowDraw
                    ? 'Equal scores submit as a draw — 1 match point each.'
                    : 'A bracket match needs a winner to advance.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
