import { GameCard } from '@/lib/simulation/types';
import { FullCardDisplay } from './FullCardDisplay';
import { cn } from '@/lib/utils';

interface ZoneSectionProps {
  title: string;
  cards: GameCard[];
  orientation: 'top' | 'bottom';
  compact?: boolean;
}

export const ZoneSection = ({ title, cards, orientation, compact = false }: ZoneSectionProps) => {
  if (cards.length === 0) return null;

  const isTop = orientation === 'top';

  return (
    <div className={cn(
      "border-2 rounded-xl p-4",
      compact ? "bg-muted/20" : "bg-muted/30",
      "border-border/40"
    )}>
      <div className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
        <span className="text-primary">{title}</span>
        <span className="text-muted-foreground text-xs">({cards.length})</span>
      </div>
      <div className={cn(
        "flex gap-3 overflow-x-auto pb-2",
        compact ? "flex-wrap" : "min-h-[200px]",
        "scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
      )}>
        {cards.map((card) => (
          <FullCardDisplay
            key={card.instanceId}
            card={card}
            compact={compact}
            faceDown={isTop && card.zone === 'hand'}
          />
        ))}
      </div>
    </div>
  );
};
