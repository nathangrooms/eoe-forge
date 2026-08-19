/**
 * Your hand, fanned along the bottom edge — the biggest thing on the table.
 *
 * Owner: *"For the player, the hand needs to be massive."*, *"my hand should be
 * massive - I can barely even see it - cards are tiny."*
 *
 * A hand is not a list. It is a fan of cards held at an angle, closest to you,
 * that you lift one of to look at it: an arc, a rotation per card, an overlap
 * that grows as the hand grows, and a lift on hover that straightens the card
 * and brings it forward. It is where a player STUDIES a card before committing
 * to a play, which is why it gets the most pixels of anything on screen.
 *
 * **Clicking a card does not play it.** It opens the preview, which is where
 * Cast and Play land live. That rule is the whole shape of this screen: a tap
 * is never the action.
 *
 * Castability shows here, loudly. Owner: *"I liked when cards were greyed out
 * if you couldnt cast them."* It comes from `planCastFromHand` / `planLandDrop`,
 * the same helpers the bot uses, so the fan and the rules can never disagree,
 * and it is said twice: the card loses all of its colour, and it sits back in
 * the fan while the ones you can actually play stand slightly proud of it. A
 * player should be able to see what they can cast without reading a single
 * mana cost.
 *
 * The size the player chose is a CEILING. A fanned hand of n cards occupies
 * `w + (n-1) * w * (1 - overlap)`, so the fan measures itself and solves that
 * for the widest card that fits. Without it, ten cards at the preferred size
 * need about 970px and simply ran off the side of a narrow screen.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GameCardView } from './GameCardView';
import { useMeasuredWidth } from './useMeasure';
import {
  isLand,
  planCastFromHand,
  planLandDrop,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '@/lib/game';

export interface ViewerHandProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  /** Click a card and the preview opens. Nothing is played by a click. */
  onInspect: (card: CardInstance) => void;
  /** The card currently in the preview, lifted out of the fan. */
  selectedId?: string | null;
  /**
   * Cards the player has picked out of the fan for something.
   *
   * The London mulligan's bottoming step is the caller: you choose N cards to
   * put back and have to be able to see which N. Drawn with the same lift the
   * preview selection uses, because to the eye it means the same thing — this
   * one is picked.
   */
  markedIds?: readonly string[];
  /** Rendered width of a card in the fan. A ceiling, not a fixed value. */
  cardWidth?: number;
  /** Include the command zone at the right-hand end of the fan. */
  includeCommandZone?: boolean;
  /**
   * What to say when there is nothing in the fan.
   *
   * The fan is not always the reader's own hand: `/simulate` draws this same
   * component for whichever seat is being watched, and "Your hand is empty" is
   * simply wrong about somebody else's. The sentence comes from the caller so
   * the two surfaces can share the component instead of forking it.
   */
  emptyLabel?: string;
  className?: string;
}

/**
 * Fan geometry: total sweep in degrees, and the height of the arc.
 *
 * The arc is applied as a *lift* on the middle cards rather than a drop on the
 * outer ones, so the whole fan stays on or above its baseline. Pushing the ends
 * downward instead would hang them off the bottom of the screen.
 */
function fanGeometry(count: number) {
  if (count <= 1) return { step: 0, arc: 0 };
  const sweep = Math.min(30, count * 4.5);
  return { step: sweep / (count - 1), arc: Math.min(22, count * 2.4) };
}

/**
 * How much each card hides the one before it.
 *
 * Capped at 42%: beyond that the art and the type line disappear behind the
 * next card and the hand becomes a stack of edges. Shrink-to-fit handles a hand
 * too wide for the screen, so overlap does not have to absorb it.
 */
function overlapFraction(count: number): number {
  if (count <= 1) return 0;
  return Math.min(0.42, Math.max(0.18, 1 - 7 / count));
}

/** Smallest a hand card may shrink to before it stops being readable at all. */
const MIN_HAND_CARD = 96;

/**
 * How far an uncastable card sits back from a castable one, in px.
 *
 * The grey-out is the loud signal; this is the quiet one underneath it. A hand
 * is a physical object and the cards you are considering are the ones you have
 * pushed forward, so the ones you cannot pay for drop back into the fan.
 */
const UNPLAYABLE_STEP_BACK = 12;

/** A real card is 63 × 88 mm: height = width ÷ this. */
const CARD_RATIO = 0.7176;

/**
 * Widest card that still lets `count` cards fit inside `available` pixels.
 *
 * The fan is rotated, and a rotated card is wider than an upright one. The
 * outermost card leans by half the sweep about its bottom edge, which throws
 * its top corner sideways by `(height / 2) * sin(θ)` at each end — about 35px
 * on a big hand, which is exactly how far the end cards used to hang off the
 * screen. Solving `w * (spans + sin(θ) / ratio) = available` puts the whole
 * rotated fan inside the measured box instead of just the upright boxes.
 */
export function fitCardWidth(available: number, count: number, preferred: number): number {
  if (count <= 0 || available <= 0) return preferred;
  const overlap = overlapFraction(count);
  const spans = 1 + (count - 1) * (1 - overlap);
  const lean = Math.sin((fanGeometry(count).step * (count - 1) * Math.PI) / 360) / CARD_RATIO;
  const fits = Math.floor(available / (spans + lean));
  return Math.max(MIN_HAND_CARD, Math.min(preferred, fits));
}

export function ViewerHand({
  state,
  viewerPlayerId,
  freeCast,
  onInspect,
  selectedId,
  markedIds,
  /* 104px rendered a Magic card at roughly a third of readable size — the owner
     could not read their own hand, and said so twice. A hand card is the thing
     you study before committing to a play, so it is the largest element on the
     table; the fan comes down from this ceiling when the screen is small. */
  cardWidth = 300,
  includeCommandZone = true,
  emptyLabel = 'Your hand is empty',
  className,
}: ViewerHandProps) {
  const reduceMotion = useReducedMotion();
  const [fanRef, fanWidth] = useMeasuredWidth<HTMLDivElement>();

  const me = state.players.find(p => p.id === viewerPlayerId);

  const hand = me ? me.zones.hand.map(id => state.cards[id]).filter(Boolean) : [];
  const command =
    me && includeCommandZone
      ? me.zones.command.map(id => state.cards[id]).filter(Boolean)
      : [];
  const cards = [...hand, ...command];

  /* Shrink to fit rather than running off the edge. `cardWidth` is the ceiling
     (the size the player asked for), not a fixed value. */
  const renderedWidth = fitCardWidth(fanWidth ? fanWidth - 16 : 0, cards.length, cardWidth);

  const { step, arc } = fanGeometry(cards.length);
  const middle = (cards.length - 1) / 2;
  const overlap = overlapFraction(cards.length);
  /* The outer cards pivot about their bottom edge, so their bottom corner
     swings below the baseline. Without this the fan is clipped by the bottom of
     the viewport. */
  const dip = Math.round(
    (renderedWidth / 2) * Math.sin((step * (cards.length - 1) * Math.PI) / 360)
  );

  if (!me) return null;

  if (cards.length === 0) {
    return (
      <div ref={fanRef} className={cn('flex items-end justify-center pb-2', className)}>
        <p className="rounded-full bg-background/60 px-3 py-1 text-[11px] text-muted-foreground shadow-md shadow-black/40 backdrop-blur-sm">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={fanRef}
      className={cn('flex items-end justify-center', className)}
      /* The lean swings the outer cards' bottom corners below the baseline, and
         an uncastable card sits a further step back — both have to be paid for
         here or the fan is clipped by the bottom of the viewport. */
      style={{ paddingBottom: dip + UNPLAYABLE_STEP_BACK }}
    >
      <AnimatePresence initial={false}>
        {cards.map((card, index) => {
          const fromCommand = index >= hand.length;
          const land = isLand(card);
          const landPlan = land ? planLandDrop(state, viewerPlayerId, card.instanceId) : null;
          const castPlan = land
            ? null
            : planCastFromHand(state, viewerPlayerId, card.instanceId, { ignoreMana: freeCast });

          const playable = land ? !!landPlan?.ok : !!castPlan?.ok;
          const reason = (land ? landPlan?.reason : castPlan?.reason) ?? '';
          const selected =
            selectedId === card.instanceId || !!markedIds?.includes(card.instanceId);

          const offset = index - middle;
          const rotate = offset * step;
          // 0 at the ends, -arc in the middle: the fan curves upward off its
          // baseline instead of dropping its outer cards off the screen. A card
          // you cannot pay for then sits back from that line, so the playable
          // ones read as a shorter, brighter row standing proud of the rest.
          const arcDrop = middle === 0 ? 0 : ((offset * offset) / (middle * middle)) * arc - arc;
          const drop = playable || freeCast ? arcDrop : arcDrop + UNPLAYABLE_STEP_BACK;

          /* Copy rules: no em-dash, and no doubled full stop. The refusals
             `planCastFromHand` returns are already whole sentences ("You have
             already played a land this turn."), so appending another period
             produced "…this turn.. Click to preview." in every tooltip and in
             every screen reader. */
          const standing = playable
            ? land
              ? 'You can play this as a land drop'
              : 'You can cast this'
            : (reason || 'You cannot play this right now').replace(/\.\s*$/, '');
          const label = `${card.name}. ${standing}. Click to preview.`;

          return (
            <motion.div
              key={card.instanceId}
              layout={!reduceMotion}
              initial={
                reduceMotion ? false : { opacity: 0, x: 180, y: -70, rotate: -24, scale: 0.7 }
              }
              animate={{
                opacity: 1,
                x: 0,
                y: selected ? drop - 46 : drop,
                rotate: selected ? 0 : rotate,
                scale: selected ? 1.08 : 1,
              }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -150, scale: 0.85, transition: { duration: 0.28 } }
              }
              whileHover={
                reduceMotion ? undefined : { y: drop - 54, rotate: 0, scale: 1.16, zIndex: 60 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 }
              }
              style={{
                transformOrigin: 'bottom center',
                marginLeft: index === 0 ? 0 : -renderedWidth * overlap,
                zIndex: selected ? 70 : index,
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => onInspect(card)}
                title={label}
                aria-label={label}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GameCardView
                  card={card}
                  width={renderedWidth}
                  ignoreTapped
                  dimmed={!playable && !freeCast}
                  selected={selected}
                  title={label}
                />
                {fromCommand && (
                  <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background shadow-md shadow-black/60">
                    Cmd
                  </span>
                )}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ViewerHand;
