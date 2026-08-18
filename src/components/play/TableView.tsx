/**
 * The pod, as it physically sits.
 *
 * Geometry comes from `src/lib/game/seating.ts` and nothing here re-derives it.
 * That module already answers the two hard questions — which edge a seat is on,
 * and how far its panel has to turn — including the CSS trap that a rotation
 * does not change an element's layout box, so a sideways seat must be laid out
 * with its width and height swapped before it is rotated.
 *
 * `layoutFromViewpoint` re-indexes the layout so the viewer is always at the
 * bottom edge. Today that is a no-op because the human takes seat 0; when every
 * player has their own device it is the whole reason each of them sees a table
 * that matches the one in front of them.
 *
 * Two things this component adds on top of the geometry:
 *
 *   **Measurement.** A four-player pinwheel gives the top and bottom seats a
 *   wide, thin strip and the side seats a tall, narrow one. One hard-coded card
 *   size cannot serve both, so the board measures itself and tells each seat how
 *   large its cards may be — a card never shrinks below readable, it overlaps
 *   instead.
 *
 *   **Lunge vectors.** An attacking creature leans toward the seat it is
 *   attacking. Each seat's content is rotated to face its player, so "toward
 *   that seat" has to be computed in screen space and then rotated back into
 *   the attacker's own frame, or three of the four seats would lunge sideways.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { SeatPanel } from './SeatPanel';
import { Playmat } from './Playmat';
import type { Lunge } from './GameCardView';
import type { LifeDeltaMap } from './useTableMotion';
import type { LifeBadgeSize } from './LifeBadge';
import {
  layoutFromViewpoint,
  seatBoxStyle,
  seatContentStyle,
  seatingFor,
  type CardInstance,
  type GameState,
  type PlayerId,
  type Seat,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

/** A real card is 63 × 88 mm: height = width ÷ this. */
const CARD_RATIO = 0.7176;
/** Vertical space the identity strip needs, per life-badge size. */
const STRIP_HEIGHT: Record<LifeBadgeSize, number> = { sm: 64, md: 84, lg: 108 };

export interface TableViewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  variant?: SeatingVariant;
  onCardClick?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  attackerIds?: string[];
  blockerIds?: string[];
  selectedIds?: string[];
  lifeDeltas?: LifeDeltaMap;
  /** Room left along the bottom edge for the viewer's fanned hand. */
  bottomInset?: number;
  className?: string;
}

/** Below this, a card stops being identifiable at a glance. */
const MIN_READABLE_WIDTH = 52;

interface SeatMetrics {
  cardWidth: number;
  capacity: number;
  rows: 1 | 2;
  lifeSize: LifeBadgeSize;
}

/**
 * How large this seat may draw a card, and whether it has the height for the
 * usual two rows.
 *
 * The order matters: two rows are tried first, and a seat only drops to one
 * when two would push cards below the size at which you can tell a Thragtusk
 * from a Thrashing Brontodon. A row is a nicety; a legible card is the product.
 */
function metricsFor(contentWidth: number, contentHeight: number): SeatMetrics {
  const lifeSize: LifeBadgeSize =
    contentHeight >= 320 ? 'lg' : contentHeight >= 210 ? 'md' : 'sm';

  const available = Math.max(60, contentHeight - STRIP_HEIGHT[lifeSize]);
  const widthCap = Math.min(112, contentWidth / 4.5);

  const twoRow = Math.min(widthCap, (available / 2) * CARD_RATIO);
  const rows: 1 | 2 = twoRow >= MIN_READABLE_WIDTH ? 2 : 1;

  const cardWidth = Math.round(
    Math.max(34, rows === 2 ? twoRow : Math.min(widthCap, available * CARD_RATIO))
  );
  const capacity = Math.max(3, Math.floor((contentWidth * 0.94) / (cardWidth * 1.08)));

  return { cardWidth, capacity, rows, lifeSize };
}

/**
 * A unit vector from one seat toward another, expressed in the *attacker's*
 * rotated frame. Screen-space first, because that is where "toward" means
 * something, then rotated by the negative of the attacker's own rotation.
 */
function lungeBetween(
  from: Seat,
  to: Seat,
  boardWidth: number,
  boardHeight: number,
  magnitude: number
): Lunge | null {
  const ax = (from.rect.x + from.rect.w / 2) * boardWidth;
  const ay = (from.rect.y + from.rect.h / 2) * boardHeight;
  const bx = (to.rect.x + to.rect.w / 2) * boardWidth;
  const by = (to.rect.y + to.rect.h / 2) * boardHeight;

  const vx = bx - ax;
  const vy = by - ay;
  const length = Math.hypot(vx, vy);
  if (length < 1) return null;

  const nx = vx / length;
  const ny = vy / length;
  const theta = (from.rotation * Math.PI) / 180;

  return {
    x: (nx * Math.cos(theta) + ny * Math.sin(theta)) * magnitude,
    y: (-nx * Math.sin(theta) + ny * Math.cos(theta)) * magnitude,
  };
}

export function TableView({
  state,
  viewerPlayerId,
  botPlayerIds,
  variant = 'table',
  onCardClick,
  onOpenZone,
  attackerIds,
  blockerIds,
  selectedIds,
  lifeDeltas,
  bottomInset = 0,
  className,
}: TableViewProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;

    setBoard({ width: element.clientWidth, height: element.clientHeight });

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setBoard({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
    if (board.width === 0 || board.height === 0) return result;

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

      const vector = lungeBetween(from, to, board.width, board.height, 22);
      if (vector) result[declaration.attackerId] = vector;
    }
    return result;
  }, [state.combat.attackers, state.cards, state.players, seatBySeatIndex, board]);

  return (
    <div className={cn('relative w-full overflow-hidden rounded-2xl', className)}>
      {/* The table itself, under every mat. */}
      <Playmat tone="board" rounded="rounded-2xl" className="absolute inset-0 h-full w-full" />

      {/* The seating area proper. Held off the bottom edge by `bottomInset` so
          the viewer's fanned hand has somewhere to sit without covering a mat.
          It is also what gets measured — the seats are positioned against it. */}
      <div
        ref={boardRef}
        className="absolute left-0 right-0 top-0"
        style={{ bottom: bottomInset }}
      >
        {layout.seats.map(seat => {
          const player = state.players[seat.index];
          if (!player) return null;

          const contentWidth = seat.isSideways
            ? seat.rect.h * board.height
            : seat.rect.w * board.width;
          const contentHeight = seat.isSideways
            ? seat.rect.w * board.width
            : seat.rect.h * board.height;
          const metrics = metricsFor(contentWidth || 320, contentHeight || 200);

          return (
            <div key={seat.index} style={seatBoxStyle(seat) as CSSProperties}>
              <div style={seatContentStyle(seat) as CSSProperties} className="p-1">
                <SeatPanel
                  state={state}
                  player={player}
                  isViewer={player.id === viewerPlayerId}
                  isBot={botPlayerIds.indexOf(player.id) !== -1}
                  onCardClick={onCardClick}
                  onOpenZone={onOpenZone}
                  attackerIds={attackerIds}
                  blockerIds={blockerIds}
                  selectedIds={selectedIds}
                  lunges={lunges}
                  lifeDeltas={lifeDeltas?.[player.id]}
                  cardWidth={metrics.cardWidth}
                  rowCapacity={metrics.capacity}
                  rows={metrics.rows}
                  lifeSize={metrics.lifeSize}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TableView;
