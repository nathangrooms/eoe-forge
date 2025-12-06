import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  PieChart, 
  Activity,
  Sparkles
} from 'lucide-react';

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
  return (
    <div className="space-y-4">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/20 via-accent/10 to-primary/5 border border-primary/20 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-cosmic rounded-full blur-3xl opacity-20 -translate-y-32 translate-x-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-cosmic shadow-lg">
              <BarChart3 className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Collection Analytics</h2>
              <p className="text-muted-foreground">Deep insights into your Magic collection</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Insights
            </Badge>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-3 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Activity className="h-4 w-4" />
              Total Cards
            </div>
            <div className="text-2xl font-bold mt-1">{totalCards.toLocaleString()}</div>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PieChart className="h-4 w-4" />
              Unique
            </div>
            <div className="text-2xl font-bold mt-1">{uniqueCards.toLocaleString()}</div>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4" />
              Total Value
            </div>
            <div className="text-2xl font-bold text-green-500 mt-1">
              ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Mythics
            </div>
            <div className="text-2xl font-bold mt-1">{topRarityCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
