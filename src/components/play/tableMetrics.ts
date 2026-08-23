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

/* -------------------------------------------------------------------------- */
/* THE HAND HAS A BAND OF ITS OWN NOW, AND DOES NOT LAP THE TABLE             */
/* -------------------------------------------------------------------------- */
/*
 * Owner, on a screenshot of a real game: *"THE HAND OVERLAPS THE BOARD. A large
 * fan of cards sits on top of the mat and covers the bottom third of the
 * table."*
 *
 * Measured on 23 Aug 2026 through `play-harness.html`, two seats, 14 permanents
 * a seat, bots paused:
 *
 *   1920 x 1080   fan paints 1441 x 320 at (235, 740)   95,316 px of the
 *                 viewer's own mat covered, 6 of that seat's permanents under it
 *   1280 x 800    fan paints 1018 x 239 at (127, 537)   58,766 px, 7 permanents
 *
 * The board was ALREADY reserving a strip for the fan — 270px of 1080 — so the
 * mat paid for the hand twice: once in height it never got, and again in the
 * 66px of itself the fan covered on top of that. The reserve was `cardWidth /
 * CARD_RATIO`, which is an UPRIGHT card, and a fanned hand is not upright. The
 * cards are rotated and lifted into an arc, so 194px cards reserving 270px
 * painted 320px. That difference IS the overlap, to the pixel.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACED IT: a band of its own, and the card revealed on approach
 * ---------------------------------------------------------------------------
 * A hand at a real table is held at the edge, tilted toward you, with the
 * bottom of the cards below the table line. So the fan gets a band that no mat
 * is drawn under, and it sits LOW in that band: the top `HAND_REVEAL` of every
 * card stands above the table edge and the rest hangs below the screen.
 * Bringing a card forward — hover, keyboard focus, or opening it in the preview
 * — lifts the whole card into view on a transform, over a board that is still
 * entirely there behind it.
 *
 * The reveal fraction is not a taste call. A Magic card's type line sits at
 * about 62% of its height, so at 0.62 the docked fan shows the name, the mana
 * cost, the whole illustration and the type line of every card in hand, and
 * hides the rules text and the power/toughness box. That is what a player fans
 * a hand to see; the two things it hides are on the card the instant you reach
 * for it, and in the preview the moment you press it.
 *
 * The band therefore costs the board `cardHeight * HAND_REVEAL` instead of a
 * whole card plus its lean, and the seats take the difference as card size.
 */

/**
 * How much of a hand card stands above the table edge at rest.
 *
 * Down to and including the type line. See the note above.
 */
export const HAND_REVEAL = 0.62;

/**
 * Room above the resting line for the fan's own shape.
 *
 * A fan is an arc: `ViewerHand`'s `fanGeometry` lifts the middle cards up to
 * 22px off the baseline and leans the outer ones, which throws their top
 * corners upward. Reserved here rather than discovered later, because
 * "discovered later" is the 66px of mat the old reserve was quietly handing
 * over.
 */
export const HAND_LIFT = 24;

/** Share of the viewport height the hand's band may claim, by view. */
const BAND_SHARE_FOCUSED = 0.3;
const BAND_SHARE_TABLE = 0.19;

export interface HandMetrics {
  /** Ceiling handed to `ViewerHand`, which shrinks below it to fit the width. */
  cardWidth: number;
  /** Pixels of the bottom edge the board must keep clear for the fan. */
  inset: number;
}

/**
 * The band a fan of `cardWidth` cards needs: its revealed part, and its lift.
 *
 * Exported because `ViewerHand` has to sink itself by exactly the part of a
 * card this does NOT reserve, and a second copy of that sum is how the fan
 * would come to hang half a card too low.
 */
export function handBandFor(cardWidth: number): number {
  return Math.round((cardWidth / CARD_RATIO) * HAND_REVEAL) + HAND_LIFT;
}

/**
 * How far below the table edge a docked card's bottom hangs.
 *
 * The other half of `handBandFor`, and the number `ViewerHand` applies as a
 * negative margin so the top of the fan lands on the top of the band.
 */
export function handSinkFor(cardWidth: number): number {
  return Math.round((cardWidth / CARD_RATIO) * (1 - HAND_REVEAL));
}

/**
 * The hand's size and the band reserved for it.
 *
 * The BAND comes first and the card is derived from it, which is the reverse of
 * the old order and the reason the two can no longer disagree: a strip is
 * claimed from the viewport, the card is the largest one whose revealed part
 * fits that strip, and the strip is then trimmed back to what that card really
 * needs when the player's own ceiling is what binds.
 *
 * `ViewerHand` treats `cardWidth` as a ceiling and shrinks below it to fit the
 * WIDTH available, so a hand of twelve on a narrow screen still comes down. The
 * band does not move when it does: a strip that resized as cards were drawn
 * would move every mat on the table every time anybody drew.
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
  const band = Math.round(height * (focused ? BAND_SHARE_FOCUSED : BAND_SHARE_TABLE));
  /* The largest card whose revealed part, plus the fan's lift, fits the band.
     `MIN_HAND_CARD` is the floor on a very short window, where the honest
     answer is that the fan hangs a little further below the edge than the
     share asked for rather than becoming unreadable. */
  const cardWidth = Math.round(
    Math.min(ceiling, Math.max(MIN_HAND_CARD, ((band - HAND_LIFT) / HAND_REVEAL) * CARD_RATIO))
  );
  return { cardWidth, inset: handBandFor(cardWidth) };
}
