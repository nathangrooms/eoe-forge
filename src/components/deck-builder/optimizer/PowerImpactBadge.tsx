// EDH Power level impact indicator with visual projection
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Zap, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PowerImpactBadgeProps {
  impact: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  currentLevel?: number;
  showProjection?: boolean;
  animated?: boolean;
}

export function PowerImpactBadge({ 
  impact, 
  size = 'md', 
  showLabel = true,
  currentLevel,
  showProjection = false,
  animated = false
}: PowerImpactBadgeProps) {
  const isPositive = impact > 0;
  const isNeutral = Math.abs(impact) < 0.05;
  const projectedLevel = currentLevel ? currentLevel + impact : null;
  
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0 h-5',
    md: 'text-xs px-2 py-0.5 h-6',
    lg: 'text-sm px-2.5 py-1 h-7'
  };

  const iconSize = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4'
  };

  // Determine impact strength for visual styling
  const impactStrength = Math.abs(impact);
  const isStrong = impactStrength >= 0.5;
  const isMedium = impactStrength >= 0.2 && impactStrength < 0.5;

  if (isNeutral) {
    return (
      <Badge variant="outline" className={cn(sizeClasses[size], "text-muted-foreground gap-1")}>
        <Minus className={iconSize[size]} />
        {showLabel && 'No Change'}
      </Badge>
    );
  }

  const badgeContent = (
    <Badge 
      variant="outline" 
      className={cn(
        sizeClasses[size],
        "gap-1 transition-all",
        isPositive 
          ? isStrong 
            ? "text-green-400 bg-green-500/15 border-green-500/40 shadow-green-500/10 shadow-sm"
            : isMedium
            ? "text-green-400 bg-green-500/10 border-green-500/30"
            : "text-green-400/80 bg-green-500/5 border-green-500/20"
          : isStrong
            ? "text-amber-400 bg-amber-500/15 border-amber-500/40 shadow-amber-500/10 shadow-sm"
            : isMedium
            ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
            : "text-amber-400/80 bg-amber-500/5 border-amber-500/20"
      )}
    >
      {isPositive ? (
        <TrendingUp className={cn(iconSize[size], animated && "animate-pulse")} />
      ) : (
        <TrendingDown className={cn(iconSize[size], animated && "animate-pulse")} />
      )}
      <span className="font-semibold">
        {isPositive ? '+' : ''}{impact.toFixed(1)}
      </span>
      {showLabel && <span className="font-normal opacity-80">Power</span>}
    </Badge>
  );

  if (showProjection && projectedLevel !== null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5">
              {animated ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  {badgeContent}
                </motion.div>
              ) : badgeContent}
              {currentLevel && (
                <span className="text-xs text-muted-foreground flex items-center">
                  {currentLevel.toFixed(1)}
                  <ArrowUp className={cn(
                    "h-3 w-3 mx-0.5",
                    isPositive ? "text-green-400" : "text-amber-400 rotate-180"
                  )} />
                  <span className={cn(
                    "font-medium",
                    isPositive ? "text-green-400" : "text-amber-400"
                  )}>
                    {projectedLevel.toFixed(1)}
                  </span>
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium">Power Level Projection</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Current:</div>
                <div className="font-medium">{currentLevel?.toFixed(1)}</div>
                <div className="text-muted-foreground">Change:</div>
                <div className={cn("font-medium", isPositive ? "text-green-400" : "text-amber-400")}>
                  {isPositive ? '+' : ''}{impact.toFixed(1)}
                </div>
                <div className="text-muted-foreground">Projected:</div>
                <div className={cn("font-medium", isPositive ? "text-green-400" : "text-amber-400")}>
                  {projectedLevel?.toFixed(1)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t">
                {isPositive 
                  ? "This change will increase your deck's competitive power."
                  : "This change may reduce your deck's competitive power."}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {animated ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {badgeContent}
            </motion.div>
          ) : badgeContent}
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span>
              Estimated EDH power level {isPositive ? 'increase' : 'decrease'}: {Math.abs(impact).toFixed(1)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
