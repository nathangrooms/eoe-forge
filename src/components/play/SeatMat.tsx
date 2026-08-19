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
  MIN_BOARD_CARD,
  ZoneBlock,
  ZoneRow,
  fitBlockCardWidth,
} from './Battlefield';
import {
  EMPTY_ROW_HEIGHT,
  ROW_PADDING,
  fitRowCard,
  planIdentityInset,
  rowAsk,
  shareBandHeight,
} from './seatLayout';
import { BOARD_ROWS, SUPPORT_BLOCK, splitIntoRows } from './boardRows';
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

/**
 * Vertical room the identity strip needs, per life-badge size.
 *
 * Every pixel here is a pixel the two rows do not get, and on a four-quadrant
 * board those rows are already sharing about a third of the screen height. So
 * these are exactly `LifeBadge`'s own ring diameters and not one pixel more —
 * anything larger is padding paid for out of card size, anything smaller and
 * the badge overflows onto the creature row behind it. An opponent's hand is
 * drawn into the same strip rather than being given a row of its own: the
 * spec's hand row is the viewer's, and the viewer's hand is the fan along the
 * bottom of the whole board.
 */
const HEADER_HEIGHT: Record<LifeBadgeSize, number> = { sm: 52, md: 70, lg: 92 };

/** Gap between the two rows, and between the rows and the support block. */
const BAND_GAP = 4;

/** Width an empty support block keeps, to run its name up as a spine. */
const SUPPORT_SPINE = 22;

/** `ZoneBlock`'s own horizontal padding, which its width has to cover. */
const BLOCK_INNER_PADDING = 10;

/**
 * The narrowest the two rows may be squeezed to before the support block stops
 * growing. Two cards and the gap between them: past that the block is winning
 * an argument it should not be in.
 */
const MIN_ROW_WIDTH = 200;

export interface SeatMatProps {
  state: GameState;
  player: Player;
  /** The seat this device controls. */
  isViewer?: boolean;
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
  /* Measurement — the chosen size is a ceiling, never a fixed width         */
  /* ---------------------------------------------------------------------- */

  const width = mat.width || 480;
  const height = mat.height || 300;

  const lifeSize: LifeBadgeSize = height >= 470 ? 'lg' : height >= 350 ? 'md' : 'sm';
  const headerHeight = HEADER_HEIGHT[lifeSize];

  /* The pile column is exactly as wide as the card it has to hold, and the card
     it has to hold is limited by a quarter of the mat's height. Sizing it from
     the height rather than the width is what stops it being a wide empty strip
     stealing room from the board on a short quadrant. */
  const tileHeight = Math.max(42, Math.floor((height - 14) / 4) - 3);
  const tileCardWidth = Math.max(20, Math.round((tileHeight - 12) * CARD_RATIO));
  const sideWidth = Math.round(
    Math.min(Math.max(52, width * 0.24), Math.max(52, tileCardWidth + 12))
  );

  /* The identity strip floats over the mat instead of sitting in a band above
     it. Those 70px of height were being paid for by every card on the seat —
     they are half the height of a card — while the row underneath had 900px of
     width going spare on a 1680px screen. So the strip is paid for sideways
     instead: the top row keeps its ends clear, and the whole mat height goes to
     the two rows. Owner: *"no weird small windows or unutilised space"*. */
  const bandsHeight = Math.max(72, height - 6);

  /*
   * Room the floating strip needs at each end of the top row — MEASURED.
   *
   * It used to be a flat 30% of the mat at the start and 16% at the end, which
   * on a 1024px window reserved 446px of an 872px row for a strip that painted
   * 291px of content. The cards paid for the difference by overlapping each
   * other inside what was left while 220px of the same row stayed blank —
   * owner: *"no weird small windows or unutilised space"*, *"cards are tiny on
   * screen"*. So each end is now measured and the fraction is only the ceiling.
   *
   * There is no feedback loop here: the strip's own width is decided by
   * `nameMaxWidth` below, which is derived from the mat width and never from
   * these numbers. The insets follow the strip; the strip never follows them.
   */
  const [identityStartRef, identityStartBox] = useMeasuredSize<HTMLDivElement>();
  const [identityEndRef, identityEndBox] = useMeasuredSize<HTMLDivElement>();

  /* The ceiling, and the value used on the very first paint before the observer
     has read anything — the old behaviour, so a first frame is never broken. */
  const identityInsetCap = Math.round(Math.min(width * 0.3, 300));
  const identityInsetEndCap = Math.round(Math.min(width * 0.16, 160));
  const nameMaxWidth = Math.max(80, identityInsetCap - HEADER_HEIGHT[lifeSize] - 12);

  const identityInset = identityStartBox.width
    ? Math.min(identityInsetCap, Math.round(identityStartBox.width) + 10)
    : identityInsetCap;
  const identityInsetEnd = identityEndBox.width
    ? Math.min(identityInsetEndCap, Math.round(identityEndBox.width) + 10)
    : identityInsetEndCap;

  /* ---------------------------------------------------------------------- */
  /* How the two rows share the height                                      */
  /* ---------------------------------------------------------------------- */
  /*
   * Not 50/50. An even split means an empty creatures row holds half the mat
   * open while the mana row underneath it squeezes eight lands into 139px, and
   * it means the card size is decided by whichever row is worse off.
   *
   * Each row instead asks for the height it can actually USE — the height at
   * which its cards reach the size the width already allows, or the ceiling the
   * player chose, whichever comes first. An empty row asks for a labelled strip
   * and nothing more. Then the band is shared out in proportion to those asks,
   * scaled down together if they do not fit and handed the surplus if they do.
   *
   * That is what makes one creature on an otherwise empty board large: the row
   * below it is asking for 24px, so everything else is his.
   */
  /* The block's width depends on the card size and the card size depends on the
     width left over, so the knot is cut with a provisional card size taken from
     height alone — which is the constraint that actually binds on this board —
     and the rows are then fitted against the answer. */
  const provisionalCard = Math.min(
    cardWidth,
    Math.max(MIN_BOARD_CARD, ((bandsHeight - BAND_GAP) / 2 - ROW_PADDING) * CARD_RATIO)
  );

  /*
   * The support block is sized to what it HOLDS, not to a fixed share of the
   * mat. Empty, it collapses to a spine and gives the width to the rows; as
   * permanents land there it grows a column at a time and takes it back.
   *
   * It is never allowed to starve the rows: whatever it asks for, it stops at
   * the point where the two rows still have room for a readable card.
   */
  const supportCap = Math.max(0, width - sideWidth - MIN_ROW_WIDTH - BAND_GAP - 14);
  const supportPerColumn = Math.max(
    1,
    Math.floor(bandsHeight / (provisionalCard / CARD_RATIO + BAND_GAP))
  );
  const supportColumns = Math.max(1, Math.ceil(rows.support.length / supportPerColumn));
  const supportWidth =
    rows.support.length === 0
      ? Math.min(SUPPORT_SPINE, supportCap)
      : Math.round(
          Math.min(supportCap, supportColumns * (provisionalCard + BAND_GAP) + BLOCK_INNER_PADDING)
        );
  const supportHeight = bandsHeight;

  const rowWidth = Math.max(80, width - sideWidth - supportWidth - BAND_GAP - 14);
  /* The top row pays for the identity strip out of its ends; the mana row has
     the whole width, which is why a big mana base still reads. */
  const creatureRowWidth = Math.max(80, rowWidth - identityInset - identityInsetEnd);

  const askCreatures = rowAsk(rows.creatures.length, creatureRowWidth, cardWidth);
  const askLands = rowAsk(rows.lands.length, rowWidth, cardWidth);
  const bandsUsable = Math.max(2 * EMPTY_ROW_HEIGHT, bandsHeight - BAND_GAP);

  const { creatureHeight, landHeight } = shareBandHeight(
    bandsUsable,
    rows.creatures.length,
    rows.lands.length,
    askCreatures,
    askLands
  );

  /*
   * Each row sizes its own card, because the two rows no longer have the same
   * height. A row is never given a card taller than the row itself — that is
   * what stops a permanent spilling into the seat below — and never one below
   * `MIN_BOARD_CARD` unless the row is genuinely too short to hold one.
   */
  const creatureCardWidth = fitRowCard(
    rows.creatures.length,
    creatureHeight,
    creatureRowWidth,
    cardWidth
  );
  const landCardWidth = fitRowCard(rows.lands.length, landHeight, rowWidth, cardWidth);

  /*
   * Where the top row sits relative to the floating identity strip.
   *
   * It steps aside only when its cards would actually reach the strip. It used
   * to be handed the row's TAPPED count as well, and that was half of the
   * owner's *"tapped/untapped on opponents side ... causes layout shifting"*:
   * tapping one more creature could flip this decision, and the whole row
   * jumped sideways by the width of the strip. `layoutRow` now holds turning
   * room at the ends of the run regardless of what is tapped, so this answer
   * depends on the board's SHAPE and never on its state.
   */
  const creatureInset = planIdentityInset(rowWidth, rows.creatures.length, creatureCardWidth, {
    start: identityInset,
    end: identityInsetEnd,
  });

  /* The label prints in the gutter between the strip and the first card, and is
     told how wide that gutter is so it can never be drawn across card art. */
  const creatureLabelInset = creatureInset.start || identityInset;
  const creatureLabelWidth = Math.max(
    0,
    Math.round(creatureInset.cardsStart - creatureLabelInset - 6)
  );

  /* One number for the things that are about the mat rather than about a row —
     the tap chip's cutoff, and the block's ceiling. */
  const boardCardWidth = Math.max(creatureCardWidth, landCardWidth, provisionalCard);

  /* The block tiles in two directions, so it gets its own fit rather than the
     row's — a wide short block and a narrow tall one want different cards. */
  const supportCardWidth = Math.max(
    26,
    Math.min(
      boardCardWidth,
      fitBlockCardWidth(
        supportWidth,
        supportHeight,
        rows.support.length,
        boardCardWidth,
        Math.min(boardCardWidth, 48)
      )
    )
  );

  /* Below this the identity strip cannot hold everything, so the optional parts
     — the "Bot" chip, the word "mana", the spread of face-down cards — drop out
     rather than squeezing the player's name into an ellipsis. */
  const roomy = width >= 340;

  const handCount = player.zones.hand.length;
  const backWidth = Math.max(16, Math.round((headerHeight - 18) * CARD_RATIO));
  const shownBacks = Math.min(7, handCount);

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
              /* Per row, not per mat: the two rows no longer have the same
                 height, so they no longer want the same card. */
              cardWidth={creatures ? creatureCardWidth : landCardWidth}
              height={creatures ? creatureHeight : landHeight}
              /* The width the row will REALLY be laid out in. It used to be
                 handed the inset width whether or not the inset was applied, so
                 an un-inset row overlapped its cards against a boundary 460px
                 short of the one it actually had. */
              available={creatures ? creatureInset.available : rowWidth}
              /* Only the top row is under the floating identity strip, and only
                 while its cards would otherwise reach into it. */
              insetStart={creatures ? creatureInset.start : 0}
              insetEnd={creatures ? creatureInset.end : 0}
              labelInset={creatures ? creatureLabelInset : 0}
              labelMaxWidth={creatures ? creatureLabelWidth : undefined}
              tinted={row.id === 'lands'}
              renderCard={renderCard}
            />
          );
        })}
      </div>

      {/* The block grows and shrinks with what it holds, so the width eases
          rather than snapping: a rectangle that jumps open the instant an
          artifact resolves moves every card on the mat and reads as a glitch. */}
      <ZoneBlock
        /* The full label is two words too long for a quadrant on a laptop, and
           an ellipsis on a zone name reads as a bug rather than as a label. */
        label={supportWidth >= 190 ? SUPPORT_BLOCK.label : SUPPORT_BLOCK.shortLabel}
        cards={rows.support}
        cardWidth={supportCardWidth}
        width={supportWidth}
        height={supportHeight}
        renderCard={renderCard}
        className="transition-[width] duration-300 ease-out motion-reduce:transition-none"
      />
    </div>
  );

  return (
    <section
      ref={matRef}
      aria-label={`${player.name}'s seat`}
      className={cn('relative h-full w-full', className)}
    >
      <Playmat
        art={commander?.imageUrl}
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
            // The pile column belongs on the OUTER edge of the seat, which is
            // whichever side of the board this quadrant sits against. The board
            // inside it never mirrors: creatures top, lands bottom, block right,
            // on every mat at the table.
            side === 'left' ? 'flex-row' : 'flex-row-reverse'
          )}
        >
          {pileColumn}

          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Who this is, and what they are on. Upright, on every seat.

                It FLOATS over the top of the mat rather than sitting in a band
                above it. As a band it cost 70px of height on every seat — half
                a card — and the row beneath it had 900px of width spare on a
                1680px screen, so the trade was strictly bad. The top row keeps
                its ends clear for it instead (`identityInset`), which costs
                width the mat has and buys height it does not.

                `pointer-events-none` on the strip and `auto` on its parts, so
                the empty middle of it never swallows a click meant for a
                creature underneath. */}
            <div
              className="pointer-events-none absolute left-0 top-0 z-20 flex items-center gap-2 px-1"
              /* Stops at the support block rather than crossing it: the mana
                 chip at its right end was landing on the block's spine and
                 covering the zone's name. */
              style={{ height: headerHeight, right: supportWidth + BAND_GAP }}
            >
              {/* The measured cluster. The creatures row keeps clear of exactly
                  this box and not of a guessed fraction of the mat — see
                  `identityInset`. It is `w-fit`, so it reports the width its
                  contents actually take rather than the width it was offered. */}
              <div
                ref={identityStartRef}
                className="pointer-events-none flex w-fit shrink-0 items-center gap-2"
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
                  className="pointer-events-auto shrink-0"
                />

                {/* Bounded, not `flex-1`: a strip that stretched across the mat
                    would put an invisible box over the middle of the creatures
                    row, and the row is what the player is trying to click. The
                    bound comes from the mat's width alone — never from
                    `identityInset`, which is measured FROM this box and would
                    otherwise chase its own tail. */}
                <div className="pointer-events-auto min-w-0" style={{ maxWidth: nameMaxWidth }}>
                {/* Never wraps. A narrow quadrant that let this strip run onto a
                    second line pushed the name and the commander out of a box
                    with a fixed height, and the seat looked broken. */}
                <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                  {onFocusSeat ? (
                    <button
                      type="button"
                      onClick={() => onFocusSeat(player.id)}
                      title={`Look at ${player.name}'s board`}
                      className="truncate rounded text-sm font-semibold text-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {player.name}
                    </button>
                  ) : (
                    <h3 className="truncate text-sm font-semibold text-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {player.name}
                    </h3>
                  )}
                  {isViewer && (
                    <span className="shrink-0 rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
                      {viewerLabel}
                    </span>
                  )}
                  {isBot && roomy && (
                    <span className="shrink-0 rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground backdrop-blur-sm">
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

                    This row is `flex-nowrap` inside a bounded, `overflow-hidden`
                    box: the name TRUNCATES and every chip is `shrink-0`. So a
                    chip holding a sentence took the whole strip, squeezed the
                    name to nothing, and then clipped itself mid-word anyway.
                    Measured on a knocked-out seat, the header read

                      [WATCHING] [BOT] LIFE TOTAL REACHED ZE

                    with no player name on it at all. That is unreadable twice
                    over: a seat you cannot identify, labelled with half a word.
                    A chip is a chip-sized fact; the reason is a sentence, so it
                    goes where sentences go. The log already records it in full.
                  */}
                  {dead && (
                    <span
                      title={
                        player.lossReasons[0]
                          ? `Out of the game: ${lossReasonLabel(player.lossReasons[0])}.`
                          : 'Out of the game.'
                      }
                      className="shrink-0 rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground backdrop-blur-sm"
                    >
                      Out
                    </span>
                  )}
                </div>

                {commander && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <ColorIdentity colors={commander.colorIdentity} size="xs" />
                    <span className="truncate text-[10px] text-muted-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {commander.name}
                    </span>
                  </div>
                  )}
                </div>
              </div>

              {/* Nothing between the two clusters but air the cards can be
                  clicked through — this is the middle of the creatures row. */}
              <span aria-hidden="true" className="pointer-events-none flex-1" />

              {/* The other measured cluster. The mana count and the opponent's
                  hand are the only things at this end, and they are far
                  narrower than the 16% of the mat that used to be reserved for
                  them. */}
              <div
                ref={identityEndRef}
                className="pointer-events-none flex w-fit shrink-0 items-center gap-2"
              >
                <span
                  className="pointer-events-auto shrink-0 rounded-full bg-background/65 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground shadow-sm shadow-black/40 backdrop-blur-sm"
                  title={`${untapped} untapped mana source${untapped === 1 ? '' : 's'}`}
                >
                  {untapped}
                  {roomy ? ' mana' : ''}
                </span>

                {/* Somebody else's hand: cards, face down. Never a count alone. */}
                {showHandBacks && roomy && handCount > 0 && (
                  <div
                    className="pointer-events-auto flex shrink-0 items-center"
                    title={`${handCount} card${handCount === 1 ? '' : 's'} in hand`}
                    aria-label={`${player.name} holds ${handCount} cards`}
                  >
                    {Array.from({ length: shownBacks }).map((_, index) => (
                      <CardBack
                        key={index}
                        width={backWidth}
                        style={{
                          marginLeft: index === 0 ? 0 : -backWidth * 0.58,
                          transform: `rotate(${(index - shownBacks / 2) * 3}deg)`,
                          zIndex: index,
                        }}
                      />
                    ))}
                    <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground backdrop-blur-sm">
                      {handCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {board}
          </div>
        </div>
      </Playmat>
    </section>
  );
}

export default SeatMat;
