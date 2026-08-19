/**
 * How a play surface sizes itself against the screen it is drawn on.
 *
 * This existed twice. `src/pages/Play.tsx` had a `handMetrics` and a private
 * copy of `CARD_RATIO`; `WatchedTable.tsx` had a second `handMetrics` with
 * DIFFERENT numbers (a 260px ceiling against 300, a 0.4/0.24 height share
 * against 0.42/0.25, and no overhang at all). So the two screens that are
 * supposed to be the same screen already laid their hands out differently, four
 * days after being merged, which is the drift this whole workstream exists to
 * stop. One copy, in a `.ts` the test runner can actually reach.
 *
 * `node --test --experimental-strip-types` cannot parse JSX, so arithmetic that
 * lives in a `.tsx` cannot be tested. That is the same reason `boardMetrics.ts`
 * was split out of `Battlefield.tsx`, and the reason is not weaker here.
 */

/* Extension-qualified, the same way `seatLayout.ts` does it: `node --test` has
   no bundler to resolve a bare specifier or the `@/` alias with. */
import { CARD_RATIO } from './boardMetrics.ts';

export { CARD_RATIO };

/** Height of the floating HUD. The board is held off the top edge by this. */
export const HUD_INSET = 56;

/**
 * Height of the strip along the bottom edge the game feed floats in, used by
 * the views that have no hand to hold that space open.
 */
export const FEED_INSET = 74;

/**
 * Starting ceilings, in px, until the player moves the sliders.
 *
 * Owner, twice: *"Cards need to be much bigger in general"*, then *"cards are
 * tiny on screen overall"*. Every surface shrinks below its ceiling to fit the
 * room it measures, so a low default buys nothing on a large screen and costs
 * everything on it. Start big and let the fit take it down.
 */
export const BOARD_CARD_DEFAULT = 200;
export const HAND_CARD_DEFAULT = 300;

/** Below this a card in the fan stops being readable, so the fit stops here. */
export const MIN_HAND_CARD = 96;

/** The shortest viewport the arithmetic will reason about. */
export const MIN_VIEWPORT_HEIGHT = 480;

/** Share of the viewport height a hand may claim, by view. */
const SHARE_FOCUSED = 0.42;
const SHARE_TABLE = 0.25;

/**
 * How much of the card's own height is reserved below the board.
 *
 * The reserved strip is deliberately smaller than a card: the fan laps over the
 * near seat's mana row exactly as a hand held over the near edge of a table
 * would, and what the strip buys is that the seats above it are not crushed to
 * make room. In the one-seat view it laps further still, because the only board
 * underneath it is the one you are studying and the view exists to make the
 * hand as large as it can be.
 */
const OVERHANG_FOCUSED = 0.9;
const OVERHANG_TABLE = 1;

export interface HandMetrics {
  /** Ceiling handed to `ViewerHand`, which shrinks below it to fit the width. */
  cardWidth: number;
  /** Pixels of the bottom edge the board must keep clear for the fan. */
  inset: number;
}

/**
 * The hand's size and the strip reserved for it.
 *
 * `ViewerHand` treats its `cardWidth` as a ceiling and shrinks to fit the width
 * available, which is the right rule for a wide screen and the wrong one for a
 * short one: a laptop 800px tall would otherwise be handed cards taller than
 * the table. So the chosen ceiling is capped by HEIGHT here, and a matching
 * strip is reserved along the bottom edge.
 *
 * @param viewportHeight  Height of the window, in px.
 * @param ceiling         The player's chosen card width. Only ever come down from.
 * @param focused         True in the single-seat view, which gets far more room.
 */
export function handMetrics(
  viewportHeight: number,
  ceiling: number,
  focused: boolean
): HandMetrics {
  const height = Math.max(MIN_VIEWPORT_HEIGHT, viewportHeight);
  const share = focused ? SHARE_FOCUSED : SHARE_TABLE;
  const cardWidth = Math.round(
    Math.min(ceiling, Math.max(MIN_HAND_CARD, height * share * CARD_RATIO))
  );
  const overhang = focused ? OVERHANG_FOCUSED : OVERHANG_TABLE;
  return { cardWidth, inset: Math.round((cardWidth / CARD_RATIO) * overhang) };
}
