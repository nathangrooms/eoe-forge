import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Star, Package, ShoppingCart } from 'lucide-react';

interface QuickPriceStatsProps {
  watchlistCount: number;
  myListingsCount: number;
  totalListingValue: number;
  shoppingListCount: number;
}

/**
 * Three of these numbers used to be tinted yellow/blue/green/purple and a
 * fourth tile ("Potential Savings") was hardcoded to 0 and therefore rendered
 * "--" forever. It is replaced by the shopping-list count, which is real.
 */
export function QuickPriceStats({
  watchlistCount,
  myListingsCount,
  totalListingValue,
  shoppingListCount,
}: QuickPriceStatsProps) {
  const stats = [
    { label: 'Watching', value: watchlistCount, icon: Star },
    { label: 'Shopping list', value: shoppingListCount, icon: ShoppingCart },
    { label: 'My listings', value: myListingsCount, icon: Package },
    { label: 'Listing value', value: `$${totalListingValue.toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
