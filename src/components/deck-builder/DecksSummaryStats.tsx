import { Card, CardContent } from '@/components/ui/card';
import { 
  Layers, 
  Target, 
  DollarSign, 
  Star,
  TrendingUp,
  Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeckSummary } from '@/lib/api/deckAPI';

interface DecksSummaryStatsProps {
  decks: DeckSummary[];
  className?: string;
}

export function DecksSummaryStats({ decks, className }: DecksSummaryStatsProps) {
  const totalDecks = decks.length;
  const favoriteCount = decks.filter(d => d.favorite).length;
  
  const avgPowerLevel = totalDecks > 0 
    ? decks.reduce((sum, d) => sum + (d.power?.score || 0), 0) / totalDecks 
    : 0;
  
  const totalValue = decks.reduce((sum, d) => sum + (d.economy?.priceUSD || 0), 0);
  
  const totalCards = decks.reduce((sum, d) => sum + (d.counts?.total || 0), 0);
  
  const completeDecks = decks.filter(d => (d.economy?.missing || 0) === 0).length;
  const completionRate = totalDecks > 0 ? Math.round((completeDecks / totalDecks) * 100) : 0;

  const stats = [
    {
      label: 'Total Decks',
      value: totalDecks,
      icon: Layers,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      label: 'Avg Power',
      value: avgPowerLevel.toFixed(1),
      suffix: '/10',
      icon: Target,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    },
    {
      label: 'Total Value',
      value: `$${Math.round(totalValue).toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      label: 'Favorites',
      value: favoriteCount,
      icon: Star,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10'
    },
    {
      label: 'Total Cards',
      value: totalCards.toLocaleString(),
      icon: Package,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      label: 'Complete',
      value: `${completionRate}%`,
      subtext: `${completeDecks}/${totalDecks}`,
      icon: TrendingUp,
      color: completionRate === 100 ? 'text-green-500' : 'text-muted-foreground',
      bgColor: completionRate === 100 ? 'bg-green-500/10' : 'bg-muted/50'
    }
  ];

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3", className)}>
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold">{stat.value}</span>
                  {stat.suffix && <span className="text-xs text-muted-foreground">{stat.suffix}</span>}
                </div>
                {stat.subtext && (
                  <p className="text-[10px] text-muted-foreground">{stat.subtext}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
