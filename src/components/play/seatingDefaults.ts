/**
 * Which seating arrangement a pod of this size should start in.
 *
 * `seating.ts` describes every arrangement and takes no view on screens — it
 * cannot, because the same geometry drives a phone lying flat on a table and a
 * 27-inch monitor. This is where the screen gets a say.
 *
 * The four-player case is the one that matters. The `table` pinwheel is
 * physically correct — one player per edge, which is exactly right for a device
 * in the middle of a real table — but on a landscape monitor it hands the top
 * and bottom seats a strip a couple of card-heights tall and everybody's cards
 * shrink to fit it. `quads` gives all four seats an equal, roughly 3:2 box, so
 * the cards on it are nearly twice as wide. On a desktop screen that is not a
 * preference, it is legibility.
 */

import type { SeatingVariant } from '@/lib/game';

/** Below this the pinwheel wins again: four quads on a phone are four postage stamps. */
const DESKTOP_MIN_WIDTH = 1024;

export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;
  }
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

/**
 * The arrangement a pod of `playerCount` should open in.
 *
 * @param desktop Pass an explicit value in tests; defaults to the live viewport.
 */
export function defaultSeatingFor(playerCount: number, desktop = isDesktopViewport()): SeatingVariant {
  if (playerCount === 4 && desktop) return 'quads';
  return 'table';
}
