/**
 * The full table: every seat, positioned where that player physically sits.
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
 */

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { SeatPanel } from './SeatPanel';
import {
  layoutFromViewpoint,
  seatBoxStyle,
  seatContentStyle,
  seatingFor,
  type CardInstance,
  type GameState,
  type PlayerId,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

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
  className?: string;
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
  className,
}: TableViewProps) {
  const viewerSeat = state.players.find(p => p.id === viewerPlayerId)?.seat ?? 0;
  const layout = layoutFromViewpoint(seatingFor(state.players.length, variant), viewerSeat);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-muted/30 p-1.5',
        // Tall enough that a four-way pinwheel still gives each edge a usable
        // strip; the aspect keeps the pod square-ish rather than letterboxed.
        'min-h-[30rem] md:min-h-[38rem]',
        className
      )}
      style={{ aspectRatio: '4 / 3' }}
    >
      {layout.seats.map(seat => {
        const player = state.players[seat.index];
        if (!player) return null;

        return (
          <div key={seat.index} style={seatBoxStyle(seat) as CSSProperties}>
            <div style={seatContentStyle(seat) as CSSProperties} className="p-1">
              <SeatPanel
                state={state}
                player={player}
                density="compact"
                isViewer={player.id === viewerPlayerId}
                isBot={botPlayerIds.indexOf(player.id) !== -1}
                onCardClick={onCardClick}
                onOpenZone={onOpenZone}
                attackerIds={attackerIds}
                blockerIds={blockerIds}
                selectedIds={selectedIds}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
