// Premium additions section for incomplete decks - Mobile optimized
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Package, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PowerImpactBadge } from './PowerImpactBadge';

export interface AdditionSuggestion {
  name: string;
  image: string;
  price: number;
  reason: string;
  type?: string;
  priority: 'high' | 'medium' | 'low';
  inCollection?: boolean;
  edhImpact?: number;
  category?: string;
  selected?: boolean;
}

interface AdditionsSectionProps {
  suggestions: AdditionSuggestion[];
  missingCards: number;
  onAddCard: (cardName: string) => void;
  onAddMultiple: (cardNames: string[]) => void;
  isAdding: boolean;
  currentPowerLevel?: number;
}

export function AdditionsSection({
  suggestions,
  missingCards,
  onAddCard,
  onAddMultiple,
  isAdding,
  currentPowerLevel
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
    const sorted = [...suggestions]
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, count);
    setSelectedCards(new Set(sorted.map(s => s.name)));
  };

  const addSelected = () => {
    onAddMultiple(Array.from(selectedCards));
    setSelectedCards(new Set());
  };

  const selectedImpact = useMemo(() => 
    [...selectedCards].reduce((sum, name) => {
      const card = suggestions.find(s => s.name === name);
      return sum + (card?.edhImpact || 0);
    }, 0),
    [selectedCards, suggestions]
  );

  const priorityStyles = {
    high: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', label: 'Must Add', dot: 'bg-green-500' },
    medium: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: 'Recommended', dot: 'bg-blue-500' },
    low: { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', label: 'Optional', dot: 'bg-muted-foreground' }
  };

  const grouped = suggestions.reduce((acc, s) => {
    const cat = s.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, AdditionSuggestion[]>);

  const categoryOrder = ['Essential', 'Ramp', 'Card Draw', 'Removal', 'Creatures', 'Lands', 'Other'];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a);
    const bIdx = categoryOrder.indexOf(b);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  return (
    <TooltipProvider>
      <div className="space-y-3 sm:space-y-4">
        {/* Header - Mobile optimized */}
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    <span className="truncate">Complete Your Deck</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {missingCards} needed • {suggestions.length} suggestions
                  </p>
                </div>
                {selectedCards.size > 0 && selectedImpact > 0 && (
                  <PowerImpactBadge impact={selectedImpact} size="sm" currentLevel={currentPowerLevel} animated />
                )}
              </div>
              
              {/* Action buttons - stacked on mobile */}
              <div className="flex flex-col xs:flex-row gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => selectBest(Math.min(missingCards, suggestions.length))}
                  className="flex-1 h-9 text-xs sm:text-sm"
                >
                  <Wand2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                  Select Best {Math.min(missingCards, suggestions.length)}
                </Button>
                <Button 
                  size="sm" 
                  onClick={addSelected} 
                  disabled={selectedCards.size === 0 || isAdding} 
                  className="flex-1 h-9 text-xs sm:text-sm bg-green-600 hover:bg-green-700"
                >
                  {isAdding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Add Selected ({selectedCards.size})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card list - Mobile optimized scroll */}
        <ScrollArea className="h-[60vh] sm:h-[500px]">
          <div className="space-y-4 sm:space-y-6 pr-2 sm:pr-4">
            <AnimatePresence mode="popLayout">
              {sortedCategories.map((category) => (
                <motion.div key={category} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <div className="mb-2 sm:mb-3 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1">
                    <h4 className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                      {category}
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">{grouped[category].length}</Badge>
                    </h4>
                  </div>
                  
                  {/* Responsive grid - 1 col on mobile, 2 on tablet+ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {grouped[category].map((card, idx) => {
                      const style = priorityStyles[card.priority];
                      const isSelected = selectedCards.has(card.name);
                      
                      return (
                        <motion.div
                          key={card.name}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className={cn(
                            "group relative p-2 sm:p-3 rounded-lg sm:rounded-xl border transition-all duration-200 cursor-pointer",
                            isSelected ? "border-green-500/50 bg-green-500/10" : "border-border hover:border-primary/30",
                            "active:scale-[0.98]"
                          )}
                          onClick={() => toggleCard(card.name)}
                        >
                          {/* Priority indicator */}
                          <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg sm:rounded-l-xl", style.dot)} />
                          
                          {/* Checkbox - positioned for mobile touch */}
                          <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                            <Checkbox 
                              checked={isSelected} 
                              onCheckedChange={() => toggleCard(card.name)} 
                              className="h-5 w-5 bg-background/80" 
                            />
                          </div>
                          
                          <div className="flex gap-2 sm:gap-3 pl-5 sm:pl-4">
                            {/* Card image - smaller on mobile */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="relative w-16 sm:w-24 flex-shrink-0">
                                  <img 
                                    src={card.image} 
                                    alt={card.name} 
                                    className="w-full rounded-md sm:rounded-lg shadow-md" 
                                    onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }} 
                                  />
                                  {card.inCollection && (
                                    <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] px-1 bg-blue-500">
                                      <Package className="h-2 w-2 mr-0.5" />Owned
                                    </Badge>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="p-0 hidden sm:block">
                                <img src={card.image} alt={card.name} className="w-64 rounded-lg" />
                              </TooltipContent>
                            </Tooltip>
                            
                            {/* Card details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-[9px] sm:text-xs px-1 sm:px-1.5", style.text, style.bg, style.border)}
                                >
                                  {style.label}
                                </Badge>
                                {card.edhImpact && card.edhImpact > 0 && (
                                  <PowerImpactBadge impact={card.edhImpact} size="sm" showLabel={false} />
                                )}
                              </div>
                              <p className="font-medium text-xs sm:text-sm truncate">{card.name}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">${card.price.toFixed(2)}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2 hidden xs:block">
                                {card.reason}
                              </p>
                              
                              {/* Add button */}
                              <Button 
                                size="sm" 
                                variant={isSelected ? "secondary" : "default"} 
                                className="mt-1.5 sm:mt-2 w-full h-7 sm:h-8 text-[10px] sm:text-xs" 
                                onClick={(e) => { e.stopPropagation(); onAddCard(card.name); }} 
                                disabled={isAdding}
                              >
                                <Plus className="h-3 w-3 mr-1" />Add Now
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
