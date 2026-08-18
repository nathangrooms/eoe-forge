import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deriveCardTags } from '@/lib/cards/tagger';

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
  /**
   * Role tags, the same vocabulary `cards.tags` holds.
   *
   * `ArchetypeDetection` reads these and nothing else — it counts cards
   * tagged `aristocrats`, `storm`, `landfall` and so on. The field did not
   * exist, so every deck it was handed reported zero of every tag and only
   * the three type-line detectors could ever fire.
   */
  tags?: string[];
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
      
      addCard: (card) => set((state) => {
        const existingCard = state.cards.find(c => c.id === card.id);
        // Use the quantity from the card if provided, otherwise default to 1
        const quantityToAdd = card.quantity || 1;
        
        console.log('addCard called:', card.name, 'quantity to add:', quantityToAdd, 'existing:', !!existingCard, 'totalCards before:', state.totalCards);
        
        if (existingCard) {
          // Increase quantity by the card's quantity
          const updatedCards = state.cards.map(c =>
            c.id === card.id ? { ...c, quantity: c.quantity + quantityToAdd } : c
          );
          const newState = {
            cards: updatedCards,
            totalCards: state.totalCards + quantityToAdd
          };
          
          console.log('addCard (existing): new quantity:', existingCard.quantity + quantityToAdd, 'totalCards after:', newState.totalCards);
          
          // Auto-save if we have a current deck ID
          if (state.currentDeckId) {
            setTimeout(() => {
              get().updateDeck(state.currentDeckId!);
            }, 500); // Debounce auto-save
          }
          
          return newState;
        } else {
          // Add new card with its quantity
          const newState = {
            cards: [...state.cards, { ...card, quantity: quantityToAdd }],
            totalCards: state.totalCards + quantityToAdd
          };
          
          console.log('addCard (new): totalCards after:', newState.totalCards, 'cards count:', newState.cards.length);
          
          // NOTE: Auto-save removed to prevent race conditions.
          // The parent component handles auto-save with proper debouncing.
          
          return newState;
        }
      }),
      
      removeCard: (cardId) => set((state) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) {
          console.warn('removeCard: Card not found', cardId);
          return state;
        }
        
        console.log('removeCard called:', card.name, 'quantity:', card.quantity, 'totalCards before:', state.totalCards);
        
        let newState;
        if (card.quantity > 1) {
          // Decrease quantity by 1
          const updatedCards = state.cards.map(c =>
            c.id === cardId ? { ...c, quantity: c.quantity - 1 } : c
          );
          newState = {
            cards: updatedCards,
            totalCards: state.totalCards - 1
          };
        } else {
          // Remove card entirely (quantity is 1)
          newState = {
            cards: state.cards.filter(c => c.id !== cardId),
            totalCards: state.totalCards - 1
          };
        }
        
        console.log('removeCard result: totalCards after:', newState.totalCards);
        
        // NOTE: Auto-save removed to prevent race conditions.
        // The parent component should call updateDeck explicitly when needed.
        
        return newState;
      }),
      
      updateCardQuantity: (cardId, quantity) => set((state) => {
        const card = state.cards.find(c => c.id === cardId);
        console.log('updateCardQuantity called:', card?.name, 'from', card?.quantity, 'to', quantity, 'totalCards before:', state.totalCards);
        
        if (quantity <= 0) {
          // Remove card entirely
          const removedQuantity = card?.quantity || 0;
          const newState = {
            cards: state.cards.filter(c => c.id !== cardId),
            totalCards: state.totalCards - removedQuantity
          };
          console.log('updateCardQuantity (remove): totalCards after:', newState.totalCards);
          return newState;
        } else {
          // Update quantity
          const oldQuantity = card?.quantity || 0;
          const difference = quantity - oldQuantity;
          
          const updatedCards = state.cards.map(c =>
            c.id === cardId ? { ...c, quantity } : c
          );
          
          const newState = {
            cards: updatedCards,
            totalCards: state.totalCards + difference
          };
          console.log('updateCardQuantity (update): totalCards after:', newState.totalCards);
          return newState;
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
            // power_level is NOT written here. It is a mirror of the canonical
            // EDH score and is owned by `persistDeckPower` in
            // `@/lib/deck/power`. Writing a store field with no setter used to
            // stamp every new deck with the previously-opened deck's number.
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

          /*
           * Cards come from the local `cards` table, joined in one indexed
           * query by `fetchDeckCards`.
           *
           * This used to issue one `api.scryfall.com/cards/named?exact=` per
           * unique card name — 85+ requests to open a commander deck, and 250+
           * once the page's other consumers piled on. Scryfall rate-limits at
           * ~10 req/s, so a large deck reliably collected 429s, and every
           * refused card fell into the "not found" branch below: mana value 0,
           * empty type line, no art, no price. The builder then showed
           * "Est. value $0", "Avg mana value 0.00", "Colourless", a mana curve
           * with everything stacked on 0 — and, worst of all, computed an EDH
           * power score from that wreckage and persisted it to `user_decks`,
           * so the wrong number followed the deck onto the tile and the deck
           * page. Opening the builder could silently corrupt the deck's score.
           *
           * `named?exact=` also returned an arbitrary printing, so the store
           * replaced the deck's real `card_id` with a different one and
           * collection ownership was matched on ids the deck did not hold.
           */
          const { fetchDeckCards, scryfallImageUrl } = await import('@/lib/deck/deckCards');

          let deckRows;
          try {
            deckRows = await fetchDeckCards(deckId);
          } catch (cardsError) {
            console.error('Error loading deck cards:', cardsError);
            const message =
              cardsError instanceof Error ? cardsError.message : 'Failed to load deck cards';
            return { success: false, error: message };
          }

          // Only printings genuinely absent from the local table go to
          // Scryfall — normally none, and never more than a handful.
          const missing = deckRows.filter(row => !row.card);
          const fallback = new Map<string, any>();
          if (missing.length > 0) {
            const names = Array.from(new Set<string>(missing.map(row => row.card_name)));
            await Promise.all(
              names.map(async cardName => {
                try {
                  const response = await fetch(
                    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
                  );
                  fallback.set(cardName, response.ok ? await response.json() : null);
                } catch (error) {
                  console.error(`Error fetching ${cardName}:`, error);
                  fallback.set(cardName, null);
                }
              })
            );
          }

          const deckCards = deckRows.map(row => {
            const local = row.card;
            const api = local ? null : fallback.get(row.card_name);
            return {
              card_id: row.card_id,
              card_name: row.card_name,
              quantity: row.quantity,
              is_commander: row.is_commander,
              is_sideboard: row.is_sideboard,
              // Shaped like the Scryfall payload the mapping below already
              // expects, so the two sources stay interchangeable.
              resolved: local
                ? {
                    id: row.card_id,
                    name: local.name,
                    cmc: local.cmc,
                    type_line: local.type_line,
                    colors: local.colors,
                    color_identity: local.color_identity,
                    oracle_text: local.oracle_text,
                    power: local.power,
                    toughness: local.toughness,
                    image_uris: local.image_uris ?? {
                      small: scryfallImageUrl(row.card_id, 'small') ?? undefined,
                      normal: scryfallImageUrl(row.card_id, 'normal') ?? undefined,
                      large: scryfallImageUrl(row.card_id, 'large') ?? undefined,
                      art_crop: scryfallImageUrl(row.card_id, 'art_crop') ?? undefined,
                    },
                    prices: local.prices,
                    set: local.set_code,
                    set_name: local.set_code,
                    rarity: local.rarity,
                    keywords: local.keywords,
                    legalities: local.legalities,
                    layout: 'normal',
                    mana_cost: local.mana_cost,
                    // Authoritative: derived by the database from every face.
                    tags: local.tags,
                  }
                : api,
            };
          });

          // Transform and set deck data
          const cards: Card[] = [];
          let commander: Card | undefined;

          {
            for (const dbCard of deckCards) {
              try {
                const apiCard = dbCard.resolved;

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
                    // The deck's own printing id, never the arbitrary one a
                    // name lookup returns — collection ownership, card removal
                    // and replacement all key on it.
                    id: dbCard.card_id || apiCard.id,
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
                    mechanics: apiCard.keywords || [],
                    /*
                     * Derived here rather than fetched: this path already has
                     * the full Scryfall payload, and `deriveCardTags` is the
                     * same rule set compiled into `public.derive_card_tags`,
                     * so the result matches the row in our own table without a
                     * second round trip. `card_faces` is read for us.
                     */
                    tags: apiCard.tags?.length ? apiCard.tags : deriveCardTags(apiCard)
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

          // Deduplicate cards - merge any cards with the same ID
          const deduplicatedCards = cards.reduce((acc, card) => {
            const existing = acc.find(c => c.id === card.id);
            if (existing) {
              existing.quantity += card.quantity;
            } else {
              acc.push({ ...card });
            }
            return acc;
          }, [] as Card[]);

          console.log('Loaded deck with', deduplicatedCards.length, 'unique cards, total:', deduplicatedCards.reduce((sum, c) => sum + c.quantity, 0));

          // Update store state
          set({
            name: deckData.name,
            format: deckData.format as any,
            colors: deckData.colors,
            cards: deduplicatedCards,
            commander,
            currentDeckId: deckId,
            totalCards: deduplicatedCards.reduce((sum, card) => sum + card.quantity, 0)
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
          // SAFETY CHECK: Don't sync if deck is essentially empty (only commander or nothing)
          // This prevents accidental data loss from race conditions or stale state
          if (state.cards.length === 0 && !state.commander) {
            console.warn('Skipping updateDeck: deck state is empty, likely a race condition');
            return { success: false, error: 'Deck state is empty - sync skipped to prevent data loss' };
          }

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
              // See saveDeck: power_level is never written from the store.
              description: `${state.format} deck with ${state.totalCards} cards`,
            })
            .eq('id', deckId)
            .eq('user_id', user.id);

          if (deckError) {
            console.error('Error updating deck:', deckError);
            return { success: false, error: deckError.message };
          }

          // Get current cards in database to compute delta
          const { data: existingCards } = await supabase
            .from('deck_cards')
            .select('id, card_id')
            .eq('deck_id', deckId);

          // Build set of card IDs we want to keep
          const currentCardIds = new Set(state.cards.map(c => c.id));
          if (state.commander) {
            currentCardIds.add(state.commander.id);
          }

          // Delete only cards that are no longer in the deck
          const cardsToDelete = existingCards?.filter(ec => !currentCardIds.has(ec.card_id)) || [];
          if (cardsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from('deck_cards')
              .delete()
              .in('id', cardsToDelete.map(c => c.id));

            if (deleteError) {
              console.error('Error deleting removed cards:', deleteError);
              return { success: false, error: deleteError.message };
            }
          }

          // Upsert commander if present
          if (state.commander) {
            const { error: commanderError } = await supabase
              .from('deck_cards')
              .upsert({
                deck_id: deckId,
                card_id: state.commander.id,
                card_name: state.commander.name,
                quantity: 1,
                is_commander: true,
                is_sideboard: false
              }, { onConflict: 'deck_id,card_id', ignoreDuplicates: false });

            if (commanderError) {
              console.error('Error saving commander:', commanderError);
              return { success: false, error: commanderError.message };
            }
          }

          // Upsert all other cards
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

            const cardUpserts = uniqueCards.map(card => ({
              deck_id: deckId,
              card_id: card.id,
              card_name: card.name,
              quantity: card.quantity,
              is_commander: false,
              is_sideboard: false
            }));

            const { error: cardsError } = await supabase
              .from('deck_cards')
              .upsert(cardUpserts, { onConflict: 'deck_id,card_id', ignoreDuplicates: false });

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
        cards: state.cards,
        commander: state.commander,
        currentDeckId: state.currentDeckId,
        totalCards: state.totalCards
      })
    }
  )
);