// Smart quick actions bar for optimizer
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  Sparkles, 
  Wand2, 
  RotateCcw,
  CheckCheck,
  Filter,
  SortAsc,
  Undo2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface OptimizerQuickActionsProps {
  deckStatus: 'incomplete' | 'overloaded' | 'complete';
  missingCards: number;
  excessCards: number;
  onAutoFill?: () => void;
  onAutoCut?: () => void;
  onAutoOptimize?: () => void;
  onUndo?: () => void;
  onReset?: () => void;
  canUndo: boolean;
  isProcessing: boolean;
  selectedCount: number;
}

export function OptimizerQuickActions({
  deckStatus,
  missingCards,
  excessCards,
  onAutoFill,
  onAutoCut,
  onAutoOptimize,
  onUndo,
  onReset,
  canUndo,
  isProcessing,
  selectedCount
}: OptimizerQuickActionsProps) {
  return (
    <TooltipProvider>
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/50"
      >
        <span className="text-xs font-medium text-muted-foreground mr-2">
          Quick Actions:
        </span>
        
        {/* Context-specific actions */}
        {deckStatus === 'incomplete' && onAutoFill && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                onClick={onAutoFill}
                disabled={isProcessing || missingCards === 0}
                className="h-8 text-xs bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1.5 text-green-400" />
                Auto-Fill {missingCards}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Automatically add the best {missingCards} cards</p>
            </TooltipContent>
          </Tooltip>
        )}

        {deckStatus === 'overloaded' && onAutoCut && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                onClick={onAutoCut}
                disabled={isProcessing || excessCards === 0}
                className="h-8 text-xs bg-destructive/10 border-destructive/30 hover:bg-destructive/20"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                Auto-Cut {excessCards}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Automatically remove the worst {excessCards} cards</p>
            </TooltipContent>
          </Tooltip>
        )}

        {deckStatus === 'complete' && onAutoOptimize && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                onClick={onAutoOptimize}
                disabled={isProcessing}
                className="h-8 text-xs bg-primary/10 border-primary/30 hover:bg-primary/20"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />
                Auto-Optimize
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Apply all recommended swaps at once</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Divider */}
        <div className="h-6 w-px bg-border mx-1" />

        {/* Common actions */}
        {canUndo && onUndo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onUndo}
                disabled={isProcessing}
                className="h-8 text-xs"
              >
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Undo
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo last action</p>
            </TooltipContent>
          </Tooltip>
        )}

        {onReset && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onReset}
                disabled={isProcessing}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear all suggestions and start over</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Selection indicator */}
        {selectedCount > 0 && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="ml-auto"
          >
            <Badge className="bg-primary/20 text-primary border-primary/30">
              <CheckCheck className="h-3 w-3 mr-1" />
              {selectedCount} selected
            </Badge>
          </motion.div>
        )}
      </motion.div>
    </TooltipProvider>
  );
}
