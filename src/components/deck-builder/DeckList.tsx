import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Minus,
  Crown,
  Swords,
  Shield,
  Scroll,
  Gem,
  Sparkles,
  Mountain,
  Users,
  Skull
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';

const CATEGORY_ICONS = {
  commander: Crown,
  lands: Mountain,
  creatures: Users,
  instants: Sparkles,
  sorceries: Scroll,
  enchantments: Gem,
  artifacts: Shield,
  planeswalkers: Swords,
  battles: Skull
};

const CMC_BUCKETS = [
  { range: '0-1', label: '0-1 CMC', min: 0, max: 1 },
  { range: '2', label: '2 CMC', min: 2, max: 2 },
  { range: '3', label: '3 CMC', min: 3, max: 3 },
  { range: '4', label: '4 CMC', min: 4, max: 4 },
  { range: '5', label: '5 CMC', min: 5, max: 5 },
  { range: '6-7', label: '6-7 CMC', min: 6, max: 7 },
  { range: '8-9', label: '8-9 CMC', min: 8, max: 9 },
  { range: '10+', label: '10+ CMC', min: 10, max: 99 }
];

interface DeckCategory {
  name: string;
  cards: Array<{
    id: string;
    name: string;
    cmc: number;
    quantity: number;
    type: string;
    colors: string[];
    mechanics: string[];
  }>;
  expanded: boolean;
}

export const DeckList = () => {
  const deck = useDeckStore();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    creatures: true,
    lands: true,
    instants: true,
    sorceries: true,
    enchantments: false,
    artifacts: false,
    planeswalkers: false,
    battles: false
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const renderCategoryHeader = (category: string, count: number) => {
    const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || Gem;
    const isExpanded = expandedCategories[category];

    return (
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 rounded-lg"
        onClick={() => toggleCategory(category)}
      >
        <div className="flex items-center space-x-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium capitalize">{category}</span>
          <Badge variant="outline" className="text-xs">
            {count}
          </Badge>
        </div>
      </div>
    );
  };

  const renderCreatureBuckets = (creatures: any[]) => {
    return (
      <div className="space-y-2 ml-6">
        {CMC_BUCKETS.map((bucket) => {
          const bucketCreatures = creatures.filter(
            card => card.cmc >= bucket.min && card.cmc <= bucket.max
          );

          if (bucketCreatures.length === 0) return null;

          return (
            <div key={bucket.range} className="border-l-2 border-muted pl-4">
              <div className="text-sm text-muted-foreground mb-2 font-medium">
                {bucket.label} ({bucketCreatures.length})
              </div>
              <div className="space-y-1">
                {bucketCreatures.map((card) => (
                  <div key={card.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">{card.quantity}x</span>
                      <span className="text-sm font-medium">{card.name}</span>
                      {card.mechanics.length > 0 && (
                        <div className="flex space-x-1">
                          {card.mechanics.slice(0, 2).map((mechanic) => (
                            <Badge key={mechanic} variant="secondary" className="text-xs px-1 py-0">
                              {mechanic}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deck.removeCard(card.id);
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deck.addCard(card);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCardList = (cards: any[]) => {
    return (
      <div className="space-y-1 ml-6">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div className="flex items-center space-x-2">
              <span className="text-sm">{card.quantity}x</span>
              <span className="text-sm font-medium">{card.name}</span>
              <span className="text-xs text-muted-foreground">({card.cmc})</span>
              {card.mechanics.length > 0 && (
                <div className="flex space-x-1">
                  {card.mechanics.slice(0, 2).map((mechanic) => (
                    <Badge key={mechanic} variant="secondary" className="text-xs px-1 py-0">
                      {mechanic}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  deck.removeCard(card.id);
                }}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  deck.addCard(card);
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Group actual deck cards by category
  const groupedCards = deck.cards.reduce((groups, card) => {
    const category = card.category || 'other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(card);
    return groups;
  }, {} as Record<string, any[]>);

  const categories = ['creatures', 'lands', 'instants', 'sorceries', 'enchantments', 'artifacts', 'planeswalkers', 'battles'];

  return (
    <div className="space-y-1">
      {categories.map((category) => {
        const cards = groupedCards[category] || [];
        if (cards.length === 0) return null;
        
        return (
          <div key={category}>
            {renderCategoryHeader(category, cards.length)}
            {expandedCategories[category] && (
              <div className="pb-2">
                {category === 'creatures' ? 
                  renderCreatureBuckets(cards) : 
                  renderCardList(cards)
                }
              </div>
            )}
          </div>
        );
      })}

      {/* Empty State */}
      {deck.cards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Start Building Your Deck</h3>
          <p className="text-sm">Search for cards and add them to begin building your Magic deck.</p>
        </div>
      )}
    </div>
  );
};