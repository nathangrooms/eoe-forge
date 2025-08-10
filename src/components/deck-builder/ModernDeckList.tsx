import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Skull,
  Download,
  Upload,
  Trash2,
  Search
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { CardPreview } from './CardPreview';

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
  { range: '8+', label: '8+ CMC', min: 8, max: 99 }
];

export const ModernDeckList = () => {
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
  const [searchTerm, setSearchTerm] = useState('');

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Group cards by category
  const groupedCards = deck.cards.reduce((groups, card) => {
    const category = card.category || 'other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(card);
    return groups;
  }, {} as Record<string, any[]>);

  // Filter cards by search term
  const filterCards = (cards: any[]) => {
    if (!searchTerm) return cards;
    return cards.filter(card => 
      card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.type_line.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.mechanics?.some((m: string) => m.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  const renderCategoryHeader = (category: string, count: number) => {
    const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || Gem;
    const isExpanded = expandedCategories[category];

    return (
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
        onClick={() => toggleCategory(category)}
      >
        <div className="flex items-center space-x-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Icon className="h-5 w-5 text-primary" />
          <span className="font-medium capitalize text-lg">{category}</span>
          <Badge variant="outline" className="ml-auto">
            {count}
          </Badge>
        </div>
      </div>
    );
  };

  const renderCreatureBuckets = (creatures: any[]) => {
    const filteredCreatures = filterCards(creatures);
    
    return (
      <div className="space-y-4 ml-8">
        {CMC_BUCKETS.map((bucket) => {
          const bucketCreatures = filteredCreatures.filter(
            card => card.cmc >= bucket.min && card.cmc <= bucket.max
          );

          if (bucketCreatures.length === 0) return null;

          return (
            <div key={bucket.range} className="border-l-2 border-primary/20 pl-4">
              <div className="text-sm font-medium mb-3 text-muted-foreground">
                {bucket.label} ({bucketCreatures.length} cards)
              </div>
              <div className="space-y-2">
                {bucketCreatures.map((card) => (
                  <div key={card.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-mono w-6">{card.quantity}x</span>
                      <div>
                        <div className="font-medium">{card.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {card.power && card.toughness && `${card.power}/${card.toughness} • `}
                          CMC {card.cmc}
                        </div>
                      </div>
                      {card.mechanics?.length > 0 && (
                        <div className="flex space-x-1">
                          {card.mechanics.slice(0, 2).map((mechanic: string) => (
                            <Badge key={mechanic} variant="secondary" className="text-xs">
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
                        className="h-8 w-8 p-0"
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
                        className="h-8 w-8 p-0"
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
    const filteredCards = filterCards(cards);
    
    return (
      <div className="space-y-2 ml-8">
        {filteredCards.map((card) => (
          <div key={card.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-mono w-6">{card.quantity}x</span>
              <div>
                <div className="font-medium">{card.name}</div>
                <div className="text-xs text-muted-foreground">
                  {card.type_line} • CMC {card.cmc}
                </div>
              </div>
              {card.mechanics?.length > 0 && (
                <div className="flex space-x-1">
                  {card.mechanics.slice(0, 2).map((mechanic: string) => (
                    <Badge key={mechanic} variant="secondary" className="text-xs">
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
                className="h-8 w-8 p-0"
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
                className="h-8 w-8 p-0"
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

  const categories = ['creatures', 'lands', 'instants', 'sorceries', 'enchantments', 'artifacts', 'planeswalkers', 'battles'];

  return (
    <div className="space-y-6">
      {/* Deck Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{deck.name}</h2>
          <p className="text-muted-foreground">
            {deck.totalCards} cards • Power Level {deck.powerLevel}/10 • {deck.format}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => deck.clearDeck()}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search your deck..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((category) => {
          const cards = groupedCards[category] || [];
          if (cards.length === 0) return null;
          
          return (
            <Card key={category} className="overflow-hidden">
              {renderCategoryHeader(category, cards.length)}
              {expandedCategories[category] && (
                <div className="pb-4">
                  {category === 'creatures' ? 
                    renderCreatureBuckets(cards) : 
                    renderCardList(cards)
                  }
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {deck.cards.length === 0 && (
        <Card className="p-12 text-center">
          <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-medium mb-2">Start Building Your Deck</h3>
          <p className="text-muted-foreground">
            Search for cards in the Card Database tab and add them to begin building your Edge of Eternities deck.
          </p>
        </Card>
      )}
    </div>
  );
};