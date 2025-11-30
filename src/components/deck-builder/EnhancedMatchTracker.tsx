import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Trophy, Target, TrendingUp, Calendar, Plus, BarChart3 } from 'lucide-react';

interface Match {
  id: string;
  deck_id: string;
  result: string;
  opponent_commander?: string;
  opponent_deck_name?: string;
  played_at: string;
  notes?: string;
}

interface EnhancedMatchTrackerProps {
  deckId: string;
  deckName: string;
}

export function EnhancedMatchTracker({ deckId, deckName }: EnhancedMatchTrackerProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    result: 'win',
    opponent_commander: '',
    opponent_deck_name: '',
    notes: '',
    played_at: new Date().toISOString().split('T')[0],
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
    } catch (error: any) {
      showError('Failed to load matches', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('deck_matches').insert({
        deck_id: deckId,
        user_id: user.id,
        result: formData.result,
        opponent_commander: formData.opponent_commander || null,
        opponent_deck_name: formData.opponent_deck_name || null,
        notes: formData.notes || null,
        played_at: new Date(formData.played_at).toISOString(),
      });

      if (error) throw error;

      showSuccess('Match recorded successfully');
      setDialogOpen(false);
      setFormData({
        result: 'win',
        opponent_commander: '',
        opponent_deck_name: '',
        notes: '',
        played_at: new Date().toISOString().split('T')[0],
      });
      loadMatches();
    } catch (error: any) {
      showError('Failed to record match', error.message);
    }
  };

  const stats = {
    total: matches.length,
    wins: matches.filter(m => m.result === 'win').length,
    losses: matches.filter(m => m.result === 'loss').length,
    draws: matches.filter(m => m.result === 'draw').length,
  };

  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0';

  const resultColors = {
    win: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    loss: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    draw: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Match History</CardTitle>
              <CardDescription>{deckName}</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Record Match
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Match Result</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Result</Label>
                    <Select
                      value={formData.result}
                      onValueChange={(value) => setFormData({ ...formData, result: value })}
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

                  <div className="space-y-2">
                    <Label>Opponent's Commander (Optional)</Label>
                    <Input
                      value={formData.opponent_commander}
                      onChange={(e) => setFormData({ ...formData, opponent_commander: e.target.value })}
                      placeholder="e.g., Atraxa, Praetors' Voice"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Opponent's Deck Name (Optional)</Label>
                    <Input
                      value={formData.opponent_deck_name}
                      onChange={(e) => setFormData({ ...formData, opponent_deck_name: e.target.value })}
                      placeholder="e.g., Superfriends, Voltron"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={formData.played_at}
                      onChange={(e) => setFormData({ ...formData, played_at: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Key plays, what worked, what didn't..."
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Save Match</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Matches</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10">
              <Trophy className="h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.wins}</div>
                <div className="text-xs text-muted-foreground">Wins</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
              <Target className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.losses}</div>
                <div className="text-xs text-muted-foreground">Losses</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">{winRate}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading matches...</div>
          ) : matches.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No matches recorded yet. Click "Record Match" to get started!
            </div>
          ) : (
            <div className="space-y-3">
              {matches.slice(0, 10).map((match) => (
                <div key={match.id} className="flex items-start justify-between p-3 rounded-lg border bg-card">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={resultColors[match.result as keyof typeof resultColors]}>
                        {match.result.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(match.played_at).toLocaleDateString()}
                      </span>
                    </div>
                    {(match.opponent_commander || match.opponent_deck_name) && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">vs </span>
                        <span className="font-medium">
                          {match.opponent_commander || match.opponent_deck_name}
                        </span>
                      </div>
                    )}
                    {match.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{match.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
