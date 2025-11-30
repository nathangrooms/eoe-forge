import { motion, AnimatePresence } from 'framer-motion';
import { Phase } from '@/lib/simulation/types';

const PHASE_NAMES: Record<Phase, string> = {
  untap: '⟲ Untap',
  upkeep: '↑ Upkeep',
  draw: '🎴 Draw',
  precombat_main: '⚡ Main 1',
  combat_begin: '⚔️ Combat Begin',
  declare_attackers: '→ Declare Attackers',
  declare_blockers: '🛡️ Declare Blockers',
  combat_damage: '💥 Combat Damage',
  combat_end: '⚔️ Combat End',
  postcombat_main: '⚡ Main 2',
  end: '🌙 End',
  cleanup: '🧹 Cleanup'
};

export const PhaseIndicator = ({ phase, show }: { phase: Phase; show: boolean }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          transition={{ duration: 0.4, ease: "backOut" }}
          className="fixed top-1/3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
        >
          <div className="bg-gradient-to-r from-primary/90 to-primary-glow/90 backdrop-blur-sm px-12 py-6 rounded-2xl shadow-2xl border-2 border-primary-glow">
            <div className="text-4xl font-black text-primary-foreground tracking-wider drop-shadow-lg">
              {PHASE_NAMES[phase]}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
