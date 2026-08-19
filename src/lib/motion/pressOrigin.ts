import { useEffect } from 'react';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Where the press that opened a panel happened.
 *
 * A slide-over that always flies in from the middle of the right edge is
 * motion without meaning: it says "a panel appeared", not "this control opened
 * that panel". Offsetting the panel's starting position towards the control the
 * player actually pressed makes the connection, and costs one `translate` on a
 * keyframe that was already running.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * If the panel was opened from the keyboard, from a toast, from a redirect or
 * from anything else with no pointer behind it, there is no origin and none is
 * invented — the panel slides straight in from its edge. Same rule
 * `zoneTravel.ts` follows: a path we cannot honestly know is not drawn.
 *
 * ONE LISTENER, PASSIVE, CAPTURE
 * ------------------------------
 * Capture so it still sees the press when the control stops propagation.
 * Passive so it can never delay a tap. Reference-counted so ten sheets on a
 * page are still one listener, and none at all when no sheet is mounted.
 */

interface PressPoint {
  x: number;
  y: number;
  at: number;
}

let lastPress: PressPoint | null = null;
let subscribers = 0;

function record(event: PointerEvent) {
  lastPress = { x: event.clientX, y: event.clientY, at: Date.now() };
}

/** Past this the press is not what opened the panel. */
const STALE_MS = 700;

/**
 * The furthest a panel will start from its resting place, in px.
 *
 * A control in the page header would otherwise launch a full-height panel from
 * several hundred pixels up, which reads as a swoop rather than a connection.
 */
const MAX_OFFSET_PX = 140;

/** Register interest in press positions. Call from anything that may open a panel. */
export function useTrackPressOrigin(): void {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      document.addEventListener('pointerdown', record, { capture: true, passive: true });
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        document.removeEventListener('pointerdown', record, { capture: true });
        lastPress = null;
      }
    };
  }, []);
}

/**
 * How far above or below the centre of the screen the opening press was, in px,
 * clamped. `null` when there is no recent press to attribute the panel to — and
 * `null` under reduced motion, so a caller writing this into an inline style
 * cannot accidentally out-specify the flattened token on `:root`.
 */
export function pressOriginOffsetY(): number | null {
  if (prefersReducedMotion()) return null;
  if (!lastPress) return null;
  if (Date.now() - lastPress.at > STALE_MS) return null;
  if (typeof window === 'undefined') return null;
  const delta = lastPress.y - window.innerHeight / 2;
  if (!Number.isFinite(delta)) return null;
  return Math.max(-MAX_OFFSET_PX, Math.min(MAX_OFFSET_PX, delta));
}
