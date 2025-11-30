import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface CollectionStats {
  totalCards: number;
  totalValue: number;
  uniqueCards: number;
  averageValue: number;
}

interface CollectionComparisonProps {
  current: CollectionStats;
  previous?: CollectionStats;
  period?: string;
}

export function CollectionComparison({ current, previous, period = "Last Month" }: CollectionComparisonProps) {
  const changes = previous ? {
    cards: current.totalCards - previous.totalCards,
    value: current.totalValue - previous.totalValue,
    unique: current.uniqueCards - previous.uniqueCards,
  } : null;

  const percentChange = (curr: number, prev: number) => {
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection Growth</CardTitle>
        <CardDescription>Comparison with {period}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Cards</span>
              {changes && (
                <Badge variant={changes.cards >= 0 ? "default" : "destructive"} className="text-xs">
                  {changes.cards >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {changes.cards >= 0 ? '+' : ''}{changes.cards}
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold">{current.totalCards.toLocaleString()}</p>
            {previous && (
              <Progress 
                value={Math.min(100, (current.totalCards / previous.totalCards) * 100)} 
                className="h-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Value</span>
              {changes && (
                <Badge variant={changes.value >= 0 ? "default" : "destructive"} className="text-xs">
                  {changes.value >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  ${Math.abs(changes.value).toFixed(0)}
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold text-green-600">
              ${current.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            {previous && (
              <Progress 
                value={Math.min(100, (current.totalValue / previous.totalValue) * 100)} 
                className="h-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Unique Cards</span>
              {changes && (
                <Badge variant={changes.unique >= 0 ? "default" : "destructive"} className="text-xs">
                  {changes.unique >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {changes.unique >= 0 ? '+' : ''}{changes.unique}
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold">{current.uniqueCards.toLocaleString()}</p>
            {previous && (
              <Progress 
                value={Math.min(100, (current.uniqueCards / previous.uniqueCards) * 100)} 
                className="h-2"
              />
            )}
          </div>
        </div>

        {previous && changes && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Average card value change</span>
              <span className="font-medium">
                {percentChange(current.averageValue, previous.averageValue).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
