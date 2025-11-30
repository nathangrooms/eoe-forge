import { motion, AnimatePresence } from 'framer-motion';
import { GameCard } from '@/lib/simulation/types';

interface SimulationCinematicOverlayProps {
  mode: 'attack' | 'block' | 'destroy';
  attackerCards?: GameCard[];
  blockerCards?: GameCard[];
  destroyedCards?: GameCard[];
}

export const SimulationCinematicOverlay = ({
  mode,
  attackerCards = [],
  blockerCards = [],
  destroyedCards = [],
}: SimulationCinematicOverlayProps) => {
  const title =
    mode === 'attack'
      ? 'All-Out Assault'
      : mode === 'block'
        ? 'Defensive Wall'
        : 'Devastating Blow';

  const subtitle =
    mode === 'attack'
      ? 'Attackers are charging into battle'
      : mode === 'block'
        ? 'Blockers step in to absorb the damage'
        : 'Creatures are destroyed in a flash of power';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-xl flex items-center justify-center pointer-events-none"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative max-w-5xl w-full mx-4 rounded-3xl border border-primary/40 bg-gradient-to-br from-background via-primary/10 to-background shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute -left-16 -top-16 w-64 h-64 rounded-full bg-primary/40 blur-3xl" />
            <div className="absolute -right-10 -bottom-10 w-72 h-72 rounded-full bg-accent/40 blur-3xl" />
          </div>

          <div className="relative px-8 pt-8 pb-6 flex flex-col gap-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.25em] uppercase text-muted-foreground mb-2">
                  {mode === 'attack' && 'Combat Phase'}
                  {mode === 'block' && 'Defense Phase'}
                  {mode === 'destroy' && 'Resolution'}
                </div>
                <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-primary via-accent to-primary-foreground bg-clip-text text-transparent">
                  {title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">{subtitle}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground hidden sm:block">
                <div className="font-semibold">Cinematic View</div>
                <div className="opacity-80">Auto-plays on key moments</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
              <div className="sm:col-span-1 flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attackers</div>
                <div className="flex flex-wrap gap-2">
                  {attackerCards.map((card) => (
                    <div
                      key={card.instanceId}
                      className="px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 text-xs font-semibold text-primary-foreground/90"
                    >
                      {card.name}
                    </div>
                  ))}
                  {attackerCards.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No attackers</div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-1 flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blockers</div>
                <div className="flex flex-wrap gap-2">
                  {blockerCards.map((card) => (
                    <div
                      key={card.instanceId}
                      className="px-3 py-1.5 rounded-full bg-accent/20 border border-accent/40 text-xs font-semibold text-accent-foreground/90"
                    >
                      {card.name}
                    </div>
                  ))}
                  {blockerCards.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No blockers assigned</div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-1 flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {mode === 'destroy' ? 'Destroyed' : 'At Risk'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {destroyedCards.map((card) => (
                    <div
                      key={card.instanceId}
                      className="px-3 py-1.5 rounded-full bg-destructive/20 border border-destructive/40 text-xs font-semibold text-destructive/90"
                    >
                      {card.name}
                    </div>
                  ))}
                  {destroyedCards.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No creatures destroyed yet</div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-muted/60">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-primary via-accent to-primary-foreground"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
