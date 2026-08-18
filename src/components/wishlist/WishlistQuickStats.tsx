import { useMemo } from 'react';
import { DollarSign, TrendingDown, Bell, Heart } from 'lucide-react';
import { formatPriceCompact, toNumber } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  target_price_usd?: number;
  alert_enabled?: boolean;
  card?: { prices?: { usd?: string } };
}

interface WishlistQuickStatsProps {
  items: WishlistItem[];
}

export function WishlistQuickStats({ items }: WishlistQuickStatsProps) {
  const stats = useMemo(() => {
    const totalValue = items.reduce(
      (sum, item) => sum + toNumber(item.card?.prices?.usd) * item.quantity,
      0
    );
    const totalCards = items.reduce((sum, item) => sum + item.quantity, 0);
    const alertsActive = items.filter(i => i.alert_enabled && i.target_price_usd).length;
    const priceDrops = items.filter(
      item =>
        item.target_price_usd &&
        item.card?.prices?.usd &&
        toNumber(item.card.prices.usd) <= item.target_price_usd
    ).length;

    return { totalValue, totalCards, alertsActive, priceDrops };
  }, [items]);

  const statItems = [
    { icon: DollarSign, label: 'Total value', value: formatPriceCompact(stats.totalValue) },
    { icon: Heart, label: 'Cards', value: stats.totalCards.toLocaleString() },
    { icon: Bell, label: 'Alerts active', value: stats.alertsActive.toLocaleString() },
    {
      icon: TrendingDown,
      label: 'At or below target',
      value: stats.priceDrops.toLocaleString(),
      highlight: stats.priceDrops > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {statItems.map(stat => (
        <div
          key={stat.label}
          className={cn(
            // A tile that matters is raised, not outlined.
            'flex items-center gap-3 rounded-lg p-4 shadow-lg shadow-black/20',
            stat.highlight ? 'bg-primary text-primary-foreground' : 'bg-card'
          )}
        >
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              stat.highlight ? 'bg-primary-foreground/15' : 'bg-muted'
            )}
          >
            <stat.icon
              className={cn(
                'h-5 w-5',
                stat.highlight ? 'text-primary-foreground' : 'text-muted-foreground'
              )}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-xs',
                stat.highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}
            >
              {stat.label}
            </p>
            <p className="truncate text-lg font-bold tabular-nums">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
