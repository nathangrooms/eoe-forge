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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Fan geometry: total sweep in degrees, and the height of the arc.
 *
 * The arc is applied as a *lift* on the middle cards rather than a drop on the
 * outer ones, so the whole fan stays on or above its baseline. Pushing the ends
 * downward instead would hang them off the bottom of the screen.
 */
function fanGeometry(count: number) {
  if (count <= 1) return { step: 0, arc: 0 };
  const sweep = Math.min(30, count * 4.5);
  return { step: sweep / (count - 1), arc: Math.min(22, count * 2.4) };
}

/**
 * How much each card hides the one before it.
 *
 * Capped at 42%: beyond that the art and the type line disappear behind the
 * next card and the hand becomes a stack of edges. Shrink-to-fit handles a hand
 * too wide for the screen, so overlap does not have to absorb it.
 */
function overlapFraction(count: number): number {
  if (count <= 1) return 0;
  return Math.min(0.42, Math.max(0.18, 1 - 7 / count));
}

/** Smallest a hand card may shrink to before it stops being readable at all. */
const MIN_HAND_CARD = 76;

/**
 * Widest card that still lets `count` cards fit inside `available` pixels.
 *
 * A fanned hand of n cards occupies `w + (n-1) * w * (1 - overlap)`, so solving
 * for w gives the largest card that fits. Without this the hand used a fixed
 * width and simply ran off the side of a narrow screen — ten cards at the
 * preferred size need roughly 970px.
 */
function fitCardWidth(available: number, count: number, preferred: number): number {
  if (count <= 0 || available <= 0) return preferred;
  const overlap = overlapFraction(count);
  const spans = 1 + (count - 1) * (1 - overlap);
  const fits = Math.floor(available / spans);
  return Math.max(MIN_HAND_CARD, Math.min(preferred, fits));
}

/** Width of an element, kept current across resizes and orientation changes. */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(prev => (Math.abs(prev - next) > 1 ? next : prev));
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function ViewerHand({
  state,
  viewerPlayerId,
  freeCast,
  onCast,
  onPlayLand,
  /* 104px rendered a Magic card at roughly a third of readable size — the owner
     could not read their own hand. A hand card is the thing you study before
     committing to a play, so it is the largest element on the table. */
  cardWidth = 210,
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

  const [fanRef, fanWidth] = useMeasuredWidth<HTMLDivElement>();
  /* Shrink to fit rather than running off the edge. `cardWidth` is the ceiling
     (the size the player asked for), not a fixed value. */
  const renderedWidth = fitCardWidth(
    fanWidth ? fanWidth - 16 : 0,
    cards.length,
    cardWidth
  );

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
    <div ref={fanRef} className={cn('flex items-end justify-center', className)}>
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
          // 0 at the ends, -arc in the middle: the fan curves upward off its
          // baseline instead of dropping its outer cards off the screen.
          const drop =
            middle === 0 ? 0 : ((offset * offset) / (middle * middle)) * arc - arc;

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
                marginLeft: index === 0 ? 0 : -renderedWidth * overlap,
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
                  width={renderedWidth}
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
