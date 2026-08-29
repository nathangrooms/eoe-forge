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
 *
 * ## The buttons are in the top bar, and there is only one set of them
 *
 * This bar used to carry MULLIGAN and KEEP while the HUD carried KEEP THIS HAND
 * at the same time, so the screen asked one question and offered its answer
 * twice, in two places, four hundred pixels apart. The owner has asked for the
 * main action bar to be at the TOP, and combat splitting one decision across two
 * bars is on the same defect list. So this says WHAT is being decided and the
 * top bar is where it is answered, for the opening hand exactly as for the end
 * of a turn.
 */

import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';

export interface MulliganBarProps {
  /** How many mulligans this seat has already taken. */
  taken: number;
  /** How many the player has picked for the bottom so far. */
  chosen: number;
  /** How many they owe. Zero means the keep is free. */
  owed: number;
  /** True once the player has kept and is choosing what to put back. */
  bottoming: boolean;
  className?: string;
}

export function MulliganBar({
  taken,
  chosen,
  owed,
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
    ? 'Click cards in your hand to choose them. Click again to change your mind. Start the game from the bar at the top.'
    /* Says where, because the answers moved. A player who reads "keep it" and
       finds no Keep under the sentence has been sent looking. */
    : 'Keep it, or shuffle back and draw seven more. Both buttons are in the bar at the top.';

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
    </div>
  );
}

export default MulliganBar;
