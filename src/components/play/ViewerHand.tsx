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
 *
 * The solving lives in `fanFit` in `tableMetrics.ts`, where `node --test` can
 * reach it, and it gives the OVERLAP away before the card size. It used to stop
 * at a floor of 96px and hand back a fan too wide for the screen: measured at
 * 390 x 844 with eight cards, the fan painted from x = -148 to x = 530 and two
 * of the eight were 100% off screen with nothing saying so.
 *
 * ---------------------------------------------------------------------------
 * IT IS HELD AT THE EDGE OF THE TABLE, NOT OVER IT
 * ---------------------------------------------------------------------------
 * Owner, on a screenshot of a real game: *"THE HAND OVERLAPS THE BOARD. A large
 * fan of cards sits on top of the mat and covers the bottom third of the
 * table."* Measured at 1920 x 1080 before this change: the fan painted 320px
 * where the board had reserved 270, so 95,316 px of the reader's own mat and
 * six of their own permanents sat underneath it.
 *
 * So the fan sits in a band of its own and SINKS into it. The top
 * `HAND_REVEAL` of every card is above the table edge and the rest hangs below
 * the bottom of the screen, the way a hand is really held: name, mana cost,
 * whole illustration and type line on screen for every card you hold, rules
 * text and the power box one hover away and in the preview on a press.
 *
 * Reaching for a card lifts the whole of it back into view. Hover does it,
 * keyboard focus does it, and the card open in the preview stays lifted, so a
 * player choosing a play is looking at the whole card and the whole board at
 * once. The lift is `translateY` and nothing else, so the board behind it never
 * moves.
 *
 * `tableMetrics.ts` owns both halves of the sum — what the band reserves and
 * what this sinks by — because two copies of that arithmetic is exactly how the
 * fan would come to hang half a card too low.
 */

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GameCardView } from './GameCardView';
import { useMeasuredWidth } from './useMeasure';
import { fanFit, fanGeometry, handSinkFor } from './tableMetrics';
import { handPlayVerdict } from './cardActions';
import { isLand, type CardInstance, type GameState, type PlayerId } from '@/lib/game';

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
  /**
   * Something on the table is asking what it is aimed at, so the fan steps back.
   *
   * Two reasons, and the second is the load-bearing one:
   *
   *   - the eye. The fan is the brightest thing on the screen and it laps over
   *     the near mats. Leaving it lit while the board recedes points the player
   *     at the one place the answer is not;
   *   - the announcement. A press on a hand card opens that card in the
   *     preview, which unmounts whatever was asking and drops a half collected
   *     answer on the floor without saying so. While a question is open the fan
   *     does not take presses at all, and Escape is the way back.
   *
   * Nothing in here is ever a legal target: a spell cast from hand is not on
   * the battlefield, and `AimLayer` carries a control for any legal card that
   * is off the board.
   */
  receded?: boolean;
  /**
   * Hold the fan at the table edge, with the bottom of each card off screen.
   *
   * True during a turn, and that is the right trade there: the board is the
   * thing being decided, and a fan standing at its full height lay across the
   * player's own permanents (measured at 95,316 px of covered mat and six
   * permanents, which is why the sink exists at all).
   *
   * FALSE AT THE MULLIGAN, and this is the defect it closes. Measured through
   * the harness at 1600 x 1000, on the screen that asks "keep it, or shuffle
   * back": nine cards on screen, eight of them cut off by the bottom of the
   * window, the worst losing 45.1% of itself. The player is being asked to
   * judge seven cards they cannot read the rules text of, and the reason the
   * fan was sunk does not apply, because at that moment both mats are empty.
   * Nothing is being protected from the hand except two blank rectangles.
   *
   * So the caller says which moment it is, and the fan stands up for the one
   * where the hand IS the decision.
   */
  sunk?: boolean;
  className?: string;
}

/**
 * How far an uncastable card sits back from a castable one, in px.
 *
 * The grey-out is the loud signal; this is the quiet one underneath it. A hand
 * is a physical object and the cards you are considering are the ones you have
 * pushed forward, so the ones you cannot pay for drop back into the fan.
 */
const UNPLAYABLE_STEP_BACK = 12;

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
  receded = false,
  sunk = true,
  className,
}: ViewerHandProps) {
  const reduceMotion = useReducedMotion();
  const [fanRef, fanWidth] = useMeasuredWidth<HTMLDivElement>();
  /* Keyboard reach. Hover raises a card and so must focus, or a player driving
     the fan from the keyboard reads the top 62% of everything and never sees a
     rules box. `onFocus`/`onBlur` in React are `focusin`/`focusout`, which
     bubble, so one handler on the button covers whatever inside it takes the
     focus ring. */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const me = state.players.find(p => p.id === viewerPlayerId);

  const hand = me ? me.zones.hand.map(id => state.cards[id]).filter(Boolean) : [];
  const command =
    me && includeCommandZone
      ? me.zones.command.map(id => state.cards[id]).filter(Boolean)
      : [];
  const cards = [...hand, ...command];

  /* Shrink AND tighten to fit, rather than running off the edge. `cardWidth` is
     the ceiling (the size the player asked for), not a fixed value, and the
     overlap gives way before the card size does. Two of eight cards used to be
     100% off screen at 390px wide; see `fanFit`. */
  const { cardWidth: renderedWidth, overlap } = fanFit(
    fanWidth ? fanWidth - 16 : 0,
    cards.length,
    cardWidth
  );

  const { step, arc } = fanGeometry(cards.length);
  const middle = (cards.length - 1) / 2;
  /* The outer cards pivot about their bottom edge, so their bottom corner
     swings below the baseline. Without this the fan is clipped by the bottom of
     the viewport. */
  const dip = Math.round(
    (renderedWidth / 2) * Math.sin((step * (cards.length - 1) * Math.PI) / 360)
  );

  /*
   * How far the fan is sunk below the table edge, and therefore how far a card
   * has to travel to come back.
   *
   * `handSinkFor` is the half of the band arithmetic `tableMetrics.ts` does not
   * reserve; `handBandFor` is the half it does, and the board is inset by that.
   * Together they are one card height, which is why the two cannot be allowed
   * to live in two files.
   */
  const sink = sunk ? handSinkFor(renderedWidth) : 0;
  /* Clear of the edge by the part that was hidden, plus a little more so the
     raised card stands out of the fan rather than merely joining it. A fan that
     is already whole on screen still lifts, because reaching for a card has to
     do something visible, but it only has the standing-proud part to travel. */
  const raise = sink + 54;

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
      /*
       * THE SINK, and it is the whole of "the hand no longer covers the table".
       *
       * A negative bottom margin, so the fan hangs below the band it was given
       * by exactly the part of a card the band does not reserve. What used to
       * be the bottom 38% of every card lying across the near seat's mana row
       * is now below the bottom of the screen, and the mat has that height back.
       *
       * It has to swallow the padding as well as the sink, because both push
       * the fan up off the container's own bottom edge. Measured on the first
       * attempt with only the sink: the fan painted its top at y=827 against a
       * band that started at 875, so 47px of it — the `bottom-2` offset plus
       * the dip padding — was still lying on the mat. The caller pins this to
       * `bottom-0` for the same reason.
       *
       * The dip padding still exists because the outer cards' bottom corners
       * swing below the baseline when a raised card straightens: without it the
       * fan is cut off at its own box rather than at the screen edge.
       */
      /*
       * `sunk` false is the mulligan, and there the margin goes to zero rather
       * than to minus the sink. The padding below already reserves the arc's
       * dip and the step back an unplayable card takes, so a box pinned to
       * `bottom-0` with no negative margin puts the LOWEST painted pixel of the
       * fan on the bottom of the window. Leaving the padding swallowed, which
       * is right when the fan is meant to hang below the edge, left the outer
       * cards 12% off screen on the one screen that exists to be read.
       */
      style={{
        paddingBottom: dip + UNPLAYABLE_STEP_BACK,
        marginBottom: sunk ? -(sink + dip + UNPLAYABLE_STEP_BACK) : 0,
      }}
    >
      <AnimatePresence initial={false}>
        {cards.map((card, index) => {
          const fromCommand = index >= hand.length;
          const land = isLand(card);
          /*
           * THE SAME QUESTION THE PREVIEW ASKS, ASKED ONCE.
           *
           * This used to be `planCastFromHand(...).ok`, which answers cost and
           * zone and deliberately says nothing about timing or targets. So the
           * fan said "You can cast this" on a sorcery during the opponent's
           * untap step, and on a removal spell with nothing on the board to
           * point at, and the preview underneath then refused. Measured over
           * 4,000 real cards: 307 promised-then-refused in your own main phase,
           * 3,410 in the untap step. `handPlayVerdict` is the one rule both
           * surfaces now read.
           */
          const verdict = handPlayVerdict(state, viewerPlayerId, card, { freeCast });
          const playable = verdict.ok;
          const reason = verdict.reason;
          const selected =
            selectedId === card.instanceId || !!markedIds?.includes(card.instanceId);
          /* Raised: the whole card is on screen. A card the player has reached
             for — with the keyboard, or by opening it in the preview — stays
             raised, so choosing a play means looking at the whole card and the
             whole board at the same time. */
          const raised = selected || focusedId === card.instanceId;

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
              : verdict.needsTarget
                ? 'You can cast this once you pick what it is aimed at'
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
                /* `raise` clears the sink as well as standing the card out of
                   the fan, so a raised card is whole on screen rather than
                   merely higher than its neighbours. */
                y: raised ? drop - raise : drop,
                rotate: raised ? 0 : rotate,
                scale: raised ? 1.08 : 1,
              }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -150, scale: 0.85, transition: { duration: 0.28 } }
              }
              whileHover={
                reduceMotion || receded
                  ? undefined
                  : { y: drop - raise, rotate: 0, scale: 1.12, zIndex: 60 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 }
              }
              style={{
                transformOrigin: 'bottom center',
                marginLeft: index === 0 ? 0 : -renderedWidth * overlap,
                zIndex: raised ? 70 : index,
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => onInspect(card)}
                onFocus={() => setFocusedId(card.instanceId)}
                onBlur={() => setFocusedId(id => (id === card.instanceId ? null : id))}
                disabled={receded}
                title={label}
                aria-label={label}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GameCardView
                  card={card}
                  width={renderedWidth}
                  ignoreTapped
                  aiming={receded ? 'receded' : null}
                  dimmed={!playable && !freeCast}
                  selected={!receded && selected}
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
