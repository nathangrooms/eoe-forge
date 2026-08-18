/**
 * The one strip of furniture combat needs, floating on the table.
 *
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens"*, and *"Make sure no modals
 * in play, it should be beautiful within the playmat system."*
 *
 * Combat used to be a room of its own: a full-screen view with its own header,
 * its own lane diagram and its own tray of cards, drawn instead of the board.
 * Everything a player needed to *do* is now on the cards themselves — the sword
 * on the creature — so what is left over is the handful of things that are not
 * about any one card:
 *
 *   - who you are attacking, when the pod has more than one opponent;
 *   - how much damage the swing currently does, straight out of the engine;
 *   - and the press that says "that is my declaration, move on".
 *
 * That is a strip, not a screen. It floats over the top edge of the table in
 * the same material as the HUD above it, it covers no creature row on any mat,
 * and the board underneath it is the board that was there a second earlier —
 * same seats, same cards, same positions.
 *
 * Every number on it is computed by `resolveCombat`, the same function the
 * combat damage step calls. Nothing here re-implements a rule; if the strip
 * says 6 damage, six is what the step will deal.
 */

import { Swords, ShieldPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CombatStage } from './combatUi';
import type { Player, PlayerId } from '@/lib/game';

export interface CombatBarProps {
  stage: Exclude<CombatStage, null>;
  /** The sentence: "You attack Yeva with 2 creatures". Empty before anything swings. */
  sentence: string;
  /** What to do next, in one line. */
  hint: string;
  /** Life the current declaration takes off, per the engine's own resolution. */
  damage: number;
  /** True when that damage kills somebody. */
  lethal: boolean;
  /** Creatures declared so far this step (attackers, or blockers assigned). */
  count: number;
  /** Opponents that can be attacked. Only drawn when there is a choice to make. */
  targets?: readonly Player[];
  targetId?: PlayerId | null;
  onTarget?: (playerId: PlayerId) => void;
  /** Confirm the declaration and hand the step back to the game. */
  onConfirm: () => void;
  /** Why confirm is refused, or empty when it is not. */
  blockedReason?: string;
  className?: string;
}

export function CombatBar({
  stage,
  sentence,
  hint,
  damage,
  lethal,
  count,
  targets,
  targetId,
  onTarget,
  onConfirm,
  blockedReason,
  className,
}: CombatBarProps) {
  const attacking = stage === 'attackers';
  const Icon = attacking ? Swords : ShieldPlus;

  const headline =
    sentence || (attacking ? 'Declare your attackers' : 'Declare your blockers');

  const confirmLabel = attacking
    ? count > 0
      ? `Attack with ${count}`
      : 'No attacks'
    : count > 0
      ? `Confirm ${count} block${count === 1 ? '' : 's'}`
      : 'No blocks';

  return (
    <div
      className={cn(
        // Same material as the HUD it hangs below: a surface tint and a shadow,
        // never a border. It is part of the table, not a window over it.
        'pointer-events-auto flex max-w-[min(96vw,54rem)] items-center gap-3 rounded-xl px-3 py-2 shadow-xl shadow-black/50 backdrop-blur-md',
        lethal ? 'bg-destructive/25' : 'bg-background/85',
        className
      )}
      role="group"
      aria-label={attacking ? 'Declare attackers' : 'Declare blockers'}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0', lethal ? 'text-destructive' : 'text-foreground/75')}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{headline}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {blockedReason || hint}
        </p>
      </div>

      {/* Who am I hitting? Only asked when the answer is not obvious — a pod of
          two has exactly one opponent and does not need a chooser. */}
      {attacking && targets && targets.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-foreground/[0.06] p-0.5">
          {targets.map(target => (
            <button
              key={target.id}
              type="button"
              onClick={() => onTarget?.(target.id)}
              aria-pressed={target.id === targetId}
              title={`Attack ${target.name} (${target.life} life)`}
              className={cn(
                'max-w-[9rem] truncate rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                target.id === targetId
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
              )}
            >
              {target.name}
              <span className="ml-1 tabular-nums opacity-70">{target.life}</span>
            </button>
          ))}
        </div>
      )}

      {/* The number the whole step is about. */}
      <div className="shrink-0 text-right leading-none">
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums',
            damage > 0 ? (lethal ? 'text-destructive' : 'text-foreground') : 'text-muted-foreground'
          )}
        >
          {damage}
        </p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {lethal ? 'lethal' : 'damage through'}
        </p>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!!blockedReason}
        title={blockedReason || confirmLabel}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-40',
          count > 0
            ? 'bg-foreground text-background shadow-md shadow-black/40 hover:bg-foreground/90'
            : 'bg-foreground/[0.1] text-foreground hover:bg-foreground/[0.18]'
        )}
      >
        {attacking && count > 0 && <Swords className="h-4 w-4" />}
        <span>{confirmLabel}</span>
      </button>
    </div>
  );
}

export default CombatBar;
