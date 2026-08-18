/**
 * Loading state for the optimiser run.
 *
 * Restyled to match the rest of the rebuild: the outline is gone (design law
 * 2), the type is readable, and the dead `blur-xl` "background glow" div — which
 * rendered nothing and was against the no-glow rule anyway — has been removed.
 */

import { motion } from 'framer-motion';
import { Brain, Search, Sparkles, ImageIcon, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressStep {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const STEPS: ProgressStep[] = [
  { id: 'analyzing', label: 'Reading the decklist', icon: <Brain className="h-5 w-5" /> },
  { id: 'comparing', label: 'Comparing card options', icon: <Search className="h-5 w-5" /> },
  {
    id: 'generating',
    label: 'Generating recommendations',
    icon: <Sparkles className="h-5 w-5" />,
  },
  { id: 'fetching', label: 'Loading card art', icon: <ImageIcon className="h-5 w-5" /> },
];

interface OptimizerProgressProps {
  currentStep: number;
  loadingCollection?: boolean;
}

export function OptimizerProgress({ currentStep, loadingCollection }: OptimizerProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl bg-card p-8 shadow-lg sm:p-10"
    >
      <div className="mx-auto max-w-2xl">
        <h3 className="text-2xl font-bold">
          {loadingCollection ? 'Scanning your collection' : 'Optimising your deck'}
        </h3>
        <p className="mt-2 text-base text-muted-foreground">
          {loadingCollection
            ? 'Finding cards you already own so the suggestions cost nothing.'
            : 'Reading synergies, curve and mana base to find the changes worth making.'}
        </p>

        <div className="mt-8 space-y-2">
          {STEPS.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className={cn(
                  'flex items-center gap-4 rounded-xl p-4 transition-colors',
                  isActive && 'bg-muted',
                  isCompleted && 'opacity-55'
                )}
              >
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={cn(
                    'text-base font-medium',
                    !isActive && !isCompleted && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
