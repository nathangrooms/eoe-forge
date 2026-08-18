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
import { CARD_RATIO, ZoneBlock, ZoneRow, fitBlockCardWidth, fitRowCardWidth } from './Battlefield';
import { BOARD_ROWS, SUPPORT_BLOCK, splitIntoRows } from './boardRows';
import { GameCardView, type Lunge } from './GameCardView';
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
 * the strip is exactly as tall as the life badge it holds and no taller, and an
 * opponent's hand is drawn into the same strip rather than being given a row of
 * its own — the spec's hand row is the viewer's, and the viewer's hand is the
 * fan along the bottom of the whole board.
 */
const HEADER_HEIGHT: Record<LifeBadgeSize, number> = { sm: 50, md: 66, lg: 84 };

/** Gap between the two rows, and between the rows and the support block. */
const BAND_GAP = 4;

export interface SeatMatProps {
  state: GameState;
  player: Player;
  /** The seat this device controls. */
  isViewer?: boolean;
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
      <span className={shell} style={{ height, width }} title={`${title} — ${count}`}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title} — ${count}`}
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
  isBot,
  /* A ceiling, and a deliberately generous one. The owner has now said twice
     that the board reads as icons rather than cards; the mat comes down from
     this on a small viewport, so starting low only ever makes it worse. */
  cardWidth = 200,
  onInspect,
  onTapCard,
  onOpenZone,
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

  const bandsHeight = Math.max(72, height - headerHeight - 6);
  /* Two rows now, not three. Creatures get the slightly taller of the two —
     they carry the counters, the damage and the power/toughness badge, and
     they are the row every other seat has to read across the table. */
  const creatureHeight = Math.floor((bandsHeight - BAND_GAP) * 0.53);
  const landHeight = bandsHeight - BAND_GAP - creatureHeight;

  /* The support block holds its place whether or not it holds anything, so the
     two rows never change width as an enchantment resolves. Roughly a fifth of
     the mat, and never wider than two cards at the current ceiling. */
  const supportWidth = Math.round(
    Math.max(56, Math.min(width * 0.21, cardWidth * 2 + 12, Math.max(56, width - sideWidth - 200)))
  );
  const supportHeight = bandsHeight;

  const rowWidth = Math.max(80, width - sideWidth - supportWidth - BAND_GAP - 14);

  const busiest = Math.max(rows.lands.length, rows.creatures.length);
  const boardCardWidth = Math.max(
    30,
    Math.round(
      Math.min(
        cardWidth,
        (Math.min(creatureHeight, landHeight) - 8) * CARD_RATIO,
        fitRowCardWidth(rowWidth, busiest, cardWidth)
      )
    )
  );

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
     inspector's Tap button is the way — it is still there. */
  const tapChipFits = boardCardWidth >= 54;

  const renderCard = (card: CardInstance, _index: number, renderWidth: number) => (
    <GameCardView
      card={card}
      width={renderWidth}
      entering
      role={roleOf(card)}
      lunge={lunges?.[card.instanceId] ?? null}
      selected={inspectedId === card.instanceId}
      onClick={onInspect ? () => onInspect(card) : undefined}
      onTap={onTapCard && tapChipFits ? () => onTapCard(card) : undefined}
      title={card.name}
    />
  );

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
        title={tax > 0 ? `Command zone — ${tax} commander tax` : 'Command zone'}
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
        {BOARD_ROWS.map(row => (
          <ZoneRow
            key={row.id}
            label={row.label}
            cards={rows[row.id]}
            cardWidth={boardCardWidth}
            height={row.id === 'creatures' ? creatureHeight : landHeight}
            available={rowWidth}
            tinted={row.id === 'lands'}
            renderCard={renderCard}
          />
        ))}
      </div>

      <ZoneBlock
        label={SUPPORT_BLOCK.label}
        cards={rows.support}
        cardWidth={supportCardWidth}
        width={supportWidth}
        height={supportHeight}
        renderCard={renderCard}
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

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Who this is, and what they are on. Upright, on every seat. */}
            <div
              className="flex shrink-0 items-center gap-2 px-1"
              style={{ height: headerHeight }}
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

              <div className="min-w-0 flex-1">
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
                      You
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
                  {dead && (
                    <span className="shrink-0 rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground backdrop-blur-sm">
                      {player.lossReasons[0] ? lossReasonLabel(player.lossReasons[0]) : 'Out'}
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

              <span
                className="shrink-0 rounded-full bg-background/65 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground shadow-sm shadow-black/40 backdrop-blur-sm"
                title={`${untapped} untapped mana source${untapped === 1 ? '' : 's'}`}
              >
                {untapped}
                {roomy ? ' mana' : ''}
              </span>

              {/* Somebody else's hand: cards, face down. Never a count alone. */}
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

            {board}
          </div>
        </div>
      </Playmat>
    </section>
  );
}

export default SeatMat;
