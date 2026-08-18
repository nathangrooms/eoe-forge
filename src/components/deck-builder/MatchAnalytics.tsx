import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, TrendingUp, Target, Calendar, Zap, BarChart3 } from 'lucide-react';

interface MatchAnalyticsProps {
  deckId: string;
  deckName: string;
}

export function MatchAnalytics({ deckId, deckName }: MatchAnalyticsProps) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatches();
  }, [deckId]);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deck_matches')
        .select('*')
        .eq('deck_id', deckId)
        .order('played_at', { ascending: false });

      if (error) throw error;
      setMatches(data || []);
    } catch (error) {
      console.error('Failed to load matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const total = matches.length;
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    const draws = matches.filter(m => m.result === 'draw').length;
    
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    // Analyze by opponent commander
    const byOpponent = matches.reduce((acc, match) => {
      const opp = match.opponent_commander || 'Unknown';
      if (!acc[opp]) {
        acc[opp] = { wins: 0, losses: 0, draws: 0, total: 0 };
      }
      acc[opp].total++;
      if (match.result === 'win') acc[opp].wins++;
      if (match.result === 'loss') acc[opp].losses++;
      if (match.result === 'draw') acc[opp].draws++;
      return acc;
    }, {} as Record<string, any>);

    const opponentStats = Object.entries(byOpponent)
      .map(([commander, stats]) => {
        const opponentData = stats as { wins: number; losses: number; draws: number; total: number };
        return {
          commander,
          wins: opponentData.wins,
          losses: opponentData.losses,
          draws: opponentData.draws,
          total: opponentData.total,
          winRate: opponentData.total > 0 ? (opponentData.wins / opponentData.total) * 100 : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Recent performance (last 10 matches)
    const recent = matches.slice(0, 10);
    const recentWins = recent.filter(m => m.result === 'win').length;
    const recentWinRate = recent.length > 0 ? (recentWins / recent.length) * 100 : 0;

    // Monthly performance
    const currentMonth = new Date().getMonth();
    const monthMatches = matches.filter(m => 
      new Date(m.played_at).getMonth() === currentMonth
    );
    const monthWins = monthMatches.filter(m => m.result === 'win').length;
    const monthWinRate = monthMatches.length > 0 ? (monthWins / monthMatches.length) * 100 : 0;

    return {
      total,
      wins,
      losses,
      draws,
      winRate,
      opponentStats,
      recentWinRate,
      monthWinRate,
      monthMatches: monthMatches.length,
    };
  }, [matches]);

  const getWinRateColor = (rate: number) => {
    if (rate >= 60) return 'text-green-500';
    if (rate >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Match Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading analytics...
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No matches recorded yet</p>
            <p className="text-sm">Start tracking your games to see analytics</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="matchups">Matchups</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Key Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                  <div className={`text-3xl font-bold ${getWinRateColor(analytics.winRate)}`}>
                    {analytics.winRate.toFixed(0)}%
                  </div>
                  <Progress value={analytics.winRate} className="h-1 mt-2" />
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Total Matches</div>
                  <div className="text-3xl font-bold">{analytics.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {analytics.wins}W / {analytics.losses}L / {analytics.draws}D
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Recent Form</div>
                  <div className={`text-3xl font-bold ${getWinRateColor(analytics.recentWinRate)}`}>
                    {analytics.recentWinRate.toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Last 10 games</div>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">This Month</div>
                  <div className={`text-3xl font-bold ${getWinRateColor(analytics.monthWinRate)}`}>
                    {analytics.monthWinRate.toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {analytics.monthMatches} matches
                  </div>
                </div>
              </div>

              {/* Win/Loss Breakdown */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Record Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Wins</span>
                    <div className="flex items-center gap-2">
                      <Progress value={(analytics.wins / analytics.total) * 100} className="w-32 h-2" />
                      <Badge variant="default">{analytics.wins}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Losses</span>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(analytics.losses / analytics.total) * 100} 
                        className="w-32 h-2 [&>div]:bg-red-500" 
                      />
                      <Badge variant="secondary">{analytics.losses}</Badge>
                    </div>
                  </div>
                  {analytics.draws > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Draws</span>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={(analytics.draws / analytics.total) * 100} 
                          className="w-32 h-2 [&>div]:bg-yellow-500" 
                        />
                        <Badge variant="outline">{analytics.draws}</Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="matchups" className="space-y-4">
              <h3 className="font-semibold text-sm">Performance by Opponent</h3>
              {analytics.opponentStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No opponent data available
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.opponentStats.map((stat) => (
                    <div key={stat.commander} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium">{stat.commander}</div>
                          <div className="text-xs text-muted-foreground">
                            {stat.total} matches • {stat.wins}W / {stat.losses}L
                          </div>
                        </div>
                        <Badge className={getWinRateColor(stat.winRate)}>
                          {stat.winRate.toFixed(0)}%
                        </Badge>
                      </div>
                      <Progress value={stat.winRate} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <h3 className="font-semibold text-sm">Performance Insights</h3>
              
              <div className="space-y-3">
                {analytics.recentWinRate > analytics.winRate && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <TrendingUp className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium mb-1">Improving Form</div>
                      <div className="text-muted-foreground">
                        Your recent win rate ({analytics.recentWinRate.toFixed(0)}%) is higher than your overall average
                      </div>
                    </div>
                  </div>
                )}

                {analytics.monthMatches >= 5 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Zap className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium mb-1">Active Month</div>
                      <div className="text-muted-foreground">
                        You've played {analytics.monthMatches} matches this month
                      </div>
                    </div>
                  </div>
                )}

                {analytics.opponentStats.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <Target className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium mb-1">Best Matchup</div>
                      <div className="text-muted-foreground">
                        {analytics.opponentStats[0].winRate.toFixed(0)}% win rate vs {analytics.opponentStats[0].commander}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
