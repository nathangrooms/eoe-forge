import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Package } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';

interface DeckBudgetTrackerProps {
  deckCards: any[];
  targetBudget?: number;
}

/**
 * COPIES COUNT.
 *
 * Every figure in this panel used to be built from `parseFloat(card.prices.usd)`
 * summed once per *distinct* card, with no `quantity` anywhere in the file. For
 * a singleton Commander deck the only error was basic lands, which are cheap,
 * so it had been almost right for the format the product is mostly used for and
 * badly wrong for anything with four-ofs. The error was inherited by
 * `top5Percent`, `percentUsed`, `remaining`, the over-budget test and the
 * rarity roll-up.
 *
 * It also meant the Value tab's total and the "Est. value" tile at the top of
 * the same page were two different numbers for one deck. They agree now.
 */
function copiesOf(card: { quantity?: number }): number {
  return Math.max(1, Math.floor(card.quantity ?? 1));
}

export function DeckBudgetTracker({ deckCards, targetBudget = 100 }: DeckBudgetTrackerProps) {
  const [budgetLimit, setBudgetLimit] = useState(targetBudget);

  const budgetAnalysis = useMemo(() => {
    // Calculate total deck value
    const totalValue = deckCards.reduce((sum, card) => {
      const price = parseFloat(card.prices?.usd || '0');
      return sum + (Number.isNaN(price) ? 0 : price) * copiesOf(card);
    }, 0);

    // Find the most expensive stacks — a playset of a $12 card outranks one $30
    // card in what it costs to assemble, which is the question this asks.
    const sortedByPrice = [...deckCards]
      .map(card => ({
        name: card.name,
        copies: copiesOf(card),
        unitPrice: parseFloat(card.prices?.usd || '0') || 0,
        price: (parseFloat(card.prices?.usd || '0') || 0) * copiesOf(card),
        rarity: card.rarity,
      }))
      .filter(c => c.price > 0)
      .sort((a, b) => b.price - a.price);

    const top5Expensive = sortedByPrice.slice(0, 5);
    const top5Value = top5Expensive.reduce((sum, c) => sum + c.price, 0);
    const top5Percent = totalValue > 0 ? (top5Value / totalValue) * 100 : 0;

    // Calculate by rarity
    const byRarity = deckCards.reduce((acc, card) => {
      const rarity = card.rarity || 'common';
      const price = parseFloat(card.prices?.usd || '0');
      acc[rarity] = (acc[rarity] || 0) + (Number.isNaN(price) ? 0 : price) * copiesOf(card);
      return acc;
    }, {} as Record<string, number>);

    // Calculate budget status
    const percentUsed = (totalValue / budgetLimit) * 100;
    const remaining = budgetLimit - totalValue;
    const isOverBudget = totalValue > budgetLimit;

    // Suggest budget alternatives
    const suggestions: string[] = [];
    if (isOverBudget) {
      suggestions.push(`$${(totalValue - budgetLimit).toFixed(2)} over budget`);
    }
    if (top5Percent > 50) {
      suggestions.push(`Top 5 cards account for ${top5Percent.toFixed(0)}% of deck value`);
    }
    if (byRarity.mythic > totalValue * 0.4) {
      suggestions.push('Consider fewer mythic rares to reduce cost');
    }

    return {
      totalValue,
      percentUsed,
      remaining,
      isOverBudget,
      top5Expensive,
      top5Value,
      top5Percent,
      byRarity,
      suggestions,
    };
  }, [deckCards, budgetLimit]);

  const getBudgetColor = (percent: number) => {
    if (percent > 100) return 'text-destructive';
    if (percent > 80) return 'text-foreground';
    return 'text-foreground';
  };

  const getRarityColor = (rarity: string | undefined) => {
    if (!rarity) return 'text-foreground';
    switch (rarity.toLowerCase()) {
      case 'mythic': return 'text-foreground';
      case 'rare': return 'text-foreground';
      case 'uncommon': return 'text-foreground';
      default: return 'text-foreground';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Budget Tracker
        </CardTitle>
        <CardDescription>Monitor and optimize your deck's cost</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Budget Limit Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Budget Limit</span>
            <Badge variant="outline" className="text-base">
              ${budgetLimit.toFixed(0)}
            </Badge>
          </div>
          <Slider
            value={[budgetLimit]}
            onValueChange={(value) => setBudgetLimit(value[0])}
            min={50}
            max={5000}
            step={50}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$50</span>
            <span>$5000</span>
          </div>
        </div>

        {/* Current Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Current Deck Value</div>
              <div className={`text-3xl font-bold ${getBudgetColor(budgetAnalysis.percentUsed)}`}>
                ${budgetAnalysis.totalValue.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {budgetAnalysis.isOverBudget ? 'Over Budget' : 'Remaining'}
              </div>
              <div className={`text-2xl font-bold ${budgetAnalysis.isOverBudget ? 'text-destructive' : 'text-foreground'}`}>
                {budgetAnalysis.isOverBudget ? (
                  <>-${Math.abs(budgetAnalysis.remaining).toFixed(2)}</>
                ) : (
                  <>${budgetAnalysis.remaining.toFixed(2)}</>
                )}
              </div>
            </div>
          </div>

          <Progress 
            value={Math.min(budgetAnalysis.percentUsed, 100)} 
            className={`h-3 ${budgetAnalysis.isOverBudget ? '[&>div]:bg-destructive/10' : ''}`}
          />
          
          <div className="text-sm text-muted-foreground">
            Using {budgetAnalysis.percentUsed.toFixed(1)}% of budget
          </div>
        </div>

        {/* Suggestions */}
        {budgetAnalysis.suggestions.length > 0 && (
          <Alert className={budgetAnalysis.isOverBudget ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-muted'}>
            <AlertCircle className={`h-4 w-4 ${budgetAnalysis.isOverBudget ? 'text-destructive' : 'text-foreground'}`} />
            <AlertDescription className="text-sm">
              <div className="font-medium mb-2">Budget Insights:</div>
              <ul className="list-disc list-inside space-y-1">
                {budgetAnalysis.suggestions.map((suggestion, idx) => (
                  <li key={idx}>{suggestion}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Top Expensive Cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span>Most Expensive Cards</span>
            <Badge variant="outline" className="text-xs">
              ${budgetAnalysis.top5Value.toFixed(2)} ({budgetAnalysis.top5Percent.toFixed(0)}%)
            </Badge>
          </div>
          <div className="space-y-2">
            {budgetAnalysis.top5Expensive.map((card, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-muted-foreground w-5">{idx + 1}.</span>
                  <span className="truncate">
                    {card.copies > 1 ? `${card.copies}x ` : ''}
                    {card.name}
                  </span>
                  <Badge variant="outline" className={`text-xs ${getRarityColor(card.rarity)}`}>
                    {card.rarity}
                  </Badge>
                </div>
                <span className="font-medium ml-2">${card.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Value by Rarity */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span>Value by Rarity</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(budgetAnalysis.byRarity)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([rarity, value]) => (
                <div key={rarity} className="p-3 rounded-lg border bg-card">
                  <div className="text-xs text-muted-foreground capitalize mb-1">{rarity}</div>
                  <div className="text-lg font-bold">${(value as number).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">
                    {((value as number / budgetAnalysis.totalValue) * 100).toFixed(0)}% of deck
                  </div>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
