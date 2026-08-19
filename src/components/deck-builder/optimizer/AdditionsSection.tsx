/**
 * Cards to add, as cards.
 *
 * Was a two-column list of 96px thumbnails with 10px reason text inside a
 * 500px inner scroller. Now it is a real card grid at `lg` — the art is the
 * thing you are judging, so the art is what the layout is built from.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Package, Wand2 } from 'lucide-react';
import { CardGrid } from '@/components/cards';
import { motion, AnimatePresence } from 'framer-motion';
import { SuggestionTile, TilePill } from './SuggestionTile';
import { PowerImpactBadge } from './PowerImpactBadge';
import { playabilityBand } from '@/lib/deck/playabilityView';
import type { CardPlayability } from '@/lib/deck/playability';
import { cn } from '@/lib/utils';

export interface AdditionSuggestion {
  name: string;
  /** Full card object for `<CardImage>`. */
  card: any;
  /** `null` when Scryfall reports no USD price. Never coerced to 0. */
  price: number | null;
  reason: string;
  type?: string;
  priority: 'high' | 'medium' | 'low';
  inCollection?: boolean;
  /** The model's estimate, or `null` when it gave none. */
  edhImpact?: number | null;
  category?: string;
  /** Computed: how castable this card is on the deck's existing mana base. */
  castability?: CardPlayability | null;
  selected?: boolean;
}

interface AdditionsSectionProps {
  suggestions: AdditionSuggestion[];
  missingCards: number;
  /** The deck these were suggested for, kept as the reason on the shopping list. */
  deckId?: string | null;
  onAddCard: (cardName: string) => void;
  onAddMultiple: (cardNames: string[]) => void;
  isAdding: boolean;
}

const PRIORITY_LABEL = {
  high: 'Must add',
  medium: 'Recommended',
  low: 'Optional',
} as const;

const CATEGORY_ORDER = [
  'Essential',
  'Ramp',
  'Card Draw',
  'Removal',
  'Creatures',
  'Lands',
  'Other',
];

export function AdditionsSection({
  suggestions,
  missingCards,
  deckId,
  onAddCard,
  onAddMultiple,
  isAdding,
}: AdditionsSectionProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  const toggleCard = (name: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectBest = (count: number) => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const sorted = [...suggestions]
      .sort((a, b) => order[a.priority] - order[b.priority])
      .slice(0, count);
    setSelectedCards(new Set(sorted.map(s => s.name)));
  };

  const addSelected = () => {
    onAddMultiple(Array.from(selectedCards));
    setSelectedCards(new Set());
  };

  const grouped = suggestions.reduce((acc, s) => {
    const cat = s.category || 'Other';
    (acc[cat] ||= []).push(s);
    return acc;
  }, {} as Record<string, AdditionSuggestion[]>);

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const bestCount = Math.min(missingCards, suggestions.length);

  return (
    <div className="space-y-6">
      <Card className="sticky top-2 z-20 bg-card/95 shadow-lg backdrop-blur">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold">Complete your deck</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {missingCards} card{missingCards === 1 ? '' : 's'} needed ·{' '}
              {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
              {selectedCards.size > 0 && <> · {selectedCards.size} selected</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {bestCount > 0 && (
              <Button variant="outline" size="lg" onClick={() => selectBest(bestCount)}>
                <Wand2 className="mr-2 h-4 w-4" />
                Select best {bestCount}
              </Button>
            )}
            <Button
              size="lg"
              onClick={addSelected}
              disabled={selectedCards.size === 0 || isAdding}
            >
              {isAdding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add {selectedCards.size > 0 ? selectedCards.size : ''} card
              {selectedCards.size === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {sortedCategories.map(category => (
        <section key={category} className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {category} · {grouped[category].length}
          </h4>

          <CardGrid width={260} gap={20}>
            <AnimatePresence mode="popLayout">
              {grouped[category].map(card => (
                <motion.div
                  key={card.name}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                >
                  <SuggestionTile
                    name={card.name}
                    card={card.card}
                    price={card.price}
                    reason={card.reason}
                    selected={selectedCards.has(card.name)}
                    onToggle={() => toggleCard(card.name)}
                    offerLists
                    deckId={deckId}
                    tags={
                      <>
                        <TilePill>{PRIORITY_LABEL[card.priority]}</TilePill>
                        {card.inCollection && (
                          <TilePill>
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              Owned
                            </span>
                          </TilePill>
                        )}
                        <PowerImpactBadge impact={card.edhImpact} />
                      </>
                    }
                    footnote={
                      /* Castability is only worth a line when it is a problem.
                         A 97% two-drop does not need telling. */
                      card.castability &&
                      card.castability.pct !== null &&
                      card.castability.pct < 65 ? (
                        <p
                          className={cn(
                            'text-sm font-medium tabular-nums',
                            playabilityBand(card.castability.pct).textClass
                          )}
                        >
                          Castable turn {card.castability.turn} in{' '}
                          {card.castability.pct.toFixed(0)}% of games on your mana base
                        </p>
                      ) : null
                    }
                    action={
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => onAddCard(card.name)}
                        disabled={isAdding}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add now
                      </Button>
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </CardGrid>
        </section>
      ))}
    </div>
  );
}
