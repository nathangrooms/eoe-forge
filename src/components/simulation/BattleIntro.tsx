import { motion } from 'framer-motion';

interface BattleIntroProps {
  deck1Name: string;
  deck2Name: string;
  onComplete: () => void;
}

/**
 * Brief title card shown as a simulation starts. Stripped of the animated
 * lightning bars, gradient card backs, glow shadows, pulsing icons and
 * gradient-clipped headline — it is a name-versus-name plate now.
 */
export const BattleIntro = ({ deck1Name, deck2Name, onComplete }: BattleIntroProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/95 px-4 backdrop-blur-lg"
    >
      <div className="flex w-full max-w-3xl items-center justify-center gap-8 sm:gap-16">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="min-w-0 flex-1 text-center"
        >
          <div className="mx-auto mb-4 h-32 w-24 rounded-lg border-2 border-border bg-card" />
          <div className="truncate text-lg font-bold text-foreground sm:text-xl">{deck1Name}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="shrink-0 text-sm font-semibold uppercase tracking-widest text-muted-foreground"
        >
          versus
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="min-w-0 flex-1 text-center"
        >
          <div className="mx-auto mb-4 h-32 w-24 rounded-lg border-2 border-border bg-card" />
          <div className="truncate text-lg font-bold text-foreground sm:text-xl">{deck2Name}</div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.3 }}
        onAnimationComplete={onComplete}
        className="text-sm text-muted-foreground"
      >
        Dealing opening hands…
      </motion.div>
    </motion.div>
  );
};
