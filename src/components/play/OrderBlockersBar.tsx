/**
 * CR 509.2 — the attacking player orders the blockers.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT WAS RUNNING BACKWARDS
 * ---------------------------------------------------------------------------
 * `combat.ts:assignToBlockers` walks `declaration.blockedBy` and spends the
 * attacker's power down that list, lethal-first. The list is built by `BLOCK`,
 * which APPENDS in the order blocks were declared — and blocks are declared by
 * the DEFENDER. So the defender was choosing which of their own creatures the
 * attacker killed, just by click order, and the attacking player had no say at
 * all.
 *
 * A 3/3 blocked by a 1/1 and a 2/2 is the whole case. Block with the 1/1 first
 * and the engine spends 1 on it and 2 on the 2/2: the cheap creature dies and
 * the good one lives. The attacker wanted all three on the 2/2.
 *
 * ---------------------------------------------------------------------------
 * WHY NO HARNESS RUN COULD EVER HAVE FOUND IT
 * ---------------------------------------------------------------------------
 * `scripts/playtest/reach-census.ts`, six games, 6,656 applied actions: 72
 * blocked lanes and ZERO with two or more blockers. `bot.ts` assembles exactly
 * `blockersRequiredFor` bodies — one, or two for menace — and never
 * double-blocks by choice. Twenty green bot games say nothing about this. A
 * human double-blocks with two presses on the mat.
 *
 * ---------------------------------------------------------------------------
 * THE GESTURE
 * ---------------------------------------------------------------------------
 * One press per blocker, and it means "this one takes damage first". Pressing
 * a chip promotes it to the front, so any order in the list is reachable by
 * pressing the blockers in the order you want them hit. No drag: a drag on a
 * three-item list is a worse version of this, and it is unusable on a touch
 * screen over a board that is already handling drags of its own.
 *
 * The chips carry the number they are in the order and the stat line, because
 * the whole decision is "which of these can I afford to kill" and that is a
 * question about power and toughness.
 *
 * It is a strip in the same band as `CombatBar`, in the same material, so
 * combat furniture is one thing in one place rather than two. `CombatBar` is
 * never on screen at the same moment: it draws for a seat that owes a
 * declaration, and this draws for the attacking player in the step AFTER their
 * declaration is finished.
 */

import { ArrowRight, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statLineIn, type AttackDeclaration, type GameState, type PlayerId } from '@/lib/game';

export interface OrderBlockersBarProps {
  state: GameState;
  /** Lanes of this seat's that carry two or more blockers. From `lanesNeedingDamageOrder`. */
  lanes: readonly AttackDeclaration[];
  /** Put `blockerIds` into this order for `attackerId`. Dispatches ORDER_BLOCKERS. */
  onOrder: (attackerId: string, blockerIds: string[]) => void;
  /** Done looking. Releases the step so combat damage can be dealt. */
  onConfirm: () => void;
  className?: string;
}

export function OrderBlockersBar({
  state,
  lanes,
  onOrder,
  onConfirm,
  className,
}: OrderBlockersBarProps) {
  if (lanes.length === 0) return null;

  /*
   * ONE ROW WHEN THERE IS ONE LANE, AND THAT IS NOT A TASTE CALL.
   *
   * The first build of this stacked a headline over a lane row and measured
   * 543 x 101 at (525, 60) on a 1600 x 1000 window. Measured with it: 54,554px
   * of the opponent's seat band covered, and **21,985px of their "Creatures, 2
   * cards" row** — the row holding the two blockers the strip is asking the
   * player to order. Covering the cards a decision is about is worse than the
   * decision being missing, because the player cannot see what they are
   * choosing between.
   *
   * `PlayTable`'s own comment on the band says `CombatBar` "lands on the two
   * far seats' identity bands ... and on no card anywhere", and it manages that
   * by being ONE ROW. So this is one row too, and it grows to a stack only when
   * more than one attacker was multi-blocked, which is rare and is the case
   * where there is genuinely more to show.
   */
  const single = lanes.length === 1;

  const laneRow = (lane: (typeof lanes)[number], compact: boolean) => {
    const attacker = state.cards[lane.attackerId];
    if (!attacker) return null;
    return (
      <div
        key={lane.attackerId}
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5',
          compact ? '' : 'rounded-lg bg-foreground/[0.05] px-2 py-1.5'
        )}
      >
        <span className="max-w-[10rem] truncate text-xs font-semibold text-foreground">
          {attacker.name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {statLineIn(state, attacker)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />

        {lane.blockedBy.map((blockerId, index) => {
          const blocker = state.cards[blockerId];
          if (!blocker) return null;
          const first = index === 0;
          return (
            <button
              key={blockerId}
              type="button"
              onClick={() =>
                onOrder(lane.attackerId, [
                  blockerId,
                  ...lane.blockedBy.filter(id => id !== blockerId),
                ])
              }
              aria-pressed={first}
              title={
                first
                  ? `${blocker.name} takes damage first`
                  : `Assign damage to ${blocker.name} first`
              }
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                first
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.08] text-muted-foreground hover:bg-foreground/[0.16] hover:text-foreground'
              )}
            >
              <span className="tabular-nums opacity-70">{index + 1}</span>
              <span className="max-w-[8rem] truncate">{blocker.name}</span>
              <span className="tabular-nums opacity-70">{statLineIn(state, blocker)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const confirm = (
    <button
      type="button"
      onClick={onConfirm}
      title="Assign combat damage in this order"
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold uppercase tracking-wide text-background shadow-md shadow-black/40 transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>Deal damage</span>
    </button>
  );

  return (
    <div
      className={cn(
        // Same material as CombatBar and the HUD: surface tint and a shadow,
        // never a border.
        'pointer-events-auto flex max-w-[min(96vw,58rem)] items-center gap-3 rounded-xl bg-background/90 px-3 py-2 shadow-xl shadow-black/50 backdrop-blur-md',
        single ? '' : 'flex-col items-stretch',
        className
      )}
      role="group"
      aria-label="Order the blockers"
    >
      {single ? (
        <>
          <Swords className="h-5 w-5 shrink-0 text-foreground/75" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {laneRow(lanes[0], true)}
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              Press a blocker to put it first. Damage goes down the row in this order.
            </p>
          </div>
          {confirm}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Swords className="h-5 w-5 shrink-0 text-foreground/75" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {lanes.length} of your attackers were blocked by more than one creature
              </p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                Press a blocker to put it first. Damage goes down the row in this order.
              </p>
            </div>
            {confirm}
          </div>
          <div className="flex flex-col gap-1.5">{lanes.map(lane => laneRow(lane, false))}</div>
        </>
      )}
    </div>
  );
}

export default OrderBlockersBar;
