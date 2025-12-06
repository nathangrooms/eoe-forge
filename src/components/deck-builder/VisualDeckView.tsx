import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Minus, 
  X, 
  Search, 
  Grid3X3, 
  LayoutList,
  ChevronDown,
  ChevronRight,
  Crown,
  Users,
  Mountain,
  Sparkles,
  Scroll,
  Shield,
  Gem,
  Swords
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniManaCurve } from './MiniManaCurve';

interface DeckCard {
  id: string;
  name: string;
  quantity: number;
  cmc: number;
  type_line: string;
  colors?: string[];
  mana_cost?: string;
  image_uris?: { normal?: string; small?: string };
  prices?: { usd?: string };
}

interface VisualDeckViewProps {
  cards: DeckCard[];
  commander?: any;
  format: string;
  onAddCard?: (cardId: string) => void;
  onRemoveCard?: (cardId: string) => void;
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
}

type Category = 'commander' | 'creatures' | 'instants' | 'sorceries' | 'artifacts' | 'enchantments' | 'planeswalkers' | 'lands' | 'other';

const CATEGORY_CONFIG: Record<Category, { label: string; icon: any; color: string }> = {
  commander: { label: 'Commander', icon: Crown, color: 'text-amber-400' },
  creatures: { label: 'Creatures', icon: Users, color: 'text-green-500' },
  instants: { label: 'Instants', icon: Sparkles, color: 'text-blue-400' },
  sorceries: { label: 'Sorceries', icon: Scroll, color: 'text-blue-600' },
  artifacts: { label: 'Artifacts', icon: Shield, color: 'text-gray-400' },
  enchantments: { label: 'Enchantments', icon: Gem, color: 'text-purple-500' },
  planeswalkers: { label: 'Planeswalkers', icon: Swords, color: 'text-orange-500' },
  lands: { label: 'Lands', icon: Mountain, color: 'text-amber-600' },
  other: { label: 'Other', icon: Grid3X3, color: 'text-gray-500' }
};

export function VisualDeckView({ 
  cards, 
  commander, 
  format,
  onAddCard,
  onRemoveCard,
  onUpdateQuantity
}: VisualDeckViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'pile'>('pile');

  const getCategory = (card: DeckCard): Category => {
    const typeLine = card.type_line?.toLowerCase() || '';
    if (typeLine.includes('creature')) return 'creatures';
    if (typeLine.includes('instant')) return 'instants';
    if (typeLine.includes('sorcery')) return 'sorceries';
    if (typeLine.includes('artifact')) return 'artifacts';
    if (typeLine.includes('enchantment')) return 'enchantments';
    if (typeLine.includes('planeswalker')) return 'planeswalkers';
    if (typeLine.includes('land')) return 'lands';
    return 'other';
  };

  const groupedCards = useMemo(() => {
    const filtered = cards.filter(card => 
      card.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<Category, DeckCard[]> = {
      commander: [],
      creatures: [],
      instants: [],
      sorceries: [],
      artifacts: [],
      enchantments: [],
      planeswalkers: [],
      lands: [],
      other: []
    };

    filtered.forEach(card => {
      const category = getCategory(card);
      groups[category].push(card);
    });

    // Sort each group by CMC then name
    Object.keys(groups).forEach(key => {
      groups[key as Category].sort((a, b) => {
        if (a.cmc !== b.cmc) return a.cmc - b.cmc;
        return a.name.localeCompare(b.name);
      });
    });

    return groups;
  }, [cards, searchTerm]);

  const toggleCategory = (category: Category) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  const getCardImage = (card: DeckCard) => {
    return card.image_uris?.normal || card.image_uris?.small || 
      `https://cards.scryfall.io/normal/front/${card.id.charAt(0)}/${card.id.charAt(1)}/${card.id}.jpg`;
  };

  const curveData = useMemo(() => {
    const bins: Record<string, number> = {
      '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6-7': 0, '8-9': 0, '10+': 0
    };
    cards.forEach(card => {
      if (card.type_line?.toLowerCase().includes('land')) return;
      const cmc = card.cmc || 0;
      const qty = card.quantity || 1;
      if (cmc <= 1) bins['0-1'] += qty;
      else if (cmc === 2) bins['2'] += qty;
      else if (cmc === 3) bins['3'] += qty;
      else if (cmc === 4) bins['4'] += qty;
      else if (cmc === 5) bins['5'] += qty;
      else if (cmc >= 6 && cmc <= 7) bins['6-7'] += qty;
      else if (cmc >= 8 && cmc <= 9) bins['8-9'] += qty;
      else bins['10+'] += qty;
    });
    return bins;
  }, [cards]);

  const renderCardPile = (categoryCards: DeckCard[], category: Category) => {
    if (categoryCards.length === 0) return null;
    
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isCollapsed = collapsedCategories.has(category);
    const totalCards = categoryCards.reduce((sum, c) => sum + (c.quantity || 1), 0);

    return (
      <div key={category} className="mb-4">
        <button
          onClick={() => toggleCategory(category)}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className="font-medium text-sm">{config.label}</span>
          <Badge variant="secondary" className="text-xs ml-auto">{totalCards}</Badge>
        </button>
        
        {!isCollapsed && (
          <div className={cn(
            "mt-2 pl-2",
            viewMode === 'pile' ? "flex flex-wrap gap-1" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
          )}>
            {viewMode === 'pile' ? (
              // Stacked pile view - overlapping cards
              <div className="relative w-full">
                <div className="flex flex-wrap gap-1">
                  {categoryCards.map((card, index) => (
                    <div 
                      key={card.id}
                      className="group relative"
                      style={{ width: '120px' }}
                    >
                      <div className="relative rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all hover:scale-105 hover:z-10">
                        <img
                          src={getCardImage(card)}
                          alt={card.name}
                          className="w-full h-auto"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                          }}
                        />
                        {card.quantity > 1 && (
                          <Badge className="absolute top-1 right-1 text-xs bg-black/70">
                            ×{card.quantity}
                          </Badge>
                        )}
                        
                        {/* Hover actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          {onAddCard && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => onAddCard(card.id)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {onRemoveCard && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => onRemoveCard(card.id)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Grid view
              categoryCards.map(card => (
                <div 
                  key={card.id}
                  className="group relative rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all"
                >
                  <img
                    src={getCardImage(card)}
                    alt={card.name}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                  {card.quantity > 1 && (
                    <Badge className="absolute top-1 right-1 text-xs bg-black/70">
                      ×{card.quantity}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and View Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search cards in deck..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button
            size="icon"
            variant={viewMode === 'pile' ? 'default' : 'ghost'}
            className="h-8 w-8"
            onClick={() => setViewMode('pile')}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mini Mana Curve */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Mana Curve</span>
          <span className="text-xs text-muted-foreground">
            {cards.reduce((sum, c) => sum + (c.quantity || 1), 0)} cards
          </span>
        </div>
        <MiniManaCurve curveData={curveData} className="h-24" />
      </Card>

      {/* Commander Section */}
      {format === 'commander' && commander && (
        <Card className="p-4 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-400" />
            <div className="flex-1">
              <h3 className="font-semibold">{commander.name}</h3>
              <p className="text-xs text-muted-foreground">{commander.type_line}</p>
            </div>
            {commander.image_uris?.small && (
              <img 
                src={commander.image_uris.normal || commander.image_uris.small} 
                alt={commander.name}
                className="h-20 w-auto rounded-lg shadow-md"
              />
            )}
          </div>
        </Card>
      )}

      {/* Card Categories */}
      <div className="space-y-2">
        {(Object.keys(CATEGORY_CONFIG) as Category[])
          .filter(cat => cat !== 'commander')
          .map(category => renderCardPile(groupedCards[category], category))
        }
      </div>

      {cards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No cards in deck yet</p>
          <p className="text-sm">Use the "Add Cards" tab to search and add cards</p>
        </div>
      )}
    </div>
  );
}