// Smart quick actions bar for optimizer - Mobile optimized
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  Sparkles, 
  Wand2, 
  RotateCcw,
  CheckCheck,
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
        className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-lg bg-muted/50 border border-border/50"
      >
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground mr-1 sm:mr-2 hidden xs:inline">
          Quick:
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
                className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3 bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
              >
                <Wand2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-green-400" />
                <span className="hidden xs:inline">Auto-Fill </span>{missingCards}
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
                className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3 bg-destructive/10 border-destructive/30 hover:bg-destructive/20"
              >
                <Wand2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-destructive" />
                <span className="hidden xs:inline">Auto-Cut </span>{excessCards}
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
                className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3 bg-primary/10 border-primary/30 hover:bg-primary/20"
              >
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-primary" />
                <span className="hidden xs:inline">Auto-</span>Optimize
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Apply all recommended swaps at once</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Divider - hidden on very small screens */}
        <div className="h-5 sm:h-6 w-px bg-border mx-0.5 sm:mx-1 hidden xs:block" />

        {/* Common actions */}
        {canUndo && onUndo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onUndo}
                disabled={isProcessing}
                className="h-7 sm:h-8 text-[10px] sm:text-xs px-2"
              >
                <Undo2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline ml-1.5">Undo</span>
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
                className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline ml-1.5">Reset</span>
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
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] sm:text-xs">
              <CheckCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
              {selectedCount}
            </Badge>
          </motion.div>
        )}
      </motion.div>
    </TooltipProvider>
  );
}
