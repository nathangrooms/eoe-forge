/**
 * One physical card on the table.
 *
 * The states that have to read instantly, from across a four-player board:
 *
 *   tapped        turned ninety degrees, exactly as it lies in paper, and it
 *                 *turns* — the rotation is animated, because a card that
 *                 teleports between upright and sideways loses the one cue
 *                 that says "this is spent".
 *   attacking     lunged toward the seat it is attacking, lifted off the mat.
 *   face down     a real drawn card back, never a grey rectangle.
 *   selected      washed and raised, never outlined. No hairlines anywhere.
 *
 * Card art goes through `CardImage`, which already picks a Scryfall resolution
 * that matches the rendered size. A card with no art at all still renders as a
 * card — name, cost as pips, type line, power and toughness — because the card
 * database has gaps and a playtest full of holes is unusable.
 */

import { memo, type CSSProperties, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, RotateCw, Hourglass, Zap, Swords, Shield, ShieldPlus, Hand, Link2, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { CardBack, CARD_RADIUS } from './CardBack';
import { CARD_RATIO } from './Battlefield';
import { counterBadge } from './cardMarks';
import {
  attachmentsOn,
  automationFor,
  carriesSummary,
  hostOf,
  statLine,
  statLineIn,
  isLand,
  isCreature,
  hasKeyword,
  hasKeywordIn,
  isCreatureIn,
} from '@/lib/game';
import type { CardInstance } from '@/lib/game';
import { useGameState } from './GameStateContext';

export type GameCardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Rendered width in px per size token. Drives the Scryfall resolution too. */
export const GAME_CARD_WIDTH: Record<GameCardSize, number> = {
  xs: 58,
  sm: 86,
  md: 130,
  lg: 186,
  xl: 262,
};

const NAME_TEXT: Record<GameCardSize, string> = {
  xs: 'text-[7px] leading-tight',
  sm: 'text-[9px] leading-tight',
  md: 'text-[11px] leading-snug',
  lg: 'text-sm leading-snug',
  xl: 'text-base leading-snug',
};

/** A lunge, in card-local pixels. Positive y is toward the bottom of the seat. */
export interface Lunge {
  x: number;
  y: number;
}

/**
 * The combat control drawn on a permanent.
 *
 * `kind` comes straight from `combatUi.ts` and picks the glyph and the fill;
 * `label` is the reason, and it is required, because the one state this chip
 * has that the tap chip does not is *inert* — an attacker you cannot block yet
 * — and an inert control that will not say why is the thing being complained
 * about, not the fix for it.
 */
export interface CombatChipProps {
  kind: 'attack' | 'attacking' | 'block' | 'armed' | 'blocking' | 'target';
  enabled: boolean;
  label: string;
  onClick: () => void;
}

/** Glyph per chip kind. Swords for offence, shields for defence. */
const COMBAT_CHIP_ICON = {
  attack: Swords,
  attacking: Swords,
  block: Shield,
  armed: ShieldPlus,
  blocking: Shield,
  target: Swords,
} as const;

export interface GameCardViewProps {
  card: CardInstance;
  size?: GameCardSize;
  /** Explicit width in px, overriding `size`. */
  width?: number;
  /** Render the back instead of the face. */
  hidden?: boolean;
  selected?: boolean;
  /**
   * A card you cannot play right now.
   *
   * Owner: *"I liked when cards were greyed out if you couldnt cast them."*
   * This had been softened to a barely-visible step-back and the owner asked
   * for it back, so it is a real grey-out again: all colour gone and the card
   * pushed down in brightness, which on a Magic card is the loudest signal
   * there is — the frame, the mana pips and the art all lose their hue at once.
   *
   * Brightness rather than opacity, deliberately. Opacity lets the playmat art
   * bleed through the card and made the rules text unreadable; a dimmed card is
   * still a card you are planning your next turn around, so it stays legible
   * and merely stops competing with the ones you can actually cast.
   */
  dimmed?: boolean;
  /**
   * This card's part in a target being chosen somewhere else on the table.
   *
   * Something is asking what it is aimed at, and the answer is a press on a
   * card rather than a press on a list of names. `legal` means this permanent
   * is one the engine will accept: it stays at full strength, lifts, and takes
   * the press. `receded` is every other card on the table, and it steps back so
   * the legal ones are the only thing the eye lands on.
   *
   * RECEDE IS NOT DESATURATE. Opacity and scale, and nothing else. Scryfall's
   * terms forbid altering a card image's colour and this project has been
   * pulled up for it twice, most recently for the `saturate-0` that used to sit
   * on this very element (see `dimmed` below). Both channels here are also the
   * two the project's own motion rule allows, so nothing moves the layout.
   */
  aiming?: 'legal' | 'receded' | null;
  /**
   * Tap or untap this permanent, straight from the card.
   *
   * Owner: *"I dont like that tap/untap is in left menu — tapping should be
   * easy on card."* A player tapping five lands must not open five panels, so
   * the permanent carries its own control: a chip in its corner that toggles
   * the tap and opens nothing. The inspector still offers Tap as well, for the
   * card you are already reading — this is the one for the card you are not.
   *
   * Deliberately a button rather than a double-click on the card. A double
   * click also fires two single clicks, so the "quick" gesture would have
   * opened the preview every time — which is the exact round-trip being
   * complained about.
   */
  onTap?: () => void;
  /**
   * The combat control this permanent carries, on the card.
   *
   * Owner: *"attack button should be a sword icon or something too"*, and
   * *"no way to attack with it and block stages"*.
   *
   * So attacking is a sword ON the creature, in the mirror position to the tap
   * chip — same shape, same sizing rule, opposite edge — because a player who
   * has learnt one control has learnt both. Pressing it declares or recalls the
   * attack and opens nothing, exactly as the tap chip taps and opens nothing;
   * clicking the card's art still opens the preview, so the owner's *"click and
   * preview your card, then select a button action or close"* survives intact.
   * The chip is the shortcut for the card you are NOT reading.
   *
   * `combatUi.ts` decides which chip a card carries and whether it is live.
   */
  combat?: CombatChipProps | null;
  /** Combat standing. Shown with elevation and a label, never an outline. */
  role?: 'attacker' | 'blocker' | 'target' | null;
  /**
   * Who this creature is hitting, or what it is standing in front of.
   *
   * Owner: *"attacking and blocking doesn't seem very clear at all"*. An
   * attacker used to be drawn lifted and scaled with its power over it, and
   * that was the whole record on the board of who it was attacking — with four
   * creatures pointed at four different seats, which is the normal shape of a
   * Commander game, the board could not answer the question at all. Computed by
   * `combatMarkFor` in `seatCombat.ts`, which is tested.
   */
  combatNote?: { role: 'attacker' | 'blocker'; text: string; detail: string } | null;
  /** Push toward the defending seat while attacking. */
  lunge?: Lunge | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Overrides the automatic tapped rotation, for hand and zone lists. */
  ignoreTapped?: boolean;
  title?: string;
  /** Play the "just arrived on the battlefield" entrance. */
  entering?: boolean;
}

/** A card with no art: still a card, not a placeholder. */
function TypographicFace({
  card,
  size,
  stats,
}: {
  card: CardInstance;
  size: GameCardSize;
  stats: string | null;
}) {
  const compact = size === 'xs' || size === 'sm';

  return (
    <div
      className="flex h-full w-full flex-col justify-between bg-card p-1.5"
      style={{ borderRadius: CARD_RADIUS }}
    >
      <div className="min-w-0">
        <p className={cn('truncate font-medium text-foreground', NAME_TEXT[size])}>{card.name}</p>
        {!compact && card.manaCost && <ManaCost cost={card.manaCost} size="xs" className="mt-1" />}
      </div>
      {!compact && (
        <p className="truncate text-[9px] leading-tight text-muted-foreground">{card.typeLine}</p>
      )}
      {stats && (
        <p
          className={cn(
            'self-end font-semibold text-foreground',
            compact ? 'text-[9px]' : 'text-xs'
          )}
        >
          {stats}
        </p>
      )}
    </div>
  );
}

export const GameCardView = memo(function GameCardView({
  card,
  size = 'sm',
  width,
  hidden,
  selected,
  dimmed,
  aiming = null,
  onTap,
  combat,
  role,
  combatNote = null,
  lunge,
  onClick,
  onDoubleClick,
  className,
  style,
  ignoreTapped,
  title,
  entering,
}: GameCardViewProps) {
  const reduceMotion = useReducedMotion();
  const renderedWidth = width ?? GAME_CARD_WIDTH[size];
  const tapped = !ignoreTapped && card.tapped;
  const interactive = !!onClick;

  /* The tap chip scales with the card so it is the same *proportion* of a
     permanent at every board size — never smaller than a thumb target, and
     never so large on a full-size card that it stops being a control on the
     art and starts being a badge over it. */
  const chip = Math.min(34, Math.max(20, Math.round(renderedWidth * 0.24)));

  /* The sword rides a little larger than the tap chip. Same proportional rule,
     a bigger fraction: on a board of eight creatures the one question a player
     is asking is "which of these can swing", and the answer has to be legible
     from across the table rather than found by hovering. */
  const swordChip = Math.min(42, Math.max(24, Math.round(renderedWidth * 0.3)));

  /* The counter and damage badges, on the same proportional rule. They used to
     be a fixed 9px in a 16px pill at every card size, which was the only mark
     on a card that did not follow the card. `cardMarks.ts` has the measurement
     that says so. */
  const badge = counterBadge(renderedWidth);

  /*
   * The live board, published by `PlayTable`. Every question below about what
   * this permanent CURRENTLY is — its stat line, whether it is a creature,
   * whether it has haste — is answered through it by the layer engine. `null`
   * outside a game (a deck-list row, a search result), where the printed values
   * are the correct answer and the fallbacks below are what runs.
   */
  const gameState = useGameState();

  /* Summoning sickness, told truthfully.
     `summoningSick` is set on every permanent that enters, but it only RESTRAINS
     a creature, and haste lifts the restraint entirely. The board used to print a
     9px "zzz" for any sick creature with no haste check at all, so a hasty
     creature — the one case where the player urgently needs to know it CAN swing
     — was labelled as though it could not.

     Both questions are LAYERED, and that is not a refinement — it is the whole
     point. `combat.ts`'s `eligibleAttackers` asks `isCreatureIn` (layer 4) and
     `hasKeywordIn` (layer 6), and `combatUi.ts` lights the sword from the same
     two. Asking the printed `isCreature`/`hasKeyword` here put the badge and the
     sword on one card into open contradiction:

       - Fires of Yavimaya ("Creatures you control have haste") — the engine let
         a summoning-sick bear attack and drew it a live sword, while this badge
         called it restrained.
       - Dryad Arbor — a creature that genuinely cannot attack the turn it lands,
         and the old `!isLand(card)` guard silently gave it no badge at all. The
         guard existed only to keep ordinary lands unmarked, and `isCreatureIn`
         already excludes those, so it is gone rather than corrected.

     These two are mutually exclusive by construction. */
  const creature = gameState ? isCreatureIn(gameState, card) : isCreature(card) && !isLand(card);
  const onBattlefield = card.zone === 'battlefield';
  const hasHaste = gameState
    ? hasKeywordIn(gameState, card, 'haste')
    : hasKeyword(card, 'haste');
  const hasty = creature && onBattlefield && card.summoningSick && hasHaste;
  const restrained = creature && onBattlefield && card.summoningSick && !hasty;
  const TapIcon = card.tapped ? RotateCcw : RotateCw;

  const cardHeight = renderedWidth / CARD_RATIO;

  const handleTap = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onTap?.();
  };

  const handleCombat = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (combat?.enabled) combat.onClick();
  };

  const CombatIcon = combat ? COMBAT_CHIP_ICON[combat.kind] : null;
  /* Armed and already-declared read as filled; the two "you could" states read
     as available; an inert chip is a whisper that still says why on hover. */
  const combatFilled =
    combat?.kind === 'attacking' || combat?.kind === 'armed' || combat?.kind === 'blocking';

  const counters = Object.entries(card.counters).filter(([, value]) => value !== 0);
  const damage = card.damage;

  /*
   * "This one is your job."
   *
   * `automationFor(card).needsManual` has been computed correctly, and
   * correctly, for a long time, and no component had ever rendered it. That is
   * the exact shape of the owner's Aether Vial report: the engine knows the
   * card has an upkeep trigger it will not run, it marks the card as needing a
   * human, and the board says nothing. From the player's seat an ability the
   * app can see and silently declines is indistinguishable from a broken
   * engine.
   *
   * Battlefield only. Measured over the catalogue, 95.7% of cards carry text
   * this engine does not resolve, so marking every card in every zone would
   * mark everything and therefore mark nothing. A permanent in play is where
   * the ability is actually going off and where the player can act on it, and
   * the preview carries the full account for any card in any zone.
   *
   * `automationFor` is memoised per card object in `effects.ts`, so a board of
   * 120 permanents pays for its regexes once each rather than once per render.
   */
  const needsManual = onBattlefield && !hidden && automationFor(card).needsManual;

  /*
   * The stat line comes from the layer engine, not from the card.
   *
   * `statLineIn` is memoised on state identity, so every card on the board
   * shares one `computeLayers` run per state and this is a `WeakMap` lookup —
   * which is also why the sickness badge above can afford to ask the layer
   * engine twice more without costing anything.
   *
   * Outside a game (a deck-list row, a search result) there is no state and it
   * falls back to the printed value, which is the right answer there.
   */
  const stats = gameState ? statLineIn(gameState, card) : statLine(card);

  /*
   * WHICH CREATURE IS CARRYING THE SWORD.
   *
   * The one question a board full of Equipment and Auras makes a player ask,
   * and until `attach.ts` landed nothing on this table could ever have answered
   * it, because nothing had ever built an `ATTACH`. Two marks, both from the
   * engine rather than from the card:
   *
   *   on the HOST        a link mark and a count, whose tooltip names each
   *                      attachment and what it is currently granting
   *   on the ATTACHMENT  the same mark, naming what it is on
   *
   * `carriesSummary` reads the layer engine's applied-effect trace, so the
   * tooltip cannot claim a bonus the board is not applying. An attachment whose
   * text the compiler has not modelled contributes its name and no numbers,
   * which is the true thing to say about it.
   *
   * Both are `absolute` marks over the card's own footprint, like the sickness
   * and by-hand marks above. Nothing here changes the card's box, so a sword
   * arriving cannot move a single permanent on the mat.
   */
  const readAttachments = !!gameState && onBattlefield && !hidden;
  const attachments = readAttachments ? attachmentsOn(gameState, card.instanceId) : [];
  const attachmentCount = attachments.length;
  // Asked only when there is something to say. `grantsOn` walks the layer
  // engine's applied-effect trace, and a board of forty permanents should not
  // pay for that on every card that is carrying nothing.
  const carrying = attachmentCount > 0 ? carriesSummary(gameState, card.instanceId) : '';
  const attachedHost = readAttachments ? hostOf(gameState, card) : undefined;

  const lift = role === 'attacker' ? -10 : role === 'blocker' ? -5 : selected ? -6 : 0;

  /*
   * OPACITY IS AN ANIMATED VALUE, NOT A CLASS, AND IT HAS TO BE.
   *
   * The entrance below starts the card at `opacity: 0`, so `animate` has to
   * name an opacity target or the card stays invisible forever: its counters
   * and its power/toughness badge live outside this element and rendered onto
   * an empty mat. That happened every time a seat re-mounted, and switching to
   * view mode drew an opponent's board as a set of floating 1/1 pips.
   *
   * The consequence is that this is the ONLY place a card's opacity can be set.
   * Framer writes the animated value to `style.opacity` on the element, and an
   * inline style beats any class, so `dimmed` naming `opacity-50` in the
   * className below could never have taken effect while `animate` named
   * `opacity: 1`. Every state that wants a card quieter states it here.
   *
   * `receded` is stronger than `dimmed` on purpose. `dimmed` says "not this
   * turn" over a board a player is still reading; `receded` says "not part of
   * this question" while exactly a handful of cards are.
   */
  const opacity = aiming === 'receded' ? 0.34 : aiming === 'legal' ? 1 : dimmed ? 0.5 : 1;

  /* One scale, chosen once. A legal target lifts toward the player, everything
     else settles back. Both are transforms on this inner element, which does
     not carry the layout box, so nothing on the mat moves. */
  const aimScale = aiming === 'legal' ? 1.06 : aiming === 'receded' ? 0.95 : null;

  const animate = reduceMotion
    ? { opacity, rotate: tapped ? 90 : 0, x: 0, y: 0, scale: aimScale ?? 1 }
    : {
        opacity,
        rotate: tapped ? 90 : 0,
        x: lunge?.x ?? 0,
        y: (lunge?.y ?? 0) + (aiming === 'legal' ? -8 : aiming === 'receded' ? 0 : lift),
        scale: aimScale ?? (role === 'attacker' || selected ? 1.05 : 1),
      };

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: renderedWidth, ...style }}
      onDoubleClick={onDoubleClick}
      /*
       * The card's identity, on the element, so a screenshot run can measure a
       * specific permanent rather than guessing from its name.
       *
       * Not decoration: a fallback deck holds four Grizzly Bears and both seats
       * are dealt from the same list, so "did tapping this card move that one"
       * was being answered by matching on NAME and silently comparing one
       * player's bear against another's. The layout-shift measurement in
       * `scripts/play-preview-shots.mjs` reads this.
       */
      data-instance={card.instanceId}
      data-tapped={card.tapped ? 'true' : 'false'}
    >
      {/* The rotation lives on an inner element: a CSS rotate does not change
          the layout box, so tapping a card must not reflow the row around it. */}
      <motion.div
        initial={
          entering && !reduceMotion ? { opacity: 0, scale: 0.68, y: 28, rotate: 0 } : false
        }
        animate={animate}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 320, damping: 26, mass: 0.7 }
        }
        className={cn(
          'relative w-full origin-center',
          /*
           * Cannot be cast, cannot attack, cannot block, not part of the
           * question being asked: all said with OPACITY and nothing else.
           *
           * This was `saturate-0 brightness-[0.52] contrast-[0.92]`, applied
           * over the Scryfall image of every uncastable card in hand and every
           * creature that cannot attack or block. That is desaturating and
           * colour shifting a card image, which Scryfall's terms forbid and
           * which this project has already been pulled up for twice.
           * `Playmat.tsx` records taking exactly that filter off the mat for
           * exactly that reason.
           *
           * It also made a first hand look broken. On turn one nothing is
           * castable, so the first thing a new player saw was seven grey cards.
           *
           * The value itself is in `animate` above, not here, because Framer
           * writes an inline opacity onto this element and an inline style
           * beats a class. See the comment on `opacity`.
           */
          role === 'attacker' && 'drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)]',
          aiming === 'legal' && 'drop-shadow-[0_12px_22px_rgba(0,0,0,0.7)]',
          selected && 'drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]'
        )}
      >
        {hidden ? (
          <CardBack fill title={title ?? 'Face-down card'} />
        ) : card.imageUrl ? (
          <CardImage
            card={{ name: card.name, image_url: card.imageUrl }}
            fill
            width={renderedWidth}
            onClick={onClick ? () => onClick() : undefined}
            interactive={interactive}
            hideFlip
            title={title ?? card.name}
          />
        ) : (
          <div
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={onClick}
            onKeyDown={
              interactive
                ? event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onClick?.();
                    }
                  }
                : undefined
            }
            title={title ?? card.name}
            aria-label={card.name}
            className={cn(
              'block w-full overflow-hidden shadow-md shadow-black/40',
              interactive &&
                'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            style={{ aspectRatio: '488 / 680', borderRadius: CARD_RADIUS }}
          >
            <TypographicFace card={card} size={size} stats={stats} />
          </div>
        )}

        {/* Selection and targeting read as a wash on the card, not an outline. */}
        {(selected || role === 'target') && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0',
              role === 'target' ? 'bg-destructive/30' : 'bg-foreground/20'
            )}
            style={{ borderRadius: CARD_RADIUS }}
          />
        )}

        {/* Tapped cards sit in shade. The rotation says "spent", this agrees. */}
        {tapped && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-black/35"
            style={{ borderRadius: CARD_RADIUS }}
          />
        )}

        {/*
          THE CARD IS THE BUTTON.

          Something is asking what it is aimed at and this permanent is a legal
          answer, so the whole card takes the press. A real `<button>` over the
          art rather than a handler on it, for two reasons:

            - `CardImage` owns the click on the art and is not this workstream's
              file. Wrapping is the change that is available, and it is also the
              better one;
            - it puts every legal target in the tab order with an accessible
              name, so the question can be answered from the keyboard. A prompt
              that stops the game and can only be answered with a mouse is the
              same trap as a prompt with no way out.

          Inside the rotated element, so a tapped land's hit area is the
          rectangle the eye sees rather than the upright box it was laid out in.
          The crosshair turns back the other way so it stays upright.
        */}
        {aiming === 'legal' && onClick && (
          <button
            type="button"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onClick();
            }}
            onDoubleClick={event => event.stopPropagation()}
            title={title ?? `Aim at ${card.name}`}
            aria-label={`Aim at ${card.name}`}
            className={cn(
              'absolute inset-0 z-30 flex items-center justify-center bg-foreground/[0.14]',
              'transition-colors hover:bg-foreground/[0.26]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            style={{ borderRadius: CARD_RADIUS }}
          >
            <Crosshair
              aria-hidden="true"
              className="text-foreground drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
              strokeWidth={2.5}
              style={{
                width: Math.min(46, Math.max(18, Math.round(renderedWidth * 0.3))),
                height: Math.min(46, Math.max(18, Math.round(renderedWidth * 0.3))),
                transform: tapped ? 'rotate(-90deg)' : undefined,
              }}
            />
          </button>
        )}

      </motion.div>

      {/* Overlays sit outside the rotated element so they stay upright. */}

      {/*
        Tap, on the card.

        Owner: *"tapping should be easy on card."*

        Halfway down the left edge, which is the only place on a permanent that
        survives everything the board does to it:

          - the LEFT edge is never hidden by a neighbour, because permanents in
            a row slide leftward under the card after them;
          - the MIDDLE is never hidden by the viewer's own hand, which laps over
            the foot of the near mats — and the mana row is exactly the row a
            player taps most;
          - a card turns about its centre, so this one offset is correct tapped
            and untapped alike;
          - and it covers art rather than the name along the top or the power
            and toughness at the bottom right. The top-left corner was tried
            first and ate the first two letters of every creature's name.

        Always drawn rather than revealed on hover: there is no hover on a
        tablet, and a control you have to discover is a control the owner will
        report as missing.
      */}
      {onTap && (
        <button
          type="button"
          onClick={handleTap}
          onDoubleClick={event => event.stopPropagation()}
          title={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
          aria-label={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
          aria-pressed={card.tapped}
          className={cn(
            'absolute z-20 flex items-center justify-center rounded-full shadow-md shadow-black/60 backdrop-blur-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            card.tapped
              ? 'bg-foreground text-background hover:bg-foreground/85'
              : 'bg-background/80 text-foreground hover:bg-foreground hover:text-background'
          )}
          style={{
            left: -Math.round(chip * 0.32),
            top: Math.round((cardHeight - chip) / 2),
            width: chip,
            height: chip,
          }}
        >
          <TapIcon style={{ width: chip * 0.52, height: chip * 0.52 }} strokeWidth={2.5} />
        </button>
      )}

      {/*
        The sword. Owner: *"attack button should be a sword icon or something
        too"*.

        Mirror of the tap chip — same vertical centre, opposite edge — so the
        two controls a permanent carries are the two ends of the same card and
        can never overlap however narrow the board gets. Slightly larger than
        the tap chip on purpose: declaring an attack is the loudest thing a
        creature does, and the owner's complaint was that it read as a text
        button in a step list rather than as attacking.

        An inert chip (an attacker you have not armed a blocker for yet) is
        drawn quiet rather than hidden. Hiding it would leave a player facing an
        incoming attack with nothing on screen to press, which is the reported
        bug — *"no way to attack with it and block stages"* — in the other
        direction.
      */}
      {combat && CombatIcon && (
        <button
          type="button"
          onClick={handleCombat}
          onDoubleClick={event => event.stopPropagation()}
          disabled={!combat.enabled}
          title={combat.label}
          aria-label={combat.label}
          aria-pressed={combatFilled}
          className={cn(
            'absolute z-20 flex items-center justify-center rounded-full shadow-md shadow-black/60 backdrop-blur-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !combat.enabled
              ? 'cursor-not-allowed bg-background/45 text-muted-foreground'
              : combatFilled
                ? 'bg-foreground text-background hover:bg-foreground/85'
                : 'bg-background/85 text-foreground hover:bg-foreground hover:text-background'
          )}
          style={{
            right: -Math.round(swordChip * 0.32),
            top: Math.round((cardHeight - swordChip) / 2),
            width: swordChip,
            height: swordChip,
          }}
        >
          <CombatIcon
            style={{ width: swordChip * 0.54, height: swordChip * 0.54 }}
            strokeWidth={2.5}
          />
        </button>
      )}

      {(counters.length > 0 || damage > 0) && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 flex flex-wrap justify-center gap-1"
          style={{ bottom: -Math.round(badge.height * 0.34) }}
        >
          {counters.map(([key, value]) => (
            <span
              key={key}
              className="flex items-center justify-center rounded-full bg-foreground font-semibold tabular-nums text-background shadow-md shadow-black/50"
              style={{
                fontSize: badge.font,
                lineHeight: `${badge.height}px`,
                height: badge.height,
                minWidth: badge.height,
                paddingLeft: badge.padX,
                paddingRight: badge.padX,
              }}
              title={`${value} ${key} counters`}
            >
              {value > 0 ? `+${value}` : value}
            </span>
          ))}
          {damage > 0 && (
            <span
              className="flex items-center justify-center rounded-full bg-destructive font-semibold tabular-nums text-destructive-foreground shadow-md shadow-black/50"
              style={{
                fontSize: badge.font,
                lineHeight: `${badge.height}px`,
                height: badge.height,
                minWidth: badge.height,
                paddingLeft: badge.padX,
                paddingRight: badge.padX,
              }}
              title={`${damage} damage marked`}
            >
              {damage}
            </span>
          )}
        </div>
      )}

      {/* Summoning sickness is a state you must be able to read ACROSS THE BOARD
          at a glance — "which of these can actually attack" is the question the
          player is asking every combat. So it is a proper corner mark sized to
          the card (the same proportional rule as the tap chip), not a 9px word
          buried in the counter row where it competed with +1/+1 counters and
          damage and lost.

          Haste gets the opposite mark rather than none: a creature that entered
          this turn AND can attack anyway is the single most missable thing on a
          battlefield. */}
      {(restrained || hasty) && (
        <span
          className={cn(
            'pointer-events-none absolute z-10 flex items-center justify-center rounded-full shadow-md shadow-black/60',
            restrained
              ? 'bg-background/90 text-muted-foreground backdrop-blur-sm'
              : 'bg-foreground text-background'
          )}
          style={{
            width: chip * 0.82,
            height: chip * 0.82,
            left: -Math.round(chip * 0.2),
            top: -Math.round(chip * 0.2),
          }}
          title={
            restrained
              ? `${card.name} entered the battlefield this turn. It cannot attack, or use abilities that need tapping, until your next turn begins. Haste would remove this.`
              : `${card.name} entered the battlefield this turn but has haste, so it can attack and tap immediately.`
          }
          aria-label={restrained ? 'Summoning sick' : 'Has haste'}
        >
          {restrained ? (
            <Hourglass style={{ width: chip * 0.42, height: chip * 0.42 }} strokeWidth={2.5} />
          ) : (
            <Zap style={{ width: chip * 0.44, height: chip * 0.44 }} strokeWidth={2.5} />
          )}
        </span>
      )}

      {/* The attachment mark. Bottom-left, the one corner nothing else uses, so
          it never fights the sickness mark, the by-hand mark or the tap chip.
          A count when this permanent is CARRYING things; a bare link when this
          permanent IS one. */}
      {(attachmentCount > 0 || attachedHost) && (
        <span
          className="pointer-events-none absolute z-10 flex items-center justify-center gap-px rounded-full bg-foreground px-1 text-background shadow-md shadow-black/60"
          style={{
            height: Math.round(chip * 0.68),
            left: -Math.round(chip * 0.16),
            bottom: -Math.round(chip * 0.16),
          }}
          title={
            attachmentCount > 0
              ? `${card.name} is carrying ${carrying}`
              : `${card.name} is attached to ${attachedHost?.name}`
          }
          aria-label={
            attachmentCount > 0
              ? `Carrying ${attachmentCount} ${attachmentCount === 1 ? 'attachment' : 'attachments'}`
              : `Attached to ${attachedHost?.name}`
          }
        >
          <Link2 style={{ width: chip * 0.34, height: chip * 0.34 }} strokeWidth={2.75} />
          {attachmentCount > 0 && (
            <span style={{ fontSize: Math.max(8, Math.round(chip * 0.3)) }} className="font-semibold leading-none">
              {attachmentCount}
            </span>
          )}
        </span>
      )}

      {/* Quiet on purpose. It sits in the corner the sickness mark does not
          use, it is a whisper rather than a warning, and it never covers the
          rules text — it is a standing reminder that this permanent has a job
          the engine will not do, not an alarm. Clicking the card opens the
          preview, where the by-hand controls live. */}
      {needsManual && (
        <span
          className="pointer-events-none absolute z-10 flex items-center justify-center rounded-full bg-background/85 text-muted-foreground shadow-md shadow-black/50 backdrop-blur-sm"
          style={{
            width: chip * 0.68,
            height: chip * 0.68,
            right: -Math.round(chip * 0.16),
            top: -Math.round(chip * 0.16),
          }}
          title={`${card.name} has rules text this app does not resolve for you. Click the card to add counters, flag keywords or move it, and resolve it yourself.`}
          aria-label="Resolve by hand"
        >
          <Hand style={{ width: chip * 0.36, height: chip * 0.36 }} strokeWidth={2.5} />
        </span>
      )}

      {(role === 'attacker' || role === 'blocker') && (
        <span
          /* Left, for the same reason the note below is: a crowded row hides
             the right of every card under the next one. */
          className={cn(
            'pointer-events-none absolute -top-2 left-0 z-10 rounded-full px-1.5 text-[9px] font-semibold leading-4 shadow-md shadow-black/60',
            role === 'attacker'
              ? 'bg-foreground text-background'
              : 'bg-background/90 text-foreground backdrop-blur-sm'
          )}
        >
          {/* A middle dot, not an em-dash: the copy rule covers every glyph
              that lands on screen, placeholders included. */}
          {stats ?? '·'}
        </span>
      )}

      {/*
        Who it is hitting, or what it is holding.

        Under the card rather than over it, so it never lands on the art or the
        rules text, and anchored to the LEFT rather than centred. That is not a
        style choice: `PermanentRow` gives each card `zIndex: index`, so a
        crowded row hides the RIGHT of every card under the one after it and the
        only strip that stays visible is the left edge. A centred label on a
        row of seven attackers is a label nobody can read, which is the failure
        this whole mark exists to fix.
      */}
      {combatNote && renderedWidth >= 52 && (
        <span
          title={combatNote.detail}
          aria-label={combatNote.detail}
          className={cn(
            'pointer-events-none absolute -bottom-1.5 left-0 z-20 max-w-full truncate rounded-full px-1.5 text-[9px] font-semibold leading-4 shadow-md shadow-black/60',
            combatNote.role === 'attacker'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-background/95 text-foreground backdrop-blur-sm'
          )}
        >
          {combatNote.text}
        </span>
      )}
    </div>
  );
});

export default GameCardView;
