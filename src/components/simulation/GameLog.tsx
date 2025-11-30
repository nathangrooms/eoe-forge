import { GameEvent } from '@/lib/simulation/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface GameLogProps {
  events: GameEvent[];
}

export const GameLog = ({ events }: GameLogProps) => {
  const getEventIcon = (type: GameEvent['type']) => {
    switch (type) {
      case 'draw': return '📥';
      case 'play_land': return '🏔️';
      case 'cast_spell': return '✨';
      case 'attack': return '⚔️';
      case 'block': return '🛡️';
      case 'damage': return '💥';
      case 'trigger': return '🎯';
      case 'game_over': return '🏆';
      default: return '•';
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
          const icon = getEventIcon(event.type);

          return (
            <div
              key={`${event.timestamp}-${idx}`}
              className={cn(
                "flex items-start gap-3 p-2.5 rounded-lg border text-xs leading-relaxed",
                event.type === 'damage' && "bg-destructive/10 border-destructive/40",
                event.type === 'game_over' && "bg-primary/20 border-primary font-semibold",
                event.type === 'cast_spell' && "bg-purple-500/10 border-purple-500/40",
                event.type === 'play_land' && "bg-green-500/10 border-green-500/40",
                event.type === 'attack' && "bg-orange-500/10 border-orange-500/40",
                event.type === 'block' && "bg-blue-500/10 border-blue-500/40"
              )}
            >
              <div className="text-base pt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 text-[10px] text-muted-foreground">
                  <span className="font-mono">T{event.turn}</span>
                  {event.cardName && (
                    <span className="font-semibold text-primary truncate max-w-[140px]">
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
