import { useMemo } from 'react';
import { DollarSign, TrendingDown, Bell, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  target_price_usd?: number;
  alert_enabled?: boolean;
  card?: {
    prices?: {
      usd?: string;
    };
  };
}

interface WishlistQuickStatsProps {
  items: WishlistItem[];
}

export function WishlistQuickStats({ items }: WishlistQuickStatsProps) {
  const stats = useMemo(() => {
    const totalValue = items.reduce((sum, item) => {
      const price = parseFloat(item.card?.prices?.usd || '0');
      return sum + (price * item.quantity);
    }, 0);
    
    const totalCards = items.reduce((sum, item) => sum + item.quantity, 0);
    const alertsActive = items.filter(i => i.alert_enabled && i.target_price_usd).length;
    
    const priceDrops = items.filter(item => {
      if (!item.target_price_usd || !item.card?.prices?.usd) return false;
      return parseFloat(item.card.prices.usd) <= item.target_price_usd;
    }).length;
    
    return { totalValue, totalCards, alertsActive, priceDrops };
  }, [items]);

  const statItems = [
    {
      icon: DollarSign,
      label: 'Total Value',
      value: `$${stats.totalValue.toFixed(2)}`,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      icon: Heart,
      label: 'Cards',
      value: stats.totalCards.toString(),
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10',
    },
    {
      icon: Bell,
      label: 'Alerts Active',
      value: stats.alertsActive.toString(),
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      icon: TrendingDown,
      label: 'Price Drops',
      value: stats.priceDrops.toString(),
      color: stats.priceDrops > 0 ? 'text-emerald-500' : 'text-muted-foreground',
      bgColor: stats.priceDrops > 0 ? 'bg-emerald-500/10' : 'bg-muted/50',
      highlight: stats.priceDrops > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statItems.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
            stat.highlight && "ring-1 ring-emerald-500/50"
          )}
        >
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bgColor)}>
            <stat.icon className={cn("h-5 w-5", stat.color)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
