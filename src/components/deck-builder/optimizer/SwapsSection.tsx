// Premium swaps section with EDH power impact
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  ArrowRight, 
  Check, 
  DollarSign, 
  Package, 
  TrendingUp, 
  TrendingDown,
  Loader2,
  Zap,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface SwapSuggestion {
  currentCard: {
    name: string;
    image: string;
    price: number;
    reason: string;
    playability?: number | null;
  };
  newCard: {
    name: string;
    image: string;
    price: number;
    reason: string;
    type?: string;
    inCollection?: boolean;
    synergy?: string;
  };
  priority: 'high' | 'medium' | 'low';
  category?: string;
  edhImpact?: number; // Estimated power level change
  selected: boolean;
}

interface SwapsSectionProps {
  suggestions: SwapSuggestion[];
  onToggle: (index: number) => void;
  onApplySingle: (index: number) => void;
  onApplySelected: () => void;
  isApplying: boolean;
  useCollection?: boolean;
}

export function SwapsSection({
  suggestions,
  onToggle,
  onApplySingle,
  onApplySelected,
  isApplying,
  useCollection
}: SwapsSectionProps) {
  const selectedCount = suggestions.filter(s => s.selected).length;
  const totalCostDiff = suggestions
    .filter(s => s.selected)
    .reduce((sum, s) => sum + (s.newCard.price - s.currentCard.price), 0);
  
  const totalEdhImpact = suggestions
    .filter(s => s.selected)
    .reduce((sum, s) => sum + (s.edhImpact || 0), 0);

  const priorityStyles = {
    high: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Critical' },
    medium: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'Recommended' },
    low: { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'Optional' }
  };

  // Group by priority
  const byPriority = {
    high: suggestions.filter(s => s.priority === 'high'),
    medium: suggestions.filter(s => s.priority === 'medium'),
    low: suggestions.filter(s => s.priority === 'low')
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-primary" />
                  Card Replacements
                  {useCollection && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      <Package className="h-3 w-3 mr-1" />
                      From Collection
                    </Badge>
                  )}
                </h3>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{suggestions.length} suggested</span>
                  <span className={cn(
                    "flex items-center",
                    totalCostDiff > 0 ? "text-amber-400" : totalCostDiff < 0 ? "text-green-400" : ""
                  )}>
                    <DollarSign className="h-3 w-3" />
                    {totalCostDiff >= 0 ? '+' : ''}{totalCostDiff.toFixed(2)}
                  </span>
                  {totalEdhImpact !== 0 && (
                    <span className={cn(
                      "flex items-center",
                      totalEdhImpact > 0 ? "text-green-400" : "text-amber-400"
                    )}>
                      <Zap className="h-3 w-3 mr-0.5" />
                      {totalEdhImpact > 0 ? '+' : ''}{totalEdhImpact.toFixed(1)} Power
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onApplySelected}
                  disabled={selectedCount === 0 || isApplying}
                >
                  {isApplying ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Apply Selected ({selectedCount})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swaps by priority */}
        <ScrollArea className="h-[500px]">
          <div className="space-y-6 pr-4">
            {(['high', 'medium', 'low'] as const).map((priority) => {
              const items = byPriority[priority];
              if (items.length === 0) return null;
              
              const style = priorityStyles[priority];
              
              return (
                <motion.div
                  key={priority}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", 
                      priority === 'high' ? 'bg-destructive' :
                      priority === 'medium' ? 'bg-orange-500' : 'bg-muted-foreground'
                    )} />
                    <h4 className={cn("text-sm font-medium", style.text)}>
                      {style.label} Swaps
                    </h4>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {items.map((swap, globalIndex) => {
                        const actualIndex = suggestions.findIndex(s => 
                          s.currentCard.name === swap.currentCard.name && 
                          s.newCard.name === swap.newCard.name
                        );
                        const priceDiff = swap.newCard.price - swap.currentCard.price;
                        
                        return (
                          <motion.div
                            key={`${swap.currentCard.name}-${swap.newCard.name}`}
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: globalIndex * 0.03 }}
                            className={cn(
                              "group relative rounded-xl border transition-all duration-200",
                              swap.selected ? "border-primary/50 bg-primary/5" : "border-border",
                              "hover:shadow-lg"
                            )}
                          >
                            {/* Priority indicator bar */}
                            <div className={cn(
                              "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl",
                              priority === 'high' ? 'bg-destructive' :
                              priority === 'medium' ? 'bg-orange-500' : 'bg-muted-foreground'
                            )} />

                            <div className="p-4 pl-5">
                              {/* Header row */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={swap.selected}
                                    onCheckedChange={() => onToggle(actualIndex)}
                                    className="h-5 w-5"
                                  />
                                  {swap.category && (
                                    <Badge variant="secondary" className="text-xs">
                                      {swap.category}
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {/* Price difference */}
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge 
                                        variant="outline" 
                                        className={cn(
                                          "text-xs",
                                          priceDiff > 0 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : 
                                          priceDiff < 0 ? "text-green-400 bg-green-500/10 border-green-500/30" :
                                          "text-muted-foreground"
                                        )}
                                      >
                                        <DollarSign className="h-3 w-3 mr-0.5" />
                                        {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>Price difference</TooltipContent>
                                  </Tooltip>

                                  {/* EDH power impact */}
                                  {swap.edhImpact !== undefined && swap.edhImpact !== 0 && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge 
                                          variant="outline" 
                                          className={cn(
                                            "text-xs",
                                            swap.edhImpact > 0 
                                              ? "text-green-400 bg-green-500/10 border-green-500/30"
                                              : "text-amber-400 bg-amber-500/10 border-amber-500/30"
                                          )}
                                        >
                                          {swap.edhImpact > 0 ? (
                                            <TrendingUp className="h-3 w-3 mr-0.5" />
                                          ) : (
                                            <TrendingDown className="h-3 w-3 mr-0.5" />
                                          )}
                                          {swap.edhImpact > 0 ? '+' : ''}{swap.edhImpact.toFixed(1)}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>Estimated EDH power level impact</TooltipContent>
                                    </Tooltip>
                                  )}

                                  {/* Playability improvement */}
                                  {swap.currentCard.playability !== null && swap.currentCard.playability !== undefined && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="text-xs text-green-400 bg-green-500/10 border-green-500/30">
                                          <TrendingUp className="h-3 w-3 mr-0.5" />
                                          +{100 - swap.currentCard.playability}%
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>Playability improvement</TooltipContent>
                                    </Tooltip>
                                  )}

                                  <Button
                                    size="sm"
                                    onClick={() => onApplySingle(actualIndex)}
                                    disabled={isApplying}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Apply
                                  </Button>
                                </div>
                              </div>

                              {/* Cards comparison */}
                              <div className="flex items-center gap-4">
                                {/* Current card */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                                      Remove
                                    </Badge>
                                    {swap.currentCard.playability !== null && swap.currentCard.playability !== undefined && (
                                      <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">
                                        {swap.currentCard.playability}% play
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-3">
                                    <img
                                      src={swap.currentCard.image}
                                      alt={swap.currentCard.name}
                                      className="w-28 rounded-lg shadow-md"
                                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{swap.currentCard.name}</p>
                                      <p className="text-xs text-muted-foreground">${swap.currentCard.price.toFixed(2)}</p>
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{swap.currentCard.reason}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Arrow */}
                                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                  <motion.div
                                    className="w-10 h-10 rounded-full bg-gradient-to-r from-destructive/20 to-green-500/20 flex items-center justify-center border border-primary/30"
                                    animate={{ x: [0, 4, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                  >
                                    <ArrowRight className="h-5 w-5 text-primary" />
                                  </motion.div>
                                  {swap.newCard.synergy && (
                                    <Badge variant="secondary" className="text-[9px] px-1.5">
                                      <Zap className="h-2.5 w-2.5 mr-0.5" />
                                      {swap.newCard.synergy}
                                    </Badge>
                                  )}
                                </div>

                                {/* New card */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                                      Add
                                    </Badge>
                                    {swap.newCard.inCollection && (
                                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                                        <Package className="h-3 w-3 mr-0.5" />
                                        Owned
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-3">
                                    <img
                                      src={swap.newCard.image}
                                      alt={swap.newCard.name}
                                      className="w-28 rounded-lg shadow-md"
                                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{swap.newCard.name}</p>
                                      <p className="text-xs text-muted-foreground">${swap.newCard.price.toFixed(2)}</p>
                                      <p className="text-xs text-green-600 mt-1 line-clamp-2">{swap.newCard.reason}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
