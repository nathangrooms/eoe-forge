// Premium removals section for decks with too many cards
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, AlertTriangle, Loader2, TrendingDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface RemovalSuggestion {
  name: string;
  image: string;
  price: number;
  reason: string;
  type?: string;
  priority: 'high' | 'medium' | 'low';
  playability?: number | null;
  edhImpact?: number; // How much power level would drop if removed (negative is good)
  selected?: boolean;
}

interface RemovalsSectionProps {
  suggestions: RemovalSuggestion[];
  excessCards: number;
  onRemoveCard: (cardName: string) => void;
  onRemoveMultiple: (cardNames: string[]) => void;
  isRemoving: boolean;
}

export function RemovalsSection({
  suggestions,
  excessCards,
  onRemoveCard,
  onRemoveMultiple,
  isRemoving
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
    const sorted = [...suggestions]
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, count);
    setSelectedCards(new Set(sorted.map(s => s.name)));
  };

  const removeSelected = () => {
    onRemoveMultiple(Array.from(selectedCards));
    setSelectedCards(new Set());
  };

  const priorityStyles = {
    high: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Cut First' },
    medium: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'Consider Cutting' },
    low: { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'Optional Cut' }
  };

  return (
    <div className="space-y-4">
      {/* Header with quick actions */}
      <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Deck Overloaded
              </h3>
              <p className="text-sm text-muted-foreground">
                Remove {excessCards} cards • {suggestions.length} candidates identified
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectWorst(Math.min(excessCards, suggestions.length))}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Select Worst {Math.min(excessCards, suggestions.length)}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={removeSelected}
                disabled={selectedCards.size === 0 || isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Remove Selected ({selectedCards.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Removal suggestions */}
      <ScrollArea className="h-[500px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-4">
          <AnimatePresence mode="popLayout">
            {suggestions.map((card, idx) => {
              const style = priorityStyles[card.priority];
              const isSelected = selectedCards.has(card.name);
              
              return (
                <motion.div
                  key={card.name}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, height: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className={cn(
                    "group relative p-3 rounded-xl border transition-all duration-200",
                    isSelected ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-destructive/30",
                    "hover:shadow-lg"
                  )}
                >
                  {/* Selection checkbox */}
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleCard(card.name)}
                      className="h-5 w-5 bg-background/80 backdrop-blur-sm"
                    />
                  </div>

                  <div className="flex gap-3">
                    {/* Card image */}
                    <div className="relative w-20 flex-shrink-0">
                      <img
                        src={card.image}
                        alt={card.name}
                        className={cn(
                          "w-full rounded-lg shadow-md transition-all",
                          isSelected && "opacity-50 grayscale"
                        )}
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Trash2 className="h-8 w-8 text-destructive" />
                        </div>
                      )}
                    </div>

                    {/* Card info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5", style.text, style.bg, style.border)}>
                          {style.label}
                        </Badge>
                        {card.playability !== null && card.playability !== undefined && (
                          <Badge variant="outline" className="text-[10px] px-1.5 text-orange-400 bg-orange-500/10 border-orange-500/30">
                            <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                            {card.playability}%
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm truncate">{card.name}</p>
                      <p className="text-xs text-muted-foreground">${card.price.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.reason}</p>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 w-full h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemoveCard(card.name)}
                        disabled={isRemoving}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
