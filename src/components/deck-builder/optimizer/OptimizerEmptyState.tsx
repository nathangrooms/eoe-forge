// Beautiful empty state for optimizer - Mobile optimized
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Sparkles, 
  Library, 
  Zap, 
  Target, 
  ArrowRight,
  TrendingUp,
  Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface OptimizerEmptyStateProps {
  deckStatus: 'incomplete' | 'overloaded' | 'complete';
  missingCards: number;
  excessCards: number;
  hasCards: boolean;
  hasEdhData: boolean;
  onOptimize: () => void;
  onOptimizeFromCollection: () => void;
  isLoading: boolean;
}

export function OptimizerEmptyState({
  deckStatus,
  missingCards,
  excessCards,
  hasCards,
  hasEdhData,
  onOptimize,
  onOptimizeFromCollection,
  isLoading
}: OptimizerEmptyStateProps) {
  const features = [
    {
      icon: Target,
      title: 'Smart Suggestions',
      description: 'AI analyzes your deck and suggests optimal cards'
    },
    {
      icon: Zap,
      title: 'EDH Power Tracking',
      description: 'See how changes affect your power level'
    },
    {
      icon: TrendingUp,
      title: 'Playability Data',
      description: 'Uses real EDH data to find underperformers'
    }
  ];

  const statusMessages = {
    incomplete: {
      title: 'Complete Your Deck',
      description: `Your deck needs ${missingCards} more cards to reach the required count.`,
      action: 'Get Suggestions',
      color: 'text-orange-400'
    },
    overloaded: {
      title: 'Trim Your Deck',
      description: `Your deck has ${excessCards} too many cards. Find the weakest links.`,
      action: 'Get Cuts',
      color: 'text-destructive'
    },
    complete: {
      title: 'Optimize Your Build',
      description: 'Find opportunities to swap underperforming cards.',
      action: 'Analyze',
      color: 'text-green-400'
    }
  };

  const status = statusMessages[deckStatus];

  if (!hasCards) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="p-6 sm:p-12 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <Brain className="h-7 w-7 sm:h-10 sm:w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold mb-2">Add Cards to Get Started</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Once you add cards, the optimizer will provide intelligent suggestions.
            </p>
          </motion.div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Main CTA Card - Mobile optimized */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5 overflow-hidden">
          <CardContent className="p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
              {/* Left side - Icon animation */}
              <div className="relative flex-shrink-0">
                <motion.div
                  className="w-20 h-20 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center"
                  animate={{ 
                    boxShadow: [
                      '0 0 20px rgba(139, 92, 246, 0.2)',
                      '0 0 40px rgba(139, 92, 246, 0.3)',
                      '0 0 20px rgba(139, 92, 246, 0.2)'
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="h-10 w-10 sm:h-14 sm:w-14 text-primary" />
                </motion.div>
                {hasEdhData && (
                  <motion.div 
                    className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-green-500 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full flex items-center gap-0.5 sm:gap-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    <span className="hidden xs:inline">EDH Ready</span>
                  </motion.div>
                )}
              </div>

              {/* Right side - Content */}
              <div className="flex-1 text-center sm:text-left">
                <h2 className={cn("text-xl sm:text-2xl font-bold mb-1 sm:mb-2", status.color)}>
                  {status.title}
                </h2>
                <p className="text-sm text-muted-foreground mb-4 sm:mb-6 max-w-lg">
                  {status.description}
                </p>
                <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 justify-center sm:justify-start">
                  <Button 
                    size="default"
                    onClick={onOptimize}
                    disabled={isLoading}
                    className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 h-10 sm:h-11 text-sm sm:text-base"
                  >
                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    {status.action}
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 ml-2" />
                  </Button>
                  <Button 
                    size="default" 
                    variant="outline"
                    onClick={onOptimizeFromCollection}
                    disabled={isLoading}
                    className="h-10 sm:h-11 text-sm sm:text-base"
                  >
                    <Library className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    <span className="hidden xs:inline">Use My </span>Collection
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Cards - Single column on mobile, 3 on desktop */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-2 sm:gap-4">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.1 }}
          >
            <Card className="h-full hover:border-primary/30 transition-colors">
              <CardContent className="p-3 sm:p-5">
                <div className="flex xs:flex-col items-center xs:items-start gap-3 xs:gap-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center xs:mb-3 flex-shrink-0">
                    <feature.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm sm:text-base mb-0.5 sm:mb-1">{feature.title}</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
