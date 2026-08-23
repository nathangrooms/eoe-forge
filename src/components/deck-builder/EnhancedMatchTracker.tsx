import React, { useState, useEffect, useMemo } from 'react';
import { EmptyState, FIELD, MetricRow } from '@/components/listing';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Calendar, Plus } from 'lucide-react';

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

/**
 * A deck's games: recorded, listed and read back. One panel.
 *
 * `MatchAnalytics` used to sit directly under this component on the Record tab
 * and it is now folded in. Both ran their own
 * `deck_matches.select('*').eq('deck_id', …)` and both derived total, wins,
 * losses, draws and a win rate from it with identical arithmetic, so one tab
 * made two reads of one set of rows and printed the same figure twice. Worse,
 * recording a match called `loadMatches()` here only — the panel below had no
 * way to hear about it and kept its old win rate until the page was reloaded.
 *
 * What came across: the per-opponent breakdown, the last-ten form and the
 * current-month form. What did not, and why:
 *
 * - **Its three sub-tabs.** A tab strip inside a tab, for three short sections
 *   that fit on the page one under the other.
 * - **The "Best Matchup" line.** It printed `opponentStats[0]`, and that list
 *   is sorted by number of games played, so the label said best and the figure
 *   was the opponent you have faced most. The breakdown below prints every
 *   matchup with its own win rate, which answers it without the wrong label.
 * - **"Improving Form" and "Active Month".** Both were a sentence restating a
 *   number that is now a tile in the row above them.
 */

export function EnhancedMatchTracker({ deckId, deckName }: EnhancedMatchTrackerProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
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
      setFormOpen(false);
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

  const stats = useMemo(() => {
    const total = matches.length;
    const wins = matches.filter(m => m.result === 'win').length;

    /* Sorted newest first by the query, so the first ten rows are the last ten
       games. */
    const recent = matches.slice(0, 10);
    const recentWins = recent.filter(m => m.result === 'win').length;

    /* A calendar month IN THIS YEAR.
       This read `new Date(m.played_at).getMonth() === new Date().getMonth()`
       with no year test, so a game played last August counted towards this
       August and the figure grew by twelve months of games every time the
       calendar came round. */
    const now = new Date();
    const thisMonth = matches.filter(m => {
      const played = new Date(m.played_at);
      return played.getMonth() === now.getMonth() && played.getFullYear() === now.getFullYear();
    });
    const monthWins = thisMonth.filter(m => m.result === 'win').length;

    /* Per opponent commander. `deck_matches.opponent_commander` is free text,
       so this groups on exactly what was typed. */
    const byOpponent = new Map<string, { wins: number; losses: number; draws: number; total: number }>();
    for (const match of matches) {
      const key = match.opponent_commander?.trim() || match.opponent_deck_name?.trim() || 'Unrecorded';
      const bucket = byOpponent.get(key) ?? { wins: 0, losses: 0, draws: 0, total: 0 };
      bucket.total += 1;
      if (match.result === 'win') bucket.wins += 1;
      if (match.result === 'loss') bucket.losses += 1;
      if (match.result === 'draw') bucket.draws += 1;
      byOpponent.set(key, bucket);
    }

    return {
      total,
      wins,
      losses: matches.filter(m => m.result === 'loss').length,
      draws: matches.filter(m => m.result === 'draw').length,
      recentCount: recent.length,
      recentWinRate: recent.length > 0 ? (recentWins / recent.length) * 100 : null,
      monthCount: thisMonth.length,
      monthWinRate: thisMonth.length > 0 ? (monthWins / thisMonth.length) * 100 : null,
      opponents: Array.from(byOpponent.entries())
        .map(([commander, record]) => ({
          commander,
          ...record,
          winRate: (record.wins / record.total) * 100,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [matches]);

  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0';

  /* Borderless. These read `border-border` and `border-destructive/40` before,
     which is a hairline on a chip inside a row that also drew one. A loss is
     the one result worth marking, and the tint alone says so. */
  const resultColors = {
    win: 'border-0 bg-muted text-foreground',
    loss: 'border-0 bg-destructive/10 text-destructive',
    draw: 'border-0 bg-muted text-foreground',
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
            <Button size="sm" onClick={() => setFormOpen(open => !open)}>
              <Plus className="mr-2 h-4 w-4" />
              Record match
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/**
           * The form expands where the history is, rather than covering it.
           *
           * You are recording a result relative to the run of games listed
           * directly below — a dialog put those out of sight at exactly the
           * moment you were typing about them.
           */}
          {formOpen && (
            <form
              onSubmit={handleSubmit}
              className="mb-6 space-y-4 rounded-xl bg-muted/40 p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="match-result">Result</Label>
                  <Select
                    value={formData.result}
                    onValueChange={(value) => setFormData({ ...formData, result: value })}
                  >
                    <SelectTrigger className={FIELD} id="match-result">
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
                  <Label htmlFor="match-date">Date</Label>
                  <Input className={FIELD}
                    id="match-date"
                    type="date"
                    value={formData.played_at}
                    onChange={(e) => setFormData({ ...formData, played_at: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-opponent-commander">Opponent's commander (optional)</Label>
                  <Input className={FIELD}
                    id="match-opponent-commander"
                    value={formData.opponent_commander}
                    onChange={(e) => setFormData({ ...formData, opponent_commander: e.target.value })}
                    placeholder="e.g., Atraxa, Praetors' Voice"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-opponent-deck">Opponent's deck name (optional)</Label>
                  <Input className={FIELD}
                    id="match-opponent-deck"
                    value={formData.opponent_deck_name}
                    onChange={(e) => setFormData({ ...formData, opponent_deck_name: e.target.value })}
                    placeholder="e.g., Superfriends, Voltron"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="match-notes">Notes (optional)</Label>
                <Textarea className={FIELD}
                  id="match-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Key plays, what worked, what didn't..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save match</Button>
              </div>
            </form>
          )}

          {/*
            Four figures, four different grounds and an icon on each.

            This row had a colour per tile — `bg-muted/50`, `bg-muted`,
            `bg-destructive/10`, `bg-primary/10` — with the number tinted to
            match, so a deck that had lost more than it won drew a red panel and
            a deck that had never played drew a 0% in primary. That is emphasis
            spent on the tile it happened to be, not on anything the reader
            needs to act on, and it is the same monochrome rule the rest of the
            product keeps. The icons are the thing the owner ruled out on this
            exact kind of tile, and the labels were Title Case where every other
            row in the product is sentence case.

            The one real reading is the win rate, and it stays the last tile
            with its denominator under it rather than being coloured.

            Six tiles, not four. The last two are the form figures the panel
            below this one used to draw in its own tile treatment, three
            different sizes of number on one tab.
          */}
          <MetricRow
            on="card"
            columns={6}
            className="mb-6"
            metrics={[
              {
                id: 'total',
                label: 'Matches',
                value: stats.total.toLocaleString(),
                raw: stats.total,
              },
              { id: 'wins', label: 'Wins', value: stats.wins.toLocaleString(), raw: stats.wins },
              {
                id: 'losses',
                label: 'Losses',
                value: stats.losses.toLocaleString(),
                raw: stats.losses,
                /* Draws have no tile of their own because most decks have
                   none, and a row of six with a permanent 0 in it is a worse
                   row. The panel that was folded in here printed them as a
                   third progress bar, also only when there were any. */
                subtext: stats.draws > 0 ? `${stats.draws} drawn` : undefined,
              },
              {
                id: 'rate',
                label: 'Win rate',
                /* A dash, not 0%. A deck with no matches has not won nothing,
                   it has not played. */
                value: stats.total > 0 ? `${winRate}%` : '—',
                raw: stats.total > 0 ? Number(winRate) : undefined,
                subtext: stats.total > 0 ? `${stats.wins} of ${stats.total}` : 'no matches yet',
              },
              {
                id: 'recent',
                label: 'Recent form',
                value: stats.recentWinRate === null ? '—' : `${stats.recentWinRate.toFixed(0)}%`,
                raw: stats.recentWinRate ?? undefined,
                subtext:
                  stats.recentCount > 0
                    ? `last ${stats.recentCount} game${stats.recentCount === 1 ? '' : 's'}`
                    : 'no matches yet',
              },
              {
                id: 'month',
                label: 'This month',
                value: stats.monthWinRate === null ? '—' : `${stats.monthWinRate.toFixed(0)}%`,
                raw: stats.monthWinRate ?? undefined,
                subtext:
                  stats.monthCount > 0
                    ? `${stats.monthCount} match${stats.monthCount === 1 ? '' : 'es'}`
                    : 'none yet',
              },
            ]}
          />

          {loading ? (
            <div
              className="h-32 animate-pulse rounded-lg bg-muted/30 motion-reduce:animate-none"
              role="status"
              aria-label="Loading matches"
            />
          ) : matches.length === 0 ? (
            /* Was a bare centred line reading `No matches recorded yet. Click
               "Record Match" to get started!` — which named a button by a label
               that button does not have, and ended on the kind of exclamation
               the copy rules rule out. The shared panel, and the way out is the
               control rather than a sentence describing it. */
            <EmptyState
              title="No matches yet"
              description="Once you have played some games with this deck, its record and win rate build up here."
              action={{ label: 'Record a match', onClick: () => setFormOpen(true) }}
            />
          ) : (
            /* Each row is `bg-muted/30`, not `border bg-card`. A hairline round
               every row of a ten-row list is the one thing the design law names
               outright, and a recessed ground separates them without it. */
            <div className="space-y-3">
              {matches.slice(0, 10).map((match) => (
                <div key={match.id} className="flex items-start justify-between rounded-lg bg-muted/30 p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="secondary"
                        className={resultColors[match.result as keyof typeof resultColors]}
                      >
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

          {/* Who you have played, and how it went.
              Same rows as the list above, grouped — no second query and no
              second win rate. Sorted by games played, which is the order that
              puts your real meta at the top; each line carries its own rate
              rather than one line claiming to be the best matchup. */}
          {!loading && stats.opponents.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                By opponent
              </h3>
              {stats.opponents.map(opponent => (
                <div key={opponent.commander} className="rounded-lg bg-muted/30 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{opponent.commander}</div>
                      <div className="text-xs text-muted-foreground">
                        {opponent.total} match{opponent.total === 1 ? '' : 'es'} ·{' '}
                        {opponent.wins}W / {opponent.losses}L
                        {opponent.draws > 0 ? ` / ${opponent.draws}D` : ''}
                      </div>
                    </div>
                    <Badge variant="secondary" className="border-0 tabular-nums">
                      {opponent.winRate.toFixed(0)}%
                    </Badge>
                  </div>
                  <Progress value={opponent.winRate} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
