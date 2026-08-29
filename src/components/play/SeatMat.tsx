/**
 * One player's seat — a playmat with their board on it, the right way up.
 *
 * Owner: *"players on left and right - their stats should be correct way
 * around"*, *"all hands shows as if placed in front of you, so you can click
 * their cards and view their board properly"*.
 *
 * So rotation is gone as a presentation concept. `seating.ts` still says where
 * a seat sits; nothing here turns it. Every seat is drawn exactly as it would
 * look if it were the one in front of you, which is what makes an opponent's
 * board readable — and therefore clickable — instead of decorative.
 *
 * ---------------------------------------------------------------------------
 * The geometry is a real playmat, not three stacked bands
 * ---------------------------------------------------------------------------
 * Owner, round 2: *"not sure i like the layout of items. - lands should always
 * be bottom, creatures top - 2 main rows, enchanements/artifacts etc should
 * have its own square right side or something. Doesn't follow normal playmat
 * setups at all."*
 *
 *   ┌────────┬────────────────────────────────────┬───────────────┐
 *   │ LIBRARY│  CREATURES        (top — they hit) │  ARTIFACTS    │
 *   │ YARD   ├────────────────────────────────────┤  ENCHANTMENTS │
 *   │ EXILE  │  LANDS            (bottom — mana)  │  WALKERS      │
 *   │ COMMAND│                                    │               │
 *   └────────┴────────────────────────────────────┴───────────────┘
 *
 * Two full-width rows and a block. The support block sits to the RIGHT of the
 * two rows on every seat — mirroring it on the far side of the table would put
 * it somewhere different depending on where you were sitting, and the whole
 * point of not rotating anything is that every mat reads the same way. Only the
 * pile column (library, graveyard, exile, command) follows the seat's outer
 * edge, because those are stacks you reach for rather than a board you read.
 *
 * Dropping the third band is also the single biggest size win available: the
 * two rows that are left are half again as tall, so the cards on them are half
 * again as big, before any slider is touched. Owner: *"cards are tiny on screen
 * overall"*.
 *
 * The hand is the one zone that is not on the mat. The viewer's is the fan along
 * the bottom edge of the whole board — it is the biggest thing on screen and no
 * quadrant is big enough to hold it — and an opponent's is a small spread of
 * card backs in their identity strip, because a number where a fistful of cards
 * should be is the single biggest reason a play screen reads as a spreadsheet.
 *
 * Regions are separated by surface tint and spacing, never a border, and each
 * one holds its size whether or not it has anything in it — a board that
 * reflows every time a creature dies is a board you have to re-read.
 *
 * Sizing is measured, not guessed. The chosen card size is a *ceiling*: the mat
 * measures itself and comes down from that ceiling until both rows fit its
 * height and the busier of the two fits its width. That is why cards stop
 * running off the edge of a small screen.
 *
 * A click on a card calls `onInspect` and the preview decides what is legal —
 * click, preview, act. The one exception is the tap chip on a permanent you
 * control, which is a direct control on the card and opens nothing: owner,
 * *"I dont like that tap/untap is in left menu - tapping should be easy on
 * card."*
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Playmat } from './Playmat';
import { LifeBadge, type CommanderDamagePip, type LifeBadgeSize } from './LifeBadge';
import { CardBack, LibraryStack } from './CardBack';
import {
  CARD_RATIO,
  ROW_LABEL_GUTTER,
  ZoneBlock,
  ZoneRow,
  blockCardWidth,
} from './Battlefield';
import {
  PILE_COLUMNS,
  identityBandHeight,
  pileGrid,
  seatCardWidth,
  splitBands,
  supportBlockWidth,
} from './seatLayout';
import { BOARD_ROWS, SUPPORT_BLOCK, splitIntoRows } from './boardRows';
/* What this seat's band says about combat. Pure, and therefore tested — see
   `seatCombat.test.ts`. It is also the first caller `combatLanes` has ever
   had. */
import {
  combatMarkFor,
  incomingAttack,
  incomingSentence,
  outgoingAttack,
  outgoingSentence,
} from './seatCombat';
import { Crosshair } from 'lucide-react';
import { GameCardView, type CombatChipProps, type Lunge } from './GameCardView';
import { useMeasuredSize } from './useMeasure';
import type { LifeDelta } from './useTableMotion';
import {
  availableMana,
  commanderDamageRows,
  commanderRefOf,
  commanderTax,
  isUnderAttack,
  lossReasonLabel,
  type CardInstance,
  type GameState,
  type Player,
  type PlayerId,
  type Zone,
} from '@/lib/game';

/** Gap between the two rows, and between the rows and the support block. */
const BAND_GAP = 4;

/**
 * What this mat does while something on the table is asking what it is aimed at.
 *
 * The mat does not work out legality. `chooseTargetsFor` already did, the answer
 * arrived through `aiming.ts`, and `PlayTable` split it into the set below.
 * A second opinion here is the bug this whole seam exists to remove: a name on
 * screen that the engine will refuse.
 */
export interface SeatAim {
  /** Every permanent on the table the engine will accept. Anywhere, any seat. */
  targetIds: ReadonlySet<string>;
  /** True when this seat's PLAYER is a legal answer. */
  seatIsTarget: boolean;
  /** What is asking, for the label on each control. */
  sourceName: string;
  onPickCard: (card: CardInstance) => void;
  onPickSeat: () => void;
}

export interface SeatMatProps {
  state: GameState;
  player: Player;
  /** The seat this device controls. */
  isViewer?: boolean;
  /**
   * Who is looking, so combat marks can say "hits you" instead of naming them.
   *
   * Not the same question as `isViewer`: an attacker pointed at the viewer sits
   * on somebody ELSE'S mat, and that mat has to be able to say so.
   */
  viewerPlayerId?: PlayerId;
  /**
   * What to call that seat on its own mat.
   *
   * "You" is right on `/play`, where the viewer's seat really is theirs, and
   * wrong on `/simulate`, where the same prop marks the seat the table is being
   * WATCHED through and nobody is playing it. One word, from the caller, rather
   * than a second mat.
   */
  viewerLabel?: string;
  isBot?: boolean;
  /** Ceiling for a battlefield card here. The mat only ever comes down from it. */
  cardWidth?: number;
  /** Click any card, anywhere, and the preview opens. Never the action itself. */
  onInspect?: (card: CardInstance) => void;
  /**
   * Toggle tap on one of this player's permanents, from the card itself.
   *
   * Only wired for the seat the device controls; an opponent's board is
   * readable and clickable but not operable.
   */
  onTapCard?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  /**
   * What each permanent offers while combat is being declared: the sword or
   * shield chip it carries, and whether it should be greyed out because this
   * step is about it and it cannot take part.
   *
   * Every seat gets the same function, including the opponents' — an attacker
   * swinging at you is on THEIR mat, and pressing it is how you put a blocker
   * in front of it. `combatUi.ts` decides what a card offers; a card the stage
   * is not about gets nothing back and the mat draws exactly as it did before.
   */
  combatFor?: (card: CardInstance) => { chip: CombatChipProps | null; dimmed: boolean } | null;
  /** Give this seat the whole viewport, read-only. */
  onFocusSeat?: (playerId: PlayerId) => void;
  /**
   * Open this seat's by-hand controls: life, poison, commander damage,
   * counters, and the two roles one seat holds for the table. Left unset on a
   * watched table, where nothing is anybody's to change.
   */
  onOpenSeatControls?: (playerId: PlayerId) => void;
  attackerIds?: readonly string[];
  blockerIds?: readonly string[];
  /** The card currently in the preview, so the board says which one it is. */
  inspectedId?: string | null;
  /** Per-attacker push toward the seat being attacked. */
  lunges?: Record<string, Lunge>;
  lifeDeltas?: LifeDelta[];
  /** Which edge of the board this seat's pile column sits against. */
  side?: 'left' | 'right';
  /** Draw this seat's hand as card backs in its identity strip. */
  showHandBacks?: boolean;
  /**
   * A target is being chosen. Legal permanents on this mat take the press and
   * everything else recedes, including this seat's own combat chips: there is
   * one question on the table and the board should offer one answer to it.
   */
  aim?: SeatAim | null;
  className?: string;
}

/**
 * A zone that is a pile of cards rather than a number: library, graveyard,
 * exile, command. A count on its own is the single biggest reason a play screen
 * reads as a spreadsheet.
 */
function ZoneTile({
  label,
  title,
  count,
  height,
  width,
  showCount = true,
  onClick,
  children,
}: {
  /** Drawn on the tile. `roomy` decides whether it can be the full word. */
  label: string;
  /** Said in full to a screen reader and on hover. */
  title: string;
  count: number;
  height: number;
  width: number;
  /** The library stack carries its own count, so it does not want a second. */
  showCount?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  /*
   * The label and the count are sized to the TILE.
   *
   * They were a 7px label and a 9px count, chosen for a 116 x 72 tile. The
   * tiles are now roughly twice that on a two-seat table, and type that does
   * not grow with its box reads as a rendering fault rather than as restraint.
   * Both thresholds are the tile width, which is a function of the mat, so
   * nothing here can change during a game.
   */
  const roomy = width >= 92;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          /* `z-10`, because the library's stack of card backs is drawn after
             this in the DOM and was painting over the top half of the word
             LIBRARY on every seat — visible in a 2x crop of any board
             screenshot, and the reason one pass thought the mat was clipping
             its own labels. Nothing else in a tile reaches the label line. */
          'pointer-events-none absolute left-1.5 top-0.5 z-10 max-w-[calc(100%-0.75rem)] select-none truncate font-semibold uppercase tracking-[0.14em] text-foreground/60 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]',
          roomy ? 'text-[10px]' : 'text-[8px]'
        )}
      >
        {label}
      </span>
      <span className="flex h-full w-full items-center justify-center pt-2.5">{children}</span>
      {showCount && (
        <span
          className={cn(
            'pointer-events-none absolute bottom-1 right-1.5 rounded-full bg-background/80 px-1.5 font-semibold tabular-nums text-foreground shadow-sm shadow-black/50 backdrop-blur-sm',
            roomy ? 'text-[12px] leading-5' : 'text-[9px] leading-4'
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  /* The same printed bed the two rows carry, at the mana row's weight, so the
     piles read as areas printed on the mat rather than as widgets on top of it. */
  const shell = cn(
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.07]'
  );

  if (!onClick) {
    return (
      <span className={shell} style={{ height, width }} title={`${title}, ${count} card${count === 1 ? '' : 's'}`}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title}, ${count} card${count === 1 ? '' : 's'}`}
      aria-label={`${title}, ${count} card${count === 1 ? '' : 's'}`}
      className={cn(
        shell,
        'transition-colors hover:bg-foreground/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      style={{ height, width }}
    >
      {body}
    </button>
  );
}

/**
 * An empty pile still reads as a place a pile goes.
 *
 * `bg-black/25` before this, which was a fair choice on a 44px tile and reads
 * as a hole punched in the mat at 108px. An empty zone on a real mat is a
 * printed outline on the cloth, so this is a shallow inset instead: dark enough
 * to be a recess, light enough that the grain still comes through it.
 */
function EmptyWell({ width }: { width: number }) {
  return (
    <span
      aria-hidden="true"
      className="block rounded-[6%/4%] bg-black/15 shadow-[inset_0_1px_2px_hsl(0_0%_0%/0.35),inset_0_0_0_1px_hsl(0_0%_100%/0.04)]"
      style={{ width, height: width / CARD_RATIO }}
    />
  );
}

export function SeatMat({
  state,
  player,
  isViewer,
  viewerPlayerId,
  viewerLabel = 'You',
  isBot,
  /* A ceiling, and a deliberately generous one. The owner has now said twice
     that the board reads as icons rather than cards; the mat comes down from
     this on a small viewport, so starting low only ever makes it worse. */
  cardWidth = 200,
  onInspect,
  onTapCard,
  onOpenZone,
  combatFor,
  onFocusSeat,
  onOpenSeatControls,
  attackerIds = [],
  blockerIds = [],
  inspectedId,
  lunges,
  lifeDeltas,
  side = 'left',
  showHandBacks = true,
  aim = null,
  className,
}: SeatMatProps) {
  const [matRef, mat] = useMeasuredSize<HTMLElement>();

  const active = state.activePlayerId === player.id;
  const attacked = isUnderAttack(state, player.id);
  const dead = player.hasLost;

  const battlefield = useMemo(
    () => player.zones.battlefield.map(id => state.cards[id]).filter(Boolean),
    [player.zones.battlefield, state.cards]
  );
  const rows = useMemo(() => splitIntoRows(battlefield), [battlefield]);

  /*
   * Combat, from this seat's point of view. Recomputed only when the state
   * object changes identity, which is exactly when the board does: the reducer
   * returns a new state per action, so this runs once per action per seat and
   * not once per frame. `combatLanes` walks the declarations, which is a handful
   * of entries even on a wide board.
   */
  const incoming = useMemo(() => incomingAttack(state, player.id), [state, player.id]);
  const swing = useMemo(() => outgoingAttack(state, player.id), [state, player.id]);

  /* Only ever used to pick a pronoun: "hits you" against "hits Yeva". */
  const viewerId = viewerPlayerId ?? (isViewer ? player.id : '');

  const commander = player.commanders[0];
  const untapped = availableMana(state, player.id);

  /*
   * The tax on what is ACTUALLY in the command zone, not on `commanders[0]`.
   *
   * A partner pair is two commanders with two independent counts, and reading
   * the first one meant a seat that had recast its partner three times showed a
   * tax of zero on the tile above the card it was going to charge six for.
   * `commanderCost` owns the arithmetic; this only picks which one to show, and
   * shows the worst so the number on the tile is never smaller than the number
   * the player will be asked for.
   */
  const commandTax = (player.zones.command ?? []).reduce((worst, instanceId) => {
    const ref = commanderRefOf(state, state.cards[instanceId]);
    return ref ? Math.max(worst, commanderTax(state, ref.id)) : worst;
  }, 0);

  /*
   * Commander damage, asked of the engine rather than assembled here.
   *
   * `commanderDamageRows` already sorts worst first, filters to the commanders
   * that can actually kill this seat, and never sums two tallies. This used to
   * walk `player.commanderDamage` directly, which meant the mat carried a
   * second opinion about a loss condition.
   */
  const damageRows = commanderDamageRows(state, player.id);
  const commanderDamage: CommanderDamagePip[] = damageRows.map(row => ({
    id: row.commanderId,
    name: row.name,
    amount: row.amount,
    lethal: row.lethal,
  }));
  const worstCommanderDamage = damageRows[0];

  /* ---------------------------------------------------------------------- */
  /* Measurement — geometry is a function of the BOX, never of the board     */
  /* ---------------------------------------------------------------------- */
  /*
   * Nothing below reads how many permanents the seat has. That is the fix for
   * the owner's *"keep getting weird layout shifting when things happen"*, and
   * it is a fix by construction rather than by tuning: the numbers a new
   * permanent would have to change are not computed from anything it touches.
   *
   * Measured before, driving a real four-seat game and recording every card's
   * rectangle around each action — tap, untap, draw, damage, counters, life and
   * step changes were already clean; what moved the board was a card entering
   * or leaving. `seatLayout.ts` has the numbers.
   */

  const width = mat.width || 480;
  const height = mat.height || 300;

  /* The rail down the seat's outer edge: four piles, two across and two down.
     Constant for a given mat, and it reads the mat and nothing else — see
     `pileGrid`, and the measurement of the 44px postage stamps it replaces. */
  const piles = pileGrid(width, height);
  const sideWidth = piles.rail;
  const bandHeight = identityBandHeight(height);
  const tileHeight = piles.tileHeight;
  const tileCardWidth = piles.cardWidth;

  /* The life badge is sized to the band it now sits in rather than to the mat,
     because the band is the thing it has to fit inside. Measured at 1280x800
     on a four seat table the band is 37px, and the smallest badge used to be
     52 — it sat proud of its own box. */
  const lifeSize: LifeBadgeSize = bandHeight >= 54 ? 'md' : bandHeight >= 48 ? 'sm' : 'xs';

  /*
   * The identity band is a BAND again, and the two rows start below it.
   *
   * It used to float over the top of the creatures row to buy back its height.
   * Measured on a four-seat table at 1680, that trade had gone wrong in both
   * directions at once: the strip painted about 500px of the 493px row it was
   * floating over — life and name at one end, mana and a fan of seven hand
   * backs at the other — so the creatures row was inset down to 200px of usable
   * width, drew its cards at the 62px floor, and had them drawn UNDER the hand
   * backs anyway. The band costs about 46px of height and gives the creature
   * row its whole width back, which is worth far more: after the change the two
   * rows draw the same size card instead of 62px against 134px.
   */
  const bandsHeight = Math.max(60, height - bandHeight - 8);
  const bandsUsable = Math.max(40, bandsHeight - BAND_GAP);
  const { creatureHeight, landHeight } = splitBands(bandsUsable);

  /*
   * A card size per ROW, each from that row's own height and the player's
   * ceiling, and neither of them can change when a permanent arrives.
   *
   * The two rows are no longer the same height. `splitBands` gives the creature
   * row 55% because a creature is the card every other player at the table has
   * to read and a land is a card you count; the note there has the measurement
   * and the trade. Measured at 1920 x 1080, two seats: creatures 105 -> 128,
   * lands 105 -> 104.
   *
   * `renderCard` already takes the width it is drawn at as an argument, and
   * `tapChipFits` already judges per card rather than per mat, precisely so the
   * two rows may differ.
   */
  const creatureCardWidth = seatCardWidth(creatureHeight, cardWidth);
  const landCardWidth = seatCardWidth(landHeight, cardWidth);
  /* The support block takes the creature row's ceiling: it holds the cards a
     player reads rather than counts, and `blockLayout` comes down from this to
     whatever the block's own box will hold. */
  const boardCardWidth = creatureCardWidth;

  /*
   * The support block's width: a fifth of the mat when it is empty, and one of
   * three rungs wider once there is an artifact deck in it.
   *
   * This is the ONE number on this mat that reads the board, and the reason is
   * written out in `supportBlockWidth`: at 1920 the block held every permanent
   * in play in 11.6% of the mat while 1525 x 680 px of the mat held nothing.
   * It steps twice in a whole game, at the fifth support permanent and the
   * eleventh, and neither step changes any card's SIZE — `seatCardWidth` reads
   * the row's height, which the block cannot touch.
   */
  const supportWidth = Math.min(
    supportBlockWidth(width, rows.support.length),
    Math.max(0, width - sideWidth - 180 - BAND_GAP - 14)
  );
  const supportHeight = bandsHeight;
  /* What the run of cards really gets: the mat, less the rail, less the block,
     less the row's own label gutter. Handing `layoutRow` a width the cards are
     not laid out in is how every previous version of this came to paint over
     its own edge. */
  const rowWidth = Math.max(
    80,
    width - sideWidth - supportWidth - BAND_GAP - 14 - ROW_LABEL_GUTTER
  );

  /*
   * The block's card size — and it no longer follows the board either.
   *
   * It used to. `fitBlockCardWidth(width, height, COUNT, preferred)` searched
   * down from the row's size until that many cards tiled inside the block, so
   * every card in the block resized whenever one arrived: measured on a
   * four-seat table at 1680, Rancors landing one at a time took the block from
   * 102px to 100px to 66px to 64px, moving one card 49px and another 101px. It
   * was defended as contained — the block's outer width is fixed, so the rows
   * beside it did not move — but "contained" is not the same as "does not
   * happen", and it is the owner's complaint in the owner's own words.
   *
   * `blockLayout` takes the box and a CEILING and decides the whole grid, so
   * this line hands it the ceiling and nothing else. It used to run
   * `blockCardWidth` here as well and pass that answer down as the ceiling, so
   * the same search ran twice and the second one could never reach past what
   * the first had already settled on.
   */
  const supportCardWidth = boardCardWidth;

  /* Below this the identity band cannot hold everything, so the optional parts
     — the "Bot" chip, the word "mana", the spread of face-down cards — drop out
     rather than squeezing the player's name into an ellipsis. */
  const roomy = width >= 340;

  const handCount = player.zones.hand.length;
  const backWidth = Math.max(14, Math.round((bandHeight - 14) * CARD_RATIO));
  /* A constant number of slots, not a count. The fan used to be as wide as the
     hand was big, so drawing a card widened the identity cluster and moved
     everything that had stepped aside for it. Four backs read as "a fistful of
     cards" and the exact number is printed beside them. */
  const shownBacks = Math.min(4, handCount);

  const graveyardTop = player.zones.graveyard.length
    ? state.cards[player.zones.graveyard[player.zones.graveyard.length - 1]]
    : undefined;
  const exileTop = player.zones.exile.length
    ? state.cards[player.zones.exile[player.zones.exile.length - 1]]
    : undefined;
  const commandTop = player.zones.command.length
    ? state.cards[player.zones.command[0]]
    : undefined;

  const roleOf = (card: CardInstance) => {
    if (attackerIds.indexOf(card.instanceId) !== -1) return 'attacker' as const;
    if (blockerIds.indexOf(card.instanceId) !== -1) return 'blocker' as const;
    return null;
  };

  /* Tap is offered only on a permanent this device controls, and only when the
     card is big enough for the chip not to be most of it. Below that the
     inspector's Tap button is the way — it is still there. Judged per CARD now
     rather than per mat: the two rows can be different sizes, so a mana row of
     readable lands must not lose its tap chips to a cramped creature row. */
  const tapChipFits = (renderWidth: number) => renderWidth >= 54;

  const renderCard = (card: CardInstance, _index: number, renderWidth: number) => {
    /* Combat, on the card. `combatFor` returns null for everything the current
       step is not about, which is every card on the mat outside the declare
       steps — so the board is unchanged until there is a decision to make. */
    const combat = combatFor?.(card) ?? null;

    /*
     * ONE QUESTION AT A TIME.
     *
     * While something is asking what it is aimed at, this permanent is either
     * an answer or it is out of the way, and every OTHER control it carries
     * goes quiet: no tap chip, no sword, no shield, and a press does not open
     * the preview. A card that offered four different meanings for one press
     * while the game was stopped on a question would be the row of names again
     * with extra steps.
     */
    const aimState = aim ? (aim.targetIds.has(card.instanceId) ? 'legal' : 'receded') : null;
    const legal = aimState === 'legal';

    return (
      <GameCardView
        card={card}
        width={renderWidth}
        entering
        role={aim ? null : roleOf(card)}
        lunge={aim ? null : lunges?.[card.instanceId] ?? null}
        selected={!aim && inspectedId === card.instanceId}
        aiming={aimState}
        /* A creature that cannot swing or cannot block is greyed out in exactly
           the language the hand uses for a card you cannot cast. The hourglass
           `GameCardView` already draws says WHY; this says "not this one". */
        dimmed={!aim && (combat?.dimmed ?? false)}
        onClick={
          aim
            ? legal
              ? () => aim.onPickCard(card)
              : undefined
            : onInspect
              ? () => onInspect(card)
              : undefined
        }
        onTap={!aim && onTapCard && tapChipFits(renderWidth) ? () => onTapCard(card) : undefined}
        combat={!aim && renderWidth >= 44 ? combat?.chip ?? null : null}
        /* Who it is hitting, or what it is holding. Drawn on EVERY seat, not
           just the viewer's: an attacker swinging at you is on somebody else's
           mat, and "who is attacking whom" is unanswerable if only your own
           creatures say anything. */
        combatNote={aim ? null : combatMarkFor(state, card.instanceId, viewerId)}
        title={legal ? `Aim ${aim?.sourceName} at ${card.name}` : card.name}
      />
    );
  };

  /*
   * The four piles, two across and two down.
   *
   * They used to stack in a single column, which gave each tile a quarter of
   * the mat's height and drew the card inside it at 44px — measured, and below
   * `MIN_BOARD_CARD`, which is the size at which the art stops reading. Two
   * columns hand each tile half the height instead of a quarter and the card
   * roughly doubles. `pileGrid` has the numbers and the cap.
   *
   * The reading order is the one on a real mat: library and graveyard together
   * on the top row, exile and the command zone below them.
   */
  /* The full word once the tile is wide enough to print it. A three letter
     abbreviation on a 117px tile is a habit from a 116px column. */
  const pileLabel = (long: string, short: string) => (piles.tileWidth >= 92 ? long : short);

  /*
   * THE PILES RECEDE WITH THE BOARD.
   *
   * Measured on 23 Aug 2026, real bot game, Giant Growth asking "Choose a
   * creature": seven card views inside the two seats, three lit as legal at
   * opacity 1 and two receded to 0.34, and TWO left at opacity 1 with no
   * transform at all. Both were commanders sitting in a command-zone tile,
   * which is drawn by `GameCardView` like everything else but was never handed
   * `aiming`, so the one claim the whole gesture rests on ("exactly a handful
   * of cards are the only thing the eye lands on") was false by two cards on
   * every question, on every board.
   *
   * `receded` and never `legal`: a card in a pile is not answered by pressing
   * the tile. `boardTargets` splits the engine's list into what is drawn on a
   * mat and what is not, and `AimLayer` owns the control for the half that is
   * not, which is where a legal graveyard card is pressed.
   */
  const pileAim = aim ? ('receded' as const) : null;

  const pileColumn = (
    <aside
      className="grid h-full shrink-0 content-start justify-center gap-1 py-1"
      style={{
        width: sideWidth,
        gridTemplateColumns: `repeat(${PILE_COLUMNS}, ${piles.tileWidth}px)`,
      }}
      aria-label={`${player.name}'s zones`}
    >
      <ZoneTile
        label={pileLabel('Library', 'Lib')}
        title="Library"
        count={player.zones.library.length}
        height={tileHeight}
        width={piles.tileWidth}
        showCount={player.zones.library.length === 0}
        onClick={onOpenZone ? () => onOpenZone(player.id, 'library') : undefined}
      >
        {player.zones.library.length > 0 ? (
          <LibraryStack
            count={player.zones.library.length}
            width={tileCardWidth}
            maxLayers={4}
            label="Library"
          />
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
      </ZoneTile>

      <ZoneTile
        label={pileLabel('Graveyard', 'Yard')}
        title="Graveyard"
        count={player.zones.graveyard.length}
        height={tileHeight}
        width={piles.tileWidth}
        onClick={onOpenZone ? () => onOpenZone(player.id, 'graveyard') : undefined}
      >
        {graveyardTop ? (
          <GameCardView card={graveyardTop} width={tileCardWidth} ignoreTapped aiming={pileAim} />
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
      </ZoneTile>

      <ZoneTile
        label={pileLabel('Exile', 'Exile')}
        title="Exile"
        count={player.zones.exile.length}
        height={tileHeight}
        width={piles.tileWidth}
        onClick={onOpenZone ? () => onOpenZone(player.id, 'exile') : undefined}
      >
        {exileTop ? (
          /* Exiled cards read as removed from the game: same pile, unlit.
             `saturate-0` before this, over a Scryfall image, which the licence
             forbids and this project has been pulled up for twice. */
          <span className="block opacity-60">
            <GameCardView card={exileTop} width={tileCardWidth} ignoreTapped aiming={pileAim} />
          </span>
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
      </ZoneTile>

      <ZoneTile
        label={pileLabel('Command', 'Cmd')}
        title={
          commandTax > 0
            ? `Command zone, ${commandTax} more mana in commander tax`
            : 'Command zone'
        }
        count={player.zones.command.length}
        height={tileHeight}
        width={piles.tileWidth}
        onClick={
          commandTop && onInspect
            ? () => onInspect(commandTop)
            : onOpenZone
              ? () => onOpenZone(player.id, 'command')
              : undefined
        }
      >
        {commandTop ? (
          <GameCardView card={commandTop} width={tileCardWidth} ignoreTapped aiming={pileAim} />
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
        {/*
          THE TAX, ON THE TILE.

          It used to be a 7px zone label at 30% opacity and a hover title, which
          on a four-seat table is a number nobody reads and on a touch screen is
          a number nobody can reach. It is the price of the most important card
          in the deck, so it is drawn at the weight the card count is drawn at,
          in the opposite corner so the two never collide.
        */}
        {commandTax > 0 && (
          <span
            className="pointer-events-none absolute right-1 top-0.5 rounded-full bg-background/80 px-1 text-[9px] font-semibold leading-4 tabular-nums text-foreground shadow-sm shadow-black/50 backdrop-blur-sm"
            title={`${commandTax} more mana in commander tax`}
          >
            +{commandTax}
          </span>
        )}
      </ZoneTile>
    </aside>
  );

  /* The board itself: two rows on the left, the block on the right. Identical
     on every seat, because nothing here is rotated or mirrored. */
  const board = (
    <div className="flex min-h-0 flex-1 items-stretch" style={{ gap: BAND_GAP }}>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: BAND_GAP }}>
        {BOARD_ROWS.map(row => {
          const creatures = row.id === 'creatures';
          return (
            <ZoneRow
              key={row.id}
              label={row.label}
              cards={rows[row.id]}
              /* One size for the seat. The two rows are the same height, so a
                 permanent moving between them cannot resize anything. */
              cardWidth={creatures ? creatureCardWidth : landCardWidth}
              height={creatures ? creatureHeight : landHeight}
              /* The full width, on both rows. The top row used to give up as
                 much as 300px of its left end and 160px of its right to a
                 floating identity strip; the strip is a band now, above the
                 board, so neither row owes it anything. */
              available={rowWidth}
              /* Both rows are printed areas on the mat now, at two weights so
                 they read as two. Bare mat between them was one of the reasons
                 the surface read as a flat field. */
              bed={creatures ? 'soft' : 'strong'}
              renderCard={renderCard}
            />
          );
        })}
      </div>

      {/* A constant fifth of the mat, whether or not anything is in it. It used
          to grow a column at a time as artifacts resolved and collapse to a
          22px spine when the last one left, which moved the two rows beside it
          every single time, and was one of the measured causes of the owner's
          "weird layout shifting". */}
      <ZoneBlock
        /* The full label is two words too long for a quadrant on a laptop, and
           an ellipsis on a zone name reads as a bug rather than as a label. */
        label={supportWidth >= 190 ? SUPPORT_BLOCK.label : SUPPORT_BLOCK.shortLabel}
        cards={rows.support}
        cardWidth={supportCardWidth}
        width={supportWidth}
        height={supportHeight}
        renderCard={renderCard}
      />
    </div>
  );

  /*
   * The identity band: who this is, what they are on, and what is happening to
   * them. One line, at the top of the mat, above the board rather than floating
   * over it. See `identityBandHeight` for the measurement that moved it.
   *
   * It is also the only place a seat can say something about combat without
   * covering the creatures the sentence is about, which is why the attack
   * readout lives here rather than in another floating strip.
   */
  const identityBand = (
    <div
      className={cn(
        'relative flex shrink-0 items-center gap-2 rounded-lg px-2',
        attacked && !dead ? 'bg-destructive/25' : 'bg-foreground/[0.045]'
      )}
      style={{ height: bandHeight }}
    >
      {/*
        A PLAYER IS A TARGET WITH NOWHERE TO STAND.

        Every other legal answer is a card on a mat, and this one is a person.
        The band already carries their name and their life total, which is what
        a player looks at when they decide to point a burn spell at a face, so
        the band is where the press goes. `AimLayer` carries the same control as
        a chip for anyone who looks there first; both call the same answer.

        Drawn over the band rather than around it: the band already contains a
        button (look at that seat's board) and a button inside a button is not
        valid, so this covers it for as long as the question is open.

        Opaque, and that is a correction. At 14% it was translucent and the name
        and life total underneath printed straight through the ones on top: a
        1920 screenshot read "40Yeva" over "40 Yeva BOT" on both seats. The same
        two facts twice, half a pixel apart, is worse than either alone.
      */}
      {aim?.seatIsTarget && (
        <button
          type="button"
          onClick={aim.onPickSeat}
          title={`Aim ${aim.sourceName} at ${player.name}`}
          aria-label={`Aim ${aim.sourceName} at ${player.name}`}
          className={cn(
            'absolute inset-0 z-20 flex items-center gap-2 rounded-lg bg-background/95 px-3 backdrop-blur-md',
            'text-[11px] font-semibold text-foreground transition-colors hover:bg-background/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <Crosshair aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{player.name}</span>
          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{player.life}</span>
        </button>
      )}

      <LifeBadge
        life={player.life}
        size={lifeSize}
        startingLife={state.rules.startingLife}
        poison={player.poison}
        poisonLethal={state.rules.poisonLethal}
        commanderDamage={commanderDamage}
        deltas={lifeDeltas}
        active={active}
        dead={dead}
        onOpenControls={onOpenSeatControls ? () => onOpenSeatControls(player.id) : undefined}
        className="shrink-0"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {/* Never wraps. A narrow quadrant that let this run onto a second line
            pushed the name and the commander out of a box with a fixed height,
            and the seat looked broken. */}
        <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
          {onFocusSeat ? (
            <button
              type="button"
              onClick={() => onFocusSeat(player.id)}
              title={`Look at ${player.name} board`}
              className="truncate rounded text-sm font-semibold text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {player.name}
            </button>
          ) : (
            <h3 className="truncate text-sm font-semibold text-foreground">{player.name}</h3>
          )}
          {isViewer && (
            <span className="shrink-0 rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
              {viewerLabel}
            </span>
          )}
          {isBot && roomy && (
            <span className="shrink-0 rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground">
              Bot
            </span>
          )}
          {active && !dead && (
            <span className="shrink-0 rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
              Turn
            </span>
          )}
          {/*
            THE MONARCH AND THE INITIATIVE, DRAWN AT LAST.

            `state.monarchId` and `state.initiativeId` have both been in the
            engine with a reducer case each. Grepped on 29 Aug 2026: `monarchId`
            was read in exactly one place, a target selector in
            `abilities/context.ts`, and `initiativeId` WAS READ BY NOTHING AT
            ALL. So a card could make you the monarch and no seat at the table
            would ever show it.

            They belong on the seat rather than in the HUD because the question
            is always *who has it*, and this row is where a seat's chip-sized
            facts already live. Each is one word, which is what the row's own
            note says a chip has to be.
          */}
          {state.monarchId === player.id && (
            <span
              title="The monarch. Draws an extra card each end step, and passes to whoever deals them combat damage."
              className="shrink-0 rounded-full bg-foreground/[0.14] px-1.5 text-[9px] font-semibold uppercase leading-4 text-foreground"
            >
              Monarch
            </span>
          )}
          {state.initiativeId === player.id && (
            <span
              title="Has the initiative. Ventures into Undercity at each upkeep, and passes to whoever deals them combat damage."
              className="shrink-0 rounded-full bg-foreground/[0.14] px-1.5 text-[9px] font-semibold uppercase leading-4 text-foreground"
            >
              Initiative
            </span>
          )}
          {/*
            "Out", not the whole reason.

            This row is `flex-nowrap` inside a bounded, `overflow-hidden` box:
            the name TRUNCATES and every chip is `shrink-0`. So a chip holding a
            sentence took the whole strip, squeezed the name to nothing, and
            then clipped itself mid-word anyway. Measured on a knocked-out seat,
            the header read

              [WATCHING] [BOT] LIFE TOTAL REACHED ZE

            with no player name on it at all. A chip is a chip-sized fact; the
            reason is a sentence, so it goes where sentences go. The log already
            records it in full.
          */}
          {dead && (
            <span
              title={
                player.lossReasons[0]
                  ? `Out of the game: ${lossReasonLabel(player.lossReasons[0])}.`
                  : 'Out of the game.'
              }
              className="shrink-0 rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground"
            >
              Out
            </span>
          )}
        </div>

        {/*
          The second line of the band, and it is the one that changes.

          Combat wins it whenever there is combat, because "attacking and
          blocking doesn't seem very clear at all" and a commander name is not
          news. Otherwise it is the commander, which is what a player wants to
          know about a seat they are reading for the first time.
        */}
        {bandHeight >= 34 && (
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
            {incoming.under ? (
              <span
                className={cn(
                  'truncate text-[10px] font-semibold',
                  incoming.lethal ? 'text-destructive-foreground' : 'text-foreground/90'
                )}
                title={incoming.lanes
                  .map(lane =>
                    lane.blockedBy.length
                      ? `${lane.name} ${lane.power}, blocked by ${lane.blockedBy.length}`
                      : `${lane.name} ${lane.power}, unblocked`
                  )
                  .join(' / ')}
              >
                {incoming.lethal ? 'LETHAL. ' : ''}
                {incomingSentence(incoming)}
              </span>
            ) : swing.attacking ? (
              <span className="truncate text-[10px] font-semibold text-foreground/90">
                {outgoingSentence(swing)}
              </span>
            ) : worstCommanderDamage ? (
              /*
                THE NUMBER THAT ENDS THE GAME, IN WORDS.

                Twenty-one from one commander is a loss condition players build
                whole decks around, and until this line existed the only place
                it appeared was a 14px pip on the rim of the life badge carrying
                a bare number and a hover title. Measured in a browser: a seat on
                4 commander damage drew a grey "4" indistinguishable from the
                poison pip beside it, and on a touch screen the title that
                explained it could not be reached at all.

                It takes the same line the commander name uses rather than a new
                one, so the band's height is untouched and nothing on the mat
                moves. The name is the less urgent fact and gives way; it is
                still on the card in the command zone, and in the hover title
                here.
              */
              <span
                className={cn(
                  'truncate text-[10px] font-semibold',
                  worstCommanderDamage.fatal ? 'text-destructive' : 'text-foreground/90'
                )}
                title={
                  `${worstCommanderDamage.amount} commander damage from ` +
                  `${worstCommanderDamage.name}. ${worstCommanderDamage.lethal} from a single ` +
                  `commander is lethal, and tallies are never added together.` +
                  (commander ? ` This seat plays ${commander.name}.` : '')
                }
              >
                {worstCommanderDamage.amount} of {worstCommanderDamage.lethal} from{' '}
                {worstCommanderDamage.name}
              </span>
            ) : commander ? (
              <>
                <ColorIdentity colors={commander.colorIdentity} size="xs" />
                <span className="truncate text-[10px] text-muted-foreground">{commander.name}</span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Untapped mana, and the hand as cards rather than as a number. Both are
          fixed-width by construction (see `shownBacks`), so drawing a card
          cannot move anything on the band. */}
      <span
        className="shrink-0 rounded-full bg-background/65 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground"
        title={`${untapped} untapped mana source${untapped === 1 ? '' : 's'}`}
      >
        {untapped}
        {/* "0 mana" reads as "you cannot cast anything". The number is a count
            of untapped mana SOURCES, so the chip says so. */}
        {roomy ? ' untapped' : ''}
      </span>

      {showHandBacks && roomy && handCount > 0 && (
        <div
          className="flex shrink-0 items-center"
          title={`${handCount} card${handCount === 1 ? '' : 's'} in hand`}
          aria-label={`${player.name} holds ${handCount} cards`}
        >
          {Array.from({ length: shownBacks }).map((_, index) => (
            <CardBack
              key={index}
              width={backWidth}
              style={{
                marginLeft: index === 0 ? 0 : -backWidth * 0.58,
                transform: `rotate(${(index - shownBacks / 2) * 4}deg)`,
                zIndex: index,
              }}
            />
          ))}
          <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground">
            {handCount}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <section
      ref={matRef}
      /* `${player.name}'s seat` read "You's seat" on the viewer's own mat,
         because the viewer's name IS "You". */
      aria-label={player.name === 'You' ? 'Your seat' : `${player.name}'s seat`}
      className={cn('relative h-full w-full', className)}
    >
      <Playmat
        colors={commander?.colorIdentity}
        /* Your chosen colour paints your mat. Everyone else keeps their own
           commander's, so four seats never read as one. */
        ownSeat={isViewer}
        tone={active ? 'active' : isViewer ? 'viewer' : 'seat'}
        className={cn(
          'h-full w-full transition-shadow duration-300 motion-reduce:transition-none',
          active ? 'shadow-[0_0_40px_rgba(0,0,0,0.55)]' : 'shadow-[0_0_24px_rgba(0,0,0,0.45)]',
          /* A dead seat is unlit, not drained. `saturate-0` here desaturated
             every card image on that seat's mat along with the mat itself. */
          dead && 'opacity-60'
        )}
      >
        {/* Under attack the mat itself goes red, rather than a ring appearing. */}
        {attacked && !dead && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-destructive/20"
          />
        )}

        <div
          className={cn(
            'relative flex h-full w-full gap-1 px-1',
            // The rail belongs on the OUTER edge of the seat, which is whichever
            // side of the board this quadrant sits against. The board inside it
            // never mirrors: creatures top, lands bottom, block right, on every
            // mat at the table.
            side === 'left' ? 'flex-row' : 'flex-row-reverse'
          )}
        >
          {pileColumn}

          <div className="relative flex min-w-0 flex-1 flex-col gap-1 py-1">
            {identityBand}
            {board}
          </div>
        </div>
      </Playmat>
    </section>
  );
}

export default SeatMat;
