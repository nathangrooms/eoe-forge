import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Package, 
  Sparkles, 
  TrendingUp,
  Star,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollectionQuickStatsProps {
  totalValue: number;
  totalCards: number;
  uniqueCards: number;
  avgCardValue: number;
  topRarity?: string;
  recentlyAddedCount?: number;
  loading?: boolean;
}

export function CollectionQuickStats({
  totalValue,
  totalCards,
  uniqueCards,
  avgCardValue,
  topRarity = 'mythic',
  recentlyAddedCount = 0,
  loading = false,
}: CollectionQuickStatsProps) {
  const stats = [
    {
      icon: DollarSign,
      label: 'Total Value',
      value: `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sublabel: 'USD Market Price',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
    },
    {
      icon: Package,
      label: 'Total Cards',
      value: totalCards.toLocaleString(),
      sublabel: `${uniqueCards.toLocaleString()} unique`,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      icon: TrendingUp,
      label: 'Avg Value',
      value: `$${avgCardValue.toFixed(2)}`,
      sublabel: 'per card',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
    },
    {
      icon: Sparkles,
      label: 'Recently Added',
      value: recentlyAddedCount.toString(),
      sublabel: 'last 7 days',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, index) => (
        <Card 
          key={stat.label}
          className={cn(
            "relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
            "border",
            stat.borderColor
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className={cn("text-xl sm:text-2xl font-bold", stat.color)}>
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stat.sublabel}
                </p>
              </div>
              <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
            </div>
            
            {/* Decorative gradient line */}
            <div 
              className={cn(
                "absolute bottom-0 left-0 right-0 h-1",
                "bg-gradient-to-r from-transparent via-current to-transparent opacity-20",
                stat.color
              )}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
