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
  { phase: 'combat_begin', label: 'Begin Combat' },
  { phase: 'declare_attackers', label: 'Attackers' },
  { phase: 'declare_blockers', label: 'Blockers' },
  { phase: 'combat_damage', label: 'Damage' },
  { phase: 'combat_end', label: 'End Combat' },
  { phase: 'postcombat_main', label: 'Main 2' },
  { phase: 'end', label: 'End' },
  { phase: 'cleanup', label: 'Cleanup' },
];

export const PhaseProgress = ({ currentPhase, activePlayer }: PhaseProgressProps) => {
  const currentIndex = PHASES.findIndex(p => p.phase === currentPhase);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted-foreground font-semibold">
        {activePlayer}'s Turn
      </div>
      <div className="grid grid-cols-6 gap-2">
        {PHASES.map((p, index) => (
          <div
            key={p.phase}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              index === currentIndex && "scale-105"
            )}
          >
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-all",
                index < currentIndex && "bg-primary",
                index === currentIndex && "bg-primary animate-pulse shadow-lg shadow-primary/50",
                index > currentIndex && "bg-muted"
              )}
            />
            <div
              className={cn(
                "text-[9px] transition-all whitespace-nowrap text-center leading-tight",
                index === currentIndex && "font-bold text-primary",
                index !== currentIndex && "text-muted-foreground"
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
