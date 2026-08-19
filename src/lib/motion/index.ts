/**
 * One motion vocabulary for the whole product.
 *
 * ```ts
 * import { MOTION_DURATION, useLeavingList, usePrefersReducedMotion } from '@/lib/motion';
 * ```
 *
 * Five names — press, enter, exit, panel, emphasis — and three easings. Read
 * `tokens.ts` before adding a sixth; the point of the set being small is that
 * two surfaces animating the same idea animate it the same way.
 *
 * The CSS half of the vocabulary lives in `src/index.css` under the MOTION
 * heading: `--motion-*` custom properties, the `.motion-*` classes, and the
 * `prefers-reduced-motion` block that flattens every duration at the source so
 * no caller has to remember it.
 */

export {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_EASE_CSS,
  MOTION_KEYFRAMES,
  MOTION_PRESS_SCALE,
  MOTION_RISE_PX,
  motionTiming,
  type MotionDurationName,
  type MotionEaseName,
} from './tokens';

export { usePrefersReducedMotion, prefersReducedMotion } from './useReducedMotion';

export { useLeavingList, useFlipOnChange, type ListEntry } from './list';

export { useTrackPressOrigin, pressOriginOffsetY } from './pressOrigin';
