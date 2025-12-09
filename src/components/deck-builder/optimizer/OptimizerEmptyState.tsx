// Beautiful empty state for optimizer
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
      description: `Your deck needs ${missingCards} more cards to reach the required count. Get smart suggestions based on your commander and strategy.`,
      action: 'Get Card Suggestions',
      color: 'text-orange-400'
    },
    overloaded: {
      title: 'Trim Your Deck',
      description: `Your deck has ${excessCards} too many cards. We'll help you identify the weakest links to cut.`,
      action: 'Get Cut Suggestions',
      color: 'text-destructive'
    },
    complete: {
      title: 'Optimize Your Build',
      description: 'Your deck is complete! Find opportunities to swap underperforming cards for better options.',
      action: 'Analyze & Optimize',
      color: 'text-green-400'
    }
  };

  const status = statusMessages[deckStatus];

  if (!hasCards) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="p-12 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <Brain className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Add Cards to Get Started</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Once you add cards to your deck, the optimizer will analyze them and provide intelligent suggestions.
            </p>
          </motion.div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main CTA Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              {/* Left side - Icon animation */}
              <div className="relative flex-shrink-0">
                <motion.div
                  className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center"
                  animate={{ 
                    boxShadow: [
                      '0 0 20px rgba(139, 92, 246, 0.2)',
                      '0 0 40px rgba(139, 92, 246, 0.3)',
                      '0 0 20px rgba(139, 92, 246, 0.2)'
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="h-14 w-14 text-primary" />
                </motion.div>
                {hasEdhData && (
                  <motion.div 
                    className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Zap className="h-3 w-3" />
                    EDH Ready
                  </motion.div>
                )}
              </div>

              {/* Right side - Content */}
              <div className="flex-1 text-center lg:text-left">
                <h2 className={cn("text-2xl font-bold mb-2", status.color)}>
                  {status.title}
                </h2>
                <p className="text-muted-foreground mb-6 max-w-lg">
                  {status.description}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Button 
                    size="lg" 
                    onClick={onOptimize}
                    disabled={isLoading}
                    className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  >
                    <Sparkles className="h-5 w-5 mr-2" />
                    {status.action}
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    onClick={onOptimizeFromCollection}
                    disabled={isLoading}
                  >
                    <Library className="h-5 w-5 mr-2" />
                    Use My Collection
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.1 }}
          >
            <Card className="h-full hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">{feature.title}</h4>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
