import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Clock, RefreshCw, Database } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface CardPriceHistoryChartProps {
  cardId: string;
  cardName: string;
  oracleId?: string;
  showFoil?: boolean;
}

interface PriceDataPoint {
  date: string;
  price: number;
  displayDate: string;
}

export function CardPriceHistoryChart({ 
  cardId, 
  cardName, 
  oracleId,
  showFoil = false 
}: CardPriceHistoryChartProps) {
  const [priceHistory, setPriceHistory] = useState<PriceDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    loadPriceHistory();
  }, [cardId, showFoil]);

  // Auto-capture price when component mounts if no data exists for today
  useEffect(() => {
    const checkAndCapture = async () => {
      if (!cardId) return;
      
      const today = new Date().toISOString().split('T')[0];
      
      // Check if we already have today's price
      const { data } = await supabase
        .from('card_price_history')
        .select('id')
        .eq('card_id', cardId)
        .eq('snapshot_date', today)
        .maybeSingle();
      
      // If no data for today, auto-capture silently
      if (!data) {
        try {
          await supabase.functions.invoke('capture-card-price', {
            body: { card_id: cardId, oracle_id: oracleId, card_name: cardName }
          });
          // Reload history after capture
          loadPriceHistory();
        } catch (error) {
          // Silent fail - don't interrupt user experience
          console.log('Auto-capture failed:', error);
        }
      }
    };
    
    checkAndCapture();
  }, [cardId]);

  const loadPriceHistory = async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('card_price_history')
        .select('snapshot_date, price_usd, price_usd_foil')
        .eq('card_id', cardId)
        .gte('snapshot_date', thirtyDaysAgo)
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedData: PriceDataPoint[] = data
          .filter(d => {
            const price = showFoil ? d.price_usd_foil : d.price_usd;
            return price != null && price > 0;
          })
          .map(d => ({
            date: d.snapshot_date,
            price: showFoil ? Number(d.price_usd_foil) : Number(d.price_usd),
            displayDate: format(parseISO(d.snapshot_date), 'MMM d')
          }));

        setPriceHistory(formattedData);
        setHasRealData(formattedData.length > 0);
      } else {
        setPriceHistory([]);
        setHasRealData(false);
      }
    } catch (error) {
      console.error('Error loading price history:', error);
      setPriceHistory([]);
      setHasRealData(false);
    } finally {
      setLoading(false);
    }
  };

  const captureCurrentPrice = async () => {
    setCapturing(true);
    try {
      const { data, error } = await supabase.functions.invoke('capture-card-price', {
        body: { card_id: cardId, oracle_id: oracleId, card_name: cardName }
      });

      if (error) throw error;

      toast.success('Price snapshot captured');
      await loadPriceHistory();
    } catch (error) {
      console.error('Error capturing price:', error);
      toast.error('Failed to capture price');
    } finally {
      setCapturing(false);
    }
  };

  const calculateChange = () => {
    if (priceHistory.length < 2) return null;
    const first = priceHistory[0].price;
    const last = priceHistory[priceHistory.length - 1].price;
    const change = ((last - first) / first) * 100;
    return { value: change, direction: change >= 0 ? 'up' : 'down' };
  };

  const priceChange = calculateChange();

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[150px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Price History (30 Days)
            {hasRealData && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                <Database className="h-3 w-3 mr-1" />
                Live Data
              </Badge>
            )}
          </CardTitle>
          {priceChange && (
            <Badge 
              variant="outline" 
              className={priceChange.direction === 'up' 
                ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                : 'bg-red-500/10 text-red-600 border-red-500/30'
              }
            >
              {priceChange.direction === 'up' ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {Math.abs(priceChange.value).toFixed(1)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasRealData ? (
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                  labelFormatter={(label) => label}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[150px] flex flex-col items-center justify-center text-center">
            <Clock className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Building History</p>
            <p className="text-xs text-muted-foreground mb-3">
              Click below to start tracking this card's price
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={captureCurrentPrice}
              disabled={capturing}
            >
              {capturing ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Database className="h-3 w-3 mr-1" />
              )}
              {capturing ? 'Capturing...' : 'Capture Now'}
            </Button>
          </div>
        )}
        
        {hasRealData && priceHistory.length < 7 && (
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {priceHistory.length} data point{priceHistory.length !== 1 ? 's' : ''} - chart improves with more history
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={captureCurrentPrice}
              disabled={capturing}
              className="h-6 text-xs"
            >
              {capturing ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Update
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}