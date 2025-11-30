import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trophy, Target, TrendingUp, Plus, Calendar, Users } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { formatDistanceToNow } from 'date-fns';

interface DeckMatch {
  id: string;
  deck_id: string;
  user_id: string;
  result: string;
  opponent_commander: string | null;
  opponent_deck_name: string | null;
  notes: string | null;
  played_at: string;
  created_at: string;
}

interface EnhancedPerformanceTrackerProps {
  deckId: string;
  deckName: string;
}

export function EnhancedPerformanceTracker({ deckId, deckName }: EnhancedPerformanceTrackerProps) {
  const [matches, setMatches] = useState<DeckMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  const [formData, setFormData] = useState({
    result: 'win' as 'win' | 'loss' | 'draw',
    opponentCommander: '',
    opponentDeckName: '',
    notes: ''
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
      setMatches(data || []);
    } catch (error) {
      console.error('Error loading matches:', error);
      showError('Error', 'Failed to load match history');
    } finally {
      setLoading(false);
    }
  };

  const addMatch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('deck_matches')
        .insert({
          deck_id: deckId,
          user_id: user.id,
          result: formData.result,
          opponent_commander: formData.opponentCommander || null,
          opponent_deck_name: formData.opponentDeckName || null,
          notes: formData.notes || null,
          played_at: new Date().toISOString()
        });

      if (error) throw error;

      showSuccess('Match Recorded', 'Match has been added to your history');
      setShowAddDialog(false);
      setFormData({
        result: 'win',
        opponentCommander: '',
        opponentDeckName: '',
        notes: ''
      });
      loadMatches();
    } catch (error) {
      console.error('Error adding match:', error);
      showError('Error', 'Failed to record match');
    }
  };

  const getStats = () => {
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    const draws = matches.filter(m => m.result === 'draw').length;
    const total = matches.length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

    return { wins, losses, draws, total, winRate };
  };

  const stats = getStats();

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'loss':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      case 'draw':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Performance Tracker
            </CardTitle>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Match
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Match Result</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="result">Result</Label>
                    <Select
                      value={formData.result}
                      onValueChange={(value: any) => setFormData({ ...formData, result: value })}
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
                    <Label htmlFor="opponent-commander">Opponent Commander (Optional)</Label>
                    <Input
                      id="opponent-commander"
                      value={formData.opponentCommander}
                      onChange={(e) => setFormData({ ...formData, opponentCommander: e.target.value })}
                      placeholder="e.g., Atraxa, Praetors' Voice"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opponent-deck">Opponent Deck Name (Optional)</Label>
                    <Input
                      id="opponent-deck"
                      value={formData.opponentDeckName}
                      onChange={(e) => setFormData({ ...formData, opponentDeckName: e.target.value })}
                      placeholder="e.g., Superfriends"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Key plays, what worked well, what to improve..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addMatch} className="flex-1">
                      Record Match
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowAddDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.wins}
              </div>
              <div className="text-xs text-muted-foreground">Wins</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.losses}
              </div>
              <div className="text-xs text-muted-foreground">Losses</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.draws}
              </div>
              <div className="text-xs text-muted-foreground">Draws</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-2xl font-bold text-primary">
                {stats.winRate}%
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Win Rate
              </div>
            </div>
          </div>

          {/* Match History */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No matches recorded yet</p>
              <p className="text-xs mt-1">Start tracking your deck's performance</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={getResultColor(match.result)}>
                            {match.result.toUpperCase()}
                          </Badge>
                          {match.opponent_commander && (
                            <span className="text-sm font-medium">
                              vs {match.opponent_commander}
                            </span>
                          )}
                        </div>
                        {match.opponent_deck_name && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {match.opponent_deck_name}
                          </p>
                        )}
                        {match.notes && (
                          <p className="text-xs text-muted-foreground italic mb-2">
                            "{match.notes}"
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(match.played_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </>
  );
}
