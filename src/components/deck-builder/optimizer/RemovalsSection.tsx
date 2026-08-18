/**
 * Cards to cut, as cards.
 *
 * Same rebuild as the additions grid: the 56–80px thumbnail is replaced by the
 * real card at `lg`, because deciding whether to cut something means looking at
 * it. Selected cards grey out so a pending cut reads at a glance.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Wand2 } from 'lucide-react';
import { CardGrid } from '@/components/cards';
import { motion, AnimatePresence } from 'framer-motion';
import { SuggestionTile, TilePill } from './SuggestionTile';
import { playabilityBand } from '@/lib/deck/playabilityView';
import { cn } from '@/lib/utils';

export interface RemovalSuggestion {
  name: string;
  /** Full card object for `<CardImage>`. */
  card: any;
  price: number | null;
  reason: string;
  type?: string;
  priority: 'high' | 'medium' | 'low';
  /**
   * Measured castability on this deck's own mana base, computed locally by
   * `playability.ts`. Not, as this comment used to say, the figure from the
   * EDH analysis — that was the old source and it was a third-party scrape.
   */
  playability?: number | null;
  /** The model's estimate, or `null` when it gave none. Never a constant. */
  edhImpact?: number | null;
  selected?: boolean;
}

interface RemovalsSectionProps {
  suggestions: RemovalSuggestion[];
  excessCards: number;
  onRemoveCard: (cardName: string) => void;
  onRemoveMultiple: (cardNames: string[]) => void;
  isRemoving: boolean;
}

const PRIORITY_LABEL = {
  high: 'Cut first',
  medium: 'Consider',
  low: 'Optional',
} as const;

export function RemovalsSection({
  suggestions,
  excessCards,
  onRemoveCard,
  onRemoveMultiple,
  isRemoving,
}: RemovalsSectionProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  const toggleCard = (name: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectWorst = (count: number) => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const sorted = [...suggestions]
      .sort((a, b) => order[a.priority] - order[b.priority])
      .slice(0, count);
    setSelectedCards(new Set(sorted.map(s => s.name)));
  };

  const removeSelected = () => {
    onRemoveMultiple(Array.from(selectedCards));
    setSelectedCards(new Set());
  };

  const worstCount = Math.min(excessCards, suggestions.length);

  return (
    <div className="space-y-6">
      <Card className="sticky top-2 z-20 bg-card/95 shadow-lg backdrop-blur">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold">Deck is over the limit</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {excessCards} card{excessCards === 1 ? '' : 's'} to cut ·{' '}
              {suggestions.length} candidate{suggestions.length === 1 ? '' : 's'}
              {selectedCards.size > 0 && <> · {selectedCards.size} selected</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {worstCount > 0 && (
              <Button variant="outline" size="lg" onClick={() => selectWorst(worstCount)}>
                <Wand2 className="mr-2 h-4 w-4" />
                Select worst {worstCount}
              </Button>
            )}
            <Button
              size="lg"
              variant="destructive"
              onClick={removeSelected}
              disabled={selectedCards.size === 0 || isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remove {selectedCards.size > 0 ? selectedCards.size : ''} card
              {selectedCards.size === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CardGrid width={260} gap={20}>
        <AnimatePresence mode="popLayout">
          {suggestions.map(card => (
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
                dimmed
                selected={selectedCards.has(card.name)}
                onToggle={() => toggleCard(card.name)}
                tags={
                  <>
                    <TilePill tone={card.priority === 'high' ? 'danger' : 'default'}>
                      {PRIORITY_LABEL[card.priority]}
                    </TilePill>
                    {card.playability !== null && card.playability !== undefined && (
                      <TilePill title="Castability on this deck's mana base">
                        <span
                          className={cn(
                            'tabular-nums',
                            playabilityBand(card.playability).textClass
                          )}
                        >
                          {card.playability.toFixed(0)}% castable
                        </span>
                      </TilePill>
                    )}
                  </>
                }
                action={
                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    onClick={() => onRemoveCard(card.name)}
                    disabled={isRemoving}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </CardGrid>
    </div>
  );
}
