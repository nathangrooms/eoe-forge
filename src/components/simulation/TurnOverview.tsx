import { motion, AnimatePresence } from 'framer-motion';
import { GameState } from '@/lib/simulation/types';
import { Heart, Swords } from 'lucide-react';

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

/**
 * End-of-turn damage summary.
 *
 * Previously a red gradient card with a blur "explosion", fifteen animated
 * particles, glow drop-shadows and emoji. The information it carries — damage
 * this turn, life after, and commander damage — is worth keeping; the styling
 * was not.
 */
export const TurnOverview = ({ show, state, damageDealt }: TurnOverviewProps) => {
  if (!show || (damageDealt.toPlayer1 === 0 && damageDealt.toPlayer2 === 0)) return null;

  const sides = [
    {
      key: 'player1',
      name: state.player1.name,
      damage: damageDealt.toPlayer1,
      life: state.player1.life,
      commanderDamage: damageDealt.player1Commander ?? 0,
    },
    {
      key: 'player2',
      name: state.player2.name,
      damage: damageDealt.toPlayer2,
      life: state.player2.life,
      commanderDamage: damageDealt.player2Commander ?? 0,
    },
  ].filter(s => s.damage > 0);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 text-center">
              <div className="text-2xl font-bold text-foreground">Turn {state.turn}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Damage this turn
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {sides.map(side => (
                <div
                  key={side.key}
                  className="flex flex-col items-center rounded-lg border border-border p-4"
                >
                  <div className="mb-1 max-w-full truncate text-xs text-muted-foreground">
                    {side.name}
                  </div>
                  <div className="text-4xl font-black tabular-nums text-destructive">
                    -{side.damage}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1 text-lg font-semibold tabular-nums text-foreground">
                    <Heart className="h-4 w-4" aria-hidden />
                    {side.life}
                  </div>
                  {side.commanderDamage > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Swords className="h-3 w-3" aria-hidden />
                      {side.commanderDamage} commander damage
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
