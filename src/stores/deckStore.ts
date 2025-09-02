import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Card {
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
  category: 'commanders' | 'creatures' | 'lands' | 'instants' | 'sorceries' | 'artifacts' | 'enchantments' | 'planeswalkers' | 'battles' | 'other';
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
  
  // Database operations
  saveDeck: () => Promise<{ success: boolean; deckId?: string; error?: string }>;
  loadDeck: (deckId: string) => Promise<{ success: boolean; error?: string }>;
  
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
      },

      // Database operations
      saveDeck: async () => {
        const state = get();
        const { supabase } = await import('@/integrations/supabase/client');

        try {
          // Get current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            return { success: false, error: 'User not authenticated' };
          }

          // Check if we need to create a new deck or update existing
          const deckToSave = {
            name: state.name,
            format: state.format,
            colors: state.colors,
            power_level: state.powerLevel,
            description: `${state.format} deck with ${state.totalCards} cards`,
            user_id: user.id
          };

          const { data: deckData, error: deckError } = await supabase
            .from('user_decks')
            .insert(deckToSave)
            .select()
            .single();

          if (deckError) {
            console.error('Error saving deck:', deckError);
            return { success: false, error: deckError.message };
          }

          // Save commander if present
          if (state.commander) {
            const { error: commanderError } = await supabase
              .from('deck_cards')
              .insert({
                deck_id: deckData.id,
                card_id: state.commander.id,
                card_name: state.commander.name,
                quantity: 1,
                is_commander: true,
                is_sideboard: false
              });

            if (commanderError) {
              console.error('Error saving commander:', commanderError);
            }
          }

          // Save all other cards
          if (state.cards.length > 0) {
            const cardInserts = state.cards.map(card => ({
              deck_id: deckData.id,
              card_id: card.id,
              card_name: card.name,
              quantity: card.quantity,
              is_commander: false,
              is_sideboard: false
            }));

            const { error: cardsError } = await supabase
              .from('deck_cards')
              .insert(cardInserts);

            if (cardsError) {
              console.error('Error saving cards:', cardsError);
              return { success: false, error: cardsError.message };
            }
          }

          return { success: true, deckId: deckData.id };
        } catch (error) {
          console.error('Database error:', error);
          return { success: false, error: 'Failed to save deck' };
        }
      },

      loadDeck: async (deckId: string) => {
        const { supabase } = await import('@/integrations/supabase/client');
        
        try {
          // Load deck metadata
          const { data: deckData, error: deckError } = await supabase
            .from('user_decks')
            .select('*')
            .eq('id', deckId)
            .single();

          if (deckError) {
            console.error('Error loading deck:', deckError);
            return { success: false, error: deckError.message };
          }

          // Load deck cards
          const { data: deckCards, error: cardsError } = await supabase
            .from('deck_cards')
            .select('*')
            .eq('deck_id', deckId);

          if (cardsError) {
            console.error('Error loading deck cards:', cardsError);
            return { success: false, error: cardsError.message };
          }

          // Transform and set deck data
          const cards: Card[] = [];
          let commander: Card | undefined;

          if (deckCards) {
            for (const dbCard of deckCards) {
              let category: Card['category'] = 'other';
              let type_line = '';
              let cmc = 0;

              // Basic categorization
              if (dbCard.card_name === 'Plains' || dbCard.card_name === 'Swamp') {
                category = 'lands';
                type_line = `Basic Land — ${dbCard.card_name}`;
              } else if (dbCard.card_name === 'Sol Ring') {
                category = 'artifacts';
                type_line = 'Artifact';
                cmc = 1;
              }

              if (dbCard.is_commander) {
                category = 'commanders';
              }

              const cardData: Card = {
                id: dbCard.card_id,
                name: dbCard.card_name,
                quantity: dbCard.quantity,
                cmc,
                type_line,
                colors: [],
                color_identity: [],
                oracle_text: '',
                power: undefined,
                toughness: undefined,
                image_uris: {},
                prices: {},
                set: '',
                set_name: '',
                collector_number: '',
                rarity: 'common',
                keywords: [],
                legalities: {},
                layout: 'normal',
                mana_cost: '',
                category,
                mechanics: []
              };

              if (dbCard.is_commander) {
                commander = cardData;
              } else {
                cards.push(cardData);
              }
            }
          }

          // Update store state
          set({
            name: deckData.name,
            format: deckData.format as any,
            powerLevel: deckData.power_level,
            colors: deckData.colors,
            cards,
            commander,
            totalCards: cards.reduce((sum, card) => sum + card.quantity, 0)
          });

          return { success: true };
        } catch (error) {
          console.error('Database error:', error);
          return { success: false, error: 'Failed to load deck' };
        }
      }
    }),
    {
      name: 'mtg-deck-storage',
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