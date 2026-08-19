/**
 * "It is your upkeep, and these three things are your job."
 *
 * Owner: *"I also have an artifact in play, which says at beginning of my
 * upkeep I can place a charge counter (Aether Vial) — no way to do this."*
 *
 * The card's own marker says "this permanent has text the engine will not run",
 * which is a standing fact. It is not enough on its own, because an upkeep
 * trigger has no moment — nothing enters, nothing dies, nothing appears in the
 * feed — so the one turn you needed to remember is the one turn nothing
 * reminded you. `manualDutiesFor` in `src/lib/game/manual.ts` answers the
 * narrower question: what is going off THIS step that the engine declined.
 *
 * Drawn into the mat, in the same material as the table, in the band the combat
 * strip uses. No dialog, no backdrop, nothing covered, and it gates nothing:
 * the game keeps running underneath and the player can ignore it entirely. It
 * is a reminder, not a turnstile.
 *
 * Pressing a row opens that card in the centre preview, which is where the
 * counters, the keyword flags and the zone moves already live. This component
 * therefore knows no rules and builds no actions of its own.
 */

import { Hand, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import type { ManualDuty } from '@/lib/game';

export interface ManualDutiesProps {
  duties: readonly ManualDuty[];
  /** Open one in the centre preview, where the by-hand controls are. */
  onOpen: (instanceId: string) => void;
  /** Put it away for this step. It comes back next upkeep, because it happens again. */
  onDismiss: () => void;
  className?: string;
}

const TIMING_LABEL: Record<string, string> = {
  upkeep: 'Your upkeep',
  'end-step': 'Your end step',
};

export function ManualDuties({ duties, onOpen, onDismiss, className }: ManualDutiesProps) {
  if (duties.length === 0) return null;

  const heading = TIMING_LABEL[duties[0].timing] ?? 'This step';

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex max-w-[min(94vw,34rem)] flex-col gap-1.5 overflow-hidden rounded-xl px-3 py-2 shadow-xl shadow-black/50',
        className
      )}
      role="group"
      aria-label={`${heading}: ${duties.length} to resolve by hand`}
    >
      <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />

      <div className="relative flex items-center gap-2">
        <Hand className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {heading}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          These do not happen on their own. Resolve them yourself.
        </span>
        <button
          type="button"
          onClick={onDismiss}
          title="Put this away for now"
          aria-label="Put this away for now"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {duties.map(duty => (
        <button
          key={`${duty.card.instanceId}:${duty.clause}`}
          type="button"
          onClick={() => onOpen(duty.card.instanceId)}
          className="relative flex w-full items-baseline gap-2 rounded-lg bg-foreground/[0.06] px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="shrink-0 text-xs font-semibold text-foreground">{duty.card.name}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {duty.clause}
          </span>
        </button>
      ))}
    </div>
  );
}

export default ManualDuties;
