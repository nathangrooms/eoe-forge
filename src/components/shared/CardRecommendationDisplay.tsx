// Shared Card Recommendation Display Component
// Used by both Brain.tsx and Deck Analysis for consistent card display

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Plus } from 'lucide-react';

export interface CardData {
  name: string;
  image_uri?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  cmc?: number;
  colors?: string[];
  rarity?: string;
}

interface CardRecommendationDisplayProps {
  cards: CardData[];
  onCardClick?: (card: CardData) => void;
  onAddCard?: (card: CardData) => void;
  compact?: boolean;
}

export function CardRecommendationDisplay({
  cards,
  onCardClick,
  onAddCard,
  compact = false
}: CardRecommendationDisplayProps) {
  if (!cards || cards.length === 0) return null;

  if (compact) {
    // Compact horizontal scrollable view
    return (
      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">
          Referenced Cards ({cards.length}):
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="relative flex-shrink-0 w-32 group cursor-pointer"
              onClick={() => onCardClick?.(card)}
            >
              <img
                src={card.image_uri || '/placeholder.svg'}
                alt={card.name}
                className="w-full h-auto rounded-lg border-2 border-border hover:border-primary transition-all shadow-sm group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-end justify-center pb-2">
                <Eye className="h-4 w-4 text-white" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full grid view with add buttons
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between border-t pt-3">
        <div className="text-xs font-medium text-muted-foreground">
          Referenced Cards ({cards.length}):
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {cards.map((card, idx) => (
          <Card
            key={idx}
            className="group overflow-hidden hover:shadow-lg transition-all cursor-pointer border-2 hover:border-spacecraft"
          >
            <CardContent className="p-0 relative">
              <div onClick={() => onCardClick?.(card)}>
                <img
                  src={card.image_uri || '/placeholder.svg'}
                  alt={card.name}
                  className="w-full h-auto object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <div className="text-white text-xs font-medium truncate w-full">
                    {card.name}
                  </div>
                </div>
              </div>
              {onAddCard && (
                <Button
                  size="sm"
                  variant="default"
                  className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddCard(card);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
