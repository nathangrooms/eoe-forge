/**
 * Which seating arrangement a pod of this size should start in.
 *
 * `seating.ts` describes every arrangement and takes no view on screens — it
 * cannot, because the same geometry drives a phone lying flat on a table and a
 * 27-inch monitor. This is where the screen gets a say.
 *
 * The four-player case is the one that matters, and the owner settled it:
 *
 *   *"the board should split in 4 separate ways - 2 rows, 2 columns, all hands
 *   shows as if placed in front of you"*
 *
 * `table` is the pinwheel: one player per edge, each seat rotated to face the
 * person sitting there. It is physically correct for a device lying in the
 * middle of a real table and wrong for everything else — on a landscape screen
 * it hands the top and bottom seats a strip barely two card-heights deep, and
 * three of the four boards end up sideways or upside down. `quads` gives all
 * four seats an equal, roughly 3:2 box, and the surface draws every one of them
 * upright. That is not a preference; it is whether an opponent's board can be
 * read and clicked at all.
 */

import type { SeatingVariant } from '@/lib/game';

export function defaultSeatingFor(playerCount: number): SeatingVariant {
  if (playerCount === 4) return 'quads';
  return 'table';
}
