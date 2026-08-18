import { Phase } from '@/lib/simulation/types';
import { cn } from '@/lib/utils';

interface PhaseProgressProps {
  currentPhase: Phase;
  activePlayer: string;
}

const PHASES: { phase: Phase; label: string }[] = [
  { phase: 'untap', label: 'Untap' },
  { phase: 'upkeep', label: 'Upkeep' },
  { phase: 'draw', label: 'Draw' },
  { phase: 'precombat_main', label: 'Main 1' },
  { phase: 'combat_begin', label: 'Begin combat' },
  { phase: 'declare_attackers', label: 'Attackers' },
  { phase: 'declare_blockers', label: 'Blockers' },
  { phase: 'combat_damage', label: 'Damage' },
  { phase: 'combat_end', label: 'End combat' },
  { phase: 'postcombat_main', label: 'Main 2' },
  { phase: 'end', label: 'End' },
  { phase: 'cleanup', label: 'Cleanup' },
];

/**
 * Twelve phases in a 6-column grid at 9px with `whitespace-nowrap` gave each
 * label about 55px — not enough for "Declare Blockers". Three columns with
 * wrapping labels fits the sidebar it actually renders into.
 */
export const PhaseProgress = ({ currentPhase, activePlayer }: PhaseProgressProps) => {
  const currentIndex = PHASES.findIndex(p => p.phase === currentPhase);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-muted-foreground">
        {activePlayer}&apos;s turn
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-4">
        {PHASES.map((p, index) => (
          <div key={p.phase} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'h-1 w-full rounded-full',
                index < currentIndex && 'bg-muted-foreground',
                index === currentIndex && 'bg-foreground',
                index > currentIndex && 'bg-muted'
              )}
            />
            <div
              className={cn(
                'text-center text-[10px] leading-tight',
                index === currentIndex ? 'font-bold text-foreground' : 'text-muted-foreground'
              )}
            >
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
