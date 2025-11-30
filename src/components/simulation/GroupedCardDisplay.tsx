import { GameCard } from '@/lib/simulation/types';
import { FullCardDisplay } from './FullCardDisplay';
import { AnimatedCard } from './AnimatedCard';
import { cn } from '@/lib/utils';

interface GroupedCardDisplayProps {
  cards: GameCard[];
  compact?: boolean;
  faceDown?: boolean;
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
}

interface CardGroup {
  card: GameCard;
  count: number;
  cards: GameCard[];
}

export const GroupedCardDisplay = ({ cards, compact = false, faceDown = false, onRegisterCard }: GroupedCardDisplayProps) => {
  console.log('[GroupedCardDisplay] Rendering:', {
    cardCount: cards.length,
    compact,
    faceDown,
    sampleCard: cards[0]?.name
  });
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
    <div className="flex gap-2 flex-wrap">
      {groupedCards.map((group) => (
        <div key={group.card.instanceId} className="relative">
          <AnimatedCard
            card={group.card} 
            compact={compact}
            faceDown={faceDown}
            onRegister={onRegisterCard}
          />
          {group.count > 1 && (
            <div className="absolute -top-1 -right-1 bg-background border-2 border-primary rounded-full w-7 h-7 flex items-center justify-center font-bold text-xs shadow-lg z-20">
              ×{group.count}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
