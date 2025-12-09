// Real-time optimizer statistics dashboard
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Zap, 
  Package,
  Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface OptimizerStatsProps {
  currentCards: number;
  requiredCards: number;
  currentPowerLevel?: number;
  projectedPowerLevel?: number;
  totalValue: number;
  projectedValueChange: number;
  ownedPercentage: number;
  projectedOwnedPercentage?: number;
  additionsCount: number;
  removalsCount: number;
  swapsCount: number;
}

export function OptimizerStats({
  currentCards,
  requiredCards,
  currentPowerLevel = 0,
  projectedPowerLevel,
  totalValue,
  projectedValueChange,
  ownedPercentage,
  projectedOwnedPercentage,
  additionsCount,
  removalsCount,
  swapsCount
}: OptimizerStatsProps) {
  const cardProgress = Math.min(100, (currentCards / requiredCards) * 100);
  const powerChange = projectedPowerLevel && currentPowerLevel 
    ? projectedPowerLevel - currentPowerLevel 
    : null;
  const ownershipChange = projectedOwnedPercentage !== undefined 
    ? projectedOwnedPercentage - ownedPercentage 
    : null;

  const stats = [
    {
      label: 'Cards',
      value: `${currentCards}/${requiredCards}`,
      icon: Target,
      color: currentCards === requiredCards 
        ? 'text-green-400' 
        : currentCards < requiredCards 
        ? 'text-orange-400' 
        : 'text-destructive',
      progress: cardProgress,
      progressColor: currentCards === requiredCards 
        ? 'bg-green-500' 
        : currentCards < requiredCards 
        ? 'bg-orange-500' 
        : 'bg-destructive',
      tooltip: currentCards === requiredCards 
        ? 'Deck is complete' 
        : `Need ${requiredCards - currentCards} more cards`
    },
    {
      label: 'Power',
      value: currentPowerLevel?.toFixed(1) || '--',
      icon: Zap,
      color: 'text-purple-400',
      change: powerChange,
      changeLabel: powerChange !== null && powerChange !== 0 
        ? `${powerChange > 0 ? '+' : ''}${powerChange.toFixed(1)} projected` 
        : null,
      tooltip: 'EDH Power Level (1-10)'
    },
    {
      label: 'Value',
      value: `$${totalValue.toFixed(0)}`,
      icon: DollarSign,
      color: 'text-green-400',
      change: projectedValueChange,
      changeLabel: projectedValueChange !== 0 
        ? `${projectedValueChange > 0 ? '+' : ''}$${projectedValueChange.toFixed(0)}` 
        : null,
      tooltip: 'Total deck value'
    },
    {
      label: 'Owned',
      value: `${ownedPercentage.toFixed(0)}%`,
      icon: Package,
      color: 'text-blue-400',
      progress: ownedPercentage,
      change: ownershipChange,
      tooltip: 'Cards in your collection'
    }
  ];

  return (
    <TooltipProvider>
      <Card className="border-primary/10 bg-gradient-to-r from-background to-muted/30">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <Tooltip key={stat.label}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className={cn("h-4 w-4", stat.color)} />
                      <span className="text-xs text-muted-foreground font-medium">
                        {stat.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={cn("text-xl font-bold", stat.color)}>
                        {stat.value}
                      </span>
                      {stat.change !== undefined && stat.change !== null && stat.change !== 0 && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] px-1 py-0",
                            stat.change > 0 
                              ? "text-green-400 bg-green-500/10 border-green-500/30"
                              : "text-amber-400 bg-amber-500/10 border-amber-500/30"
                          )}
                        >
                          {stat.change > 0 ? (
                            <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                          ) : (
                            <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                          )}
                          {stat.changeLabel}
                        </Badge>
                      )}
                    </div>
                    {stat.progress !== undefined && (
                      <div className="mt-2">
                        <Progress 
                          value={stat.progress} 
                          className="h-1.5" 
                        />
                      </div>
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{stat.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          
          {/* Action summary */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-border/50">
            {additionsCount > 0 && (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                +{additionsCount} to add
              </Badge>
            )}
            {removalsCount > 0 && (
              <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                -{removalsCount} to remove
              </Badge>
            )}
            {swapsCount > 0 && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                ↔ {swapsCount} swaps
              </Badge>
            )}
            {additionsCount === 0 && removalsCount === 0 && swapsCount === 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Minus className="h-3 w-3" />
                No pending changes
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
