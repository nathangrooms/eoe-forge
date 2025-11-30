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
    <div className="flex items-center gap-2 p-3 bg-background/80 backdrop-blur rounded-lg border border-border">
      <div className="text-xs text-muted-foreground font-semibold mr-2">
        {activePlayer}'s Turn
      </div>
      {PHASES.map((p, index) => (
        <div
          key={p.phase}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            index === currentIndex && "scale-110"
          )}
        >
          <div
            className={cn(
              "h-2 w-12 rounded-full transition-all",
              index < currentIndex && "bg-primary",
              index === currentIndex && "bg-primary animate-pulse shadow-lg shadow-primary/50",
              index > currentIndex && "bg-muted"
            )}
          />
          <div
            className={cn(
              "text-xs transition-all whitespace-nowrap",
              index === currentIndex && "font-bold text-primary",
              index !== currentIndex && "text-muted-foreground"
            )}
          >
            {p.label}
          </div>
        </div>
      ))}
    </div>
  );
};
