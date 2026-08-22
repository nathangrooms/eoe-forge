import { Check, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chairs, type RoomSeat, type TableRoom } from '@/lib/lobby';
import { CommanderFace } from './CommanderFace';

/**
 * Who is at the table, drawn as the decks they brought.
 *
 * A seat IS a commander to everybody looking at it, so the chair is the card,
 * large, at the size the rest of the product shows a card people are meant to
 * look at. A name in grey text next to a coloured dot tells a player nothing
 * about whether they want that game.
 *
 * EMPTY CHAIRS ARE REAL. The room draws `maxSeats` of them and leaves the
 * unfilled ones in place, so a player arriving does not shove everything below
 * them down the page, and so an empty chair is a visible invitation rather than
 * an absence somebody has to infer from a number. `chairs()` does that
 * arithmetic and is tested.
 *
 * Nothing here is separated by a line. A chair is a surface, and the space
 * between chairs is the separation.
 */

export interface TableSeatsProps {
  room: Pick<TableRoom, 'maxSeats' | 'seats' | 'hostUser' | 'status'>;
  /** The account looking at it, so its own chair can be marked. */
  meUserId?: string | null;
  className?: string;
}

export function TableSeats({ room, meUserId, className }: TableSeatsProps) {
  const seats = chairs(room);

  return (
    <ul
      className={cn(
        'grid w-full gap-4',
        seats.length <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4',
        className
      )}
    >
      {seats.map((seat, index) => (
        <li key={index}>
          {seat ? (
            <Chair seat={seat} isHost={seat.userId === room.hostUser} isMe={seat.userId === meUserId} />
          ) : (
            <EmptyChair />
          )}
        </li>
      ))}
    </ul>
  );
}

function Chair({ seat, isHost, isMe }: { seat: RoomSeat; isHost: boolean; isMe: boolean }) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center rounded-xl p-4',
        isMe ? 'bg-muted/60' : 'bg-card'
      )}
    >
      <CommanderFace commanders={seat.commanders} size="lg" emptyLabel="Choosing a deck" />

      <div className="mt-3 w-full text-center">
        <p className="flex items-center justify-center gap-1.5 truncate text-base font-semibold text-foreground">
          {isHost && <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {seat.name}
          {isMe && <span className="text-sm font-normal text-muted-foreground">you</span>}
        </p>

        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {seat.deckName ?? 'No deck yet'}
        </p>

        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm">
          {seat.ready && seat.committed ? (
            <>
              <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
              <span className="text-foreground">Ready</span>
            </>
          ) : seat.committed ? (
            <span className="text-muted-foreground">Deck down, {seat.deckSize} cards</span>
          ) : (
            <span className="text-muted-foreground">Still picking</span>
          )}
        </p>
      </div>
    </div>
  );
}

function EmptyChair() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl bg-muted/25 p-4 text-center">
      <p className="text-base font-medium text-foreground">Empty seat</p>
      <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">
        Send the link to somebody and they land right here.
      </p>
    </div>
  );
}
