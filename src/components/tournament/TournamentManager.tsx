import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Trophy, Users, Play, Clock, CheckCircle } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  format: 'single-elimination' | 'swiss' | 'round-robin';
  status: 'setup' | 'in-progress' | 'completed';
  players: string[];
  rounds: Round[];
  standings: Standing[];
  createdAt: string;
}

interface Round {
  number: number;
  matches: Match[];
  status: 'pending' | 'in-progress' | 'completed';
}

interface Match {
  id: string;
  player1: string;
  player2: string;
  winner?: string;
  score?: string;
}

interface Standing {
  player: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export function TournamentManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: '',
    format: 'swiss' as Tournament['format'],
    players: '',
  });

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = () => {
    try {
      const saved = localStorage.getItem('tournaments');
      if (saved) {
        setTournaments(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load tournaments:', error);
    }
  };

  const saveTournaments = (updated: Tournament[]) => {
    try {
      localStorage.setItem('tournaments', JSON.stringify(updated));
      setTournaments(updated);
    } catch (error) {
      showError('Failed to save', 'Could not save tournament data');
    }
  };

  const handleCreateTournament = () => {
    if (!newTournament.name.trim()) {
      showError('Name required', 'Please enter a tournament name');
      return;
    }

    const playerList = newTournament.players
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (playerList.length < 2) {
      showError('Not enough players', 'Need at least 2 players');
      return;
    }

    const tournament: Tournament = {
      id: Date.now().toString(),
      name: newTournament.name,
      format: newTournament.format,
      status: 'setup',
      players: playerList,
      rounds: [],
      standings: playerList.map(player => ({
        player,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
      })),
      createdAt: new Date().toISOString(),
    };

    const updated = [tournament, ...tournaments];
    saveTournaments(updated);
    showSuccess('Tournament created', newTournament.name);
    setDialogOpen(false);
    setNewTournament({ name: '', format: 'swiss', players: '' });
  };

  const startTournament = (tournamentId: string) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    // Generate first round pairings
    const shuffled = [...tournament.players].sort(() => Math.random() - 0.5);
    const matches: Match[] = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        matches.push({
          id: `${tournamentId}-r1-m${i / 2}`,
          player1: shuffled[i],
          player2: shuffled[i + 1],
        });
      }
    }

    const firstRound: Round = {
      number: 1,
      matches,
      status: 'in-progress',
    };

    const updated = tournaments.map(t =>
      t.id === tournamentId
        ? { ...t, status: 'in-progress' as const, rounds: [firstRound] }
        : t
    );

    saveTournaments(updated);
    showSuccess('Tournament started', 'First round pairings generated');
  };

  const recordMatchResult = (tournamentId: string, roundNumber: number, matchId: string, winner: string) => {
    const updated = tournaments.map(tournament => {
      if (tournament.id !== tournamentId) return tournament;

      const updatedRounds = tournament.rounds.map(round => {
        if (round.number !== roundNumber) return round;

        const updatedMatches = round.matches.map(match =>
          match.id === matchId ? { ...match, winner } : match
        );

        const allCompleted = updatedMatches.every(m => m.winner);

        return {
          ...round,
          matches: updatedMatches,
          status: allCompleted ? ('completed' as const) : round.status,
        };
      });

      // Update standings
      const updatedStandings = tournament.standings.map(standing => {
        const playerMatches = updatedRounds.flatMap(r => r.matches).filter(
          m => m.player1 === standing.player || m.player2 === standing.player
        );

        const wins = playerMatches.filter(m => m.winner === standing.player).length;
        const losses = playerMatches.filter(
          m => m.winner && m.winner !== standing.player
        ).length;

        return {
          ...standing,
          wins,
          losses,
          points: wins * 3,
        };
      });

      return {
        ...tournament,
        rounds: updatedRounds,
        standings: updatedStandings.sort((a, b) => b.points - a.points),
      };
    });

    saveTournaments(updated);
    showSuccess('Result recorded', 'Standings updated');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Tournament Manager
              </CardTitle>
              <CardDescription>Organize and track Magic tournaments</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create Tournament</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Tournament</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tournament Name</Label>
                    <Input
                      value={newTournament.name}
                      onChange={(e) => setNewTournament({ ...newTournament, name: e.target.value })}
                      placeholder="Friday Night Magic"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select
                      value={newTournament.format}
                      onValueChange={(value: any) => setNewTournament({ ...newTournament, format: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="swiss">Swiss</SelectItem>
                        <SelectItem value="single-elimination">Single Elimination</SelectItem>
                        <SelectItem value="round-robin">Round Robin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Players (one per line)</Label>
                    <textarea
                      className="w-full min-h-[150px] p-2 rounded-md border bg-background"
                      value={newTournament.players}
                      onChange={(e) => setNewTournament({ ...newTournament, players: e.target.value })}
                      placeholder="Player 1&#10;Player 2&#10;Player 3&#10;..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateTournament}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {tournaments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">No tournaments yet</p>
              <p className="text-sm">Create your first tournament to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tournaments.map((tournament) => (
                <div key={tournament.id} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{tournament.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="capitalize">
                          {tournament.format.replace('-', ' ')}
                        </Badge>
                        <Badge variant={
                          tournament.status === 'completed' ? 'default' :
                          tournament.status === 'in-progress' ? 'secondary' : 'outline'
                        }>
                          {tournament.status === 'setup' && <Clock className="h-3 w-3 mr-1" />}
                          {tournament.status === 'in-progress' && <Play className="h-3 w-3 mr-1" />}
                          {tournament.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {tournament.status.replace('-', ' ')}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          <Users className="h-3 w-3 inline mr-1" />
                          {tournament.players.length} players
                        </span>
                      </div>
                    </div>
                    {tournament.status === 'setup' && (
                      <Button size="sm" onClick={() => startTournament(tournament.id)}>
                        Start Tournament
                      </Button>
                    )}
                  </div>

                  {tournament.status !== 'setup' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Current Round */}
                      {tournament.rounds.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">
                            Round {tournament.rounds[tournament.rounds.length - 1].number}
                          </h4>
                          <div className="space-y-2">
                            {tournament.rounds[tournament.rounds.length - 1].matches.map((match) => (
                              <div key={match.id} className="p-3 rounded border bg-muted/50 text-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className={match.winner === match.player1 ? 'font-bold' : ''}>
                                      {match.player1}
                                    </div>
                                    <div className={match.winner === match.player2 ? 'font-bold' : ''}>
                                      {match.player2}
                                    </div>
                                  </div>
                                  {!match.winner && (
                                    <div className="flex flex-col gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          recordMatchResult(
                                            tournament.id,
                                            tournament.rounds[tournament.rounds.length - 1].number,
                                            match.id,
                                            match.player1
                                          )
                                        }
                                      >
                                        W
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          recordMatchResult(
                                            tournament.id,
                                            tournament.rounds[tournament.rounds.length - 1].number,
                                            match.id,
                                            match.player2
                                          )
                                        }
                                      >
                                        W
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Standings */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Standings</h4>
                        <div className="space-y-1">
                          {tournament.standings.map((standing, idx) => (
                            <div key={standing.player} className="flex items-center justify-between p-2 rounded border bg-muted/30 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold w-6">{idx + 1}.</span>
                                <span>{standing.player}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {standing.wins}-{standing.losses}-{standing.draws} ({standing.points} pts)
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
