import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';

interface CollectionValueTrendsProps {
  collectionCards: any[];
}

export function CollectionValueTrends({ collectionCards }: CollectionValueTrendsProps) {
  const analytics = useMemo(() => {
    const totalValue = collectionCards.reduce((sum, card) => {
      const price = parseFloat(card.price_usd || '0');
      return sum + price * card.quantity;
    }, 0);

    // Group by set
    const bySet = collectionCards.reduce((acc, card) => {
      const set = card.set_code || 'Unknown';
      const quantity = Number(card.quantity) || 0;
      const value = parseFloat(card.price_usd || '0') * quantity;
      acc[set] = (acc[set] || 0) + value;
      return acc;
    }, {} as Record<string, number>);

    const topSets = Object.entries(bySet)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 5);

    // Group by condition
    const byCondition = collectionCards.reduce((acc, card) => {
      const condition = card.condition || 'NM';
      const value = parseFloat(card.price_usd || '0') * (card.quantity || 0);
      acc[condition] = (acc[condition] || 0) + value;
      return acc;
    }, {} as Record<string, number>);

    // Calculate foil vs non-foil
    const foilValue = collectionCards
      .filter(c => (c.foil || 0) > 0)
      .reduce((sum, card) => {
        const price = parseFloat(card.price_usd || '0');
        return sum + price * (card.foil || 0);
      }, 0);

    const nonFoilValue = totalValue - foilValue;

    // Find most valuable cards
    const sortedCards = [...collectionCards]
      .map(card => ({
        name: card.card_name,
        value: parseFloat(card.price_usd || '0') * (card.quantity || 0),
        quantity: card.quantity || 0,
        singlePrice: parseFloat(card.price_usd || '0'),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const top10Value = sortedCards.reduce((sum, c) => sum + c.value, 0);
    const top10Percent = (top10Value / totalValue) * 100;

    // Calculate average card value
    const totalCards = collectionCards.reduce((sum, c) => sum + (c.quantity || 0) + (c.foil || 0), 0);
    const avgValue = totalCards > 0 ? totalValue / totalCards : 0;

    return {
      totalValue,
      topSets,
      byCondition,
      foilValue,
      nonFoilValue,
      sortedCards,
      top10Value,
      top10Percent,
      avgValue,
      totalCards,
    };
  }, [collectionCards]);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <DollarSign className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">${analytics.totalValue.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <Percent className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">{analytics.top10Percent.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Top 10 Cards</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-green-500" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">${analytics.avgValue.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Avg Card Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <DollarSign className="h-6 w-6 md:h-8 md:w-8 text-yellow-500" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">${analytics.foilValue.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Foil Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Value by Set */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Sets by Value</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.topSets.map(([set, value], idx) => (
              <div key={set} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground">{idx + 1}</span>
                  <div>
                    <div className="font-medium">{set.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground">
                      {((Number(value) / analytics.totalValue) * 100).toFixed(1)}% of collection
                    </div>
                  </div>
                </div>
                <Badge className="text-lg">${Number(value).toFixed(2)}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Most Valuable Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Most Valuable Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analytics.sortedCards.map((card, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-muted-foreground w-6">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{card.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {card.quantity}x @ ${card.singlePrice.toFixed(2)} each
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">${card.value.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">
                    {((card.value / analytics.totalValue) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Value Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Foil vs Non-Foil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Foil Cards</span>
                <span className="font-medium">${analytics.foilValue.toFixed(2)}</span>
              </div>
              <div className="h-8 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-500"
                  style={{ width: `${(analytics.foilValue / analytics.totalValue) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Non-Foil Cards</span>
                <span className="font-medium">${analytics.nonFoilValue.toFixed(2)}</span>
              </div>
              <div className="h-8 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(analytics.nonFoilValue / analytics.totalValue) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Value by Condition</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.byCondition)
                .sort(([, a], [, b]) => Number(b) - Number(a))
                .map(([condition, value]) => (
                  <div key={condition} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-sm font-medium">{condition}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${Number(value).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        {((Number(value) / analytics.totalValue) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
