import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  Minus, 
  Search, 
  ChevronDown,
  ChevronRight,
  Crown,
  Users,
  Mountain,
  Sparkles,
  Scroll,
  Shield,
  Gem,
  Swords,
  X,
  RefreshCw,
  Trash2,
  LayoutList,
  Grid3X3
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  oracle_text?: string;
}

interface VisualDeckViewProps {
  cards: DeckCard[];
  commander?: any;
  format: string;
  onAddCard?: (cardId: string) => void;
  onRemoveCard?: (cardId: string) => void;
  onDeleteCard?: (cardId: string) => void;
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
  onReplaceCard?: (cardId: string) => void;
}

type Category = 'creatures' | 'instants' | 'sorceries' | 'artifacts' | 'enchantments' | 'planeswalkers' | 'lands' | 'other';

const CATEGORY_CONFIG: Record<Category, { label: string; icon: any; color: string }> = {
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
  onDeleteCard,
  onUpdateQuantity,
  onReplaceCard
}: VisualDeckViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [isListView, setIsListView] = useState(false);

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

  const getCommanderImage = () => {
    if (!commander) return null;
    return commander.image_uris?.normal || commander.image_uris?.large || commander.image ||
      `https://cards.scryfall.io/normal/front/${commander.id?.charAt(0)}/${commander.id?.charAt(1)}/${commander.id}.jpg`;
  };

  const renderListView = (categoryCards: DeckCard[], category: Category) => {
    if (categoryCards.length === 0) return null;
    
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isCollapsed = collapsedCategories.has(category);
    const totalCards = categoryCards.reduce((sum, c) => sum + (c.quantity || 1), 0);

    return (
      <div key={category} className="mb-4">
        <button
          onClick={() => toggleCategory(category)}
          className="flex items-center gap-2 w-full p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors mb-2"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className="font-medium text-sm">{config.label}</span>
          <Badge variant="secondary" className="ml-auto text-xs">{totalCards}</Badge>
        </button>
        
        {!isCollapsed && (
          <div className="space-y-1 pl-2">
            {categoryCards.map((card) => (
              <div 
                key={card.id}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-medium text-muted-foreground w-6">{card.quantity}x</span>
                  <span className="text-sm truncate">{card.name}</span>
                  {card.mana_cost && (
                    <span className="text-xs text-muted-foreground font-mono">{card.mana_cost}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onAddCard && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAddCard(card.id)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                  {onRemoveCard && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemoveCard(card.id)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  )}
                  {onReplaceCard && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => onReplaceCard(card.id)}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCardPile = (categoryCards: DeckCard[], category: Category) => {
    if (categoryCards.length === 0) return null;
    
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isCollapsed = collapsedCategories.has(category);
    const totalCards = categoryCards.reduce((sum, c) => sum + (c.quantity || 1), 0);

    return (
      <div key={category} className="mb-6">
        <button
          onClick={() => toggleCategory(category)}
          className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors mb-3"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Icon className={cn("h-5 w-5", config.color)} />
          <span className="font-semibold">{config.label}</span>
          <Badge variant="secondary" className="ml-auto">{totalCards}</Badge>
        </button>
        
        {!isCollapsed && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {categoryCards.map((card) => (
              <div 
                key={card.id}
                className="group relative"
              >
                <div className="relative rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all hover:scale-[1.02] hover:z-10 bg-muted/20">
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
                    <Badge className="absolute top-2 right-2 text-sm bg-black/80 px-2">
                      ×{card.quantity}
                    </Badge>
                  )}
                  
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <div className="flex items-center gap-2">
                      {onAddCard && (
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          className="h-9 w-9" 
                          onClick={(e) => { e.stopPropagation(); onAddCard(card.id); }}
                          title="Add copy"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      {onRemoveCard && (
                        <Button 
                          size="icon" 
                          variant="secondary" 
                          className="h-9 w-9" 
                          onClick={(e) => { e.stopPropagation(); onRemoveCard(card.id); }}
                          title="Remove"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {onReplaceCard && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 text-xs bg-primary/20 border-primary/40 hover:bg-primary/30"
                          onClick={(e) => { e.stopPropagation(); onReplaceCard(card.id); }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Replace
                        </Button>
                      )}
                      {onDeleteCard && (
                        <Button 
                          size="icon" 
                          variant="outline"
                          className="h-8 w-8 text-xs bg-destructive/20 border-destructive/40 hover:bg-destructive/30"
                          onClick={(e) => { e.stopPropagation(); onDeleteCard(card.id); }}
                          title="Delete all copies"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search cards in deck..."
            className="pl-9"
          />
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Grid3X3 className={cn("h-4 w-4", !isListView && "text-primary")} />
          <Switch
            checked={isListView}
            onCheckedChange={setIsListView}
            id="view-toggle"
          />
          <LayoutList className={cn("h-4 w-4", isListView && "text-primary")} />
          <Label htmlFor="view-toggle" className="text-sm text-muted-foreground ml-1">
            {isListView ? 'List' : 'Visual'}
          </Label>
        </div>
      </div>

      {/* Commander Section */}
      {format === 'commander' && commander && (
        <Card className="p-4 border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Commander Image - larger on mobile, original size on desktop */}
            <div className="w-40 md:w-48 flex-shrink-0 mx-auto md:mx-0">
              <img 
                src={getCommanderImage() || '/placeholder.svg'} 
                alt={commander.name}
                className="w-full h-auto rounded-xl shadow-lg"
                onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
              />
            </div>
            
            {/* Commander Details */}
            <div className="flex-1 min-w-0 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <Crown className="h-5 w-5 text-amber-400" />
                <span className="text-xs uppercase tracking-wider text-amber-400 font-medium">Commander</span>
              </div>
              <h3 className="text-xl font-bold mb-1">{commander.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{commander.type_line}</p>
              
              {/* Oracle Text - Always show full text on desktop */}
              {commander.oracle_text && (
                <div className="text-sm leading-relaxed space-y-2 max-h-40 overflow-y-auto pr-2">
                  {commander.oracle_text.split('\n').map((line: string, i: number) => (
                    <p key={i} className="text-foreground/90">{line}</p>
                  ))}
                </div>
              )}
              
              {/* Stats */}
              <div className="flex items-center justify-center md:justify-start gap-4 mt-3 pt-3 border-t border-border/40">
                {commander.mana_cost && (
                  <Badge variant="outline" className="font-mono">{commander.mana_cost}</Badge>
                )}
                {commander.power && commander.toughness && (
                  <Badge variant="secondary">{commander.power}/{commander.toughness}</Badge>
                )}
                {commander.loyalty && (
                  <Badge variant="secondary">Loyalty: {commander.loyalty}</Badge>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Card Categories */}
      <div>
        {(Object.keys(CATEGORY_CONFIG) as Category[]).map(category => 
          isListView 
            ? renderListView(groupedCards[category], category)
            : renderCardPile(groupedCards[category], category)
        )}
      </div>

      {cards.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No cards in deck yet</p>
          <p className="text-sm">Use the "Add Cards" tab to search and add cards</p>
        </div>
      )}
    </div>
  );
}
