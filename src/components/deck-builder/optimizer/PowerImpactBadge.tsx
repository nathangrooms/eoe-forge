// EDH Power level impact indicator
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PowerImpactBadgeProps {
  impact: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function PowerImpactBadge({ impact, size = 'md', showLabel = true }: PowerImpactBadgeProps) {
  const isPositive = impact > 0;
  const isNeutral = impact === 0;
  
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1'
  };

  const iconSize = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4'
  };

  if (isNeutral) {
    return (
      <Badge variant="outline" className={cn(sizeClasses[size], "text-muted-foreground")}>
        <Minus className={cn(iconSize[size], "mr-0.5")} />
        {showLabel && 'No Change'}
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge 
          variant="outline" 
          className={cn(
            sizeClasses[size],
            isPositive 
              ? "text-green-400 bg-green-500/10 border-green-500/30"
              : "text-amber-400 bg-amber-500/10 border-amber-500/30"
          )}
        >
          {isPositive ? (
            <TrendingUp className={cn(iconSize[size], "mr-0.5")} />
          ) : (
            <TrendingDown className={cn(iconSize[size], "mr-0.5")} />
          )}
          {isPositive ? '+' : ''}{impact.toFixed(1)}
          {showLabel && ' Power'}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          <span>
            Estimated EDH power level {isPositive ? 'increase' : 'decrease'}: {Math.abs(impact).toFixed(1)}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
