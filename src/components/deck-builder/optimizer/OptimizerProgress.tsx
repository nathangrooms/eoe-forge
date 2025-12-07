// Premium loading progress component with step indicators
import { motion } from 'framer-motion';
import { Brain, Search, Sparkles, ImageIcon, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressStep {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const STEPS: ProgressStep[] = [
  { id: 'analyzing', label: 'Analyzing deck composition', icon: <Brain className="h-5 w-5" /> },
  { id: 'comparing', label: 'Comparing card options', icon: <Search className="h-5 w-5" /> },
  { id: 'generating', label: 'Generating recommendations', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'fetching', label: 'Loading card images', icon: <ImageIcon className="h-5 w-5" /> }
];

interface OptimizerProgressProps {
  currentStep: number;
  loadingCollection?: boolean;
}

export function OptimizerProgress({ currentStep, loadingCollection }: OptimizerProgressProps) {
  return (
    <div className="relative">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-600/10 rounded-2xl blur-xl" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative p-8 rounded-2xl border border-primary/20 bg-card/80 backdrop-blur-sm"
      >
        {/* Central Animation */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-primary rounded-full blur-lg opacity-50"
            />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <Brain className="h-10 w-10 text-white" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -inset-2 rounded-full border-2 border-primary/30"
            />
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h3 className="text-xl font-bold mb-2">
            {loadingCollection ? 'Scanning Your Collection' : 'Optimizing Your Deck'}
          </h3>
          <p className="text-muted-foreground text-sm">
            {loadingCollection 
              ? 'Finding cards you already own for budget-friendly upgrades'
              : 'Analyzing synergies and finding the best improvements'
            }
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg transition-all duration-300",
                  isActive && "bg-primary/10 border border-primary/30",
                  isCompleted && "opacity-60"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  isCompleted ? "bg-green-500/20 text-green-400" :
                  isActive ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                )}>
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span className={cn(
                  "font-medium transition-colors",
                  isActive && "text-foreground",
                  !isActive && !isCompleted && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
                {isActive && (
                  <motion.div
                    className="ml-auto flex gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-primary"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
