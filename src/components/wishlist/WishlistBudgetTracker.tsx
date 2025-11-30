import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, DollarSign, ShoppingCart, AlertCircle } from 'lucide-react';

interface WishlistBudgetTrackerProps {
  wishlistCards: any[];
  budget: number;
}

export function WishlistBudgetTracker({ wishlistCards, budget }: WishlistBudgetTrackerProps) {
  const totalValue = wishlistCards.reduce((sum, card) => {
    const price = parseFloat(card.cards?.prices?.usd || '0');
    return sum + price * (card.quantity || 1);
  }, 0);

  const highPriorityValue = wishlistCards
    .filter(c => c.priority === 'high')
    .reduce((sum, card) => {
      const price = parseFloat(card.cards?.prices?.usd || '0');
      return sum + price * (card.quantity || 1);
    }, 0);

  const budgetUsed = (totalValue / budget) * 100;
  const remaining = budget - totalValue;

  const sortedCards = [...wishlistCards]
    .map(card => ({
      ...card,
      price: parseFloat(card.cards?.prices?.usd || '0'),
    }))
    .sort((a, b) => b.price - a.price);

  const top5Expensive = sortedCards.slice(0, 5);
  const top5Value = top5Expensive.reduce((sum, c) => sum + c.price * (c.quantity || 1), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Wishlist Budget
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Budget Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Total Wishlist Value</div>
            <div className="text-3xl font-bold">${totalValue.toFixed(2)}</div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {remaining >= 0 ? 'Remaining Budget' : 'Over Budget'}
            </div>
            <div className={`text-3xl font-bold ${remaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              ${Math.abs(remaining).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Budget Progress</span>
            <span className="font-medium">{budgetUsed.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(budgetUsed, 100)} className="h-3" />
        </div>

        {/* Priority Breakdown */}
        <div className="p-4 rounded-lg border bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">High Priority Items</span>
            </div>
            <Badge variant="destructive">${highPriorityValue.toFixed(2)}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {wishlistCards.filter(c => c.priority === 'high').length} cards • 
            {((highPriorityValue / totalValue) * 100).toFixed(0)}% of wishlist value
          </div>
        </div>

        {/* Most Expensive Cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span>Most Expensive Cards</span>
            <Badge variant="outline" className="text-xs">
              ${top5Value.toFixed(2)} total
            </Badge>
          </div>
          <div className="space-y-2">
            {top5Expensive.map((card, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-muted-foreground w-5">{idx + 1}.</span>
                  <span className="truncate">{card.card_name}</span>
                  {card.priority === 'high' && (
                    <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                  )}
                </div>
                <span className="font-medium ml-2">${card.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        {remaining < 0 && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium mb-1">Over Budget</div>
                <div className="text-muted-foreground">
                  Consider removing ${Math.abs(remaining).toFixed(2)} worth of cards or 
                  increase your budget to acquire all wishlist items.
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
