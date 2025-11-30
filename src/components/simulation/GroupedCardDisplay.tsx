import { GameCard } from '@/lib/simulation/types';
import { FullCardDisplay } from './FullCardDisplay';
import { AnimatedCard } from './AnimatedCard';
import { cn } from '@/lib/utils';

interface GroupedCardDisplayProps {
  cards: GameCard[];
  compact?: boolean;
  faceDown?: boolean;
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
  damages?: Map<string, Array<{ id: string; amount: number; timestamp: number }>>;
  attackers?: any[];
  blockers?: any[];
}

interface CardGroup {
  card: GameCard;
  count: number;
  cards: GameCard[];
}

export const GroupedCardDisplay = ({ 
  cards, 
  compact = false, 
  faceDown = false, 
  onRegisterCard, 
  damages = new Map(), 
  attackers = [], 
  blockers = [] 
}: GroupedCardDisplayProps) => {
  // Group cards by name
  const groupedCards = cards.reduce((acc, card) => {
    const existing = acc.find(g => g.card.name === card.name);
    if (existing) {
      existing.count++;
      existing.cards.push(card);
    } else {
      acc.push({
        card,
        count: 1,
        cards: [card]
      });
    }
    return acc;
  }, [] as CardGroup[]);

  return (
    <div className="flex gap-1.5 items-start flex-row flex-nowrap">
      {groupedCards.map((group) => {
        const isAttacking = attackers.some(a => a.instanceId === group.card.instanceId);
        const isBlocking = blockers.some(b => b.blocker === group.card.instanceId);

        return (
          <div key={group.card.instanceId} className="relative shrink-0">
            <AnimatedCard
              card={group.card} 
              compact={compact}
              faceDown={faceDown}
              onRegister={onRegisterCard}
              damages={damages.get(group.card.instanceId)}
              isAttacking={isAttacking}
              isBlocking={isBlocking}
            />
            {group.count > 1 && (
              <div className="absolute -top-1 -right-1 bg-background border-2 border-primary rounded-full w-6 h-6 flex items-center justify-center font-bold text-[10px] shadow-lg z-20">
                ×{group.count}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
