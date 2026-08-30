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
/* -------------------------------------------------------------------------- */
/* THE FAN'S OWN FIT, AND THE TWO CARDS THAT WERE ENTIRELY OFF SCREEN         */
/* -------------------------------------------------------------------------- */
/*
 * `fitCardWidth` lived in `ViewerHand.tsx` and could not be tested, for the
 * reason the top of this file gives. It also had a floor it would not go below
 * and NOTHING TO DO when the floor was still too wide, so it returned the floor
 * and let the fan run off both edges.
 *
 * Measured at 390 x 844 with eight cards, 2026-08-30, through
 * `scripts/probe/card-panel-fit.mjs`:
 *
 *   fan painted from x = -148 to x = 530, in a 390px window
 *   Yuna, Grand Summoner      104 wide at left -136   100% off screen
 *   Atraxa, Praetors' Voice   127 wide at left  403   100% off screen
 *   Sequence Engine / Yahenni                          ~48% off screen
 *
 * Two of the eight cards a player is holding could not be seen at all, and
 * nothing on screen said so. A card that is 100% invisible is strictly worse
 * than a card that is small.
 *
 * A real hand answers this without being told: you fan it TIGHTER as it grows,
 * and read the left edge of each card. So the overlap gives way before the card
 * size does, and only once the overlap has run out does the card shrink below
 * the readable floor. The order matters — shrinking first makes a hand of eight
 * unreadable on a phone in order to solve a problem the overlap can absorb.
 */

/**
 * Fan sweep and arc for `count` cards.
 *
 * The arc is applied as a LIFT on the middle cards rather than a drop on the
 * outer ones, so the whole fan stays on or above its baseline. Pushing the ends
 * downward instead would hang them off the bottom of the screen.
 */
export function fanGeometry(count: number): { step: number; arc: number } {
  if (count <= 1) return { step: 0, arc: 0 };
  const sweep = Math.min(30, count * 4.5);
  return { step: sweep / (count - 1), arc: Math.min(22, count * 2.4) };
}

/**
 * How much each card hides the one before it, before any fitting.
 *
 * Capped at 42%: beyond that the art and the type line disappear behind the
 * next card and the hand becomes a stack of edges. That cap is the RESTING
 * shape; `fanFit` may tighten past it when the alternative is a card that is
 * not on the screen at all.
 */
export function overlapFraction(count: number): number {
  if (count <= 1) return 0;
  return Math.min(0.42, Math.max(0.18, 1 - 7 / count));
}

/** Below this a card in the fan stops being readable, so the overlap gives first. */
export const MIN_FAN_CARD = MIN_HAND_CARD;

/**
 * Tightest the fan will ever be packed.
 *
 * 0.68 leaves 32% of every card showing. In a fan the visible strip is the
 * card's LEFT edge, where the name and the mana cost begin, so a third of a card
 * is enough to tell it from the one beside it and to reach for it. Past this the
 * hand really is a stack of edges and shrinking the cards is the better trade.
 */
export const MAX_FAN_OVERLAP = 0.68;

/**
 * Tighter still, once the card has already come down to `ABS_MIN_FAN_CARD`.
 *
 * A dozen cards on a 320px phone cannot be fanned at 96px however hard the
 * arithmetic is pushed, and at that point there are only two answers: shingle
 * them, or paint some of them off the screen. Shingling is the one a player can
 * still work with, so the cap lifts rather than the fan giving up.
 */
export const HARD_MAX_FAN_OVERLAP = 0.85;

/** Absolute floor. Under this a card is a coloured rectangle, so it never happens. */
export const ABS_MIN_FAN_CARD = 72;

export interface FanFit {
  /** Rendered width of one card. */
  cardWidth: number;
  /** Fraction of a card hidden by the next one. */
  overlap: number;
  /** Whether the fan had to pack tighter than its resting shape to fit. */
  tightened: boolean;
}

/**
 * The widest card, and the loosest fan, that fit `count` cards in `available` px.
 *
 * A rotated card is wider than an upright one: the outermost card leans by half
 * the sweep about its bottom edge, which throws its top corner sideways by
 * `(height / 2) * sin(θ)` at each end. Solving
 * `w * (spans + sin(θ) / ratio) = available` puts the whole ROTATED fan inside
 * the measured box rather than just the upright boxes.
 *
 * @param available  Room the fan has, in px.
 * @param count      Cards in the hand.
 * @param preferred  The player's chosen width. Only ever come down from.
 */
export function fanFit(available: number, count: number, preferred: number): FanFit {
  const resting = overlapFraction(count);
  if (count <= 0 || available <= 0) {
    return { cardWidth: preferred, overlap: resting, tightened: false };
  }

  const { step } = fanGeometry(count);
  /* Constant for a given count: the sweep only depends on how many cards. */
  const lean = Math.sin((step * (count - 1) * Math.PI) / 360) / CARD_RATIO;
  const spans = (overlap: number) => 1 + (count - 1) * (1 - overlap);
  /* The epsilon is not cosmetic. Solving for the overlap that makes a 96px card
     fit exactly and then measuring it back lands on 95.999999, which floors to
     95, which reads as "it did not fit" and sends the whole fan down a branch it
     did not need. */
  const widthAt = (overlap: number) => Math.floor(available / (spans(overlap) + lean) + 1e-9);
  /* The inverse: the overlap at which a card of `width` exactly fills the room. */
  const overlapFor = (width: number) =>
    count > 1 ? 1 - (available / width - lean - 1) / (count - 1) : 0;

  /*
   * THE OVERLAP IS CHOSEN FIRST AND THE WIDTH FOLLOWS FROM IT, always. That
   * order is what makes the fan fit by construction instead of by a chain of
   * early returns, one of which used to hand back a floor it had just proved
   * was too wide.
   */
  let overlap = resting;
  const held = Math.min(preferred, MIN_FAN_CARD);
  if (widthAt(resting) < held) {
    /* Tighten, holding the card at the readable floor. */
    overlap = Math.min(MAX_FAN_OVERLAP, Math.max(resting, overlapFor(held)));
    if (widthAt(overlap) < ABS_MIN_FAN_CARD) {
      /* Still not enough room, and the card is now under the absolute floor. It
         is a very small screen holding a very large hand: shingle them. */
      overlap = Math.min(HARD_MAX_FAN_OVERLAP, Math.max(overlap, overlapFor(ABS_MIN_FAN_CARD)));
    }
  }

  return {
    cardWidth: Math.max(1, Math.min(preferred, widthAt(overlap))),
    overlap,
    tightened: overlap > resting,
  };
}

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
