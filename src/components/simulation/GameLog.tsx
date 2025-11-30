import { GameEvent } from '@/lib/simulation/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface GameLogProps {
  events: GameEvent[];
  autoScroll?: boolean;
}

export const GameLog = ({ events, autoScroll = true }: GameLogProps) => {
  const getEventIcon = (type: GameEvent['type']) => {
    switch (type) {
      case 'draw': return '📥';
      case 'play_land': return '🏔️';
      case 'cast_spell': return '✨';
      case 'attack': return '⚔️';
      case 'block': return '🛡️';
      case 'damage': return '💥';
      case 'trigger': return '🎯';
      case 'phase_change': return '⏭️';
      case 'game_over': return '🏆';
      default: return '•';
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        {events.map((event, index) => (
          <div
            key={index}
            className={cn(
              "flex items-start gap-3 p-2 rounded-lg text-sm transition-all",
              event.type === 'game_over' && "bg-primary/20 border border-primary",
              event.type === 'damage' && "bg-destructive/10",
              event.type === 'phase_change' && "text-muted-foreground text-xs",
              index === events.length - 1 && "bg-accent/20"
            )}
          >
            <span className="text-lg">{getEventIcon(event.type)}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Turn {event.turn}</span>
                {event.cardName && (
                  <span className="text-xs font-semibold text-primary">{event.cardName}</span>
                )}
              </div>
              <div>{event.description}</div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
