import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutGrid, 
  List, 
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
  Eye
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';

type ViewMode = 'list' | 'visual';
type Category = 'creatures' | 'lands' | 'instants' | 'sorceries' | 'enchantments' | 'artifacts' | 'planeswalkers' | 'battles';

const CATEGORY_ICONS = {
  creatures: Users,
  lands: Mountain,
  instants: Sparkles,
  sorceries: Scroll,
  enchantments: Gem,
  artifacts: Shield,
  planeswalkers: Swords,
  battles: Skull
};

const CATEGORY_LABELS = {
  creatures: 'Creatures',
  lands: 'Lands',
  instants: 'Instants',
  sorceries: 'Sorceries',
  enchantments: 'Enchantments',
  artifacts: 'Artifacts',
  planeswalkers: 'Planeswalkers',
  battles: 'Battles'
};

interface EnhancedDeckListProps {
  deckId?: string;
}

export function EnhancedDeckList({ deckId }: EnhancedDeckListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set(['creatures', 'lands']));
  const [selectedCard, setSelectedCard] = useState<any>(null);
  
  const deck = useDeckStore();
  const { activeDeck, updateCardQuantity, removeCardFromDeck, decks } = useDeckManagementStore();

  // Get the correct deck - prioritize local deck if deckId matches a local deck
  const localDeck = deckId ? decks.find(d => d.id === deckId) : activeDeck;
  const cards = localDeck?.cards || deck.cards || [];

  const toggleCategory = (category: Category) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const groupedCards = cards.reduce((acc, card) => {
    // Determine category based on type_line
    let category: Category = 'creatures'; // default
    
    const typeLine = card.type_line?.toLowerCase() || '';
    
    if (typeLine.includes('land')) {
      category = 'lands';
    } else if (typeLine.includes('creature')) {
      category = 'creatures';
    } else if (typeLine.includes('instant')) {
      category = 'instants';
    } else if (typeLine.includes('sorcery')) {
      category = 'sorceries';
    } else if (typeLine.includes('enchantment')) {
      category = 'enchantments';
    } else if (typeLine.includes('artifact')) {
      category = 'artifacts';
    } else if (typeLine.includes('planeswalker')) {
      category = 'planeswalkers';
    } else if (typeLine.includes('battle')) {
      category = 'battles';
    }
    
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(card);
    return acc;
  }, {} as Record<string, any[]>);

  const updateQuantity = (cardId: string, change: number) => {
    if (localDeck) {
      const card = cards.find(c => c.id === cardId);
      if (card) {
        const newQuantity = Math.max(0, card.quantity + change);
        if (newQuantity === 0) {
          removeCardFromDeck(localDeck.id, cardId);
        } else {
          updateCardQuantity(localDeck.id, cardId, newQuantity);
        }
      }
    } else {
      // Handle Supabase deck
      const card = cards.find(c => c.id === cardId);
      if (card) {
        const newQuantity = Math.max(0, card.quantity + change);
        if (newQuantity === 0) {
          deck.removeCard(cardId);
        } else {
          deck.updateCardQuantity(cardId, newQuantity);
        }
      }
    }
  };

  const CategoryCard = ({ category, cards: categoryCards }: { category: Category, cards: any[] }) => {
    const Icon = CATEGORY_ICONS[category] || Users; // Fallback to Users icon if undefined
    const isExpanded = expandedCategories.has(category);
    const totalCards = categoryCards.reduce((sum, card) => sum + card.quantity, 0);

    // Category-specific colors using app theme
    const getCategoryColor = (category: Category) => {
      const colors = {
        creatures: 'border-l-green-500 bg-green-500/20',
        lands: 'border-l-orange-500 bg-orange-500/20', 
        instants: 'border-l-blue-500 bg-blue-500/20',
        sorceries: 'border-l-red-500 bg-red-500/20',
        enchantments: 'border-l-purple-500 bg-purple-500/20',
        artifacts: 'border-l-gray-500 bg-gray-500/20',
        planeswalkers: 'border-l-pink-500 bg-pink-500/20',
        battles: 'border-l-orange-600 bg-orange-600/20'
      };
      return colors[category] || 'border-l-gray-500 bg-gray-500/20';
    };

    return (
      <Card className={`mb-4 border-l-4 ${getCategoryColor(category)}`}>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCategory(category)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{CATEGORY_LABELS[category]}</CardTitle>
              <Badge variant="secondary">{totalCards}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode(viewMode === 'list' ? 'visual' : 'list');
                }}
              >
                {viewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-0">
            {viewMode === 'list' ? (
              <div className="space-y-2">
                {categoryCards.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(card.id, -1)}
                          className="h-6 w-6 p-0"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="font-mono text-sm w-8 text-center">{card.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(card.id, 1)}
                          className="h-6 w-6 p-0"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <div className="flex-1">
                        <div className="font-medium">{card.name}</div>
                        <div className="text-sm text-muted-foreground">{card.type_line}</div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {card.mana_cost && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {card.cmc}
                          </Badge>
                        )}
                        {card.colors?.length > 0 && (
                          <div className="flex gap-1">
                            {card.colors.map((color: string) => (
                              <div 
                                key={color}
                                className={`w-3 h-3 rounded-full border ${getColorClass(color)}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {categoryCards.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="relative group">
                    <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                      {card.image_uris?.normal ? (
                        <img 
                          src={card.image_uris.normal} 
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Icon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      
                      {/* Quantity Badge */}
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-background/90 text-foreground border">
                          {card.quantity}
                        </Badge>
                      </div>
                      
                      {/* Quantity Controls */}
                      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1 bg-background/90 rounded p-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(card.id, -1)}
                            className="h-6 w-6 p-0"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-mono text-sm flex-1 text-center">{card.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(card.id, 1)}
                            className="h-6 w-6 p-0"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-center">
                      <div className="font-medium text-sm line-clamp-1">{card.name}</div>
                      <div className="text-xs text-muted-foreground">CMC {card.cmc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Deck List</h2>
          <p className="text-sm text-muted-foreground">{totalCards} cards total</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
          <Button
            variant={viewMode === 'visual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('visual')}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Visual
          </Button>
        </div>
      </div>

      {/* Categories */}
      {Object.entries(groupedCards).map(([category, categoryCards]) => (
        <CategoryCard
          key={category}
          category={category as Category}
          cards={categoryCards}
        />
      ))}

      {cards.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Cards in Deck</h3>
            <p className="text-muted-foreground">
              Add cards from the search tab to build your deck
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    W: 'bg-yellow-100 border-yellow-300',
    U: 'bg-blue-100 border-blue-300',
    B: 'bg-gray-100 border-gray-300',
    R: 'bg-red-100 border-red-300',
    G: 'bg-green-100 border-green-300'
  };
  return colorMap[color] || 'bg-gray-200 border-gray-300';
}