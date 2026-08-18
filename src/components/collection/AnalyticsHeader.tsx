import { Activity, PieChart, TrendingUp, Sparkles } from 'lucide-react';
import { formatPriceCompact } from '@/components/collection/browser/types';

interface AnalyticsHeaderProps {
  totalCards: number;
  totalValue: number;
  uniqueCards: number;
  topRarityCount?: number;
}

export function AnalyticsHeader({
  totalCards,
  totalValue,
  uniqueCards,
  topRarityCount = 0,
}: AnalyticsHeaderProps) {
  const stats = [
    { icon: Activity, label: 'Total cards', value: totalCards.toLocaleString() },
    { icon: PieChart, label: 'Unique', value: uniqueCards.toLocaleString() },
    { icon: TrendingUp, label: 'Total value', value: formatPriceCompact(totalValue) },
    { icon: Sparkles, label: 'Mythics', value: topRarityCount.toLocaleString() },
  ];

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-xl font-bold text-foreground">Analytics</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-lg bg-card p-3 shadow-lg shadow-black/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <stat.icon className="h-4 w-4" aria-hidden="true" />
              {stat.label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
