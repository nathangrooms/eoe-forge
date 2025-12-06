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
  replacements?: Card[];
}

export interface ReplacementCard {
  id: string;
  originalCardId: string;
  card: Card;
  priority: number;
  notes?: string;
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
  replacements: ReplacementCard[];
  
  // Current deck ID for auto-saving
  currentDeckId?: string;
  
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
  setCurrentDeckId: (deckId: string) => void;
  
  // Replacement actions
  addReplacement: (originalCardId: string, replacementCard: Card, priority?: number, notes?: string) => void;
  removeReplacement: (replacementId: string) => void;
  updateReplacementPriority: (replacementId: string, priority: number) => void;
  getReplacementsForCard: (cardId: string) => ReplacementCard[];
  addReplacementToWishlist: (replacementId: string) => void;
  
  // Database operations
  saveDeck: () => Promise<{ success: boolean; deckId?: string; error?: string }>;
  loadDeck: (deckId: string) => Promise<{ success: boolean; error?: string }>;
  updateDeck: (deckId: string) => Promise<{ success: boolean; error?: string }>;
  
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
      name: '',
      format: 'commander',
      powerLevel: 5,
      colors: [],
      colorIdentity: [],
      cards: [],
      commander: undefined,
      replacements: [],
      currentDeckId: undefined,
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
          const newState = {
            cards: updatedCards,
            totalCards: state.totalCards + 1
          };
          
          // Auto-save if we have a current deck ID
          if (state.currentDeckId) {
            setTimeout(() => {
              get().updateDeck(state.currentDeckId!);
            }, 500); // Debounce auto-save
          }
          
          return newState;
        } else {
          // Add new card
          const newState = {
            cards: [...state.cards, { ...card, quantity: 1 }],
            totalCards: state.totalCards + 1
          };
          
          // Auto-save if we have a current deck ID
          if (state.currentDeckId) {
            setTimeout(() => {
              get().updateDeck(state.currentDeckId!);
            }, 500); // Debounce auto-save
          }
          
          return newState;
        }
      }),
      
      removeCard: (cardId) => set((state) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return state;
        
        let newState;
        if (card.quantity > 1) {
          // Decrease quantity
          const updatedCards = state.cards.map(c =>
            c.id === cardId ? { ...c, quantity: c.quantity - 1 } : c
          );
          newState = {
            cards: updatedCards,
            totalCards: state.totalCards - 1
          };
        } else {
          // Remove card entirely
          newState = {
            cards: state.cards.filter(c => c.id !== cardId),
            totalCards: state.totalCards - 1
          };
        }
        
        // Auto-save if we have a current deck ID
        if (state.currentDeckId) {
          setTimeout(() => {
            get().updateDeck(state.currentDeckId!);
          }, 500); // Debounce auto-save
        }
        
        return newState;
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
        replacements: [],
        totalCards: 0,
        colors: [],
        colorIdentity: []
      }),
      
      importDeck: (cards) => set({
        cards,
        totalCards: cards.reduce((sum, card) => sum + card.quantity, 0)
      }),
      
      setCurrentDeckId: (deckId) => set({ currentDeckId: deckId }),
      
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

      // Replacement actions
      addReplacement: (originalCardId, replacementCard, priority = 1, notes) => set((state) => {
        const newReplacement: ReplacementCard = {
          id: `${originalCardId}-${replacementCard.id}-${Date.now()}`,
          originalCardId,
          card: replacementCard,
          priority,
          notes
        };
        
        return {
          replacements: [...state.replacements, newReplacement]
        };
      }),

      removeReplacement: (replacementId) => set((state) => ({
        replacements: state.replacements.filter(r => r.id !== replacementId)
      })),

      updateReplacementPriority: (replacementId, priority) => set((state) => ({
        replacements: state.replacements.map(r => 
          r.id === replacementId ? { ...r, priority } : r
        )
      })),

      getReplacementsForCard: (cardId) => {
        return get().replacements
          .filter(r => r.originalCardId === cardId)
          .sort((a, b) => a.priority - b.priority);
      },

      addReplacementToWishlist: async (replacementId) => {
        const state = get();
        const replacement = state.replacements.find(r => r.id === replacementId);
        if (!replacement) return;

        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
          await supabase.from('wishlist').insert({
            user_id: user.id,
            card_id: replacement.card.id,
            card_name: replacement.card.name,
            priority: replacement.priority.toString(),
            note: replacement.notes || `Replacement for deck: ${state.name}`
          });
        } catch (error) {
          console.error('Error adding to wishlist:', error);
        }
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
            // Create a cache for API responses to avoid duplicate calls
            const cardCache = new Map<string, any>();
            
            // Group cards by name to avoid duplicate API calls
            const uniqueCardNames = [...new Set(deckCards.map(card => card.card_name))];
            
            // Fetch all unique cards in parallel
            const cardPromises = uniqueCardNames.map(async (cardName) => {
              try {
                const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
                if (response.ok) {
                  const apiCard = await response.json();
                  cardCache.set(cardName, apiCard);
                } else {
                  cardCache.set(cardName, null);
                }
              } catch (error) {
                console.error(`Error fetching ${cardName}:`, error);
                cardCache.set(cardName, null);
              }
            });

            // Wait for all API calls to complete
            await Promise.all(cardPromises);

            // Process each deck card using the cached data
            for (const dbCard of deckCards) {
              try {
                const apiCard = cardCache.get(dbCard.card_name);
                
                if (apiCard) {
                  // Determine category based on type line and commander status
                  let category: Card['category'] = 'other';
                  const typeLine = apiCard.type_line?.toLowerCase() || '';
                  
                  if (dbCard.is_commander) {
                    category = 'commanders';
                  } else if (typeLine.includes('creature')) {
                    category = 'creatures';
                  } else if (typeLine.includes('land')) {
                    category = 'lands';
                  } else if (typeLine.includes('instant')) {
                    category = 'instants';
                  } else if (typeLine.includes('sorcery')) {
                    category = 'sorceries';
                  } else if (typeLine.includes('artifact')) {
                    category = 'artifacts';
                  } else if (typeLine.includes('enchantment')) {
                    category = 'enchantments';
                  } else if (typeLine.includes('planeswalker')) {
                    category = 'planeswalkers';
                  } else if (typeLine.includes('battle')) {
                    category = 'battles';
                  }
                  
                  const cardData: Card = {
                    id: apiCard.id,
                    name: apiCard.name,
                    quantity: dbCard.quantity,
                    cmc: apiCard.cmc || 0,
                    type_line: apiCard.type_line || '',
                    colors: apiCard.colors || [],
                    color_identity: apiCard.color_identity || [],
                    oracle_text: apiCard.oracle_text || '',
                    power: apiCard.power,
                    toughness: apiCard.toughness,
                    image_uris: apiCard.image_uris || {},
                    prices: apiCard.prices || {},
                    set: apiCard.set || '',
                    set_name: apiCard.set_name || '',
                    collector_number: apiCard.collector_number || '',
                    rarity: apiCard.rarity || 'common',
                    keywords: apiCard.keywords || [],
                    legalities: apiCard.legalities || {},
                    layout: apiCard.layout || 'normal',
                    mana_cost: apiCard.mana_cost || '',
                    category,
                    mechanics: apiCard.keywords || []
                  };

                  if (dbCard.is_commander) {
                    commander = cardData;
                  } else {
                    cards.push(cardData);
                  }
                  
                } else {
                  // Fallback for cards not found in Scryfall
                  let category: Card['category'] = dbCard.is_commander ? 'commanders' : 'other';
                  let type_line = '';
                  
                  const cardName = dbCard.card_name.toLowerCase();
                  if (cardName.includes('plains') || cardName.includes('island') || cardName.includes('swamp') || 
                      cardName.includes('mountain') || cardName.includes('forest')) {
                    category = 'lands';
                    type_line = `Basic Land — ${dbCard.card_name}`;
                  } else if (cardName.includes('sol ring')) {
                    category = 'artifacts';
                    type_line = 'Artifact';
                  }

                  const cardData: Card = {
                    id: dbCard.card_id,
                    name: dbCard.card_name,
                    quantity: dbCard.quantity,
                    cmc: 0,
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
                
              } catch (error) {
                console.error(`Error processing ${dbCard.card_name}:`, error);
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
            currentDeckId: deckId,
            totalCards: cards.reduce((sum, card) => sum + card.quantity, 0)
          });

          return { success: true };
        } catch (error) {
          console.error('Database error:', error);
          return { success: false, error: 'Failed to load deck' };
        }
      },

      updateDeck: async (deckId: string) => {
        const state = get();
        const { supabase } = await import('@/integrations/supabase/client');

        try {
          // Get current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            return { success: false, error: 'User not authenticated' };
          }

          // Update deck metadata
          const { error: deckError } = await supabase
            .from('user_decks')
            .update({
              name: state.name,
              format: state.format,
              colors: state.colors,
              power_level: state.powerLevel,
              description: `${state.format} deck with ${state.totalCards} cards`,
            })
            .eq('id', deckId)
            .eq('user_id', user.id);

          if (deckError) {
            console.error('Error updating deck:', deckError);
            return { success: false, error: deckError.message };
          }

          // Delete existing deck cards
          const { error: deleteError } = await supabase
            .from('deck_cards')
            .delete()
            .eq('deck_id', deckId);

          if (deleteError) {
            console.error('Error deleting existing cards:', deleteError);
            return { success: false, error: deleteError.message };
          }

          // Insert commander if present
          if (state.commander) {
            const { error: commanderError } = await supabase
              .from('deck_cards')
              .insert({
                deck_id: deckId,
                card_id: state.commander.id,
                card_name: state.commander.name,
                quantity: 1,
                is_commander: true,
                is_sideboard: false
              });

            if (commanderError) {
              console.error('Error saving commander:', commanderError);
              return { success: false, error: commanderError.message };
            }
          }

          // Insert all other cards in batches to avoid issues
          if (state.cards.length > 0) {
            // Remove duplicates and ensure unique card entries
            const uniqueCards = state.cards.reduce((acc, card) => {
              const existing = acc.find(c => c.id === card.id);
              if (existing) {
                existing.quantity += card.quantity;
              } else {
                acc.push({ ...card });
              }
              return acc;
            }, [] as Card[]);

            const cardInserts = uniqueCards.map(card => ({
              deck_id: deckId,
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

          return { success: true };
        } catch (error) {
          console.error('Database error:', error);
          return { success: false, error: 'Failed to update deck' };
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
        currentDeckId: state.currentDeckId,
        totalCards: state.totalCards
      })
    }
  )
);