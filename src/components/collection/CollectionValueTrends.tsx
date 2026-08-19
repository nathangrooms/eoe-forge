import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, Percent } from 'lucide-react';
import {
  conditionLabel,
  formatPrice,
  normalizeCondition,
  toNumber,
} from '@/components/collection/browser/types';
import type { CollectionCard } from '@/types/collection';

interface CollectionValueTrendsProps {
  collectionCards: CollectionCard[];
}

export function CollectionValueTrends({ collectionCards }: CollectionValueTrendsProps) {
  const analytics = useMemo(() => {
    // Values come from the live joined `card.prices`, foils at foil price. The
    // previous version read the denormalised `price_usd` column, a snapshot
    // written once at insert time and never refreshed — and null for every card
    // added through the wishlist or CollectionAPI.addCard.
    const rows = collectionCards.map(item => {
      const prices = (item.card?.prices ?? {}) as Record<string, string | null | undefined>;
      const unit = toNumber(prices.usd);
      const foilUnit = toNumber(prices.usd_foil) || unit;
      const quantity = item.quantity || 0;
      const foil = item.foil || 0;
      return {
        name: item.card_name,
        setCode: item.set_code || 'unknown',
        condition: normalizeCondition(item.condition),
        quantity,
        foil,
        unit,
        foilValue: foil * foilUnit,
        nonFoilValue: quantity * unit,
        value: quantity * unit + foil * foilUnit,
      };
    });

    const totalValue = rows.reduce((sum, r) => sum + r.value, 0);

    const bySet: Record<string, number> = {};
    const byCondition: Record<string, number> = {};
    for (const row of rows) {
      bySet[row.setCode] = (bySet[row.setCode] || 0) + row.value;
      byCondition[row.condition] = (byCondition[row.condition] || 0) + row.value;
    }

    const topSets = Object.entries(bySet)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const foilValue = rows.reduce((sum, r) => sum + r.foilValue, 0);
    const nonFoilValue = rows.reduce((sum, r) => sum + r.nonFoilValue, 0);

    /*
     * Only cards we can actually price belong in a list of the most valuable
     * ones. `toNumber` above turns a missing price into 0, so an unpriced card
     * fell to the bottom of the ranking and was then printed there as
     * "2x @ $0.00 each · $0.00 · 0.0%", which states that the card is worth
     * nothing rather than that we do not know. Nothing in `cards` is stored at
     * $0.00, so a row worth nothing is always a row we could not price.
     */
    const unpricedCards = rows.filter(r => r.quantity + r.foil > 0 && r.value <= 0).length;

    const sortedCards = [...rows]
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(r => ({
        name: r.name,
        value: r.value,
        quantity: r.quantity + r.foil,
        singlePrice: r.unit,
      }));

    const top10Value = sortedCards.reduce((sum, c) => sum + c.value, 0);
    const top10Percent = totalValue > 0 ? (top10Value / totalValue) * 100 : 0;

    const totalCards = rows.reduce((sum, r) => sum + r.quantity + r.foil, 0);
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
      unpricedCards,
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
                <div className="text-lg md:text-2xl font-bold">{formatPrice(analytics.totalValue)}</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <Percent className="h-6 w-6 text-muted-foreground md:h-8 md:w-8" aria-hidden="true" />
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
              <TrendingUp className="h-6 w-6 text-muted-foreground md:h-8 md:w-8" aria-hidden="true" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">{formatPrice(analytics.avgValue)}</div>
                <div className="text-xs text-muted-foreground">Avg Card Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <DollarSign className="h-6 w-6 text-muted-foreground md:h-8 md:w-8" aria-hidden="true" />
              <div className="md:text-right">
                <div className="text-lg md:text-2xl font-bold">{formatPrice(analytics.foilValue)}</div>
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
              <div key={set} className="flex items-center justify-between p-3 rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground">{idx + 1}</span>
                  <div>
                    <div className="font-medium">{set.toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground">
                      {((Number(value) / analytics.totalValue) * 100).toFixed(1)}% of collection
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-base tabular-nums">{formatPrice(Number(value))}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Most Valuable Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Most Valuable Cards</CardTitle>
          {analytics.unpricedCards > 0 && (
            <p className="text-xs text-muted-foreground">
              {analytics.unpricedCards === 1
                ? '1 card is missing because we have no price for it yet'
                : `${analytics.unpricedCards} cards are missing because we have no price for them yet`}
            </p>
          )}
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
                      {card.singlePrice > 0
                        ? `${card.quantity}x @ ${formatPrice(card.singlePrice)} each`
                        : `${card.quantity}x, foil price only`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums">{formatPrice(card.value)}</div>
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
                <span className="font-medium">{formatPrice(analytics.foilValue)}</span>
              </div>
              <div className="h-8 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-muted-foreground"
                  style={{ width: `${(analytics.foilValue / analytics.totalValue) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Non-Foil Cards</span>
                <span className="font-medium">{formatPrice(analytics.nonFoilValue)}</span>
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
                      <span className="text-sm font-medium">{conditionLabel(condition)}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tabular-nums">{formatPrice(Number(value))}</div>
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
