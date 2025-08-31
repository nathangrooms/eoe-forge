import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DeckCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  colors: string[];
  mana_cost?: string;
  quantity: number;
  category: 'creatures' | 'lands' | 'instants' | 'sorceries' | 'artifacts' | 'enchantments' | 'planeswalkers' | 'other';
  mechanics?: string[];
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
}

export interface Deck {
  id: string;
  name: string;
  format: string;
  description?: string;
  commander?: DeckCard;
  cards: DeckCard[];
  colors: string[];
  powerLevel: number;
  totalCards: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DeckManagementState {
  decks: Deck[];
  activeDeck: Deck | null;
  
  // Actions
  createDeck: (name: string, format: string, description?: string) => Deck;
  deleteDeck: (deckId: string) => void;
  setActiveDeck: (deckId: string) => void;
  updateDeck: (deckId: string, updates: Partial<Deck>) => void;
  setCommander: (deckId: string, commander: DeckCard) => void;
  addCardToDeck: (deckId: string, card: DeckCard) => void;
  removeCardFromDeck: (deckId: string, cardId: string) => void;
  updateCardQuantity: (deckId: string, cardId: string, quantity: number) => void;
  getDeckValue: (deckId: string) => number;
  
  // Computed properties
  getStandardDecks: () => Deck[];
  getCommanderDecks: () => Deck[];
  getDecksByFormat: (format: string) => Deck[];
}

export const useDeckManagementStore = create<DeckManagementState>()(
  persist(
    (set, get) => ({
      decks: [
        // Create a default deck for each format
        {
          id: 'default-standard',
          name: 'Standard Deck',
          format: 'standard',
          description: 'Your standard format deck',
          cards: [],
          colors: [],
          powerLevel: 5,
          totalCards: 0,
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'default-commander',
          name: 'Commander Deck',
          format: 'commander',
          description: 'Your commander deck',
          cards: [],
          colors: [],
          powerLevel: 5,
          totalCards: 0,
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ],
      activeDeck: null,

      createDeck: (name: string, format: string, description?: string) => {
        const newDeck: Deck = {
          id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          format,
          description,
          cards: [],
          colors: [],
          powerLevel: 5,
          totalCards: 0,
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        set(state => ({
          decks: [...state.decks, newDeck]
        }));
        
        return newDeck;
      },

      deleteDeck: (deckId: string) => {
        set(state => ({
          decks: state.decks.filter(deck => deck.id !== deckId),
          activeDeck: state.activeDeck?.id === deckId ? null : state.activeDeck
        }));
      },

      setActiveDeck: (deckId: string) => {
        const deck = get().decks.find(d => d.id === deckId);
        set({ activeDeck: deck || null });
      },

      updateDeck: (deckId: string, updates: Partial<Deck>) => {
        set(state => ({
          decks: state.decks.map(deck => 
            deck.id === deckId 
              ? { ...deck, ...updates, updatedAt: new Date() }
              : deck
          ),
          activeDeck: state.activeDeck?.id === deckId 
            ? { ...state.activeDeck, ...updates, updatedAt: new Date() }
            : state.activeDeck
        }));
      },

      setCommander: (deckId: string, commander: DeckCard) => {
        set(state => {
          const updatedDecks = state.decks.map(deck => {
            if (deck.id === deckId) {
              const commanderColors = commander.colors || [];
              return {
                ...deck,
                commander,
                colors: commanderColors,
                updatedAt: new Date()
              };
            }
            return deck;
          });

          return {
            decks: updatedDecks,
            activeDeck: state.activeDeck?.id === deckId 
              ? { ...state.activeDeck, commander, colors: commander.colors || [], updatedAt: new Date() }
              : state.activeDeck
          };
        });
      },

      addCardToDeck: (deckId: string, card: DeckCard) => {
        set(state => {
          const updatedDecks = state.decks.map(deck => {
            if (deck.id === deckId) {
              const existingCard = deck.cards.find(c => c.id === card.id);
              const updatedCards = existingCard
                ? deck.cards.map(c => 
                    c.id === card.id 
                      ? { ...c, quantity: c.quantity + card.quantity }
                      : c
                  )
                : [...deck.cards, card];

              const totalCards = updatedCards.reduce((sum, c) => sum + c.quantity, 0);
              
              return {
                ...deck,
                cards: updatedCards,
                totalCards,
                updatedAt: new Date()
              };
            }
            return deck;
          });

          return {
            decks: updatedDecks,
            activeDeck: state.activeDeck?.id === deckId 
              ? updatedDecks.find(d => d.id === deckId) || state.activeDeck
              : state.activeDeck
          };
        });
      },

      removeCardFromDeck: (deckId: string, cardId: string) => {
        set(state => {
          const updatedDecks = state.decks.map(deck => {
            if (deck.id === deckId) {
              const updatedCards = deck.cards.filter(c => c.id !== cardId);
              const totalCards = updatedCards.reduce((sum, c) => sum + c.quantity, 0);
              
              return {
                ...deck,
                cards: updatedCards,
                totalCards,
                updatedAt: new Date()
              };
            }
            return deck;
          });

          return {
            decks: updatedDecks,
            activeDeck: state.activeDeck?.id === deckId 
              ? updatedDecks.find(d => d.id === deckId) || state.activeDeck
              : state.activeDeck
          };
        });
      },

      updateCardQuantity: (deckId: string, cardId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeCardFromDeck(deckId, cardId);
          return;
        }

        set(state => {
          const updatedDecks = state.decks.map(deck => {
            if (deck.id === deckId) {
              const updatedCards = deck.cards.map(c => 
                c.id === cardId ? { ...c, quantity } : c
              );
              const totalCards = updatedCards.reduce((sum, c) => sum + c.quantity, 0);
              
              return {
                ...deck,
                cards: updatedCards,
                totalCards,
                updatedAt: new Date()
              };
            }
            return deck;
          });

          return {
            decks: updatedDecks,
            activeDeck: state.activeDeck?.id === deckId 
              ? updatedDecks.find(d => d.id === deckId) || state.activeDeck
              : state.activeDeck
          };
        });
      },

      getDeckValue: (deckId: string) => {
        const deck = get().decks.find(d => d.id === deckId);
        if (!deck) return 0;
        
        return deck.cards.reduce((total, card) => {
          const price = parseFloat(card.prices?.usd || '0');
          return total + (price * card.quantity);
        }, 0);
      },

      getStandardDecks: () => get().decks.filter(deck => deck.format === 'standard'),
      getCommanderDecks: () => get().decks.filter(deck => deck.format === 'commander'),
      getDecksByFormat: (format: string) => get().decks.filter(deck => deck.format === format),
    }),
    {
      name: 'deck-management-storage',
      partialize: (state) => ({
        decks: state.decks,
        activeDeck: state.activeDeck,
      }),
    }
  )
);