import { Check, Loader2, LogOut, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DeckSummary } from '@/lib/play/deckSource';
import type { RoomSeat, TableRoom } from '@/lib/lobby';
import { DeckChoice } from './DeckChoice';

/**
 * The two sets of controls a room has: the ones that are yours, and the ones
 * that are the host's.
 *
 * READY IS NOT A TICK BOX, and the copy says so. Putting your deck down means
 * it is shuffled here, on this device, against a seed nobody else will ever
 * see, and the fingerprint of that shuffle is published before the first card
 * is drawn. `prepareSeat` does it and `seat.ts` explains why it happens at this
 * moment and not later. On screen that is one line: your deck is down, this is
 * how many cards are in it.
 *
 * WHY START IS OFF IS ALWAYS SAID. `start_online_table` refuses a start that
 * breaks any of its rules, and a raised exception next to a button somebody
 * just pressed is a surprise. `whyNotStartable` says the same thing first, in
 * a sentence, beside the disabled button.
 *
 * Nothing here is a dialog and nothing is centred. Leaving is confirmed in
 * place: the control swaps to Leave / Stay, which is the standing rule for a
 * destructive action.
 */

export interface SeatControlsProps {
  seat: RoomSeat;
  decks: DeckSummary[];
  loadingDecks: boolean;
  /** Set while the deck is being loaded and shuffled. */
  shuffling: boolean;
  saving: boolean;
  error?: string | null;
  onChooseDeck: (deckId: string) => void;
  onReady: (ready: boolean) => void;
  /** Shuffle the deck already on the seat again, after one failed. */
  onRetry: () => void;
}

export function SeatControls({
  seat,
  decks,
  loadingDecks,
  shuffling,
  saving,
  error,
  onChooseDeck,
  onReady,
  onRetry,
}: SeatControlsProps) {
  const busy = shuffling || saving;

  return (
    <section className="rounded-xl bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Your seat</h2>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-end">
        <div>
          <label
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="room-deck"
          >
            Deck
          </label>
          <DeckChoice
            id="room-deck"
            decks={decks}
            loading={loadingDecks}
            value={seat.deckId}
            disabled={busy}
            onChange={onChooseDeck}
          />

          <p className="mt-2 text-sm text-muted-foreground">
            {shuffling ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Shuffling your deck
              </span>
            ) : seat.committed ? (
              `Your deck is shuffled and down. ${seat.deckSize} cards in the library.`
            ) : (
              'Pick a deck and it gets shuffled here, on your machine. Nobody else ever sees it.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            variant={seat.ready ? 'secondary' : 'default'}
            disabled={busy || !seat.committed}
            onClick={() => onReady(!seat.ready)}
            className="min-w-[12rem]"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : seat.ready ? (
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : null}
            {seat.ready ? 'Ready. Change my mind' : 'I am ready'}
          </Button>

          {!seat.committed && !shuffling && (
            <p className="text-sm text-muted-foreground">Choose a deck first.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-foreground">{error}</p>
          {/* A picker does not fire when you choose the deck it already holds,
              so without this the only way past a failed shuffle would be to
              pick a different deck than the one you meant to play. */}
          {seat.deckId && !seat.committed && !shuffling && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The host's controls                                                        */
/* -------------------------------------------------------------------------- */

export interface HostControlsProps {
  room: TableRoom;
  startReason: string | null;
  starting: boolean;
  changingVisibility: boolean;
  onStart: () => void;
  onVisibility: (visibility: 'public' | 'link') => void;
}

export function HostControls({
  room,
  startReason,
  starting,
  changingVisibility,
  onStart,
  onVisibility,
}: HostControlsProps) {
  return (
    <section className="rounded-xl bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">You are hosting</h2>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Who can find it
          </p>
          <div className="mt-2 flex gap-2">
            <VisibilityButton
              selected={room.visibility === 'public'}
              disabled={changingVisibility}
              label="Anyone in the lobby"
              onClick={() => onVisibility('public')}
            />
            <VisibilityButton
              selected={room.visibility === 'link'}
              disabled={changingVisibility}
              label="Only people with the link"
              onClick={() => onVisibility('link')}
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Button size="lg" disabled={starting || startReason !== null} onClick={onStart}>
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Start the game
          </Button>

          {startReason && (
            <p className="max-w-sm text-sm text-muted-foreground lg:text-right">{startReason}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function VisibilityButton({
  selected,
  disabled,
  label,
  onClick,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-2.5 text-sm font-medium transition-transform duration-150',
        'motion-safe:active:scale-[0.98]',
        selected ? 'bg-foreground text-background' : 'bg-muted/50 text-muted-foreground'
      )}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Standing up                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Leaving, confirmed in place.
 *
 * The host leaving an empty lobby takes the table with it, which is
 * `leave_online_table`'s own rule and is stated here rather than discovered.
 */
export function LeaveTable({
  lastOneHere,
  leaving,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  lastOneHere: boolean;
  leaving: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <Button variant="ghost" onClick={onAsk} disabled={leaving}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        Leave the table
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">
        {lastOneHere
          ? 'You are the last one here, so the table closes.'
          : 'Your seat opens up for somebody else.'}
      </span>
      <Button variant="secondary" onClick={onConfirm} disabled={leaving}>
        {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Leave
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={leaving}>
        Stay
      </Button>
    </div>
  );
}
