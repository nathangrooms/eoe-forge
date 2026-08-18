/**
 * The pod, as four equal quadrants — two rows, two columns, every seat upright.
 *
 * Owner: *"the board should split in 4 separate ways - 2 rows, 2 columns, all
 * hands shows as if placed in front of you, so you can click their cards and
 * view their board properly"*.
 *
 * Placement still comes from `src/lib/game/seating.ts`, which owns the geometry
 * and the turn order that goes with it; `layoutFromViewpoint` keeps the viewer
 * in the bottom-left quadrant so a networked table gives every player a board
 * that matches the one in front of them. What this component does NOT do is
 * rotate anything. The pinwheel put three of the four seats sideways or upside
 * down, which made an opponent's board something you squinted at rather than
 * something you used. Four upright quadrants, all interactive.
 *
 * The same renderer draws one seat as draws four. That is the whole reason hand
 * mode and view mode exist as props rather than as separate screens: pass a
 * `focusPlayerId` and that seat takes the entire board. They cannot drift apart
 * because they are the same code.
 */

import { useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { SeatMat } from './SeatMat';
import { Playmat } from './Playmat';
import type { Lunge } from './GameCardView';
import type { LifeDeltaMap } from './useTableMotion';
import {
  layoutFromViewpoint,
  seatingFor,
  type CardInstance,
  type GameState,
  type PlayerId,
  type Seat,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

export interface PlayTableProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  variant?: SeatingVariant;
  /** Draw exactly one seat, filling the board. Hand mode and view mode. */
  focusPlayerId?: PlayerId | null;
  /** Ceiling for a battlefield card. Each mat comes down from it to fit. */
  cardWidth?: number;
  /** A click on any card opens the preview. It is never the action itself. */
  onInspect?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  onFocusSeat?: (playerId: PlayerId) => void;
  attackerIds?: readonly string[];
  blockerIds?: readonly string[];
  inspectedId?: string | null;
  lifeDeltas?: LifeDeltaMap;
  /** Room left along the bottom edge for the viewer's fanned hand. */
  bottomInset?: number;
  /** Room left along the top edge for the HUD that floats over the table. */
  topInset?: number;
  className?: string;
}

/**
 * A unit vector from one seat toward another, in screen space.
 *
 * Nothing is rotated any more, so this is the whole calculation: an attacking
 * creature leans toward the quadrant it is attacking and everybody at the table
 * can see which way the swing is pointed.
 */
function lungeBetween(from: Seat, to: Seat, magnitude: number): Lunge | null {
  const vx = to.rect.x + to.rect.w / 2 - (from.rect.x + from.rect.w / 2);
  const vy = to.rect.y + to.rect.h / 2 - (from.rect.y + from.rect.h / 2);
  const length = Math.hypot(vx, vy);
  if (length < 0.001) return null;
  return { x: (vx / length) * magnitude, y: (vy / length) * magnitude };
}

export function PlayTable({
  state,
  viewerPlayerId,
  botPlayerIds,
  variant = 'quads',
  focusPlayerId = null,
  cardWidth = 150,
  onInspect,
  onOpenZone,
  onFocusSeat,
  attackerIds,
  blockerIds,
  inspectedId,
  lifeDeltas,
  bottomInset = 0,
  topInset = 0,
  className,
}: PlayTableProps) {
  const viewerSeat = state.players.find(p => p.id === viewerPlayerId)?.seat ?? 0;

  const layout = useMemo(
    () => layoutFromViewpoint(seatingFor(state.players.length, variant), viewerSeat),
    [state.players.length, variant, viewerSeat]
  );

  const seatBySeatIndex = useMemo(() => {
    const map = new Map<number, Seat>();
    for (const seat of layout.seats) map.set(seat.index, seat);
    return map;
  }, [layout]);

  /** instanceId -> how far and which way that attacker leans. */
  const lunges = useMemo(() => {
    const result: Record<string, Lunge> = {};
    for (const declaration of state.combat.attackers) {
      const attacker = state.cards[declaration.attackerId];
      if (!attacker) continue;

      const attackingPlayer = state.players.find(p => p.id === attacker.controllerId);
      const defenderId =
        declaration.defenderPlayerId ??
        (declaration.defenderInstanceId
          ? state.cards[declaration.defenderInstanceId]?.controllerId
          : undefined);
      if (!attackingPlayer || !defenderId) continue;

      const defendingPlayer = state.players.find(p => p.id === defenderId);
      if (!defendingPlayer) continue;

      const from = seatBySeatIndex.get(attackingPlayer.seat);
      const to = seatBySeatIndex.get(defendingPlayer.seat);
      if (!from || !to) continue;

      const vector = lungeBetween(from, to, 20);
      if (vector) result[declaration.attackerId] = vector;
    }
    return result;
  }, [state.combat.attackers, state.cards, state.players, seatBySeatIndex]);

  const focused = focusPlayerId
    ? state.players.find(p => p.id === focusPlayerId) ?? null
    : null;

  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      {/* The table itself, under every mat. Full bleed: a game board does not
          have a corner radius, and the viewport edge is the edge of the table. */}
      <Playmat tone="board" rounded="rounded-none" className="absolute inset-0 h-full w-full" />

      <div
        className="absolute left-0 right-0"
        style={{ top: topInset, bottom: bottomInset }}
      >
        {focused ? (
          <div className="absolute inset-0 p-1">
            <SeatMat
              state={state}
              player={focused}
              isViewer={focused.id === viewerPlayerId}
              isBot={botPlayerIds.indexOf(focused.id) !== -1}
              cardWidth={cardWidth}
              onInspect={onInspect}
              onOpenZone={onOpenZone}
              attackerIds={attackerIds}
              blockerIds={blockerIds}
              inspectedId={inspectedId}
              lunges={lunges}
              lifeDeltas={lifeDeltas?.[focused.id]}
              side="left"
              showHandBacks={focused.id !== viewerPlayerId}
            />
          </div>
        ) : (
          layout.seats.map(seat => {
            const player = state.players[seat.index];
            if (!player) return null;

            const isViewer = player.id === viewerPlayerId;
            const style: CSSProperties = {
              position: 'absolute',
              left: `${seat.rect.x * 100}%`,
              top: `${seat.rect.y * 100}%`,
              width: `${seat.rect.w * 100}%`,
              height: `${seat.rect.h * 100}%`,
            };

            return (
              <div key={seat.index} style={style} className="p-1">
                <SeatMat
                  state={state}
                  player={player}
                  isViewer={isViewer}
                  isBot={botPlayerIds.indexOf(player.id) !== -1}
                  cardWidth={cardWidth}
                  onInspect={onInspect}
                  onOpenZone={onOpenZone}
                  onFocusSeat={isViewer ? undefined : onFocusSeat}
                  attackerIds={attackerIds}
                  blockerIds={blockerIds}
                  inspectedId={inspectedId}
                  lunges={lunges}
                  lifeDeltas={lifeDeltas?.[player.id]}
                  side={seat.rect.x + seat.rect.w / 2 <= 0.5 ? 'left' : 'right'}
                  showHandBacks={!isViewer}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default PlayTable;
