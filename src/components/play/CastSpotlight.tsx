/**
 * The card being cast, held in the middle of the table for a beat.
 *
 * Arena does this and it is not decoration: in a pod with three opponents, a
 * spell that resolves inside somebody else's quadrant is a spell you did not
 * see. Lifting it to the centre at a readable size — with who cast it and where
 * it went — is the difference between watching a game and watching numbers
 * change.
 *
 * It is `pointer-events-none` throughout. Nothing that appears on its own may
 * ever swallow a click.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { GameCardView } from './GameCardView';
import type { CastSpotlightEntry } from './useTableMotion';
import type { GameState } from '@/lib/game';

const DESTINATION: Record<string, string> = {
  battlefield: 'resolves onto the battlefield',
  graveyard: 'resolves',
  exile: 'is exiled',
};

export interface CastSpotlightProps {
  state: GameState;
  entry: CastSpotlightEntry | null;
  className?: string;
}

export function CastSpotlight({ state, entry, className }: CastSpotlightProps) {
  const reduceMotion = useReducedMotion();
  const caster = entry ? state.players.find(p => p.id === entry.controllerId) : null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-40 flex items-center justify-center',
        className
      )}
      aria-live="polite"
    >
      <AnimatePresence>
        {entry && (
          <motion.div
            key={entry.key}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.72, y: 26 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.06, y: -18 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 240, damping: 24, mass: 0.8 }
            }
            className="flex flex-col items-center gap-2"
          >
            {/* A pool of shadow under the card, so it lifts off whatever mat it
                happens to be floating over. */}
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -inset-12 -z-10"
                style={{
                  background:
                    'radial-gradient(closest-side, hsl(0 0% 2% / 0.72), transparent 100%)',
                }}
              />
              <GameCardView
                card={entry.card}
                size="xl"
                ignoreTapped
                className="drop-shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
              />
            </div>

            <div className="flex flex-col items-center gap-1 rounded-full bg-background/80 px-3 py-1 shadow-lg shadow-black/60 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {caster?.name ?? 'Someone'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {DESTINATION[entry.to] ?? 'plays a card'}
                </span>
                <ManaCost cost={entry.card.manaCost} size="xs" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CastSpotlight;
