/**
 * One player's slice of the table: who they are, what they are on, and what
 * they have in play.
 *
 * This component is used twice at very different sizes — as a rotated panel on
 * the four-player board, and full width in the hand and combat views — so it
 * takes a `density` rather than assuming either.
 *
 * The battlefield is split into lands and everything else. That is not
 * decoration: at a glance a Magic player counts your untapped mana first and
 * your threats second, and a single undifferentiated pile makes both harder.
 */

import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { GameCardView, type GameCardSize } from './GameCardView';
import {
  availableMana,
  isLand,
  isUnderAttack,
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
  /** The seat this device controls — gets the accent treatment and its own hand count. */
  isViewer?: boolean;
  /** Seats driven by the bot policy, labelled so nobody mistakes one for a person. */
  isBot?: boolean;
  onCardClick?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  /** Instance ids to ring as attackers. */
  attackerIds?: string[];
  /** Instance ids to ring as blockers. */
  blockerIds?: string[];
  selectedIds?: string[];
  className?: string;
}

const CARD_SIZE: Record<SeatDensity, GameCardSize> = {
  compact: 'xs',
  comfortable: 'sm',
};

function ZoneCount({
  label,
  count,
  onClick,
  emphasis,
}: {
  label: string;
  count: number;
  onClick?: () => void;
  emphasis?: boolean;
}) {
  const content = (
    <>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold tabular-nums', emphasis ? 'text-foreground' : 'text-foreground')}>
        {count}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  className,
}: SeatPanelProps) {
  const size = CARD_SIZE[density];
  const active = state.activePlayerId === player.id;
  const attacked = isUnderAttack(state, player.id);
  const dead = player.hasLost;

  const battlefield = player.zones.battlefield.map(id => state.cards[id]).filter(Boolean);
  const lands = battlefield.filter(isLand);
  const permanents = battlefield.filter(card => !isLand(card));
  const untapped = availableMana(state, player.id);

  const commanderDamage = Object.entries(player.commanderDamage).filter(([, value]) => value > 0);

  const roleOf = (card: CardInstance) => {
    if (attackerIds.indexOf(card.instanceId) !== -1) return 'attacker' as const;
    if (blockerIds.indexOf(card.instanceId) !== -1) return 'blocker' as const;
    return null;
  };

  return (
    <section
      aria-label={`${player.name}'s seat`}
      className={cn(
        'flex h-full w-full flex-col gap-2 overflow-hidden rounded-lg p-2 transition-shadow duration-300 motion-reduce:transition-none',
        active ? 'bg-card shadow-lg' : 'bg-card/70 shadow-sm',
        attacked && 'shadow-[0_0_0_2px_hsl(var(--destructive))]',
        dead && 'opacity-50 saturate-0',
        className
      )}
    >
      {/* Identity and life */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{player.name}</h3>
            {isViewer && (
              <span className="rounded-full bg-primary px-1.5 text-[9px] font-semibold uppercase leading-4 text-primary-foreground">
                You
              </span>
            )}
            {isBot && (
              <span className="rounded-full bg-muted px-1.5 text-[9px] font-medium uppercase leading-4 text-muted-foreground">
                Bot
              </span>
            )}
            {active && !dead && (
              <span className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold uppercase leading-4 text-background">
                Turn
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {player.commanders.map(commander => (
              <span key={commander.id} className="flex items-center gap-1">
                <ColorIdentity colors={commander.colorIdentity} size="xs" />
                <span className="max-w-[8rem] truncate text-[10px] text-muted-foreground">
                  {commander.name}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className={cn(
              'font-semibold tabular-nums leading-none',
              density === 'compact' ? 'text-2xl' : 'text-3xl',
              player.life <= 5 ? 'text-destructive' : 'text-foreground'
            )}
          >
            {player.life}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">life</span>
        </div>
      </header>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-1">
        <ZoneCount label="mana" count={untapped} emphasis />
        <ZoneCount
          label="hand"
          count={player.zones.hand.length}
          onClick={isViewer && onOpenZone ? () => onOpenZone(player.id, 'hand') : undefined}
        />
        <ZoneCount
          label="lib"
          count={player.zones.library.length}
          onClick={isViewer && onOpenZone ? () => onOpenZone(player.id, 'library') : undefined}
        />
        <ZoneCount
          label="gy"
          count={player.zones.graveyard.length}
          onClick={onOpenZone ? () => onOpenZone(player.id, 'graveyard') : undefined}
        />
        <ZoneCount
          label="exile"
          count={player.zones.exile.length}
          onClick={onOpenZone ? () => onOpenZone(player.id, 'exile') : undefined}
        />
        <ZoneCount
          label="cmd"
          count={player.zones.command.length}
          onClick={onOpenZone ? () => onOpenZone(player.id, 'command') : undefined}
        />
        {player.poison > 0 && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {player.poison} poison
          </span>
        )}
        {commanderDamage.map(([commanderId, value]) => {
          const name =
            state.players
              .flatMap(p => p.commanders)
              .find(c => c.id === commanderId)?.name ?? 'Commander';
          return (
            <span
              key={commanderId}
              title={`${value} commander damage from ${name}`}
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                value >= 21 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-foreground'
              )}
            >
              {value} cmd
            </span>
          );
        })}
        {dead && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Out — {player.lossReasons[0] ?? 'eliminated'}
          </span>
        )}
      </div>

      {/* Battlefield */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {permanents.length === 0 && lands.length === 0 ? (
          <p className="rounded-md bg-muted/40 px-2 py-3 text-center text-[11px] text-muted-foreground">
            Empty battlefield
          </p>
        ) : null}

        {permanents.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {permanents.map(card => (
              <GameCardView
                key={card.instanceId}
                card={card}
                size={size}
                role={roleOf(card)}
                selected={selectedIds.indexOf(card.instanceId) !== -1}
                onClick={onCardClick ? () => onCardClick(card) : undefined}
              />
            ))}
          </div>
        )}

        {lands.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lands.map(card => (
              <GameCardView
                key={card.instanceId}
                card={card}
                size={size}
                selected={selectedIds.indexOf(card.instanceId) !== -1}
                onClick={onCardClick ? () => onCardClick(card) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
