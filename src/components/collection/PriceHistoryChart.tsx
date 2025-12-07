import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, RefreshCw, Database } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface PriceHistoryChartProps {
  collectionCards: any[];
}

interface PriceDataPoint {
  date: string;
  value: number;
  change: number;
}

interface HistoryRecord {
  id: string;
  snapshot_date: string;
  total_value_usd: number;
  card_count: number;
  unique_card_count: number;
}

export function PriceHistoryChart({ collectionCards }: PriceHistoryChartProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([]);
  const [currentValue, setCurrentValue] = useState(0);
  const [changePercent, setChangePercent] = useState(0);
  const [changeAmount, setChangeAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [dataPointCount, setDataPointCount] = useState(0);

  useEffect(() => {
    loadPriceHistory();
  }, [collectionCards, timeRange]);

  const loadPriceHistory = async () => {
    setLoading(true);
    
    // Calculate current total value
    const current = collectionCards.reduce((sum, card) => {
      const price = parseFloat(card.price_usd || '0');
      return sum + (price * card.quantity);
    }, 0);
    setCurrentValue(current);

    try {
      // Try to load real historical data
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        generateSimulatedData(current);
        return;
      }

      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: history, error } = await supabase
        .from('collection_value_history')
        .select('*')
        .eq('user_id', session.session.user.id)
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      if (error) {
        console.error('Error loading price history:', error);
        generateSimulatedData(current);
        return;
      }

      if (history && history.length >= 2) {
        // Use real data
        setHasRealData(true);
        setDataPointCount(history.length);
        
        const dataPoints: PriceDataPoint[] = history.map((record: HistoryRecord) => {
          const date = new Date(record.snapshot_date);
          return {
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: Number(record.total_value_usd),
            change: 0 // Will calculate below
          };
        });

        // Add today's current value if not already captured
        const today = new Date().toISOString().split('T')[0];
        const lastRecord = history[history.length - 1];
        if (lastRecord.snapshot_date !== today) {
          dataPoints.push({
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: current,
            change: 0
          });
        }

        // Calculate changes
        const startValue = dataPoints[0].value;
        for (const point of dataPoints) {
          point.change = ((point.value - startValue) / startValue) * 100;
        }

        const endValue = dataPoints[dataPoints.length - 1].value;
        const totalChange = endValue - startValue;
        const totalChangePercent = startValue > 0 ? ((totalChange / startValue) * 100) : 0;

        setChangeAmount(totalChange);
        setChangePercent(totalChangePercent);
        setPriceData(dataPoints);
      } else {
        // Not enough data - show message about building history
        setHasRealData(false);
        setDataPointCount(history?.length || 0);
        generateSimulatedData(current);
      }
    } catch (error) {
      console.error('Error loading price history:', error);
      generateSimulatedData(current);
    } finally {
      setLoading(false);
    }
  };

  const generateSimulatedData = (current: number) => {
    setHasRealData(false);
    
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const dataPoints: PriceDataPoint[] = [];
    
    // Simulate price fluctuations with realistic variance
    let baseValue = current;
    const dailyVolatility = 0.02; // 2% daily volatility
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Add random walk with slight upward bias for MTG prices
      const randomChange = (Math.random() - 0.48) * dailyVolatility;
      baseValue = baseValue * (1 + randomChange);
      
      const change = ((baseValue - current) / current) * 100;
      
      dataPoints.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: parseFloat(baseValue.toFixed(2)),
        change: parseFloat(change.toFixed(2))
      });
    }

    // Calculate change from period start
    const startValue = dataPoints[0].value;
    const endValue = dataPoints[dataPoints.length - 1].value;
    const totalChange = endValue - startValue;
    const totalChangePercent = startValue > 0 ? ((totalChange / startValue) * 100) : 0;

    setChangeAmount(totalChange);
    setChangePercent(totalChangePercent);
    setPriceData(dataPoints);
  };

  const captureSnapshot = async () => {
    setCapturing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        showError('Not logged in', 'Please log in to capture price history');
        return;
      }

      const response = await supabase.functions.invoke('capture-collection-value', {
        body: { user_id: session.session.user.id }
      });

      if (response.error) {
        throw response.error;
      }

      showSuccess('Snapshot Captured', 'Your collection value has been recorded');
      loadPriceHistory(); // Reload to show new data
    } catch (error: any) {
      console.error('Error capturing snapshot:', error);
      showError('Error', error.message || 'Failed to capture snapshot');
    } finally {
      setCapturing(false);
    }
  };

  const isPositive = changePercent >= 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <DollarSign className="h-5 w-5 text-primary shrink-0" />
              <span>Value History</span>
              {hasRealData && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <Database className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">Track your collection's value over time</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={captureSnapshot}
              disabled={capturing}
              className="whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 ${capturing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-1">{capturing ? 'Capturing...' : 'Capture'}</span>
            </Button>
            <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
              <SelectTrigger className="w-[100px] sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Value Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Current Value</div>
            <div className="text-2xl font-bold">
              ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Change ({timeRange})</div>
            <div className={`text-2xl font-bold flex items-center gap-2 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Dollar Change</div>
            <div className={`text-2xl font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}${Math.abs(changeAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[300px] w-full">
          {priceData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: any) => [`$${value.toLocaleString()}`, 'Value']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke={hasRealData ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} 
                  strokeWidth={2}
                  strokeDasharray={hasRealData ? undefined : '5 5'}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No price data available
            </div>
          )}
        </div>

        {/* Info Badge */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground">
            {hasRealData ? (
              <>
                <strong>Live Data:</strong> Showing {dataPointCount} days of actual price history. 
                Click "Capture Now" to record today's value, or data will be captured automatically daily.
              </>
            ) : (
              <>
                <strong>Building History:</strong> {dataPointCount > 0 ? `${dataPointCount} day(s) recorded.` : 'No history yet.'} 
                {' '}Click "Capture Now" to start tracking. The chart shows estimated data until enough real snapshots are collected.
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
