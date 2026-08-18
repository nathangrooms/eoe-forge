import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Minus, 
  ChevronDown, 
  ChevronRight, 
  Crown,
  Swords,
  Shield,
  Scroll,
  Gem,
  Sparkles,
  Mountain,
  Users,
  Search,
  X,
  ArrowRightLeft
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { ManualReplacementModal } from './ManualReplacementModal';
import { cn } from '@/lib/utils';

type Category = 'creatures' | 'lands' | 'instants' | 'sorceries' | 'enchantments' | 'artifacts' | 'planeswalkers' | 'battles' | 'other';

const CATEGORY_CONFIG: Record<Category, { label: string; icon: any; color: string; bgColor: string }> = {
  creatures: { label: 'Creatures', icon: Users, color: 'text-green-500', bgColor: 'bg-green-500/10 border-l-green-500' },
  lands: { label: 'Lands', icon: Mountain, color: 'text-amber-600', bgColor: 'bg-amber-500/10 border-l-amber-500' },
  instants: { label: 'Instants', icon: Sparkles, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-l-blue-500' },
  sorceries: { label: 'Sorceries', icon: Scroll, color: 'text-blue-600', bgColor: 'bg-blue-600/10 border-l-blue-600' },
  enchantments: { label: 'Enchantments', icon: Gem, color: 'text-purple-500', bgColor: 'bg-purple-500/10 border-l-purple-500' },
  artifacts: { label: 'Artifacts', icon: Shield, color: 'text-gray-400', bgColor: 'bg-gray-500/10 border-l-gray-500' },
  planeswalkers: { label: 'Planeswalkers', icon: Swords, color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-l-orange-500' },
  battles: { label: 'Battles', icon: Swords, color: 'text-red-500', bgColor: 'bg-red-500/10 border-l-red-500' },
  other: { label: 'Other', icon: Sparkles, color: 'text-gray-500', bgColor: 'bg-gray-500/10 border-l-gray-500' }
};

const colorMap: Record<string, string> = {
  W: 'bg-amber-100 border-amber-300',
  U: 'bg-blue-500',
  B: 'bg-gray-800',
  R: 'bg-red-500',
  G: 'bg-green-500'
};

interface EnhancedDeckListProps {
  deckId?: string;
}

export function EnhancedDeckList({ deckId }: EnhancedDeckListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [replacementModalOpen, setReplacementModalOpen] = useState(false);
  const [cardToReplace, setCardToReplace] = useState<any>(null);
  
  const deck = useDeckStore();
  const { activeDeck, updateCardQuantity: updateLocalQuantity, removeCardFromDeck, decks } = useDeckManagementStore();

  const localDeck = deckId ? decks.find(d => d.id === deckId) : activeDeck;
  const cards = localDeck?.cards || deck.cards || [];

  const toggleCategory = (category: Category) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  const getCategory = (typeLine: string): Category => {
    const lower = typeLine?.toLowerCase() || '';
    if (lower.includes('creature')) return 'creatures';
    if (lower.includes('land')) return 'lands';
    if (lower.includes('instant')) return 'instants';
    if (lower.includes('sorcery')) return 'sorceries';
    if (lower.includes('enchantment')) return 'enchantments';
    if (lower.includes('artifact')) return 'artifacts';
    if (lower.includes('planeswalker')) return 'planeswalkers';
    if (lower.includes('battle')) return 'battles';
    return 'other';
  };

  const groupedCards = useMemo(() => {
    const filtered = cards.filter((card: any) => 
      card.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<Category, any[]> = {
      creatures: [], lands: [], instants: [], sorceries: [],
      enchantments: [], artifacts: [], planeswalkers: [], battles: [], other: []
    };

    filtered.forEach((card: any) => {
      const category = getCategory(card.type_line);
      groups[category].push(card);
    });

    // Sort by CMC then name
    Object.keys(groups).forEach(key => {
      groups[key as Category].sort((a, b) => {
        if ((a.cmc || 0) !== (b.cmc || 0)) return (a.cmc || 0) - (b.cmc || 0);
        return a.name.localeCompare(b.name);
      });
    });

    return groups;
  }, [cards, searchTerm]);

  const updateQuantity = (cardId: string, change: number) => {
    if (localDeck) {
      const card = cards.find((c: any) => c.id === cardId);
      if (card) {
        const newQuantity = Math.max(0, card.quantity + change);
        if (newQuantity === 0) {
          removeCardFromDeck(localDeck.id, cardId);
        } else {
          updateLocalQuantity(localDeck.id, cardId, newQuantity);
        }
      }
    } else {
      const card = cards.find((c: any) => c.id === cardId);
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

  const getCardImage = (card: any) => {
    return card.image_uris?.small || card.image_uris?.normal || 
      `https://cards.scryfall.io/small/front/${card.id?.charAt(0)}/${card.id?.charAt(1)}/${card.id}.jpg`;
  };

  const renderCategory = (category: Category) => {
    const categoryCards = groupedCards[category];
    if (categoryCards.length === 0) return null;

    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;
    const isCollapsed = collapsedCategories.has(category);
    const totalCards = categoryCards.reduce((sum: number, card: any) => sum + (card.quantity || 1), 0);

    return (
      <div key={category} className="mb-4">
        <button
          onClick={() => toggleCategory(category)}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-lg border-l-4 transition-colors",
            config.bgColor,
            "hover:bg-muted/50"
          )}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Icon className={cn("h-5 w-5", config.color)} />
          <span className="font-semibold">{config.label}</span>
          <Badge variant="secondary" className="ml-auto">{totalCards}</Badge>
        </button>

        {!isCollapsed && (
          <div className="mt-2 space-y-1 pl-2">
            {categoryCards.map((card: any) => (
              <div 
                key={card.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors group"
              >
                {/* Card Thumbnail */}
                <img
                  src={getCardImage(card)}
                  alt={card.name}
                  className="w-12 h-auto rounded shadow-sm"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />

                {/* Quantity Controls */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(card.id, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center font-mono font-medium">{card.quantity || 1}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(card.id, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Card Name & Type */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{card.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.type_line}</p>
                </div>

                {/* CMC Badge */}
                <Badge variant="outline" className="font-mono text-xs shrink-0">
                  {card.cmc || 0}
                </Badge>

                {/* Color Identity */}
                {card.colors && card.colors.length > 0 && (
                  <div className="flex gap-0.5 shrink-0">
                    {card.colors.map((color: string) => (
                      <div 
                        key={color}
                        className={cn("w-4 h-4 rounded-full border", colorMap[color])}
                      />
                    ))}
                  </div>
                )}

                {/* Replace Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => {
                    setCardToReplace(card);
                    setReplacementModalOpen(true);
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
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

      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{cards.length} unique cards</span>
        <span>•</span>
        <span>{cards.reduce((sum: number, c: any) => sum + (c.quantity || 1), 0)} total</span>
      </div>

      {/* Categories */}
      <div>
        {(Object.keys(CATEGORY_CONFIG) as Category[]).map(category => 
          renderCategory(category)
        )}
      </div>

      {cards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No cards in deck</p>
          <p className="text-sm">Add cards using the "Add Cards" tab</p>
        </div>
      )}

      {/* Replacement Modal */}
      {cardToReplace && (
        <ManualReplacementModal
          isOpen={replacementModalOpen}
          onClose={() => {
            setReplacementModalOpen(false);
            setCardToReplace(null);
          }}
          currentCard={{
            name: cardToReplace.name,
            image: cardToReplace.image_uris?.small || cardToReplace.image_uris?.normal
          }}
          onReplace={(newCardName) => {
            // Fetch the new card and replace
            const originalQuantity = cardToReplace.quantity || 1;
            import('@/lib/api/scryfall').then(({ scryfallAPI }) => {
              scryfallAPI.getCardByName(newCardName).then((newCard) => {
                // Remove ALL copies of the original card by setting quantity to 0
                deck.updateCardQuantity(cardToReplace.id, 0);
                // Add new card with the same quantity as the original
                deck.addCard({
                  id: newCard.id,
                  name: newCard.name,
                  cmc: newCard.cmc || 0,
                  type_line: newCard.type_line || '',
                  colors: newCard.colors || [],
                  mana_cost: newCard.mana_cost,
                  quantity: originalQuantity,
                  category: 'other' as const,
                  mechanics: newCard.keywords || [],
                  image_uris: newCard.image_uris,
                  prices: newCard.prices
                });
                
                // Trigger save to database
                if (deck.currentDeckId) {
                  setTimeout(() => {
                    deck.updateDeck(deck.currentDeckId!);
                  }, 100);
                }
              });
            });
            setReplacementModalOpen(false);
            setCardToReplace(null);
          }}
          onMarkFuture={(newCardName) => {
            // Mark as future replacement - we need to fetch the card first
            import('@/lib/api/scryfall').then(({ scryfallAPI }) => {
              scryfallAPI.getCardByName(newCardName).then((newCard) => {
                deck.addReplacement(cardToReplace.id, {
                  id: newCard.id,
                  name: newCard.name,
                  cmc: newCard.cmc || 0,
                  type_line: newCard.type_line || '',
                  colors: newCard.colors || [],
                  mana_cost: newCard.mana_cost,
                  quantity: 1,
                  category: 'other' as const,
                  mechanics: newCard.keywords || [],
                  image_uris: newCard.image_uris,
                  prices: newCard.prices
                });
              });
            });
            setReplacementModalOpen(false);
            setCardToReplace(null);
          }}
        />
      )}
    </div>
  );
}