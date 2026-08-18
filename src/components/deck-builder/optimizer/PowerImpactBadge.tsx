// EDH Power level impact indicator with visual projection - Mobile optimized
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Zap, ArrowUp } from 'lucide-react';
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
    sm: 'text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4 sm:h-5',
    md: 'text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 h-5 sm:h-6',
    lg: 'text-xs sm:text-sm px-2 sm:px-2.5 py-1 h-6 sm:h-7'
  };

  const iconSize = {
    sm: 'h-2 w-2 sm:h-2.5 sm:w-2.5',
    md: 'h-2.5 w-2.5 sm:h-3 sm:w-3',
    lg: 'h-3 w-3 sm:h-4 sm:w-4'
  };

  // Determine impact strength for visual styling
  const impactStrength = Math.abs(impact);
  const isStrong = impactStrength >= 0.5;
  const isMedium = impactStrength >= 0.2 && impactStrength < 0.5;

  if (isNeutral) {
    return (
      <Badge variant="outline" className={cn(sizeClasses[size], "text-muted-foreground gap-0.5 sm:gap-1")}>
        <Minus className={iconSize[size]} />
        {showLabel && <span className="hidden xs:inline">No Change</span>}
      </Badge>
    );
  }

  const badgeContent = (
    <Badge 
      variant="outline" 
      className={cn(
        sizeClasses[size],
        "gap-0.5 sm:gap-1 transition-all",
        // A power delta is an MTG power measurement, so it keeps the
        // --power-* tokens: gain reads low-power green, loss reads high-power red.
        "bg-muted border-border",
        isPositive ? "text-power-1" : "text-power-10",
        isStrong && "font-semibold"
      )}
    >
      {isPositive ? (
        <TrendingUp className={iconSize[size]} />
      ) : (
        <TrendingDown className={iconSize[size]} />
      )}
      <span className="font-semibold">
        {isPositive ? '+' : ''}{impact.toFixed(1)}
      </span>
      {showLabel && <span className="font-normal opacity-80 hidden xs:inline">Power</span>}
    </Badge>
  );

  if (showProjection && projectedLevel !== null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 sm:gap-1.5">
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
                <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center hidden xs:flex">
                  {currentLevel.toFixed(1)}
                  <ArrowUp className={cn(
                    "h-2.5 w-2.5 sm:h-3 sm:w-3 mx-0.5",
                    isPositive ? "text-power-1" : "text-power-10 rotate-180"
                  )} />
                  <span className={cn(
                    "font-medium",
                    isPositive ? "text-power-1" : "text-power-10"
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
                <div className={cn("font-medium", isPositive ? "text-power-1" : "text-power-10")}>
                  {isPositive ? '+' : ''}{impact.toFixed(1)}
                </div>
                <div className="text-muted-foreground">Projected:</div>
                <div className={cn("font-medium", isPositive ? "text-power-1" : "text-power-10")}>
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
