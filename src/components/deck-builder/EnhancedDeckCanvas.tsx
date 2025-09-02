import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  Crown, 
  Plus, 
  Minus, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Zap,
  Shield,
  Swords
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';

interface CardGroup {
  name: string;
  cards: any[];
  icon?: React.ReactNode;
  color?: string;
}

interface EnhancedDeckCanvasProps {
  format?: string;
}

export function EnhancedDeckCanvas({ format = 'standard' }: EnhancedDeckCanvasProps) {
  const deck = useDeckStore();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(section)) {
      newCollapsed.delete(section);
    } else {
      newCollapsed.add(section);
    }
    setCollapsedSections(newCollapsed);
  };

  const updateCardQuantity = (cardId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      deck.removeCard(cardId);
    } else {
      deck.updateCardQuantity(cardId, newQuantity);
    }
  };

  const getCardGroups = (): CardGroup[] => {
    const groups: CardGroup[] = [];

    if (format === 'commander') {
      // Commander section
      const commanders = deck.cards.filter(card => card.category === 'commanders');
      groups.push({
        name: 'Commander',
        cards: commanders,
        icon: <Crown className="h-4 w-4 text-yellow-500" />,
        color: 'border-yellow-500/30 bg-yellow-500/5'
      });
    }

    // Creatures by mana value
    const creatures = deck.cards.filter(card => card.category === 'creatures');
    const creatureGroups = [
      { range: '0-1', cards: creatures.filter(c => c.cmc <= 1) },
      { range: '2', cards: creatures.filter(c => c.cmc === 2) },
      { range: '3', cards: creatures.filter(c => c.cmc === 3) },
      { range: '4', cards: creatures.filter(c => c.cmc === 4) },
      { range: '5', cards: creatures.filter(c => c.cmc === 5) },
      { range: '6-7', cards: creatures.filter(c => c.cmc >= 6 && c.cmc <= 7) },
      { range: '8-9', cards: creatures.filter(c => c.cmc >= 8 && c.cmc <= 9) },
      { range: '10+', cards: creatures.filter(c => c.cmc >= 10) }
    ].filter(group => group.cards.length > 0);

    if (creatureGroups.length > 0) {
      groups.push({
        name: `Creatures (${creatures.length})`,
        cards: creatures,
        icon: <Swords className="h-4 w-4 text-red-500" />,
        color: 'border-red-500/30 bg-red-500/5'
      });
    }

    // Spells
    const instants = deck.cards.filter(card => card.category === 'instants');
    const sorceries = deck.cards.filter(card => card.category === 'sorceries');
    const spells = [...instants, ...sorceries];

    if (spells.length > 0) {
      groups.push({
        name: `Instants & Sorceries (${spells.length})`,
        cards: spells,
        icon: <Zap className="h-4 w-4 text-blue-500" />,
        color: 'border-blue-500/30 bg-blue-500/5'
      });
    }

    // Other nonlands
    const enchantments = deck.cards.filter(card => card.type_line?.includes('Enchantment') && !card.type_line?.includes('Land'));
    const artifacts = deck.cards.filter(card => card.type_line?.includes('Artifact') && !card.type_line?.includes('Land'));
    const planeswalkers = deck.cards.filter(card => card.type_line?.includes('Planeswalker'));
    const other = [...enchantments, ...artifacts, ...planeswalkers];

    if (other.length > 0) {
      groups.push({
        name: `Other Spells (${other.length})`,
        cards: other,
        icon: <Sparkles className="h-4 w-4 text-purple-500" />,
        color: 'border-purple-500/30 bg-purple-500/5'
      });
    }

    // Lands
    const lands = deck.cards.filter(card => card.category === 'lands' || card.type_line?.includes('Land'));
    if (lands.length > 0) {
      groups.push({
        name: `Lands (${lands.length})`,
        cards: lands,
        icon: <Shield className="h-4 w-4 text-green-500" />,
        color: 'border-green-500/30 bg-green-500/5'
      });
    }

    return groups;
  };

  const cardGroups = getCardGroups();

  return (
    <div className="space-y-4">
      {/* Deck Header */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Input 
                value={deck.name || 'Untitled Deck'}
                onChange={(e) => {
                  // For now, just log the name change - implement proper setName in deckStore
                  console.log('Deck name changed to:', e.target.value);
                }}
                className="text-xl font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                placeholder="Deck Name"
              />
              <Badge variant="outline" className="capitalize">
                {format}
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">
                {deck.totalCards} cards
              </Badge>
              <Badge variant="outline">
                Power {deck.powerLevel.toFixed(1)}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Card Groups */}
      {cardGroups.map((group) => (
        <Card key={group.name} className={`transition-all ${group.color || ''}`}>
          <CardHeader 
            className="cursor-pointer"
            onClick={() => toggleSection(group.name)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2 text-base">
                {group.icon}
                <span>{group.name}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-xs">
                  {group.cards.reduce((sum, card) => sum + card.quantity, 0)} cards
                </Badge>
                {collapsedSections.has(group.name) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>

          {!collapsedSections.has(group.name) && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {group.cards.map((card) => (
                  <div 
                    key={card.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-8 h-10 bg-muted rounded flex-shrink-0 flex items-center justify-center text-xs font-bold">
                        {card.cmc}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{card.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {card.type_line}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        {card.colors?.map((color: string) => (
                          <div
                            key={color}
                            className="w-4 h-4 rounded-full border text-xs font-bold flex items-center justify-center"
                            style={{
                              backgroundColor: {
                                W: '#fffbd5',
                                U: '#0e68ab',
                                B: '#150b00',
                                R: '#d3202a',
                                G: '#00733e'
                              }[color],
                              color: color === 'W' ? '#000' : '#fff'
                            }}
                          >
                            {color}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateCardQuantity(card.id, card.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        
                        <span className="w-8 text-center font-mono">{card.quantity}</span>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateCardQuantity(card.id, card.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deck.removeCard(card.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {group.cards.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-sm">No cards in this section</div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {/* Add Cards Prompt */}
      {deck.totalCards === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Plus className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">Start Building Your Deck</h3>
            <p className="text-muted-foreground">
              Search for cards in the Card Database tab or use the AI Builder to get started
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
