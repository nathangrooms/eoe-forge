/**
 * Your hand, fanned along the bottom edge.
 *
 * This is the Arena half of the brief. A hand is not a list — it is a fan of
 * cards held at an angle, closest to you, that you lift one of to look at it.
 * So: an arc, a rotation per card, an overlap that grows as the hand grows, and
 * a lift on hover that straightens the card and brings it forward.
 *
 * Castability is decided by `planCastFromHand` / `planLandDrop` — the same
 * helpers the bot uses — so the fan and the rules can never disagree about what
 * you are allowed to play. A card you cannot pay for is desaturated and says
 * why on hover rather than vanishing.
 *
 * Cards fly in when drawn and fly *out toward the board* when played, which is
 * the whole reason the fan and the battlefield share a screen instead of living
 * in two tabs. All of it collapses to nothing under `prefers-reduced-motion`.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GameCardView } from './GameCardView';
import {
  isLand,
  planCastFromHand,
  planLandDrop,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '@/lib/game';

export interface ViewerHandProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  onCast: (card: CardInstance) => void;
  onPlayLand: (card: CardInstance) => void;
  /** Rendered width of a card in the fan. */
  cardWidth?: number;
  /** Include the command zone at the right-hand end of the fan. */
  includeCommandZone?: boolean;
  className?: string;
}

/** Fan geometry: total sweep in degrees, and how far the ends drop. */
function fanGeometry(count: number) {
  if (count <= 1) return { step: 0, arc: 0 };
  const sweep = Math.min(30, count * 4.5);
  return { step: sweep / (count - 1), arc: Math.min(22, count * 2.4) };
}

function overlapFraction(count: number): number {
  if (count <= 1) return 0;
  return Math.min(0.6, Math.max(0.24, 1 - 7 / count));
}

export function ViewerHand({
  state,
  viewerPlayerId,
  freeCast,
  onCast,
  onPlayLand,
  cardWidth = 104,
  includeCommandZone = true,
  className,
}: ViewerHandProps) {
  const reduceMotion = useReducedMotion();
  const me = state.players.find(p => p.id === viewerPlayerId);
  if (!me) return null;

  const hand = me.zones.hand.map(id => state.cards[id]).filter(Boolean);
  const command = includeCommandZone
    ? me.zones.command.map(id => state.cards[id]).filter(Boolean)
    : [];
  const cards = [...hand, ...command];

  const { step, arc } = fanGeometry(cards.length);
  const middle = (cards.length - 1) / 2;
  const overlap = overlapFraction(cards.length);

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-end justify-center pb-2', className)}>
        <p className="rounded-full bg-background/60 px-3 py-1 text-[11px] text-muted-foreground shadow-md shadow-black/40 backdrop-blur-sm">
          Your hand is empty
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex items-end justify-center', className)}>
      <AnimatePresence initial={false}>
        {cards.map((card, index) => {
          const fromCommand = index >= hand.length;
          const land = isLand(card);
          const landPlan = land ? planLandDrop(state, viewerPlayerId, card.instanceId) : null;
          const castPlan = land
            ? null
            : planCastFromHand(state, viewerPlayerId, card.instanceId, { ignoreMana: freeCast });

          const playable = land ? !!landPlan?.ok : !!castPlan?.ok;
          const reason = (land ? landPlan?.reason : castPlan?.reason) ?? '';
          const offset = index - middle;
          const rotate = offset * step;
          const drop = middle === 0 ? 0 : (offset * offset / (middle * middle)) * arc;

          const action = land ? 'Play' : fromCommand ? 'Cast from the command zone' : 'Cast';
          const label = playable
            ? `${action} ${card.name}`
            : `${card.name} — ${reason || 'not playable right now'}`;

          return (
            <motion.div
              key={card.instanceId}
              layout={!reduceMotion}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, x: 180, y: -70, rotate: -24, scale: 0.7 }
              }
              animate={{ opacity: 1, x: 0, y: drop, rotate, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -150, scale: 0.85, transition: { duration: 0.28 } }
              }
              whileHover={
                reduceMotion ? undefined : { y: drop - 54, rotate: 0, scale: 1.16, zIndex: 60 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 }
              }
              style={{
                transformOrigin: 'bottom center',
                marginLeft: index === 0 ? 0 : -cardWidth * overlap,
                zIndex: index,
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => (land ? onPlayLand(card) : onCast(card))}
                title={label}
                aria-label={label}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GameCardView
                  card={card}
                  width={cardWidth}
                  ignoreTapped
                  dimmed={!playable && !freeCast}
                  title={label}
                />
                {fromCommand && (
                  <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background shadow-md shadow-black/60">
                    Cmd
                  </span>
                )}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ViewerHand;
