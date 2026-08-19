/**
 * The motion vocabulary — every duration and easing in the product, once.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before it, motion was decided per file. The sheet opened over half a second
 * and closed in three tenths; the dashboard revealed over five tenths; card
 * images cross-faded over three tenths; the optimiser panels each picked their
 * own spring. Nothing was wrong on its own and the sum read as assembled rather
 * than built, which is exactly the complaint. Five names cover everything the
 * product actually does, so a new surface picks a name rather than a number.
 *
 * THE ONE RULE ABOVE ALL OTHERS
 * -----------------------------
 * Animate `transform` and `opacity`. Nothing else. Those two are composited off
 * the main thread and — this is the point — they cannot move anything else on
 * the page. A width, height, top, margin or padding tween is layout shift with
 * a duration attached, and the owner has reported layout shift and asked for
 * better motion in the same breath. They are one problem.
 *
 * Where something genuinely has to change size, reserve the space instead, the
 * way the card page reserves the printings row.
 *
 * REDUCED MOTION IS HANDLED AT THE SOURCE
 * ---------------------------------------
 * `index.css` redeclares every `--motion-*` duration as 1ms inside
 * `@media (prefers-reduced-motion: reduce)`, so any CSS that reads a token is
 * already covered and no author can forget. The JS side is covered by
 * `usePrefersReducedMotion()` inside the primitives in this folder, never by
 * the caller.
 *
 * 1ms rather than 0: `animationend` and `transitionend` still fire, so Radix's
 * presence machinery still unmounts a closed panel.
 *
 * THE NUMBERS ARE MIRRORED IN `src/index.css`
 * -------------------------------------------
 * CSS owns the values a stylesheet needs; this file owns the values JavaScript
 * needs (`element.animate()` durations, unmount timers). They are checked
 * against each other by `tokens.test.ts`, which fails the build's test run if
 * they drift apart.
 */

/**
 * Durations, in milliseconds.
 *
 * Anything a person does often has to feel instant, and anything past about
 * 300ms feels like waiting, so the interactive names all sit inside 250ms.
 * `emphasis` is the one exception: it narrates a change the user did not have
 * to wait for, and nothing is gated on it.
 */
export const MOTION_DURATION = {
  /** A control acknowledging a press. Must be under the pointer-up. */
  press: 120,
  /** Something arriving: a page, a revealed section, content replacing a skeleton. */
  enter: 180,
  /** Something leaving. Shorter than its entrance — a departure should not be dwelt on. */
  exit: 140,
  /** A slide-over travelling the width of itself. The longest journey in the app. */
  panel: 220,
  /** A value that changed drawing attention to itself. Narrates, never gates. */
  emphasis: 380,
} as const;

export type MotionDurationName = keyof typeof MOTION_DURATION;

/**
 * Easings.
 *
 * `out` is the one almost everything uses: fast off the mark, settling rather
 * than stopping. It is the curve `ZoneTravelLayer` already flies cards on, kept
 * rather than reinvented so the board and the interface move the same way.
 */
export const MOTION_EASE = {
  /** Arrivals. cubic-bezier(0.22, 1, 0.36, 1) */
  out: [0.22, 1, 0.36, 1],
  /** Departures: accelerate away, no settle, because nothing is landing. */
  in: [0.4, 0, 1, 1],
  /** Both ends — for a thing moving from one place to another and staying. */
  standard: [0.4, 0, 0.2, 1],
} as const;

export type MotionEaseName = keyof typeof MOTION_EASE;

const bezier = (curve: readonly number[]) => `cubic-bezier(${curve.join(', ')})`;

/** The same easings as CSS strings, for `element.animate()` and inline styles. */
export const MOTION_EASE_CSS: Record<MotionEaseName, string> = {
  out: bezier(MOTION_EASE.out),
  in: bezier(MOTION_EASE.in),
  standard: bezier(MOTION_EASE.standard),
};

/**
 * How far something travels as it arrives, in px.
 *
 * Small on purpose. A page that slides 40px reads as a slideshow; 8px reads as
 * the page settling onto the screen and is barely noticed, which is the point.
 */
export const MOTION_RISE_PX = 8;

/** How far a pressed control shrinks. */
export const MOTION_PRESS_SCALE = 0.965;

/**
 * The named transitions, ready for `element.animate()`.
 *
 * Deliberately Web Animations API rather than framer-motion: framer is a
 * 37 kB gzip shared chunk that only the play board, the simulator and a few
 * builder panels currently pull in, and spreading it into the shell, the
 * collection or the shopping list would put that on every first load. The
 * library earns its place where layout animation and orchestration are the
 * job; a fade and a rise do not need it.
 */
export function motionTiming(
  duration: MotionDurationName,
  ease: MotionEaseName = 'out'
): KeyframeAnimationOptions {
  return { duration: MOTION_DURATION[duration], easing: MOTION_EASE_CSS[ease] };
}

/**
 * Keyframes for the two movements the whole product is built from.
 *
 * `enter` is used by the route change and by content replacing a skeleton;
 * `leave` by a row being taken off a list. Both are transform and opacity only,
 * and `tokens.test.ts` asserts that stays true.
 */
export const MOTION_KEYFRAMES = {
  enter: [
    { opacity: 0, transform: `translate3d(0, ${MOTION_RISE_PX}px, 0)` },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
  ] as Keyframe[],
  leave: [
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.94)' },
  ] as Keyframe[],
} as const;
