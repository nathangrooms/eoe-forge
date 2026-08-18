import { GameEvent } from '@/lib/simulation/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ArrowDownToLine,
  Mountain,
  Sparkles,
  Swords,
  Shield,
  Zap,
  Target,
  Trophy,
  Dot,
  type LucideIcon,
} from 'lucide-react';

interface GameLogProps {
  events: GameEvent[];
}

export const GameLog = ({ events }: GameLogProps) => {
  // Icons rather than emoji: emoji glyphs render differently on every OS and
  // several of these had no consistent metaphor across platforms.
  const getEventIcon = (type: GameEvent['type']): LucideIcon => {
    switch (type) {
      case 'draw': return ArrowDownToLine;
      case 'play_land': return Mountain;
      case 'cast_spell': return Sparkles;
      case 'attack': return Swords;
      case 'block': return Shield;
      case 'damage': return Zap;
      case 'trigger': return Target;
      case 'game_over': return Trophy;
      default: return Dot;
    }
  };

  // Only show meaningful actions, newest first
  const filtered = events.filter((event) => event.type !== 'phase_change');
  const ordered = [...filtered].reverse();

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {ordered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            No actions yet. Start the simulation to see plays here.
          </div>
        )}

        {ordered.map((event, idx) => {
          const Icon = getEventIcon(event.type);

          return (
            <div
              key={`${event.timestamp}-${idx}`}
              className={cn(
                'flex items-start gap-3 rounded-lg p-2.5 text-xs leading-relaxed',
                event.type === 'damage'
                  ? 'bg-destructive/15'
                  : event.type === 'game_over'
                    ? 'bg-accent font-semibold'
                    : 'bg-muted/30'
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono">T{event.turn}</span>
                  {event.cardName && (
                    <span className="max-w-[140px] truncate font-semibold text-foreground">
                      {event.cardName}
                    </span>
                  )}
                </div>
                <div className="break-words">
                  {event.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};
