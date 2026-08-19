/**
 * Cards travelling between zones, drawn over the board.
 *
 * Owner: *"think about all of the animations and review them for play mode -
 * make it feel immersive with animations where possible"*, and the spec's first
 * principle under it: a card that changes zones should be SEEN to change zones.
 * Before this, a land you played vanished from your hand and appeared on the mat
 * in the same frame, which is the exact case the spec calls out — *"a card that
 * teleports leaves the player unsure whether their click registered"*.
 *
 * ## How it knows where a card was
 *
 * Every `GameCardView` carries `data-instance`, so the board itself is the
 * position index and there is no parallel registry of refs to keep in step with
 * it. This records where each card was drawn after every committed state; when
 * the next state moves a card, the previous rect is still in that record and the
 * new one is measured from the DOM. The ghost is tweened between the two.
 *
 * A card whose start or end position was never on screen — into a library, out
 * of an opponent's hand — is not drawn at all. `zoneTravel.ts` refuses those,
 * and the reason is project law rather than taste: a flight path out of a
 * shuffled deck is an invented position.
 *
 * ## It never gates anything
 *
 * Principle three: *"Never block input on an animation. The engine state is
 * already committed before the animation plays."* So this is a
 * `pointer-events-none` sibling of the board that reads state and renders
 * nothing interactive. Every ghost is a copy; the real card is already where it
 * belongs underneath. Removing this component changes what the board LOOKS like
 * and nothing about what it does.
 *
 * ## Cost
 *
 * One `querySelectorAll('[data-instance]')` per committed state, not per frame
 * and not per render — the board changes identity exactly when the game does.
 * At most `MAX_TRAVELS` ghosts exist at once, so a board wipe is a handful of
 * cards leaving rather than forty simultaneous tweens.
 *
 * `prefers-reduced-motion` renders nothing, as `GameCardView` already does.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GameCardView } from './GameCardView';
import { zoneMovesBetween, zoneSnapshot, travelDuration, type ZoneSnapshot } from './zoneTravel';
import type { CardInstance, GameState, PlayerId } from '@/lib/game';

interface Travel {
  key: number;
  card: CardInstance;
  from: { x: number; y: number; width: number };
  to: { x: number; y: number; width: number };
  duration: number;
}

/** A ghost outlives its tween by this much, so it fades rather than snapping. */
const LINGER_MS = 140;

type Rect = { x: number; y: number; width: number };

function readRects(root: HTMLElement | null): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  const scope: ParentNode = root ?? document;
  for (const element of scope.querySelectorAll('[data-instance]')) {
    const id = element.getAttribute('data-instance');
    if (!id || rects[id]) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 8) continue;
    rects[id] = { x: box.x, y: box.y, width: box.width };
  }
  return rects;
}

export interface ZoneTravelLayerProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  className?: string;
}

export function ZoneTravelLayer({ state, viewerPlayerId, className }: ZoneTravelLayerProps) {
  const reduceMotion = useReducedMotion();

  const zonesRef = useRef<ZoneSnapshot | null>(null);
  const rectsRef = useRef<Record<string, Rect>>({});
  const gameRef = useRef<string | null>(null);
  const keyRef = useRef(0);
  const timers = useRef<number[]>([]);
  const [travels, setTravels] = useState<Travel[]>([]);

  /*
   * Layout effect, not effect: the new positions have to be read after React
   * has mutated the DOM and before the browser paints, or the ghost starts from
   * where the card already is and the travel is invisible.
   */
  useLayoutEffect(() => {
    if (reduceMotion) return;

    // A new table has no history worth diffing against.
    const fresh = gameRef.current !== state.id;
    gameRef.current = state.id;

    const before = fresh ? null : zonesRef.current;
    const previousRects = rectsRef.current;

    const moves = zoneMovesBetween(before, state, viewerPlayerId);
    zonesRef.current = zoneSnapshot(state);

    const nextRects = readRects(null);
    rectsRef.current = nextRects;

    if (moves.length === 0) return;

    const started: Travel[] = [];
    for (const move of moves) {
      const from = previousRects[move.instanceId];
      const to = nextRects[move.instanceId];
      const card = state.cards[move.instanceId];
      // No measured start or no measured end means no honest path to draw.
      if (!from || !to || !card) continue;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance < 12) continue;

      keyRef.current += 1;
      started.push({ key: keyRef.current, card, from, to, duration: travelDuration(distance) });
    }
    if (started.length === 0) return;

    setTravels(current => [...current, ...started]);

    const keys = new Set(started.map(travel => travel.key));
    const longest = Math.max(...started.map(travel => travel.duration));
    const timer = window.setTimeout(
      () => setTravels(current => current.filter(travel => !keys.has(travel.key))),
      longest * 1000 + LINGER_MS
    );
    timers.current.push(timer);
  }, [state, viewerPlayerId, reduceMotion]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    },
    []
  );

  if (reduceMotion || travels.length === 0) return null;

  return (
    /* `fixed`, and this is the one place on the screen where that is right: the
       rects come from `getBoundingClientRect`, which is in viewport
       coordinates, and the layer is a pointer-transparent sheet of ghosts with
       nothing in it to click. It covers nothing, dims nothing and traps
       nothing — the no-modals rule is about things that take the board away
       from the player, and this cannot. */
    <div
      aria-hidden="true"
      data-travel-layer=""
      className={`pointer-events-none fixed inset-0 z-[55] overflow-hidden ${className ?? ''}`}
    >
      <AnimatePresence>
        {travels.map(travel => (
          <motion.div
            key={travel.key}
            className="absolute left-0 top-0"
            initial={{
              x: travel.from.x,
              y: travel.from.y,
              opacity: 0.96,
              scale: 1,
            }}
            animate={{
              x: travel.to.x,
              y: travel.to.y,
              opacity: 1,
              scale: travel.to.width / Math.max(1, travel.from.width),
            }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: travel.duration, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top left' }}
          >
            <GameCardView
              card={travel.card}
              width={travel.from.width}
              ignoreTapped
              className="drop-shadow-[0_16px_34px_rgba(0,0,0,0.75)]"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ZoneTravelLayer;
