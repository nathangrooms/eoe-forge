import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Target, TrendingUp, Calendar, Plus, Trash2 } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface DeckMatch {
  id: string;
  opponent_deck_name?: string;
  opponent_commander?: string;
  result: 'win' | 'loss' | 'draw';
  notes?: string;
  played_at: string;
}

interface PerformanceStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

interface DeckPerformanceTrackerProps {
  deckId: string;
  deckName: string;
}

export function DeckPerformanceTracker({ deckId, deckName }: DeckPerformanceTrackerProps) {
  const [matches, setMatches] = useState<DeckMatch[]>([]);
  const [stats, setStats] = useState<PerformanceStats>({
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  const [formData, setFormData] = useState({
    opponentDeck: '',
    opponentCommander: '',
    result: 'win' as 'win' | 'loss' | 'draw',
    notes: '',
    playedAt: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadMatches();
  }, [deckId]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deck_matches')
        .select('*')
        .eq('deck_id', deckId)
        .order('played_at', { ascending: false });

      if (error) throw error;

      const typedData = (data || []).map(match => ({
        ...match,
        result: match.result as 'win' | 'loss' | 'draw'
      }));

      setMatches(typedData);
      calculateStats(typedData);
    } catch (error) {
      console.error('Error loading matches:', error);
      showError('Error', 'Failed to load match history');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (matchData: DeckMatch[]) => {
    const totalMatches = matchData.length;
    const wins = matchData.filter(m => m.result === 'win').length;
    const losses = matchData.filter(m => m.result === 'loss').length;
    const draws = matchData.filter(m => m.result === 'draw').length;
    const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

    setStats({ totalMatches, wins, losses, draws, winRate });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('deck_matches')
        .insert({
          deck_id: deckId,
          user_id: user.id,
          opponent_deck_name: formData.opponentDeck || null,
          opponent_commander: formData.opponentCommander || null,
          result: formData.result,
          notes: formData.notes || null,
          played_at: new Date(formData.playedAt).toISOString()
        });

      if (error) throw error;

      showSuccess('Match Recorded', 'Match added to performance history');
      setShowAddDialog(false);
      setFormData({
        opponentDeck: '',
        opponentCommander: '',
        result: 'win',
        notes: '',
        playedAt: new Date().toISOString().split('T')[0]
      });
      loadMatches();
    } catch (error) {
      console.error('Error recording match:', error);
      showError('Error', 'Failed to record match');
    }
  };

  const handleDelete = async (matchId: string) => {
    try {
      const { error } = await supabase
        .from('deck_matches')
        .delete()
        .eq('id', matchId);

      if (error) throw error;
      showSuccess('Match Deleted', 'Match removed from history');
      loadMatches();
    } catch (error) {
      console.error('Error deleting match:', error);
      showError('Error', 'Failed to delete match');
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'win':
        return <Badge className="bg-green-500">Win</Badge>;
      case 'loss':
        return <Badge variant="destructive">Loss</Badge>;
      case 'draw':
        return <Badge variant="secondary">Draw</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Performance Tracker
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Record Match
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Match</DialogTitle>
                <DialogDescription>
                  Track your performance with {deckName}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="result">Result</Label>
                  <Select
                    value={formData.result}
                    onValueChange={(value: 'win' | 'loss' | 'draw') =>
                      setFormData({ ...formData, result: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="win">Win</SelectItem>
                      <SelectItem value="loss">Loss</SelectItem>
                      <SelectItem value="draw">Draw</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="opponentDeck">Opponent Deck (Optional)</Label>
                  <Input
                    id="opponentDeck"
                    value={formData.opponentDeck}
                    onChange={(e) => setFormData({ ...formData, opponentDeck: e.target.value })}
                    placeholder="e.g. Atraxa Superfriends"
                  />
                </div>
                <div>
                  <Label htmlFor="opponentCommander">Opponent Commander (Optional)</Label>
                  <Input
                    id="opponentCommander"
                    value={formData.opponentCommander}
                    onChange={(e) => setFormData({ ...formData, opponentCommander: e.target.value })}
                    placeholder="e.g. Atraxa, Praetors' Voice"
                  />
                </div>
                <div>
                  <Label htmlFor="playedAt">Date Played</Label>
                  <Input
                    id="playedAt"
                    type="date"
                    value={formData.playedAt}
                    onChange={(e) => setFormData({ ...formData, playedAt: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Key plays, what worked, what didn't..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Record Match
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Target className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.totalMatches}</div>
                <div className="text-xs text-muted-foreground">Matches</div>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <div className="text-2xl font-bold text-green-500">{stats.wins}</div>
                <div className="text-xs text-muted-foreground">Wins</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <div className="text-2xl font-bold text-red-500">{stats.losses}</div>
                <div className="text-xs text-muted-foreground">Losses</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Trophy className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.winRate.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </div>
            </div>

            {/* Match History */}
            {matches.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No matches recorded yet. Record your first match!
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold mb-2">Match History</h4>
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getResultBadge(match.result)}
                          {match.opponent_commander && (
                            <span className="text-sm font-medium">vs {match.opponent_commander}</span>
                          )}
                          {match.opponent_deck_name && (
                            <span className="text-sm text-muted-foreground">
                              ({match.opponent_deck_name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(match.played_at).toLocaleDateString()}
                        </div>
                        {match.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{match.notes}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(match.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
