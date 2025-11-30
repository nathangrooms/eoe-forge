import { motion, AnimatePresence } from 'framer-motion';
import { GameState } from '@/lib/simulation/types';

interface TurnOverviewProps {
  show: boolean;
  state: GameState;
  damageDealt: {
    toPlayer1: number;
    toPlayer2: number;
    player1Commander?: number;
    player2Commander?: number;
  };
}

export const TurnOverview = ({ show, state, damageDealt }: TurnOverviewProps) => {
  if (!show || (damageDealt.toPlayer1 === 0 && damageDealt.toPlayer2 === 0)) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.4, ease: 'backOut' }}
          className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none"
        >
          <div className="relative">
            {/* Explosion effect */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, times: [0, 0.5, 1] }}
              className="absolute inset-0 rounded-full bg-red-500/30 blur-3xl"
              style={{ width: '400px', height: '400px', margin: 'auto' }}
            />

            {/* Main card */}
            <motion.div
              initial={{ rotateX: -90, y: -100 }}
              animate={{ rotateX: 0, y: 0 }}
              transition={{ duration: 0.5, ease: 'backOut' }}
              className="relative bg-gradient-to-br from-red-900 via-red-800 to-red-950 border-4 border-red-500 rounded-2xl p-8 shadow-2xl"
              style={{ perspective: 1000 }}
            >
              {/* Title */}
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="text-5xl font-black text-red-200 mb-2 drop-shadow-lg"
                >
                  ⚔️ TURN {state.turn} ⚔️
                </motion.div>
                <div className="text-lg text-red-300 uppercase tracking-wider">
                  Battle Report
                </div>
              </div>

              {/* Damage dealt */}
              <div className="grid grid-cols-2 gap-8 mb-6">
                {/* Player 1 damage */}
                {damageDealt.toPlayer1 > 0 && (
                  <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center"
                  >
                    <div className="text-sm text-red-300 mb-2">{state.player1.name}</div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className="text-6xl font-black text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]"
                    >
                      -{damageDealt.toPlayer1}
                    </motion.div>
                    <div className="text-2xl font-bold text-red-200 mt-2">
                      {state.player1.life} ❤️
                    </div>
                    {damageDealt.player1Commander && damageDealt.player1Commander > 0 && (
                      <div className="text-sm text-amber-400 mt-1">
                        ⭐ {damageDealt.player1Commander} Commander Damage
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Player 2 damage */}
                {damageDealt.toPlayer2 > 0 && (
                  <motion.div
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center"
                  >
                    <div className="text-sm text-red-300 mb-2">{state.player2.name}</div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className="text-6xl font-black text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]"
                    >
                      -{damageDealt.toPlayer2}
                    </motion.div>
                    <div className="text-2xl font-bold text-red-200 mt-2">
                      {state.player2.life} ❤️
                    </div>
                    {damageDealt.player2Commander && damageDealt.player2Commander > 0 && (
                      <div className="text-sm text-amber-400 mt-1">
                        ⭐ {damageDealt.player2Commander} Commander Damage
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                {[...Array(15)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      x: '50%',
                      y: '50%',
                      scale: 0,
                      opacity: 1,
                    }}
                    animate={{
                      x: `${50 + (Math.random() - 0.5) * 200}%`,
                      y: `${50 + (Math.random() - 0.5) * 200}%`,
                      scale: Math.random() * 2 + 0.5,
                      opacity: 0,
                    }}
                    transition={{ duration: 1.5, delay: i * 0.05 }}
                    className="absolute w-3 h-3 bg-red-400 rounded-full"
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
