/**
 * The card being cast, held at the right edge of the table for a beat.
 *
 * Owner: *"When new creatures come on the map, perhaps show them on the right
 * hand side for a second, really large so people can read it, it should fade
 * away or get replaced if another is cast though."*
 *
 * Three things follow from that, and all three are the point:
 *
 *   **Right edge, not the centre.** A card in the middle of the board covers
 *   the exact thing everyone is looking at. At the edge, play continues
 *   underneath it.
 *   **Large enough to READ.** Somebody across the table should be able to see
 *   what resolved without asking. A thumbnail of a spell is not information.
 *   **Replaced, never queued.** A new cast takes the slot immediately, so the
 *   spotlight always shows the most recent thing rather than a backlog.
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

/*
 * Where the card went, as a label rather than as a sentence.
 *
 * It used to be a verb phrase agreeing with a third-person subject
 * ("resolves onto the battlefield") pinned to the caster's name — and the
 * viewer's own seat is called "You", so the caption on every spell the player
 * cast read "You resolves onto the battlefield". A caption with no verb in it
 * cannot get subject and verb agreement wrong.
 */
const DESTINATION: Record<string, string> = {
  battlefield: 'onto the battlefield',
  graveyard: 'to the graveyard',
  exile: 'to exile',
};

export interface CastSpotlightProps {
  state: GameState;
  entry: CastSpotlightEntry | null;
  /** Rendered card width. Sized by the page against the viewport. */
  width?: number;
  className?: string;
}

export function CastSpotlight({ state, entry, width = 260, className }: CastSpotlightProps) {
  const reduceMotion = useReducedMotion();
  const caster = entry ? state.players.find(p => p.id === entry.controllerId) : null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-40 flex items-center justify-end pr-3',
        className
      )}
      aria-live="polite"
    >
      {/*
        `popLayout`, because "replaced, never queued" has to be true of the
        LAYOUT and not just of the state.

        A plain `AnimatePresence` keeps the outgoing card in the flow while it
        fades, and this container is a flex row, so for the length of the swap
        there were two cards on the mat side by side and the new one was pushed
        off the right edge to make room for the old one. Measured mid-swap:
        the incoming card sat at x 1096..1385 of a 1680px viewport, roughly 300px
        short of the edge it is supposed to be pinned to, with the previous
        card's caption still legible beside it. Two spells on screen at once is
        exactly the backlog the owner asked not to see.

        `popLayout` takes the exiting card out of flow, so the new one lands on
        the edge immediately and the old one fades from underneath it.
      */}
      <AnimatePresence mode="popLayout">
        {entry && (
          <motion.div
            key={entry.key}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 40, scale: 0.9 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 260, damping: 26, mass: 0.7 }
            }
            className="flex flex-col items-center gap-2"
            style={{ width }}
          >
            {/* A pool of shadow behind the card, so it lifts off whatever mat it
                happens to be floating over. */}
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -inset-10 -z-10"
                style={{
                  background:
                    'radial-gradient(closest-side, hsl(0 0% 2% / 0.78), transparent 100%)',
                }}
              />
              <GameCardView
                card={entry.card}
                width={width}
                ignoreTapped
                className="drop-shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
              />
            </div>

            <div className="flex w-full items-center justify-center gap-2 truncate rounded-full bg-background/80 px-3 py-1 shadow-lg shadow-black/60 backdrop-blur-md">
              <span className="truncate text-xs font-semibold text-foreground">
                {caster?.name ?? 'Someone'}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {DESTINATION[entry.to] ?? 'played'}
              </span>
              <ManaCost cost={entry.card.manaCost} size="xs" className="shrink-0" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CastSpotlight;
