import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  BarChart3,
  Crown,
  Zap,
  Target
} from 'lucide-react';
import { CollectionStats } from '@/types/collection';
import { formatPrice, formatCardCount } from '@/features/collection/value';

interface CollectionAnalyticsProps {
  stats: CollectionStats;
  loading?: boolean;
}

export function CollectionAnalytics({ stats, loading }: CollectionAnalyticsProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const colorNames: Record<string, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless'
  };

  const colorTotal = Object.values(stats.colorDistribution).reduce((sum, count) => sum + count, 0);
  const typeTotal = Object.values(stats.typeDistribution).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cosmic-glow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatPrice(stats.totalValue)}
                </p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cards</p>
                <p className="text-2xl font-bold">
                  {formatCardCount(stats.totalCards)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.uniqueCards} unique
                </p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg CMC</p>
                <p className="text-2xl font-bold">
                  {stats.avgCmc.toFixed(1)}
                </p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-full">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Collection Power</p>
                <p className="text-2xl font-bold">
                  {Math.round((stats.totalValue / Math.max(stats.totalCards, 1)) * 100) / 100}
                </p>
                <p className="text-xs text-muted-foreground">$/card</p>
              </div>
              <div className="p-3 bg-orange-500/10 rounded-full">
                <Zap className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Color Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Color Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(stats.colorDistribution)
              .sort(([,a], [,b]) => b - a)
              .map(([color, count]) => {
                const percentage = colorTotal > 0 ? (count / colorTotal) * 100 : 0;
                const colorMap: Record<string, string> = {
                  W: 'bg-yellow-400',
                  U: 'bg-blue-500',
                  B: 'bg-gray-800',
                  R: 'bg-red-500',
                  G: 'bg-green-500',
                  C: 'bg-gray-400'
                };
                
                return (
                  <div key={color} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${colorMap[color]}`}></div>
                        <span>{colorNames[color] || color}</span>
                      </div>
                      <span className="font-medium">
                        {count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>

        {/* Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Card Types
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(stats.typeDistribution)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 6)
              .map(([type, count]) => {
                const percentage = typeTotal > 0 ? (count / typeTotal) * 100 : 0;
                
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{type}</span>
                      <span className="font-medium">
                        {count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      {/* Top Value Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Crown className="h-5 w-5 mr-2 text-yellow-500" />
            Top Value Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.topValueCards.slice(0, 10).map((item, index) => {
              const cardValue = (item.quantity || 0) * (parseFloat(item.card?.prices?.usd || '0')) +
                              (item.foil || 0) * (parseFloat(item.card?.prices?.usd_foil || item.card?.prices?.usd || '0'));
              
              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-sm font-bold">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{item.card_name}</p>
                      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                        <span>{item.set_code.toUpperCase()}</span>
                        {item.quantity > 0 && <Badge variant="outline">{item.quantity}x</Badge>}
                        {item.foil > 0 && <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">{item.foil}x Foil</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{formatPrice(cardValue)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(parseFloat(item.card?.prices?.usd || '0'))}/each
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recently Added */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            Recently Added
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.recentlyAdded.slice(0, 6).map((item) => (
              <div key={item.id} className="p-3 bg-muted/30 rounded-lg">
                <p className="font-medium truncate">{item.card_name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {item.set_code.toUpperCase()}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {item.quantity + item.foil}x
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}