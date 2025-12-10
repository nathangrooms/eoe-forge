// Premium removals section for decks with too many cards - Mobile optimized
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
  edhImpact?: number;
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
    medium: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'Consider' },
    low: { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'Optional' }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header - Mobile optimized */}
      <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive flex-shrink-0" />
                  <span className="truncate">Deck Overloaded</span>
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Remove {excessCards} cards • {suggestions.length} candidates
                </p>
              </div>
            </div>
            
            {/* Action buttons - stacked on mobile */}
            <div className="flex flex-col xs:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectWorst(Math.min(excessCards, suggestions.length))}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                Select Worst {Math.min(excessCards, suggestions.length)}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={removeSelected}
                disabled={selectedCards.size === 0 || isRemoving}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Remove ({selectedCards.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Removal suggestions - Mobile optimized */}
      <ScrollArea className="h-[60vh] sm:h-[500px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 pr-2 sm:pr-4">
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
                    "group relative p-2 sm:p-3 rounded-lg sm:rounded-xl border transition-all duration-200 cursor-pointer",
                    isSelected ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-destructive/30",
                    "active:scale-[0.98]"
                  )}
                  onClick={() => toggleCard(card.name)}
                >
                  {/* Selection checkbox */}
                  <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleCard(card.name)}
                      className="h-5 w-5 bg-background/80 backdrop-blur-sm"
                    />
                  </div>

                  <div className="flex gap-2 sm:gap-3 pl-5">
                    {/* Card image - smaller on mobile */}
                    <div className="relative w-14 sm:w-20 flex-shrink-0">
                      <img
                        src={card.image}
                        alt={card.name}
                        className={cn(
                          "w-full rounded-md sm:rounded-lg shadow-md transition-all",
                          isSelected && "opacity-50 grayscale"
                        )}
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Trash2 className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
                        </div>
                      )}
                    </div>

                    {/* Card info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5 sm:mb-1 flex-wrap">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[9px] sm:text-[10px] px-1 sm:px-1.5", style.text, style.bg, style.border)}
                        >
                          {style.label}
                        </Badge>
                        {card.playability !== null && card.playability !== undefined && (
                          <Badge 
                            variant="outline" 
                            className="text-[9px] sm:text-[10px] px-1 text-orange-400 bg-orange-500/10 border-orange-500/30"
                          >
                            <TrendingDown className="h-2 w-2 sm:h-2.5 sm:w-2.5 mr-0.5" />
                            {card.playability}%
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-xs sm:text-sm truncate">{card.name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">${card.price.toFixed(2)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2 hidden xs:block">
                        {card.reason}
                      </p>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1.5 sm:mt-2 w-full h-7 sm:h-8 text-[10px] sm:text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onRemoveCard(card.name); }}
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
