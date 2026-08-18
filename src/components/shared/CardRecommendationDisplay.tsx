// Shared Card Recommendation Display Component
// Used by both Brain.tsx and Deck Analysis for consistent card display

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CardImage } from '@/components/cards';

/**
 * Cards the assistant referenced, drawn as cards.
 *
 * Both views used to hand-roll an `<img src={card.image_uri}>` — one of them
 * with `object-cover` — which bypassed the resolution table in `CardImage`,
 * bypassed the double-faced flip, and drew a `w-full h-auto` image whose
 * height was whatever the source happened to be. They go through the one card
 * component now, so a referenced card is the same object here as it is
 * everywhere else in the product.
 *
 * `image_uri` is a bare URL rather than a Scryfall `image_uris` map, so it is
 * handed over as `image_url` — the fallback `getBestCardImage` already knows.
 */

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

/** The shape `CardImage` reads, from the flat payload the assistant returns. */
function cardShapeOf(card: CardData) {
  return { name: card.name, image_url: card.image_uri };
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
            <CardImage
              key={idx}
              card={cardShapeOf(card)}
              size="sm"
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              title={card.name}
            />
          ))}
        </div>
      </div>
    );
  }

  // Full grid view with add buttons
  return (
    <div className="mt-4 space-y-3">
      {/* A tinted rule rather than `border-t`: the surface steps, it is not
          drawn on. */}
      <div className="flex items-center justify-between pt-3 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]">
        <div className="text-xs font-medium text-muted-foreground">
          Referenced Cards ({cards.length}):
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((card, idx) => (
          <div key={idx} className="group relative">
            <CardImage
              card={cardShapeOf(card)}
              size="md"
              fill
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              title={card.name}
            >
              <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="w-full truncate text-xs font-medium text-white">{card.name}</div>
              </div>
            </CardImage>
            {onAddCard && (
              <Button
                size="sm"
                variant="default"
                className="absolute right-2 top-2 z-10 h-7 w-7 p-0 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Add ${card.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddCard(card);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
