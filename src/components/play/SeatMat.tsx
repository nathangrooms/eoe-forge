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
  identityBandHeight,
  railWidth,
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
import { GameCardView, type CombatChipProps, type Lunge } from './GameCardView';
import { useMeasuredSize } from './useMeasure';
import type { LifeDelta } from './useTableMotion';
import {
  availableMana,
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
  /** Drawn on the tile. Short, because the column is one card wide. */
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
  const body = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 top-0.5 max-w-[calc(100%-0.5rem)] select-none truncate text-[7px] font-medium uppercase tracking-[0.14em] text-foreground/30 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
      >
        {label}
      </span>
      <span className="flex h-full w-full items-center justify-center pt-2">{children}</span>
      {showCount && (
        <span className="pointer-events-none absolute bottom-0.5 right-1 rounded-full bg-background/75 px-1 text-[9px] font-semibold leading-4 tabular-nums text-foreground shadow-sm shadow-black/50 backdrop-blur-sm">
          {count}
        </span>
      )}
    </>
  );

  const shell = cn(
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.045]'
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

/** An empty pile still reads as a place a pile goes. */
function EmptyWell({ width }: { width: number }) {
  return (
    <span
      aria-hidden="true"
      className="block rounded-[6%/4%] bg-black/25 shadow-inner"
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
  attackerIds = [],
  blockerIds = [],
  inspectedId,
  lunges,
  lifeDeltas,
  side = 'left',
  showHandBacks = true,
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
  const tax = commander ? commanderTax(state, commander.id) : 0;

  const allCommanders = state.players.flatMap(p => p.commanders);
  const commanderDamage: CommanderDamagePip[] = Object.keys(player.commanderDamage)
    .map(id => ({
      id,
      name: allCommanders.find(c => c.id === id)?.name ?? 'Commander',
      amount: player.commanderDamage[id],
      lethal: state.rules.commanderDamageLethal,
    }))
    .filter(entry => entry.amount > 0);

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

  /* The rail down the seat's outer edge: identity at the top, then the four
     piles. Constant for a given mat. */
  const sideWidth = railWidth(width, height);
  const bandHeight = identityBandHeight(height);
  const tileHeight = Math.max(30, Math.floor((height - bandHeight - 16) / 4) - 3);
  const tileCardWidth = Math.max(18, Math.round((tileHeight - 10) * CARD_RATIO));

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

  /* One card size for the whole seat, from the row height and the player's
     ceiling. Both rows are the same height, so both draw the same card — and
     neither of them can change size when a permanent arrives. */
  const boardCardWidth = seatCardWidth(creatureHeight, cardWidth);
  const creatureCardWidth = boardCardWidth;
  const landCardWidth = boardCardWidth;

  /* The support block is a constant fifth of the mat. See `supportBlockWidth`
     for the measurement that says why it is not a growing third of it. */
  const supportWidth = Math.min(
    supportBlockWidth(width),
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
   * `blockCardWidth` takes the box and this ceiling and no count. It reaches
   * the same 64px the old search reached once four cards were down, so a full
   * block looks the same and a filling one no longer moves.
   */
  const supportCardWidth = Math.max(26, blockCardWidth(supportWidth, supportHeight, boardCardWidth));

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

    return (
      <GameCardView
        card={card}
        width={renderWidth}
        entering
        role={roleOf(card)}
        lunge={lunges?.[card.instanceId] ?? null}
        selected={inspectedId === card.instanceId}
        /* A creature that cannot swing or cannot block is greyed out in exactly
           the language the hand uses for a card you cannot cast. The hourglass
           `GameCardView` already draws says WHY; this says "not this one". */
        dimmed={combat?.dimmed ?? false}
        onClick={onInspect ? () => onInspect(card) : undefined}
        onTap={onTapCard && tapChipFits(renderWidth) ? () => onTapCard(card) : undefined}
        combat={renderWidth >= 44 ? combat?.chip ?? null : null}
        /* Who it is hitting, or what it is holding. Drawn on EVERY seat, not
           just the viewer's: an attacker swinging at you is on somebody else's
           mat, and "who is attacking whom" is unanswerable if only your own
           creatures say anything. */
        combatNote={combatMarkFor(state, card.instanceId, viewerId)}
        title={card.name}
      />
    );
  };

  const pileColumn = (
    <aside
      className="flex h-full shrink-0 flex-col items-center justify-start gap-1 py-1"
      style={{ width: sideWidth }}
      aria-label={`${player.name}'s zones`}
    >
      <ZoneTile
        label="Lib"
        title="Library"
        count={player.zones.library.length}
        height={tileHeight}
        width={sideWidth - 4}
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
        label="Yard"
        title="Graveyard"
        count={player.zones.graveyard.length}
        height={tileHeight}
        width={sideWidth - 4}
        onClick={onOpenZone ? () => onOpenZone(player.id, 'graveyard') : undefined}
      >
        {graveyardTop ? (
          <GameCardView card={graveyardTop} width={tileCardWidth} ignoreTapped />
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
      </ZoneTile>

      <ZoneTile
        label="Exile"
        title="Exile"
        count={player.zones.exile.length}
        height={tileHeight}
        width={sideWidth - 4}
        onClick={onOpenZone ? () => onOpenZone(player.id, 'exile') : undefined}
      >
        {exileTop ? (
          // Exiled cards read as removed from the game: same pile, drained.
          <span className="block opacity-70 saturate-0">
            <GameCardView card={exileTop} width={tileCardWidth} ignoreTapped />
          </span>
        ) : (
          <EmptyWell width={tileCardWidth} />
        )}
      </ZoneTile>

      <ZoneTile
        label={tax > 0 ? `Cmd +${tax}` : 'Cmd'}
        title={tax > 0 ? `Command zone, ${tax} commander tax` : 'Command zone'}
        count={player.zones.command.length}
        height={tileHeight}
        width={sideWidth - 4}
        onClick={
          commandTop && onInspect
            ? () => onInspect(commandTop)
            : onOpenZone
              ? () => onOpenZone(player.id, 'command')
              : undefined
        }
      >
        {commandTop ? (
          <GameCardView card={commandTop} width={tileCardWidth} ignoreTapped />
        ) : (
          <EmptyWell width={tileCardWidth} />
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
              tinted={row.id === 'lands'}
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
        'flex shrink-0 items-center gap-2 rounded-lg px-2',
        attacked && !dead ? 'bg-destructive/25' : 'bg-foreground/[0.045]'
      )}
      style={{ height: bandHeight }}
    >
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
        {roomy ? ' mana' : ''}
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
      aria-label={`${player.name}'s seat`}
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
          dead && 'opacity-60 saturate-0'
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
