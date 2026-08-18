/**
 * One player's seat — a playmat with their board on it.
 *
 * This is the component that decides whether the screen reads as a game or as a
 * dashboard, so the rules it follows are physical ones:
 *
 *   - The seat is a **mat**, not a panel. Its background is that player's
 *     commander art, darkened until cards read cleanly on top of it. Cards sit
 *     *on* the mat; nothing is in a box.
 *   - Every seat's content is already rotated to face its player by
 *     `seatContentStyle`, so within this component "up" is always toward the
 *     middle of the table and "down" is always toward the person sitting there.
 *     That is why the board grows upward and the player's own things — life,
 *     library, hand — sit along the bottom edge.
 *   - The library is a stack of card backs, and an opponent's hand is a row of
 *     card backs. A number where a pile of cards should be is the single
 *     biggest reason a play screen feels like a spreadsheet.
 *
 * Sizing is passed in rather than guessed: the table measures itself and tells
 * each seat how wide a card may be, because a four-player pinwheel gives the
 * top and bottom seats a wide thin strip and the side seats a tall narrow one,
 * and one hard-coded card size cannot serve both.
 */

import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Playmat } from './Playmat';
import { LifeBadge, type CommanderDamagePip, type LifeBadgeSize } from './LifeBadge';
import { CardBack, LibraryStack } from './CardBack';
import { Battlefield } from './Battlefield';
import { GameCardView, type Lunge } from './GameCardView';
import type { LifeDelta } from './useTableMotion';
import {
  availableMana,
  isUnderAttack,
  lossReasonLabel,
  type CardInstance,
  type GameState,
  type Player,
  type PlayerId,
  type Zone,
} from '@/lib/game';

export type SeatDensity = 'compact' | 'comfortable';

export interface SeatPanelProps {
  state: GameState;
  player: Player;
  density?: SeatDensity;
  /** The seat this device controls. */
  isViewer?: boolean;
  /** Seats driven by the bot policy, labelled so nobody mistakes one for a person. */
  isBot?: boolean;
  onCardClick?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  attackerIds?: string[];
  blockerIds?: string[];
  selectedIds?: string[];
  /** Per-attacker push toward the seat being attacked, in card-local px. */
  lunges?: Record<string, Lunge>;
  /** Life changes to float off the badge. */
  lifeDeltas?: LifeDelta[];
  /** Rendered card width in px. The table measures itself and passes this down. */
  cardWidth?: number;
  /** Cards that fit in a row before it starts overlapping. */
  rowCapacity?: number;
  /** Two rows (permanents over lands) or one band when the seat is short. */
  rows?: 1 | 2;
  lifeSize?: LifeBadgeSize;
  /** Draw this seat's hand as card backs along its own edge. */
  showHandBacks?: boolean;
  className?: string;
}

const DENSITY_CARD_WIDTH: Record<SeatDensity, number> = { compact: 48, comfortable: 76 };
const DENSITY_CAPACITY: Record<SeatDensity, number> = { compact: 7, comfortable: 9 };
const DENSITY_LIFE: Record<SeatDensity, LifeBadgeSize> = { compact: 'sm', comfortable: 'md' };

/** A small pill of zone information. Surface tint and shadow, never an outline. */
function ZoneChip({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">{count}</span>
    </>
  );

  if (!onClick) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-background/65 px-1.5 py-0.5 shadow-sm shadow-black/40 backdrop-blur-sm">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full bg-background/65 px-1.5 py-0.5 shadow-sm shadow-black/40 backdrop-blur-sm transition-colors hover:bg-background/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  );
}

export function SeatPanel({
  state,
  player,
  density = 'compact',
  isViewer,
  isBot,
  onCardClick,
  onOpenZone,
  attackerIds = [],
  blockerIds = [],
  selectedIds = [],
  lunges,
  lifeDeltas,
  cardWidth,
  rowCapacity,
  rows = 2,
  lifeSize,
  showHandBacks = true,
  className,
}: SeatPanelProps) {
  const width = cardWidth ?? DENSITY_CARD_WIDTH[density];
  const capacity = rowCapacity ?? DENSITY_CAPACITY[density];
  const badgeSize = lifeSize ?? DENSITY_LIFE[density];

  const active = state.activePlayerId === player.id;
  const attacked = isUnderAttack(state, player.id);
  const dead = player.hasLost;

  const battlefield = player.zones.battlefield.map(id => state.cards[id]).filter(Boolean);
  const untapped = availableMana(state, player.id);
  const commander = player.commanders[0];

  const allCommanders = state.players.flatMap(p => p.commanders);
  const commanderDamage: CommanderDamagePip[] = Object.keys(player.commanderDamage)
    .map(id => ({
      id,
      name: allCommanders.find(c => c.id === id)?.name ?? 'Commander',
      amount: player.commanderDamage[id],
      lethal: state.rules.commanderDamageLethal,
    }))
    .filter(entry => entry.amount > 0);

  const roleOf = (card: CardInstance) => {
    if (attackerIds.indexOf(card.instanceId) !== -1) return 'attacker' as const;
    if (blockerIds.indexOf(card.instanceId) !== -1) return 'blocker' as const;
    return null;
  };

  const handCount = player.zones.hand.length;
  const shownBacks = Math.min(7, handCount);
  const backWidth = Math.max(22, Math.round(width * 0.52));

  return (
    <section aria-label={`${player.name}'s seat`} className={cn('relative h-full w-full', className)}>
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
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-destructive/20" />
        )}

        <div className="relative flex h-full w-full flex-col">
          {/* The board grows upward, toward the middle of the table. */}
          <div className="flex min-h-0 flex-1 items-end justify-center overflow-visible px-2 pt-2">
            <Battlefield
              cards={battlefield}
              cardWidth={width}
              capacity={capacity}
              rows={rows}
              align="center"
              className="w-full"
              emptyLabel={dead ? 'Out of the game' : 'Empty battlefield'}
              renderCard={(card, index, renderWidth) => (
                <GameCardView
                  card={card}
                  width={renderWidth}
                  entering
                  role={roleOf(card)}
                  lunge={lunges?.[card.instanceId] ?? null}
                  selected={selectedIds.indexOf(card.instanceId) !== -1}
                  onClick={onCardClick ? () => onCardClick(card) : undefined}
                  title={card.name}
                />
              )}
            />
          </div>

          {/* The player's own edge: who they are, what they are on, their piles. */}
          <div className="relative z-10 flex shrink-0 items-end gap-2 px-2 pb-1.5 pt-1">
            <LifeBadge
              life={player.life}
              size={badgeSize}
              startingLife={state.rules.startingLife}
              poison={player.poison}
              poisonLethal={state.rules.poisonLethal}
              commanderDamage={commanderDamage}
              deltas={lifeDeltas}
              active={active}
              dead={dead}
              className="shrink-0"
            />

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-1">
                <h3 className="truncate text-xs font-semibold text-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {player.name}
                </h3>
                {isViewer && (
                  <span className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
                    You
                  </span>
                )}
                {isBot && (
                  <span className="rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground backdrop-blur-sm">
                    Bot
                  </span>
                )}
                {active && !dead && (
                  <span className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
                    Turn
                  </span>
                )}
                {dead && (
                  <span className="rounded-full bg-background/70 px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground backdrop-blur-sm">
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

              <div className="mt-1 flex flex-wrap items-center gap-1">
                <ZoneChip label="mana" count={untapped} />
                <ZoneChip
                  label="gy"
                  count={player.zones.graveyard.length}
                  onClick={onOpenZone ? () => onOpenZone(player.id, 'graveyard') : undefined}
                />
                <ZoneChip
                  label="exile"
                  count={player.zones.exile.length}
                  onClick={onOpenZone ? () => onOpenZone(player.id, 'exile') : undefined}
                />
                <ZoneChip
                  label="cmd"
                  count={player.zones.command.length}
                  onClick={onOpenZone ? () => onOpenZone(player.id, 'command') : undefined}
                />
              </div>
            </div>

            {/* An opponent's hand is cards, face down — never a count on its own. */}
            {showHandBacks && !isViewer && handCount > 0 && (
              <div
                className="flex shrink-0 items-end"
                title={`${handCount} card${handCount === 1 ? '' : 's'} in hand`}
                aria-label={`${player.name} holds ${handCount} cards`}
              >
                {Array.from({ length: shownBacks }).map((_, index) => (
                  <CardBack
                    key={index}
                    width={backWidth}
                    style={{
                      marginLeft: index === 0 ? 0 : -backWidth * 0.55,
                      transform: `rotate(${(index - shownBacks / 2) * 3}deg)`,
                      zIndex: index,
                    }}
                  />
                ))}
                <span className="ml-1 self-center rounded-full bg-background/70 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-foreground backdrop-blur-sm">
                  {handCount}
                </span>
              </div>
            )}

            <LibraryStack
              count={player.zones.library.length}
              width={Math.max(28, Math.round(width * 0.7))}
              onClick={isViewer && onOpenZone ? () => onOpenZone(player.id, 'library') : undefined}
              className="shrink-0"
            />
          </div>
        </div>
      </Playmat>
    </section>
  );
}

export default SeatPanel;
