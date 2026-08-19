/**
 * The pure arithmetic of a battlefield row, with no React in it.
 *
 * It lives apart from `Battlefield.tsx` for one reason: the test runner is
 * `node --test --experimental-strip-types` over plain `.ts`, which cannot parse
 * JSX and does not resolve the `@/` alias. While these numbers sat inside the
 * component, nothing that used them could be tested — which is how a card-size
 * rule the owner had personally reported broken (*"I loaded in smaller screen
 * and cards went off page"*) came to have no test at all.
 *
 * `Battlefield.tsx` re-exports every name here, so nothing importing from it
 * has to know this file exists.
 */

/** Fraction of a card that may be hidden by its neighbour before it stops. */
export const MAX_OVERLAP = 0.62;

/**
 * Below this, a card on the battlefield stops being identifiable at a glance.
 *
 * Owner, twice: *"cards are tiny on screen overall"*. 44px was a thumbnail —
 * you could tell a land from a creature by its frame colour and nothing else.
 * The floor is now a size at which the art reads and the name is a shape you
 * recognise; shrink-to-fit still exists, it just bottoms out somewhere honest.
 */
export const MIN_BOARD_CARD = 62;

/** A real card is 63 × 88 mm: height = width ÷ this. */
export const CARD_RATIO = 0.7176;

/**
 * How far each card slides under the one before it so `count` cards occupy the
 * width of `capacity` cards.
 */
export function overlapFor(count: number, capacity: number): number {
  if (count <= capacity || count < 2) return 0;
  return Math.min(MAX_OVERLAP, Math.max(0, 1 - (capacity - 1) / (count - 1)));
}

/**
 * The widest card that still lets `count` of them fit inside `available` px.
 *
 * A row of n overlapped cards occupies `w * (1 + (n-1) * (1 - overlap))`, so
 * solving that at maximum overlap gives the largest card that can possibly fit.
 * `preferred` is the ceiling the player chose with the size slider; this only
 * ever comes down from it.
 */
export function fitRowCardWidth(
  available: number,
  count: number,
  preferred: number,
  minimum = MIN_BOARD_CARD
): number {
  if (count <= 0 || available <= 0) return preferred;
  const spans = 1 + (count - 1) * (1 - MAX_OVERLAP);
  return Math.max(minimum, Math.min(preferred, Math.floor(available / spans)));
}
