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
      "border rounded-lg p-2",
      compact ? "bg-background/30" : "bg-background/50"
    )}>
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
        {title} ({cards.length})
      </div>
      <div className={cn(
        "flex gap-2 overflow-x-auto",
        compact ? "flex-wrap" : "min-h-[140px]"
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
