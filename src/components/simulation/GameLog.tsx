import { GameEvent } from '@/lib/simulation/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  return (
    <Card className="h-full flex flex-col border-2 shadow-xl">
      <div className="p-5 border-b-2 bg-muted/30">
        <h3 className="font-bold text-xl">Game Log</h3>
        <p className="text-sm text-muted-foreground mt-1">Live updates • Turn {events[events.length - 1]?.turn || 1}</p>
      </div>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-2.5">
          {events.map((event, idx) => {
            const icon = getEventIcon(event.type);

            return (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-all border-2",
                  event.type === 'phase_change' && "bg-muted/40 border-border/50",
                  event.type === 'damage' && "bg-destructive/10 border-destructive/30",
                  event.type === 'game_over' && "bg-primary/20 border-primary font-bold",
                  idx === events.length - 1 && "animate-fade-in ring-2 ring-primary/50"
                )}
              >
                <div className="text-xl">{icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className="text-xs font-semibold">
                      Turn {event.turn}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      {event.phase.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className={cn(
                    "text-sm leading-relaxed",
                    event.type === 'game_over' && "font-bold text-base"
                  )}>
                    {event.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
};
