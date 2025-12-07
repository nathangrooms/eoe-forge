// Premium replacement suggestion row with side-by-side card comparison
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowRight, Check, Undo2, DollarSign, Zap, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { OptimizerCard } from './OptimizerCard';

export interface ReplacementSuggestion {
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
  selected: boolean;
  priority: 'high' | 'medium' | 'low';
  category?: string;
}

interface ReplacementRowProps {
  suggestion: ReplacementSuggestion;
  index: number;
  onToggle: (index: number) => void;
  onApply: (index: number) => void;
  isApplying: boolean;
  applied?: boolean;
}

export function ReplacementRow({
  suggestion,
  index,
  onToggle,
  onApply,
  isApplying,
  applied
}: ReplacementRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const priceDiff = suggestion.newCard.price - suggestion.currentCard.price;
  const playabilityGain = suggestion.currentCard.playability !== null && suggestion.currentCard.playability !== undefined
    ? (100 - suggestion.currentCard.playability)
    : null;

  const priorityStyles = {
    high: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Critical' },
    medium: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'Recommended' },
    low: { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'Optional' }
  };

  const style = priorityStyles[suggestion.priority];

  if (applied) {
    return (
      <motion.div
        initial={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="p-4 rounded-xl border border-green-500/30 bg-green-500/10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-green-500" />
            <span className="font-medium text-green-500">
              Replaced {suggestion.currentCard.name} → {suggestion.newCard.name}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        "group relative rounded-xl border transition-all duration-300",
        suggestion.selected ? "border-primary/50 bg-primary/5" : style.border,
        isHovered && "shadow-lg"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Priority Indicator */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", 
        suggestion.priority === 'high' ? 'bg-destructive' :
        suggestion.priority === 'medium' ? 'bg-orange-500' : 'bg-muted-foreground'
      )} />

      <div className="p-4 pl-5">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={suggestion.selected}
              onCheckedChange={() => onToggle(index)}
              className="h-5 w-5"
            />
            <Badge variant="outline" className={cn("text-xs", style.text, style.bg, style.border)}>
              {style.label}
            </Badge>
            {suggestion.category && (
              <Badge variant="secondary" className="text-xs">
                {suggestion.category}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Cost Difference */}
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

            {/* Playability Gain */}
            {playabilityGain !== null && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs text-green-400 bg-green-500/10 border-green-500/30">
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    +{playabilityGain}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Estimated playability improvement</TooltipContent>
              </Tooltip>
            )}

            <Button
              size="sm"
              onClick={() => onApply(index)}
              disabled={isApplying}
              className="ml-2"
            >
              <Check className="h-4 w-4 mr-1" />
              Apply
            </Button>
          </div>
        </div>

        {/* Cards Comparison */}
        <div className="flex items-center gap-6">
          {/* Current Card */}
          <div className="flex-1">
            <OptimizerCard
              name={suggestion.currentCard.name}
              image={suggestion.currentCard.image}
              price={suggestion.currentCard.price}
              reason={suggestion.currentCard.reason}
              type="remove"
              playability={suggestion.currentCard.playability}
              size="lg"
            />
          </div>

          {/* Arrow Connector */}
          <div className="flex flex-col items-center gap-2">
            <motion.div
              animate={{ x: isHovered ? 5 : 0 }}
              transition={{ duration: 0.3, repeat: isHovered ? Infinity : 0, repeatType: 'reverse' }}
              className="w-12 h-12 rounded-full bg-gradient-to-r from-destructive/20 to-green-500/20 flex items-center justify-center border border-primary/30"
            >
              <ArrowRight className="h-6 w-6 text-primary" />
            </motion.div>
            {suggestion.newCard.synergy && (
              <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {suggestion.newCard.synergy}
              </Badge>
            )}
          </div>

          {/* New Card */}
          <div className="flex-1">
            <OptimizerCard
              name={suggestion.newCard.name}
              image={suggestion.newCard.image}
              price={suggestion.newCard.price}
              reason={suggestion.newCard.reason}
              type="add"
              inCollection={suggestion.newCard.inCollection}
              size="lg"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
