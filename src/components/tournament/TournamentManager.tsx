import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { 
  Trophy, 
  Users, 
  Play, 
  Clock, 
  CheckCircle, 
  Plus, 
  Swords, 
  Crown,
  ChevronRight,
  Trash2,
  RotateCcw,
  Medal
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tournament {
  id: string;
  name: string;
  format: 'single-elimination' | 'swiss' | 'round-robin';
  status: 'setup' | 'in-progress' | 'completed';
  players: string[];
  rounds: Round[];
  standings: Standing[];
  currentRound: number;
  createdAt: string;
  winner?: string;
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
  player1Score: number;
  player2Score: number;
  winner?: string;
  status: 'pending' | 'in-progress' | 'completed';
}

interface Standing {
  player: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  matchWinPct: number;
  gameWinPct: number;
}

export function TournamentManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
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
        const loaded: Tournament[] = JSON.parse(saved);
        // Migrate old tournament data to include new fields
        const migrated = loaded.map(t => ({
          ...t,
          currentRound: t.currentRound ?? 0,
          standings: t.standings.map(s => ({
            ...s,
            matchWinPct: s.matchWinPct ?? 0,
            gameWinPct: s.gameWinPct ?? 0,
          })),
        }));
        setTournaments(migrated);
        if (migrated.length > 0 && !selectedTournament) {
          setSelectedTournament(migrated[0]);
        }
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

  const calculateSwissRounds = (playerCount: number): number => {
    return Math.ceil(Math.log2(playerCount));
  };

  const generatePairings = (players: string[], standings: Standing[]): Match[] => {
    // Sort by points, then by match win percentage
    const sorted = [...standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.matchWinPct - a.matchWinPct;
    });
    
    const matches: Match[] = [];
    const paired = new Set<string>();
    
    for (let i = 0; i < sorted.length; i++) {
      if (paired.has(sorted[i].player)) continue;
      
      for (let j = i + 1; j < sorted.length; j++) {
        if (paired.has(sorted[j].player)) continue;
        
        matches.push({
          id: `m${Date.now()}-${i}-${j}`,
          player1: sorted[i].player,
          player2: sorted[j].player,
          player1Score: 0,
          player2Score: 0,
          status: 'pending',
        });
        
        paired.add(sorted[i].player);
        paired.add(sorted[j].player);
        break;
      }
    }
    
    // Handle bye for odd number of players
    const unpaired = sorted.filter(s => !paired.has(s.player));
    if (unpaired.length === 1) {
      matches.push({
        id: `m${Date.now()}-bye`,
        player1: unpaired[0].player,
        player2: 'BYE',
        player1Score: 2,
        player2Score: 0,
        winner: unpaired[0].player,
        status: 'completed',
      });
    }
    
    return matches;
  };

  const generateEliminationBracket = (players: string[]): Round[] => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    // Pad to nearest power of 2
    const size = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
    while (shuffled.length < size) {
      shuffled.push('BYE');
    }
    
    const rounds: Round[] = [];
    let currentPlayers = shuffled;
    let roundNum = 1;
    
    while (currentPlayers.length > 1) {
      const matches: Match[] = [];
      
      for (let i = 0; i < currentPlayers.length; i += 2) {
        const match: Match = {
          id: `r${roundNum}-m${i / 2}`,
          player1: currentPlayers[i],
          player2: currentPlayers[i + 1],
          player1Score: 0,
          player2Score: 0,
          status: roundNum === 1 ? 'pending' : 'pending',
        };
        
        // Auto-win for BYEs
        if (match.player2 === 'BYE') {
          match.winner = match.player1;
          match.player1Score = 2;
          match.status = 'completed';
        } else if (match.player1 === 'BYE') {
          match.winner = match.player2;
          match.player2Score = 2;
          match.status = 'completed';
        }
        
        matches.push(match);
      }
      
      rounds.push({
        number: roundNum,
        matches,
        status: roundNum === 1 ? 'in-progress' : 'pending',
      });
      
      // Prepare next round (initially empty, will be filled with winners)
      currentPlayers = matches.map(m => m.winner || 'TBD');
      roundNum++;
    }
    
    return rounds;
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
      currentRound: 0,
      standings: playerList.map(player => ({
        player,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        matchWinPct: 0,
        gameWinPct: 0,
      })),
      createdAt: new Date().toISOString(),
    };

    const updated = [tournament, ...tournaments];
    saveTournaments(updated);
    setSelectedTournament(tournament);
    showSuccess('Tournament created', newTournament.name);
    setDialogOpen(false);
    setNewTournament({ name: '', format: 'swiss', players: '' });
  };

  const startTournament = (tournamentId: string) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    let rounds: Round[];
    
    if (tournament.format === 'single-elimination') {
      rounds = generateEliminationBracket(tournament.players);
    } else {
      // Swiss/Round-Robin: generate first round
      const matches = generatePairings(tournament.players, tournament.standings);
      rounds = [{
        number: 1,
        matches,
        status: 'in-progress',
      }];
    }

    const updated = tournaments.map(t =>
      t.id === tournamentId
        ? { ...t, status: 'in-progress' as const, rounds, currentRound: 1 }
        : t
    );

    saveTournaments(updated);
    setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
    showSuccess('Tournament started', 'First round pairings generated');
  };

  const recordMatchResult = (
    tournamentId: string, 
    roundNumber: number, 
    matchId: string, 
    winner: string,
    player1Score: number,
    player2Score: number
  ) => {
    const updated = tournaments.map(tournament => {
      if (tournament.id !== tournamentId) return tournament;

      const updatedRounds = tournament.rounds.map(round => {
        if (round.number !== roundNumber) return round;

        const updatedMatches = round.matches.map(match =>
          match.id === matchId 
            ? { ...match, winner, player1Score, player2Score, status: 'completed' as const } 
            : match
        );

        const allCompleted = updatedMatches.every(m => m.status === 'completed');

        return {
          ...round,
          matches: updatedMatches,
          status: allCompleted ? ('completed' as const) : round.status,
        };
      });

      // Update standings
      const updatedStandings = tournament.standings.map(standing => {
        const playerMatches = updatedRounds.flatMap(r => r.matches).filter(
          m => (m.player1 === standing.player || m.player2 === standing.player) && m.player2 !== 'BYE'
        );
        
        const completedMatches = playerMatches.filter(m => m.status === 'completed');

        const wins = completedMatches.filter(m => m.winner === standing.player).length;
        const losses = completedMatches.filter(
          m => m.winner && m.winner !== standing.player
        ).length;
        
        const totalGamesWon = completedMatches.reduce((sum, m) => {
          if (m.player1 === standing.player) return sum + m.player1Score;
          return sum + m.player2Score;
        }, 0);
        
        const totalGamesPlayed = completedMatches.reduce((sum, m) => 
          sum + m.player1Score + m.player2Score, 0
        );

        // Add bye wins
        const byeMatches = updatedRounds.flatMap(r => r.matches).filter(
          m => m.player1 === standing.player && m.player2 === 'BYE'
        );

        return {
          ...standing,
          wins: wins + byeMatches.length,
          losses,
          points: (wins + byeMatches.length) * 3,
          matchWinPct: completedMatches.length > 0 ? (wins / completedMatches.length) * 100 : 0,
          gameWinPct: totalGamesPlayed > 0 ? (totalGamesWon / totalGamesPlayed) * 100 : 0,
        };
      });

      return {
        ...tournament,
        rounds: updatedRounds,
        standings: updatedStandings.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.matchWinPct !== a.matchWinPct) return b.matchWinPct - a.matchWinPct;
          return b.gameWinPct - a.gameWinPct;
        }),
      };
    });

    saveTournaments(updated);
    setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
    showSuccess('Result recorded', 'Match complete');
  };

  const advanceToNextRound = (tournamentId: string) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    const currentRound = tournament.rounds.find(r => r.number === tournament.currentRound);
    if (!currentRound || currentRound.status !== 'completed') {
      showError('Round not complete', 'Finish all matches first');
      return;
    }

    if (tournament.format === 'single-elimination') {
      // Advance winners to next round
      const nextRoundNum = tournament.currentRound + 1;
      const nextRound = tournament.rounds.find(r => r.number === nextRoundNum);
      
      if (!nextRound) {
        // Tournament complete
        const winner = currentRound.matches[0].winner;
        const updated = tournaments.map(t =>
          t.id === tournamentId
            ? { ...t, status: 'completed' as const, winner }
            : t
        );
        saveTournaments(updated);
        setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
        showSuccess('Tournament Complete!', `${winner} wins!`);
        return;
      }

      // Fill in winners for next round
      const winners = currentRound.matches.map(m => m.winner!);
      const updatedRounds = tournament.rounds.map(round => {
        if (round.number !== nextRoundNum) return round;
        
        const updatedMatches = round.matches.map((match, idx) => ({
          ...match,
          player1: winners[idx * 2] || 'TBD',
          player2: winners[idx * 2 + 1] || 'TBD',
          status: 'pending' as const,
        }));

        return {
          ...round,
          matches: updatedMatches,
          status: 'in-progress' as const,
        };
      });

      const updated = tournaments.map(t =>
        t.id === tournamentId
          ? { ...t, rounds: updatedRounds, currentRound: nextRoundNum }
          : t
      );

      saveTournaments(updated);
      setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
      showSuccess('Round advanced', `Round ${nextRoundNum} started`);
    } else {
      // Swiss: generate next round pairings
      const totalRounds = calculateSwissRounds(tournament.players.length);
      
      if (tournament.currentRound >= totalRounds) {
        const winner = tournament.standings[0].player;
        const updated = tournaments.map(t =>
          t.id === tournamentId
            ? { ...t, status: 'completed' as const, winner }
            : t
        );
        saveTournaments(updated);
        setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
        showSuccess('Tournament Complete!', `${winner} wins!`);
        return;
      }

      const nextRoundNum = tournament.currentRound + 1;
      const matches = generatePairings(tournament.players, tournament.standings);
      
      const newRound: Round = {
        number: nextRoundNum,
        matches,
        status: 'in-progress',
      };

      const updated = tournaments.map(t =>
        t.id === tournamentId
          ? { ...t, rounds: [...t.rounds, newRound], currentRound: nextRoundNum }
          : t
      );

      saveTournaments(updated);
      setSelectedTournament(updated.find(t => t.id === tournamentId) || null);
      showSuccess('Round advanced', `Round ${nextRoundNum} started`);
    }
  };

  const deleteTournament = (tournamentId: string) => {
    const updated = tournaments.filter(t => t.id !== tournamentId);
    saveTournaments(updated);
    setSelectedTournament(updated[0] || null);
    showSuccess('Deleted', 'Tournament removed');
  };

  const getRoundName = (roundNum: number, totalRounds: number): string => {
    const remaining = totalRounds - roundNum;
    if (remaining === 0) return 'Finals';
    if (remaining === 1) return 'Semifinals';
    if (remaining === 2) return 'Quarterfinals';
    return `Round ${roundNum}`;
  };

  const currentRoundData = selectedTournament?.rounds.find(
    r => r.number === selectedTournament.currentRound
  );

  const isRoundComplete = currentRoundData?.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Tournament List Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tournaments.length > 0 && (
            <Select 
              value={selectedTournament?.id || ''} 
              onValueChange={(id) => setSelectedTournament(tournaments.find(t => t.id === id) || null)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select tournament" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      {t.name}
                      {t.status === 'completed' && <Crown className="h-3 w-3 text-yellow-500" />}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Tournament
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Create Tournament
              </DialogTitle>
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
                    <SelectItem value="swiss">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Swiss (Recommended)
                      </div>
                    </SelectItem>
                    <SelectItem value="single-elimination">
                      <div className="flex items-center gap-2">
                        <Swords className="h-4 w-4" />
                        Single Elimination
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newTournament.format === 'swiss' 
                    ? 'Players compete in multiple rounds, paired by similar records'
                    : 'Win or go home - traditional bracket style'
                  }
                </p>
              </div>
              <div className="space-y-2">
                <Label>Players (one per line)</Label>
                <textarea
                  className="w-full min-h-[150px] p-3 rounded-md border bg-background text-sm resize-none"
                  value={newTournament.players}
                  onChange={(e) => setNewTournament({ ...newTournament, players: e.target.value })}
                  placeholder="Alice&#10;Bob&#10;Charlie&#10;Diana..."
                />
                <p className="text-xs text-muted-foreground">
                  {newTournament.players.split('\n').filter(p => p.trim()).length} players entered
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTournament}>
                <Trophy className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty State */}
      {tournaments.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Tournaments</h3>
            <p className="text-muted-foreground mb-4">
              Create your first tournament to get started
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Tournament
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Selected Tournament View */}
      {selectedTournament && (
        <div className="space-y-6">
          {/* Tournament Header */}
          <Card className="overflow-hidden">
            <div className={cn(
              "p-6",
              selectedTournament.status === 'completed' 
                ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/20" 
                : "bg-gradient-to-r from-primary/10 to-primary/5"
            )}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold">{selectedTournament.name}</h2>
                    {selectedTournament.status === 'completed' && (
                      <Crown className="h-6 w-6 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="capitalize">
                      {selectedTournament.format.replace('-', ' ')}
                    </Badge>
                    <Badge variant={
                      selectedTournament.status === 'completed' ? 'default' :
                      selectedTournament.status === 'in-progress' ? 'secondary' : 'outline'
                    }>
                      {selectedTournament.status === 'setup' && <Clock className="h-3 w-3 mr-1" />}
                      {selectedTournament.status === 'in-progress' && <Play className="h-3 w-3 mr-1" />}
                      {selectedTournament.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {selectedTournament.status}
                    </Badge>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {selectedTournament.players.length} players
                    </span>
                    {selectedTournament.status === 'in-progress' && (
                      <span className="text-muted-foreground">
                        Round {selectedTournament.currentRound}
                        {selectedTournament.format === 'swiss' && 
                          ` / ${calculateSwissRounds(selectedTournament.players.length)}`
                        }
                      </span>
                    )}
                  </div>
                  
                  {selectedTournament.winner && (
                    <div className="mt-4 p-4 rounded-lg bg-yellow-500/20 border border-yellow-500/30">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center">
                          <Crown className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Champion</p>
                          <p className="text-xl font-bold">{selectedTournament.winner}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {selectedTournament.status === 'setup' && (
                    <Button onClick={() => startTournament(selectedTournament.id)}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Tournament
                    </Button>
                  )}
                  {selectedTournament.status === 'in-progress' && isRoundComplete && (
                    <Button onClick={() => advanceToNextRound(selectedTournament.id)}>
                      Next Round
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => deleteTournament(selectedTournament.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Tournament Content */}
          {selectedTournament.status !== 'setup' && (
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
                {selectedTournament.format === 'single-elimination' && (
                  <TabsTrigger value="bracket" className="gap-2">
                    <Trophy className="h-4 w-4" />
                    Bracket
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Matches Tab */}
              <TabsContent value="matches" className="space-y-4">
                {selectedTournament.rounds.map(round => (
                  <Card key={round.number}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          {selectedTournament.format === 'single-elimination'
                            ? getRoundName(round.number, selectedTournament.rounds.length)
                            : `Round ${round.number}`
                          }
                          {round.status === 'completed' && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {round.number === selectedTournament.currentRound && round.status !== 'completed' && (
                            <Badge variant="secondary" className="ml-2">Current</Badge>
                          )}
                        </h3>
                      </div>
                      
                      <div className="grid gap-3">
                        {round.matches.map(match => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isActive={round.number === selectedTournament.currentRound && !match.winner}
                            onRecordResult={(winner, p1Score, p2Score) => 
                              recordMatchResult(selectedTournament.id, round.number, match.id, winner, p1Score, p2Score)
                            }
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Standings Tab */}
              <TabsContent value="standings">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-4 font-medium">Rank</th>
                            <th className="text-left p-4 font-medium">Player</th>
                            <th className="text-center p-4 font-medium">Record</th>
                            <th className="text-center p-4 font-medium">Points</th>
                            <th className="text-center p-4 font-medium">Match %</th>
                            <th className="text-center p-4 font-medium">Game %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTournament.standings.map((standing, idx) => (
                            <tr 
                              key={standing.player} 
                              className={cn(
                                "border-b transition-colors",
                                idx === 0 && selectedTournament.status === 'completed' && "bg-yellow-500/10",
                                idx < 3 && "font-medium"
                              )}
                            >
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {idx === 0 && <span className="text-yellow-500">🥇</span>}
                                  {idx === 1 && <span className="text-gray-400">🥈</span>}
                                  {idx === 2 && <span className="text-amber-600">🥉</span>}
                                  {idx > 2 && <span className="text-muted-foreground">{idx + 1}</span>}
                                </div>
                              </td>
                              <td className="p-4">{standing.player}</td>
                              <td className="text-center p-4">
                                <span className="text-green-500">{standing.wins}</span>
                                -
                                <span className="text-red-500">{standing.losses}</span>
                                {standing.draws > 0 && <>-<span>{standing.draws}</span></>}
                              </td>
                              <td className="text-center p-4 font-bold">{standing.points}</td>
                              <td className="text-center p-4 text-muted-foreground">
                                {(standing.matchWinPct ?? 0).toFixed(1)}%
                              </td>
                              <td className="text-center p-4 text-muted-foreground">
                                {(standing.gameWinPct ?? 0).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bracket Tab (Single Elimination Only) */}
              {selectedTournament.format === 'single-elimination' && (
                <TabsContent value="bracket">
                  <Card>
                    <CardContent className="p-6">
                      <ScrollArea className="w-full">
                        <div className="flex gap-8 min-w-max pb-4">
                          {selectedTournament.rounds.map((round, roundIdx) => (
                            <div key={round.number} className="flex flex-col gap-4">
                              <h4 className="text-sm font-medium text-center text-muted-foreground">
                                {getRoundName(round.number, selectedTournament.rounds.length)}
                              </h4>
                              <div 
                                className="flex flex-col justify-around"
                                style={{ 
                                  gap: `${Math.pow(2, roundIdx) * 2}rem`,
                                  marginTop: `${Math.pow(2, roundIdx) - 1}rem`
                                }}
                              >
                                {round.matches.map(match => (
                                  <div 
                                    key={match.id}
                                    className={cn(
                                      "w-48 rounded-lg border p-3 space-y-2 transition-all",
                                      match.winner && "bg-muted/50",
                                      !match.winner && round.number === selectedTournament.currentRound && "ring-2 ring-primary"
                                    )}
                                  >
                                    <div className={cn(
                                      "flex items-center justify-between p-2 rounded",
                                      match.winner === match.player1 && "bg-green-500/20"
                                    )}>
                                      <span className={cn(
                                        "text-sm truncate flex-1",
                                        match.winner === match.player1 && "font-bold"
                                      )}>
                                        {match.player1}
                                      </span>
                                      <span className="font-mono text-sm">{match.player1Score}</span>
                                    </div>
                                    <div className={cn(
                                      "flex items-center justify-between p-2 rounded",
                                      match.winner === match.player2 && "bg-green-500/20"
                                    )}>
                                      <span className={cn(
                                        "text-sm truncate flex-1",
                                        match.winner === match.player2 && "font-bold"
                                      )}>
                                        {match.player2}
                                      </span>
                                      <span className="font-mono text-sm">{match.player2Score}</span>
                                    </div>
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

          {/* Setup State - Player List */}
          {selectedTournament.status === 'setup' && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Players ({selectedTournament.players.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {selectedTournament.players.map((player, idx) => (
                    <div key={idx} className="p-3 rounded-lg border bg-muted/30 text-sm">
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

// Match Card Component
function MatchCard({ 
  match, 
  isActive, 
  onRecordResult 
}: { 
  match: Match; 
  isActive: boolean;
  onRecordResult: (winner: string, p1Score: number, p2Score: number) => void;
}) {
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);

  if (match.player2 === 'BYE') {
    return (
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium">{match.player1}</span>
            <Badge variant="outline">BYE</Badge>
          </div>
          <CheckCircle className="h-5 w-5 text-green-500" />
        </div>
      </div>
    );
  }

  if (match.winner) {
    return (
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className={cn(
              "flex items-center gap-2",
              match.winner === match.player1 && "font-bold text-green-500"
            )}>
              {match.winner === match.player1 && <Crown className="h-4 w-4" />}
              <span>{match.player1}</span>
              <Badge variant="outline">{match.player1Score}</Badge>
            </div>
            <span className="text-muted-foreground">vs</span>
            <div className={cn(
              "flex items-center gap-2",
              match.winner === match.player2 && "font-bold text-green-500"
            )}>
              {match.winner === match.player2 && <Crown className="h-4 w-4" />}
              <span>{match.player2}</span>
              <Badge variant="outline">{match.player2Score}</Badge>
            </div>
          </div>
          <CheckCircle className="h-5 w-5 text-green-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-lg border transition-all",
      isActive ? "ring-2 ring-primary bg-primary/5" : "bg-muted/30"
    )}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <span className="font-medium">{match.player1}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={p1Score > 0 ? "default" : "outline"}
              className="w-8 h-8 p-0"
              onClick={() => setP1Score(Math.max(0, p1Score - 1))}
              disabled={!isActive}
            >
              -
            </Button>
            <span className="w-8 text-center font-mono text-lg">{p1Score}</span>
            <Button
              size="sm"
              variant={p1Score > 0 ? "default" : "outline"}
              className="w-8 h-8 p-0"
              onClick={() => setP1Score(p1Score + 1)}
              disabled={!isActive}
            >
              +
            </Button>
          </div>
        </div>

        <Swords className="h-5 w-5 text-muted-foreground hidden md:block" />

        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={p2Score > 0 ? "default" : "outline"}
              className="w-8 h-8 p-0"
              onClick={() => setP2Score(Math.max(0, p2Score - 1))}
              disabled={!isActive}
            >
              -
            </Button>
            <span className="w-8 text-center font-mono text-lg">{p2Score}</span>
            <Button
              size="sm"
              variant={p2Score > 0 ? "default" : "outline"}
              className="w-8 h-8 p-0"
              onClick={() => setP2Score(p2Score + 1)}
              disabled={!isActive}
            >
              +
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end md:justify-start">
            <span className="font-medium">{match.player2}</span>
          </div>
        </div>

        {isActive && (p1Score > 0 || p2Score > 0) && (
          <Button 
            size="sm"
            onClick={() => {
              const winner = p1Score > p2Score ? match.player1 : match.player2;
              onRecordResult(winner, p1Score, p2Score);
            }}
            disabled={p1Score === p2Score}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Submit
          </Button>
        )}
      </div>
      {isActive && p1Score === p2Score && p1Score > 0 && (
        <p className="text-xs text-amber-500 mt-2">Matches cannot end in a tie. Adjust scores.</p>
      )}
    </div>
  );
}
