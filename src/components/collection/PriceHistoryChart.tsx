import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  LineChart as LineChartIcon,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
import type { CollectionCard } from '@/types/collection';

interface PriceHistoryChartProps {
  collectionCards: CollectionCard[];
}

interface PriceDataPoint {
  date: string;
  value: number;
}

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/**
 * Real snapshots only.
 *
 * The previous version ran a `Math.random()` walk with a deliberate upward bias
 * whenever there were fewer than two snapshots — and fed it into the same chart
 * and the same headline change figures as real data. Inventing price movement
 * in a tool people use to decide when to sell is not a placeholder, so the
 * synthetic path is gone and an honest empty state takes its place.
 */
export function PriceHistoryChart({ collectionCards }: PriceHistoryChartProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  // Current value uses the live joined prices, with foils at foil price — the
  // same rule the rest of the collection uses.
  const currentValue = useMemo(
    () =>
      collectionCards.reduce((sum, item) => {
        const prices = (item.card?.prices ?? {}) as Record<string, string | null | undefined>;
        const usd = toNumber(prices.usd);
        const usdFoil = toNumber(prices.usd_foil) || usd;
        return sum + (item.quantity || 0) * usd + (item.foil || 0) * usdFoil;
      }, 0),
    [collectionCards]
  );

  const loadPriceHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        setPriceData([]);
        return;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - RANGE_DAYS[timeRange]);

      const { data: history, error } = await supabase
        .from('collection_value_history')
        .select('snapshot_date, total_value_usd')
        .eq('user_id', session.session.user.id)
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      setPriceData(
        (history ?? []).map(record => ({
          date: new Date(record.snapshot_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          value: Number(record.total_value_usd) || 0,
        }))
      );
    } catch (error) {
      console.error('Error loading price history:', error);
      setPriceData([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadPriceHistory();
  }, [loadPriceHistory]);

  const captureSnapshot = async () => {
    setCapturing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        showError('Not signed in', 'Sign in to record collection value history');
        return;
      }

      const response = await supabase.functions.invoke('capture-collection-value', {
        body: { user_id: session.session.user.id },
      });
      if (response.error) throw response.error;

      showSuccess('Snapshot captured', "Today's collection value has been recorded");
      await loadPriceHistory();
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      showError('Error', error instanceof Error ? error.message : 'Failed to capture snapshot');
    } finally {
      setCapturing(false);
    }
  };

  const change = useMemo(() => {
    if (priceData.length < 2) return null;
    const start = priceData[0].value;
    const end = priceData[priceData.length - 1].value;
    return {
      amount: end - start,
      percent: start > 0 ? ((end - start) / start) * 100 : 0,
    };
  }, [priceData]);

  const header = (
    <CardHeader className="space-y-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Value history
          </CardTitle>
          <CardDescription className="mt-1">
            Recorded snapshots of your collection value
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={captureSnapshot} disabled={capturing}>
            <RefreshCw className={`h-4 w-4 ${capturing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="ml-1 hidden sm:inline">
              {capturing ? 'Capturing…' : 'Capture now'}
            </span>
          </Button>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="w-[110px] sm:w-[130px]" aria-label="Time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardHeader>
  );

  if (loading) {
    return (
      <Card>
        {header}
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (priceData.length < 2 || !change) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-center">
            <LineChartIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                {priceData.length === 0
                  ? 'Tracking starts with your first snapshot'
                  : 'One snapshot recorded — one more and the chart appears'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your collection is currently worth {formatPrice(currentValue)}. Capture a
                snapshot to start a history — nothing here is estimated.
              </p>
            </div>
            <Button size="sm" onClick={captureSnapshot} disabled={capturing}>
              {capturing ? 'Capturing…' : 'Capture snapshot'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isPositive = change.amount >= 0;

  return (
    <Card>
      {header}
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Current value</div>
            <div className="text-2xl font-bold tabular-nums">{formatPrice(currentValue)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Change ({timeRange})</div>
            <div className="flex items-center gap-2 text-2xl font-bold tabular-nums">
              {isPositive ? (
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-5 w-5" aria-hidden="true" />
              )}
              {isPositive ? '+' : ''}
              {change.percent.toFixed(2)}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Dollar change</div>
            <div className="text-2xl font-bold tabular-nums">
              {isPositive ? '+' : '−'}
              {formatPrice(Math.abs(change.amount))}
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                interval="preserveStartEnd"
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={value => `$${Number(value).toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px hsl(0 0% 0% / 0.5)',
                }}
                formatter={(value: number) => [formatPrice(value), 'Value']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-muted-foreground">
          {priceData.length} snapshot{priceData.length === 1 ? '' : 's'} in this range. Values
          are recorded when you capture a snapshot.
        </p>
      </CardContent>
    </Card>
  );
}
