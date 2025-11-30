import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface BattleIntroProps {
  deck1Name: string;
  deck2Name: string;
  onComplete: () => void;
}

export const BattleIntro = ({ deck1Name, deck2Name, onComplete }: BattleIntroProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-lg"
    >
      {/* Lightning effects */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0"
            style={{
              top: `${20 + i * 15}%`,
              left: i % 2 === 0 ? '-100%' : '100%',
              width: '100%',
            }}
            animate={{
              left: i % 2 === 0 ? '100%' : '-100%',
            }}
            transition={{
              duration: 0.8,
              delay: i * 0.1,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Deck icons sliding in */}
      <div className="relative z-10 flex items-center gap-16">
        <motion.div
          initial={{ x: -500, rotate: -45 }}
          animate={{ x: 0, rotate: 0 }}
          transition={{ duration: 0.8, type: 'spring' }}
          className="relative"
        >
          <div className="h-40 w-28 rounded-lg border-4 border-primary bg-gradient-to-br from-primary/20 to-primary/5 shadow-2xl shadow-primary/50 flex items-center justify-center">
            <Zap className="h-16 w-16 text-primary animate-pulse" />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-4 text-center text-xl font-bold"
          >
            {deck1Name}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          className="text-4xl font-bold text-primary"
        >
          VS
        </motion.div>

        <motion.div
          initial={{ x: 500, rotate: 45 }}
          animate={{ x: 0, rotate: 0 }}
          transition={{ duration: 0.8, type: 'spring' }}
          className="relative"
        >
          <div className="h-40 w-28 rounded-lg border-4 border-secondary bg-gradient-to-br from-secondary/20 to-secondary/5 shadow-2xl shadow-secondary/50 flex items-center justify-center">
            <Zap className="h-16 w-16 text-secondary animate-pulse" />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-4 text-center text-xl font-bold"
          >
            {deck2Name}
          </motion.div>
        </motion.div>
      </div>

      {/* Battle message */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="absolute bottom-24 text-center"
      >
        <motion.h1
          className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Let the battle begin!
        </motion.h1>
      </motion.div>

      {/* Auto-complete after animation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        onAnimationComplete={onComplete}
      />
    </motion.div>
  );
};
