import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PriceHistoryChartProps {
  collectionCards: any[];
}

interface PriceDataPoint {
  date: string;
  value: number;
  change: number;
}

export function PriceHistoryChart({ collectionCards }: PriceHistoryChartProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([]);
  const [currentValue, setCurrentValue] = useState(0);
  const [changePercent, setChangePercent] = useState(0);
  const [changeAmount, setChangeAmount] = useState(0);

  useEffect(() => {
    generatePriceHistory();
  }, [collectionCards, timeRange]);

  const generatePriceHistory = () => {
    // Calculate current total value
    const current = collectionCards.reduce((sum, card) => {
      const price = parseFloat(card.price_usd || '0');
      return sum + (price * card.quantity);
    }, 0);

    setCurrentValue(current);

    // Generate historical data (simulated)
    // In a real app, this would come from stored historical snapshots
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
    const totalChangePercent = ((totalChange / startValue) * 100);

    setChangeAmount(totalChange);
    setChangePercent(totalChangePercent);
    setPriceData(dataPoints);
  };

  const isPositive = changePercent >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Collection Value History
            </CardTitle>
            <CardDescription>Track your collection's value over time</CardDescription>
          </div>
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
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
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
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
            <strong>Note:</strong> Price history is simulated based on current market data. 
            Enable automatic price syncing to track actual historical values.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
