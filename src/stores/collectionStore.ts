import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CollectionCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  quantity: number;
  foil: number;
  condition: 'mint' | 'near_mint' | 'excellent' | 'good' | 'light_played' | 'played' | 'poor';
  language: string;
  dateAdded: Date;
  tags: string[];
  notes?: string;
  
  // Card data
  cmc: number;
  type_line: string;
  colors: string[];
  color_identity: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  keywords: string[];
  mechanics: string[];
  rarity: string;
  
  // Prices
  priceUsd?: number;
  priceFoilUsd?: number;
  
  // Synergy data
  synergyScore: number;
  synergyTags: string[];
  archetype: string[];
}

interface CollectionState {
  cards: CollectionCard[];
  totalValue: number;
  totalCards: number;
  
  // Filters
  searchQuery: string;
  selectedSets: string[];
  selectedColors: string[];
  selectedRarities: string[];
  selectedConditions: string[];
  priceRange: [number, number];
  
  // Actions
  addCard: (card: Omit<CollectionCard, 'dateAdded'>) => void;
  removeCard: (cardId: string) => void;
  updateCardQuantity: (cardId: string, quantity: number, foil?: number) => void;
  updateCardCondition: (cardId: string, condition: CollectionCard['condition']) => void;
  addCardTag: (cardId: string, tag: string) => void;
  removeCardTag: (cardId: string, tag: string) => void;
  
  // Search & Filter
  setSearchQuery: (query: string) => void;
  setSelectedSets: (sets: string[]) => void;
  setSelectedColors: (colors: string[]) => void;
  setSelectedRarities: (rarities: string[]) => void;
  setSelectedConditions: (conditions: string[]) => void;
  setPriceRange: (range: [number, number]) => void;
  
  // Bulk operations
  importCollection: (cards: CollectionCard[]) => void;
  exportCollection: () => CollectionCard[];
  
  // Analysis
  getCardsBySet: (setCode: string) => CollectionCard[];
  getCardsByColor: (color: string) => CollectionCard[];
  getCardsByArchetype: (archetype: string) => CollectionCard[];
  calculateCollectionValue: () => number;
  getTopValueCards: (count?: number) => CollectionCard[];
  
  // Synergy Analysis
  findSynergisticCards: (cardId: string, limit?: number) => CollectionCard[];
  calculateSynergyScore: (cards: CollectionCard[]) => number;
  suggestArchetypes: () => Array<{ name: string; cards: CollectionCard[]; score: number }>;
}

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      // Initial state
      cards: [],
      totalValue: 0,
      totalCards: 0,
      searchQuery: '',
      selectedSets: [],
      selectedColors: [],
      selectedRarities: [],
      selectedConditions: [],
      priceRange: [0, 1000],

      // Actions
      addCard: (card) => set((state) => {
        const existingCard = state.cards.find(c => c.id === card.id);
        if (existingCard) {
          const updatedCards = state.cards.map(c =>
            c.id === card.id 
              ? { ...c, quantity: c.quantity + card.quantity, foil: c.foil + card.foil }
              : c
          );
          return {
            cards: updatedCards,
            totalCards: state.totalCards + card.quantity + card.foil,
            totalValue: get().calculateCollectionValue()
          };
        } else {
          const newCard = { ...card, dateAdded: new Date() };
          return {
            cards: [...state.cards, newCard],
            totalCards: state.totalCards + card.quantity + card.foil,
            totalValue: get().calculateCollectionValue()
          };
        }
      }),

      removeCard: (cardId) => set((state) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return state;
        
        return {
          cards: state.cards.filter(c => c.id !== cardId),
          totalCards: state.totalCards - card.quantity - card.foil,
          totalValue: get().calculateCollectionValue()
        };
      }),

      updateCardQuantity: (cardId, quantity, foil = 0) => set((state) => {
        const updatedCards = state.cards.map(card => {
          if (card.id === cardId) {
            const oldTotal = card.quantity + card.foil;
            const newTotal = quantity + foil;
            return { ...card, quantity, foil };
          }
          return card;
        });
        
        return {
          cards: updatedCards,
          totalCards: updatedCards.reduce((sum, card) => sum + card.quantity + card.foil, 0),
          totalValue: get().calculateCollectionValue()
        };
      }),

      updateCardCondition: (cardId, condition) => set((state) => ({
        cards: state.cards.map(card =>
          card.id === cardId ? { ...card, condition } : card
        )
      })),

      addCardTag: (cardId, tag) => set((state) => ({
        cards: state.cards.map(card =>
          card.id === cardId 
            ? { ...card, tags: [...card.tags.filter(t => t !== tag), tag] }
            : card
        )
      })),

      removeCardTag: (cardId, tag) => set((state) => ({
        cards: state.cards.map(card =>
          card.id === cardId 
            ? { ...card, tags: card.tags.filter(t => t !== tag) }
            : card
        )
      })),

      // Search & Filter
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedSets: (selectedSets) => set({ selectedSets }),
      setSelectedColors: (selectedColors) => set({ selectedColors }),
      setSelectedRarities: (selectedRarities) => set({ selectedRarities }),
      setSelectedConditions: (selectedConditions) => set({ selectedConditions }),
      setPriceRange: (priceRange) => set({ priceRange }),

      // Bulk operations
      importCollection: (cards) => set({
        cards: cards.map(card => ({ ...card, dateAdded: new Date() })),
        totalCards: cards.reduce((sum, card) => sum + card.quantity + card.foil, 0),
        totalValue: get().calculateCollectionValue()
      }),

      exportCollection: () => get().cards,

      // Analysis
      getCardsBySet: (setCode) => get().cards.filter(card => card.setCode === setCode),
      
      getCardsByColor: (color) => get().cards.filter(card => 
        card.colors.includes(color) || card.color_identity.includes(color)
      ),
      
      getCardsByArchetype: (archetype) => get().cards.filter(card => 
        card.archetype.includes(archetype)
      ),

      calculateCollectionValue: () => {
        const { cards } = get();
        return cards.reduce((total, card) => {
          const regularValue = (card.priceUsd || 0) * card.quantity;
          const foilValue = (card.priceFoilUsd || card.priceUsd || 0) * card.foil;
          return total + regularValue + foilValue;
        }, 0);
      },

      getTopValueCards: (count = 10) => {
        const { cards } = get();
        return [...cards]
          .sort((a, b) => {
            const aValue = (a.priceUsd || 0) * a.quantity + (a.priceFoilUsd || a.priceUsd || 0) * a.foil;
            const bValue = (b.priceUsd || 0) * b.quantity + (b.priceFoilUsd || b.priceUsd || 0) * b.foil;
            return bValue - aValue;
          })
          .slice(0, count);
      },

      // Synergy Analysis
      findSynergisticCards: (cardId, limit = 20) => {
        const { cards } = get();
        const targetCard = cards.find(c => c.id === cardId);
        if (!targetCard) return [];

        return cards
          .filter(card => card.id !== cardId)
          .map(card => ({
            ...card,
            synergyScore: calculateCardSynergy(targetCard, card)
          }))
          .sort((a, b) => b.synergyScore - a.synergyScore)
          .slice(0, limit);
      },

      calculateSynergyScore: (cards) => {
        if (cards.length < 2) return 0;
        
        let totalSynergy = 0;
        let comparisons = 0;

        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            totalSynergy += calculateCardSynergy(cards[i], cards[j]);
            comparisons++;
          }
        }

        return comparisons > 0 ? totalSynergy / comparisons : 0;
      },

      suggestArchetypes: () => {
        const { cards } = get();
        const archetypes = new Map<string, CollectionCard[]>();

        // Group cards by archetype
        cards.forEach(card => {
          card.archetype.forEach(arch => {
            if (!archetypes.has(arch)) {
              archetypes.set(arch, []);
            }
            archetypes.get(arch)!.push(card);
          });
        });

        // Calculate synergy scores for each archetype
        return Array.from(archetypes.entries())
          .map(([name, archetypeCards]) => ({
            name,
            cards: archetypeCards,
            score: get().calculateSynergyScore(archetypeCards)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
      }
    }),
    {
      name: 'mtg-collection-storage',
      partialize: (state) => ({
        cards: state.cards,
        totalValue: state.totalValue,
        totalCards: state.totalCards
      })
    }
  )
);

// Helper function to calculate synergy between two cards
function calculateCardSynergy(card1: CollectionCard, card2: CollectionCard): number {
  let synergy = 0;

  // Color synergy
  const sharedColors = card1.colors.filter(color => card2.colors.includes(color));
  synergy += sharedColors.length * 0.1;

  // Mechanic synergy
  const sharedMechanics = card1.mechanics.filter(mechanic => card2.mechanics.includes(mechanic));
  synergy += sharedMechanics.length * 0.3;

  // Keyword synergy
  const sharedKeywords = card1.keywords.filter(keyword => card2.keywords.includes(keyword));
  synergy += sharedKeywords.length * 0.2;

  // Type synergy
  const type1 = card1.type_line.split(' — ')[0];
  const type2 = card2.type_line.split(' — ')[0];
  if (type1 === type2) synergy += 0.15;

  // CMC curve synergy (prefer different costs)
  const cmcDiff = Math.abs(card1.cmc - card2.cmc);
  if (cmcDiff >= 1 && cmcDiff <= 3) synergy += 0.1;

  // Archetype synergy
  const sharedArchetypes = card1.archetype.filter(arch => card2.archetype.includes(arch));
  synergy += sharedArchetypes.length * 0.4;

  // Oracle text synergy (simplified - would need NLP for full implementation)
  if (card1.oracle_text && card2.oracle_text) {
    const text1Words = card1.oracle_text.toLowerCase().split(/\s+/);
    const text2Words = card2.oracle_text.toLowerCase().split(/\s+/);
    const commonWords = text1Words.filter(word => 
      text2Words.includes(word) && word.length > 3
    );
    synergy += Math.min(commonWords.length * 0.05, 0.2);
  }

  return Math.min(synergy, 1.0);
}