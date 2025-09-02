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
  commanders: Crown,
  lands: Mountain,
  creatures: Users,
  instants: Sparkles,
  sorceries: Scroll,
  enchantments: Gem,
  artifacts: Shield,
  planeswalkers: Swords,
  battles: Skull
};

const CATEGORY_COLORS = {
  commanders: 'border-l-4 rounded-lg overflow-hidden',
  lands: 'border-l-4 rounded-lg overflow-hidden', 
  creatures: 'border-l-4 rounded-lg overflow-hidden',
  instants: 'border-l-4 rounded-lg overflow-hidden',
  sorceries: 'border-l-4 rounded-lg overflow-hidden',
  enchantments: 'border-l-4 rounded-lg overflow-hidden',
  artifacts: 'border-l-4 rounded-lg overflow-hidden',
  planeswalkers: 'border-l-4 rounded-lg overflow-hidden',
  battles: 'border-l-4 rounded-lg overflow-hidden'
};

const getCategoryStyle = (category: string) => {
  const styles = {
    commanders: {
      borderLeftColor: '#eab308', // Golden yellow
      background: 'linear-gradient(to right, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.1))'
    },
    lands: {
      borderLeftColor: '#d97706', // Orange (matching your reference)
      background: 'linear-gradient(to right, rgba(217, 119, 6, 0.2), rgba(217, 119, 6, 0.1))'
    },
    creatures: {
      borderLeftColor: '#16a34a', // Green (matching your reference)
      background: 'linear-gradient(to right, rgba(22, 163, 74, 0.2), rgba(22, 163, 74, 0.1))'
    },
    instants: {
      borderLeftColor: '#2563eb', // Blue (matching your reference)
      background: 'linear-gradient(to right, rgba(37, 99, 235, 0.2), rgba(37, 99, 235, 0.1))'
    },
    sorceries: {
      borderLeftColor: '#dc2626', // Red (matching your reference)
      background: 'linear-gradient(to right, rgba(220, 38, 38, 0.2), rgba(220, 38, 38, 0.1))'
    },
    enchantments: {
      borderLeftColor: '#9333ea', // Purple (matching your reference)
      background: 'linear-gradient(to right, rgba(147, 51, 234, 0.2), rgba(147, 51, 234, 0.1))'
    },
    artifacts: {
      borderLeftColor: '#6b7280', // Grey (matching your reference)
      background: 'linear-gradient(to right, rgba(107, 114, 128, 0.2), rgba(107, 114, 128, 0.1))'
    },
    planeswalkers: {
      borderLeftColor: '#ec4899', // Pink (matching your reference)
      background: 'linear-gradient(to right, rgba(236, 72, 153, 0.2), rgba(236, 72, 153, 0.1))'
    },
    battles: {
      borderLeftColor: '#f97316', // Orange
      background: 'linear-gradient(to right, rgba(249, 115, 22, 0.2), rgba(249, 115, 22, 0.1))'
    }
  };
  
  return styles[category as keyof typeof styles] || styles.creatures;
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
  const [viewMode, setViewMode] = useState<'list' | 'visual'>('visual');

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
        className="flex items-center justify-between p-4 cursor-pointer transition-all duration-300 hover:opacity-80"
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

  const categories = ['commanders', 'creatures', 'lands', 'instants', 'sorceries', 'enchantments', 'artifacts', 'planeswalkers', 'battles'];

  const renderVisualCards = (cards: any[]) => {
    const filteredCards = filterCards(cards);
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 ml-8 p-4">
        {filteredCards.map((card) => (
          <div key={card.id} className="relative group">
            <div className="aspect-[5/7] rounded-lg overflow-hidden bg-card/50 hover:shadow-lg transition-all duration-200 border border-border/50">
              {card.image_uris?.normal ? (
                <img 
                  src={card.image_uris.normal} 
                  alt={card.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-full h-full flex items-center justify-center text-center p-2 ${card.image_uris?.normal ? 'hidden' : ''}`}>
                <span className="text-xs font-medium text-foreground">{card.name}</span>
              </div>
              {card.quantity > 1 && (
                <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs font-bold rounded px-1">
                  {card.quantity}
                </div>
              )}
            </div>
            <p className="text-xs text-center mt-1 truncate text-foreground">{card.name}</p>
            <p className="text-xs text-center text-muted-foreground">CMC {card.cmc}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Deck Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Deck List</h2>
          <p className="text-muted-foreground">
            {deck.totalCards} cards total
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'visual')}>
            <TabsList>
              <TabsTrigger value="list" className="flex items-center space-x-2">
                <span>List</span>
              </TabsTrigger>
              <TabsTrigger value="visual" className="flex items-center space-x-2">
                <span>Visual</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
      <div className="space-y-3">
        {categories.map((category) => {
          const cards = groupedCards[category] || [];
          if (cards.length === 0) return null;
          
          console.log(`Category: ${category}, Colors being applied:`, getCategoryStyle(category));
          const colorClass = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] || 'border-l-4 rounded-lg overflow-hidden';
          const categoryStyle = getCategoryStyle(category);
          
          return (
            <div key={category} className={colorClass} style={{...categoryStyle, border: '2px solid red'}}>
              {renderCategoryHeader(category, cards.length)}
              {expandedCategories[category] && (
                <div className="pb-4">
                  {viewMode === 'visual' ? 
                    renderVisualCards(cards) :
                    (category === 'creatures' ? 
                      renderCreatureBuckets(cards) : 
                      renderCardList(cards))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {deck.cards.length === 0 && (
        <Card className="p-12 text-center">
          <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-medium mb-2">Start Building Your Deck</h3>
          <p className="text-muted-foreground">
            Search for cards in the Card Database tab and add them to begin building your Magic deck.
          </p>
        </Card>
      )}
    </div>
  );
};