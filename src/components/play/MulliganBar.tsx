/**
 * The opening hand, and the one decision every game of Magic starts with.
 *
 * Owner: *"No way to mulligan the first hand."* Which was true from the seat,
 * and the reason is worth recording: `mulliganActions` existed, was correct for
 * the rule it implemented, and had exactly one caller — a line in the game menu,
 * behind a slider icon, three presses away, with no label saying what it was
 * for and nothing on the table indicating a decision was owed. A capability
 * nobody can find is the same as one that does not exist.
 *
 * So it is here instead: on the mat, over your own hand, at the only moment it
 * matters, and the game does not start until it is answered.
 *
 * London rule, in two steps, because that is how it is played:
 *
 *   1. **Keep or mulligan.** A mulligan shuffles back and deals a full seven.
 *      You always look at seven.
 *   2. **Bottom what you owe.** Keeping after N mulligans costs N cards from
 *      the hand, chosen by you, put on the bottom of your library. The bar
 *      counts them off and will not let you finish early or late.
 *
 * Drawn into the mat in the table's own material. No dialog, no backdrop,
 * nothing covered: the board is dealt and visible behind it, which is the point,
 * because the hand you are judging is on screen underneath.
 */

import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';

export interface MulliganBarProps {
  /** How many mulligans this seat has already taken. */
  taken: number;
  /** Cards currently in hand. */
  handSize: number;
  /** How many the player has picked for the bottom so far. */
  chosen: number;
  /** How many they owe. Zero means the keep is free. */
  owed: number;
  onMulligan: () => void;
  onKeep: () => void;
  /** Confirm the bottoming and start the game. Only offered when the count is right. */
  onConfirmBottom: () => void;
  /** True once the player has kept and is choosing what to put back. */
  bottoming: boolean;
  className?: string;
}

export function MulliganBar({
  taken,
  handSize,
  chosen,
  owed,
  onMulligan,
  onKeep,
  onConfirmBottom,
  bottoming,
  className,
}: MulliganBarProps) {
  const remaining = Math.max(0, owed - chosen);

  const headline = bottoming
    ? remaining > 0
      ? `Put ${remaining} card${remaining === 1 ? '' : 's'} on the bottom`
      : 'Ready to start'
    : taken === 0
      ? 'Your opening hand'
      : `Mulligan ${taken}. Keeping costs ${taken} card${taken === 1 ? '' : 's'} to the bottom.`;

  const detail = bottoming
    ? 'Click cards in your hand to choose them. Click again to change your mind.'
    : 'Keep it, or shuffle back and draw seven more.';

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex max-w-[min(94vw,40rem)] items-center gap-3 overflow-hidden rounded-xl px-4 py-2.5 shadow-xl shadow-black/50',
        className
      )}
      role="group"
      aria-label="Opening hand"
    >
      <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />

      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{headline}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{detail}</p>
      </div>

      {bottoming ? (
        <button
          type="button"
          onClick={onConfirmBottom}
          disabled={remaining > 0}
          className={cn(
            'relative flex h-9 shrink-0 items-center rounded-lg px-4 text-xs font-semibold uppercase tracking-wide transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            remaining > 0
              ? 'bg-foreground/[0.08] text-muted-foreground'
              : 'bg-foreground text-background shadow-lg shadow-black/50 hover:bg-foreground/90'
          )}
        >
          Start the game
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onMulligan}
            /* A hand of one is the floor. Below that there is nothing to keep
               and nothing to choose, and offering the press would be a lie. */
            disabled={handSize <= 1}
            className="relative flex h-9 shrink-0 items-center rounded-lg bg-foreground/[0.10] px-4 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-foreground/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Mulligan
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="relative flex h-9 shrink-0 items-center rounded-lg bg-foreground px-4 text-xs font-semibold uppercase tracking-wide text-background shadow-lg shadow-black/50 transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Keep
          </button>
        </>
      )}
    </div>
  );
}

export default MulliganBar;
