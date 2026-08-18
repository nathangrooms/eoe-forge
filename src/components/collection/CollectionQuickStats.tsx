import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Package, Sparkles, TrendingUp } from 'lucide-react';
import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';

interface CollectionQuickStatsProps {
  totalValue: number;
  totalCards: number;
  uniqueCards: number;
  avgCardValue: number;
  recentlyAddedCount?: number;
  loading?: boolean;
}

export function CollectionQuickStats({
  totalValue,
  totalCards,
  uniqueCards,
  avgCardValue,
  recentlyAddedCount = 0,
  loading = false,
}: CollectionQuickStatsProps) {
  const stats = [
    {
      icon: DollarSign,
      label: 'Total value',
      value: formatPriceCompact(totalValue),
      sublabel: 'USD market price',
    },
    {
      icon: Package,
      label: 'Total cards',
      value: totalCards.toLocaleString(),
      sublabel: `${uniqueCards.toLocaleString()} unique`,
    },
    {
      icon: TrendingUp,
      label: 'Average value',
      value: formatPrice(avgCardValue),
      sublabel: 'per card',
    },
    {
      icon: Sparkles,
      label: 'Recently added',
      value: recentlyAddedCount.toLocaleString(),
      sublabel: 'last 7 days',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(stat => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="truncate text-xl font-bold tabular-nums text-card-foreground sm:text-2xl">
                  {stat.value}
                </p>
                <p className="truncate text-xs text-muted-foreground">{stat.sublabel}</p>
              </div>
              <div className="shrink-0 rounded-lg bg-muted p-2">
                <stat.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
