import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeckCard {
  id: string;
  name: string;
  quantity: number;
  cmc: number;
  type_line: string;
  colors: string[];
  mana_cost?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
  };
}

interface DeckCardDisplayProps {
  cards: DeckCard[];
  onQuantityChange?: (cardId: string, delta: number) => void;
  onRemove?: (cardId: string) => void;
  groupBy?: 'type' | 'cmc' | 'color' | 'none';
  compact?: boolean;
}

export function DeckCardDisplay({
  cards,
  onQuantityChange,
  onRemove,
  groupBy = 'type',
  compact = false
}: DeckCardDisplayProps) {
  
  const groupCards = (cards: DeckCard[]) => {
    if (groupBy === 'none') {
      return { 'All Cards': cards };
    }

    const groups: Record<string, DeckCard[]> = {};
    
    cards.forEach(card => {
      let groupKey = 'Other';
      
      if (groupBy === 'type') {
        if (card.type_line.toLowerCase().includes('creature')) groupKey = 'Creatures';
        else if (card.type_line.toLowerCase().includes('land')) groupKey = 'Lands';
        else if (card.type_line.toLowerCase().includes('instant')) groupKey = 'Instants';
        else if (card.type_line.toLowerCase().includes('sorcery')) groupKey = 'Sorceries';
        else if (card.type_line.toLowerCase().includes('artifact')) groupKey = 'Artifacts';
        else if (card.type_line.toLowerCase().includes('enchantment')) groupKey = 'Enchantments';
        else if (card.type_line.toLowerCase().includes('planeswalker')) groupKey = 'Planeswalkers';
      } else if (groupBy === 'cmc') {
        groupKey = `${card.cmc} CMC`;
      } else if (groupBy === 'color') {
        if (card.colors.length === 0) groupKey = 'Colorless';
        else if (card.colors.length === 1) groupKey = card.colors[0];
        else groupKey = 'Multicolor';
      }
      
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(card);
    });
    
    return groups;
  };

  const grouped = groupCards(cards);
  const sortedGroups = Object.entries(grouped).sort((a, b) => {
    // Sort lands last, then by group name
    if (a[0] === 'Lands') return 1;
    if (b[0] === 'Lands') return -1;
    return a[0].localeCompare(b[0]);
  });

  if (cards.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">No cards in deck</p>
        <p className="text-sm text-muted-foreground mt-2">
          Search for cards and add them to your deck
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedGroups.map(([groupName, groupCards]) => (
        <div key={groupName} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              {groupName}
            </h3>
            <Badge variant="outline" className="font-mono text-xs">
              {groupCards.reduce((sum, card) => sum + card.quantity, 0)}
            </Badge>
          </div>
          
          <div className={cn(
            "space-y-1",
            compact && "space-y-0.5"
          )}>
            {groupCards.sort((a, b) => a.name.localeCompare(b.name)).map(card => (
              <Card 
                key={card.id}
                className={cn(
                  "group hover:shadow-md transition-all",
                  compact ? "p-2" : "p-3"
                )}
              >
                <CardContent className="p-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {card.image_uris?.small && !compact && (
                      <img 
                        src={card.image_uris.small} 
                        alt={card.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium truncate",
                          compact ? "text-sm" : "text-base"
                        )}>
                          {card.name}
                        </span>
                        {card.mana_cost && !compact && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {card.mana_cost}
                          </span>
                        )}
                      </div>
                      {!compact && (
                        <p className="text-xs text-muted-foreground truncate">
                          {card.type_line}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {onQuantityChange && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className={cn(
                            "opacity-0 group-hover:opacity-100 transition-opacity",
                            compact ? "h-6 w-6" : "h-8 w-8"
                          )}
                          onClick={() => onQuantityChange(card.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        
                        <span className={cn(
                          "font-mono font-medium min-w-[2ch] text-center",
                          compact ? "text-sm" : "text-base"
                        )}>
                          {card.quantity}
                        </span>
                        
                        <Button
                          size="icon"
                          variant="outline"
                          className={cn(
                            "opacity-0 group-hover:opacity-100 transition-opacity",
                            compact ? "h-6 w-6" : "h-8 w-8"
                          )}
                          onClick={() => onQuantityChange(card.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    {onRemove && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "opacity-0 group-hover:opacity-100 transition-opacity text-destructive",
                          compact ? "h-6 w-6" : "h-8 w-8"
                        )}
                        onClick={() => onRemove(card.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
