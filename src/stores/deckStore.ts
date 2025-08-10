import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Card {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  prices?: {
    usd?: string;
    usd_foil?: string;
  };
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  keywords?: string[];
  legalities?: Record<string, string>;
  layout?: string;
  mana_cost?: string;
  quantity: number;
  category: string;
  mechanics?: string[];
}

interface DeckState {
  // Deck metadata
  name: string;
  format: 'standard' | 'commander' | 'custom';
  powerLevel: number;
  colors: string[];
  colorIdentity: string[];
  
  // Deck contents
  cards: Card[];
  commander?: Card;
  
  // Computed properties
  totalCards: number;
  
  // Actions
  setDeckName: (name: string) => void;
  setFormat: (format: 'standard' | 'commander' | 'custom') => void;
  setPowerLevel: (level: number) => void;
  addCard: (card: Card) => void;
  removeCard: (cardId: string) => void;
  updateCardQuantity: (cardId: string, quantity: number) => void;
  setCommander: (card: Card) => void;
  clearDeck: () => void;
  importDeck: (cards: Card[]) => void;
  
  // Analysis
  getCardsByCategory: (category: string) => Card[];
  getManaValue: () => number;
  getColorDistribution: () => Record<string, number>;
  getMechanicCounts: () => Record<string, number>;
}

export const useDeckStore = create<DeckState>()(
  persist(
    (set, get) => ({
      // Initial state
      name: 'New Deck',
      format: 'standard',
      powerLevel: 5,
      colors: [],
      colorIdentity: [],
      cards: [],
      commander: undefined,
      totalCards: 0,

      // Actions
      setDeckName: (name) => set({ name }),
      
      setFormat: (format) => set({ format }),
      
      setPowerLevel: (powerLevel) => set({ powerLevel }),
      
      addCard: (card) => set((state) => {
        const existingCard = state.cards.find(c => c.id === card.id);
        if (existingCard) {
          // Increase quantity
          const updatedCards = state.cards.map(c =>
            c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c
          );
          return {
            cards: updatedCards,
            totalCards: state.totalCards + 1
          };
        } else {
          // Add new card
          return {
            cards: [...state.cards, { ...card, quantity: 1 }],
            totalCards: state.totalCards + 1
          };
        }
      }),
      
      removeCard: (cardId) => set((state) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return state;
        
        if (card.quantity > 1) {
          // Decrease quantity
          const updatedCards = state.cards.map(c =>
            c.id === cardId ? { ...c, quantity: c.quantity - 1 } : c
          );
          return {
            cards: updatedCards,
            totalCards: state.totalCards - 1
          };
        } else {
          // Remove card entirely
          return {
            cards: state.cards.filter(c => c.id !== cardId),
            totalCards: state.totalCards - 1
          };
        }
      }),
      
      updateCardQuantity: (cardId, quantity) => set((state) => {
        if (quantity <= 0) {
          // Remove card
          const card = state.cards.find(c => c.id === cardId);
          const removedQuantity = card?.quantity || 0;
          return {
            cards: state.cards.filter(c => c.id !== cardId),
            totalCards: state.totalCards - removedQuantity
          };
        } else {
          // Update quantity
          const card = state.cards.find(c => c.id === cardId);
          const oldQuantity = card?.quantity || 0;
          const difference = quantity - oldQuantity;
          
          const updatedCards = state.cards.map(c =>
            c.id === cardId ? { ...c, quantity } : c
          );
          
          return {
            cards: updatedCards,
            totalCards: state.totalCards + difference
          };
        }
      }),
      
      setCommander: (card) => set({ commander: card }),
      
      clearDeck: () => set({
        cards: [],
        commander: undefined,
        totalCards: 0,
        colors: [],
        colorIdentity: []
      }),
      
      importDeck: (cards) => set({
        cards,
        totalCards: cards.reduce((sum, card) => sum + card.quantity, 0)
      }),
      
      // Analysis functions
      getCardsByCategory: (category) => {
        return get().cards.filter(card => card.category === category);
      },
      
      getManaValue: () => {
        const { cards } = get();
        if (cards.length === 0) return 0;
        
        const totalCMC = cards.reduce((sum, card) => 
          sum + (card.cmc * card.quantity), 0
        );
        const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
        
        return totalCards > 0 ? totalCMC / totalCards : 0;
      },
      
      getColorDistribution: () => {
        const { cards } = get();
        const distribution: Record<string, number> = {
          W: 0, U: 0, B: 0, R: 0, G: 0
        };
        
        cards.forEach(card => {
          (card.colors || []).forEach(color => {
            if (color in distribution) {
              distribution[color] += card.quantity;
            }
          });
        });
        
        return distribution;
      },
      
      getMechanicCounts: () => {
        const { cards } = get();
        const mechanics: Record<string, number> = {};
        
        cards.forEach(card => {
          (card.mechanics || []).forEach(mechanic => {
            mechanics[mechanic] = (mechanics[mechanic] || 0) + card.quantity;
          });
        });
        
        return mechanics;
      }
    }),
    {
      name: 'eoe-deck-storage',
      // Only persist essential data
      partialize: (state) => ({
        name: state.name,
        format: state.format,
        powerLevel: state.powerLevel,
        cards: state.cards,
        commander: state.commander,
        totalCards: state.totalCards
      })
    }
  )
);