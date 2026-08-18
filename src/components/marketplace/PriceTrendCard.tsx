import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';
import { TrendingUp, TrendingDown, Clock, RefreshCw } from 'lucide-react';

/**
 * Real 7-day price movers, computed from the `card_price_history` snapshots
 * written by the daily `capture-card-price` job.
 *
 * This component previously invented every number it displayed: it fetched the
 * current Scryfall price for six hardcoded card names and then generated the
 * "previous" price from `Math.random()`, so the same card flipped between
 * gainer and loser on every refresh. Nothing here is synthesised any more — if
 * there are fewer than two snapshots in the window, it says so.
 */

interface Mover {
  cardId: string;
  name: string;
  firstPrice: number;
  lastPrice: number;
  changePercent: number;
}

const WINDOW_DAYS = 7;
const MIN_PRICE = 0.5; // penny cards produce meaningless percentages
const MAX_ROWS = 8;

export function PriceTrendCard() {
  const [loading, setLoading] = useState(true);
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers'>('gainers');
  const [error, setError] = useState<string | null>(null);

  const loadMovers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = subDays(new Date(), WINDOW_DAYS).toISOString().split('T')[0];

      const { data, error: queryError } = await supabase
        .from('card_price_history')
        .select('card_id, card_name, snapshot_date, price_usd')
        .gte('snapshot_date', since)
        .not('price_usd', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(5000);

      if (queryError) throw queryError;

      // Collapse snapshots into first/last observation per card.
      const byCard = new Map<string, { name: string; first: number; last: number }>();
      for (const row of data ?? []) {
        const price = Number(row.price_usd);
        if (!Number.isFinite(price) || price < MIN_PRICE) continue;

        const existing = byCard.get(row.card_id);
        if (existing) {
          existing.last = price;
        } else {
          byCard.set(row.card_id, { name: row.card_name, first: price, last: price });
        }
      }

      const movers: Mover[] = [];
      byCard.forEach((v, cardId) => {
        if (v.first === v.last) return; // no movement recorded
        movers.push({
          cardId,
          name: v.name,
          firstPrice: v.first,
          lastPrice: v.last,
          changePercent: ((v.last - v.first) / v.first) * 100,
        });
      });

      setGainers(
        movers.filter(m => m.changePercent > 0)
          .sort((a, b) => b.changePercent - a.changePercent)
          .slice(0, MAX_ROWS)
      );
      setLosers(
        movers.filter(m => m.changePercent < 0)
          .sort((a, b) => a.changePercent - b.changePercent)
          .slice(0, MAX_ROWS)
      );
    } catch (e) {
      console.error('Error loading price movers:', e);
      setError('Could not load price history.');
      setGainers([]);
      setLosers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovers();
  }, [loadMovers]);

  const activeCards = activeTab === 'gainers' ? gainers : losers;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">
            Price movers · {WINDOW_DAYS} days
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadMovers}
            disabled={loading}
            aria-label="Reload price movers"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="mt-2 inline-flex rounded-md border border-border p-0.5">
          <Button
            variant={activeTab === 'gainers' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3"
            onClick={() => setActiveTab('gainers')}
          >
            <TrendingUp className="mr-1 h-3.5 w-3.5" />
            Gainers
            {gainers.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{gainers.length}</span>
            )}
          </Button>
          <Button
            variant={activeTab === 'losers' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3"
            onClick={() => setActiveTab('losers')}
          >
            <TrendingDown className="mr-1 h-3.5 w-3.5" />
            Losers
            {losers.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{losers.length}</span>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <Skeleton className="mb-1 h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{error}</div>
        ) : activeCards.length > 0 ? (
          <ul className="divide-y divide-border">
            {activeCards.map((card) => (
              <li key={card.cardId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{card.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    ${card.firstPrice.toFixed(2)} → ${card.lastPrice.toFixed(2)}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 tabular-nums">
                  {card.changePercent > 0 ? '+' : ''}
                  {card.changePercent.toFixed(1)}%
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              Not enough price history yet
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Prices are snapshotted daily. Movers appear once a card has at least two
              snapshots inside the {WINDOW_DAYS}-day window.
            </p>
          </div>
        )}

        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Computed from DeckMatrix daily USD price snapshots. Cards under $
          {MIN_PRICE.toFixed(2)} are excluded.
        </p>
      </CardContent>
    </Card>
  );
}
