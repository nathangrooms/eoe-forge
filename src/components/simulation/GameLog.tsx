import { GameEvent } from '@/lib/simulation/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface GameLogProps {
  events: GameEvent[];
  autoScroll?: boolean;
}

export const GameLog = ({ events, autoScroll = true }: GameLogProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);

  useEffect(() => {
    // Auto-scroll to bottom when new events arrive
    if (autoScroll && scrollRef.current && events.length > prevLengthRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevLengthRef.current = events.length;
  }, [events, autoScroll]);

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

  const getEventColor = (type: GameEvent['type']) => {
    switch (type) {
      case 'game_over': return 'bg-primary/20 border-primary text-primary font-bold';
      case 'damage': return 'bg-destructive/10 text-destructive';
      case 'attack': return 'bg-orange-500/10 text-orange-600';
      case 'block': return 'bg-blue-500/10 text-blue-600';
      case 'cast_spell': return 'bg-purple-500/10 text-purple-600';
      case 'phase_change': return 'text-muted-foreground text-xs';
      default: return '';
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        {events.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No events yet. Start the simulation to see the game log.
              </div>
        ) : (
          <>
            {events.map((event, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-3 p-2 rounded-lg text-sm transition-all",
                  getEventColor(event.type),
                  index === events.length - 1 && "ring-2 ring-primary/50 animate-pulse"
                )}
              >
                <span className="text-lg flex-shrink-0">{getEventIcon(event.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-mono">
                      T{event.turn}
                    </span>
                    {event.cardName && (
                      <span className="text-xs font-semibold text-primary truncate">
                        {event.cardName}
                      </span>
                    )}
                    {event.type !== 'phase_change' && (
                      <span className="text-xs text-muted-foreground">
                        • {event.phase.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="break-words">{event.description}</div>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </>
        )}
      </div>
    </ScrollArea>
  );
};
