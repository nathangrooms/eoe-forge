import { Card, CardContent } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart,
  Star,
  Package
} from 'lucide-react';

interface QuickPriceStatsProps {
  watchlistCount: number;
  myListingsCount: number;
  totalListingValue: number;
  savedAmount?: number;
}

export function QuickPriceStats({ 
  watchlistCount, 
  myListingsCount, 
  totalListingValue,
  savedAmount = 0
}: QuickPriceStatsProps) {
  const stats = [
    {
      label: 'Watching',
      value: watchlistCount,
      icon: Star,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20'
    },
    {
      label: 'My Listings',
      value: myListingsCount,
      icon: Package,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20'
    },
    {
      label: 'Listing Value',
      value: `$${totalListingValue.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20'
    },
    {
      label: 'Potential Savings',
      value: savedAmount > 0 ? `$${savedAmount.toFixed(2)}` : '--',
      icon: TrendingDown,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <Card 
          key={stat.label} 
          className={`${stat.borderColor} hover:shadow-md transition-shadow`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
