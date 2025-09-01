import { supabase } from '@/integrations/supabase/client';

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  colors: string[];
  identity: string[];
  commander?: {
    name: string;
    image: string;
  };
  counts: {
    total: number;
    unique: number;
    sideboard?: number;
    lands: number;
    creatures: number;
    instants: number;
    sorceries: number;
    artifacts: number;
    enchantments: number;
    planeswalkers: number;
    battles: number;
  };
  curve: {
    bins: Record<"0-1"|"2"|"3"|"4"|"5"|"6-7"|"8-9"|"10+", number>;
  };
  mana: {
    sources: Record<"W"|"U"|"B"|"R"|"G"|"C", number>;
    untappedPctByTurn: { t1: number; t2: number; t3: number };
  };
  legality: {
    ok: boolean;
    issues: string[];
  };
  power: {
    score: number;
    band: "casual"|"mid"|"high"|"cEDH";
    drivers: string[];
    drags: string[];
  };
  economy: {
    priceUSD: number;
    ownedPct: number;
    missing: number;
  };
  tags: string[];
  updatedAt: string;
  favorite: boolean;
}

export class DeckAPI {
  /**
   * Get list of deck summaries for current user
   */
  static async getDeckSummaries(): Promise<DeckSummary[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data: decks, error } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, power_level, description, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Get summaries for each deck
      const summaries = await Promise.all(
        (decks || []).map(async (deck) => {
          try {
            const { data: summaryData, error: summaryError } = await supabase
              .rpc('compute_deck_summary', { deck_id: deck.id });

            if (summaryError) {
              console.error('Error computing deck summary:', summaryError);
              // Return basic summary if computation fails
              return {
                id: deck.id,
                name: deck.name,
                format: deck.format,
                colors: deck.colors,
                identity: deck.colors,
                counts: {
                  total: 0,
                  unique: 0,
                  lands: 0,
                  creatures: 0,
                  instants: 0,
                  sorceries: 0,
                  artifacts: 0,
                  enchantments: 0,
                  planeswalkers: 0,
                  battles: 0
                },
                curve: {
                  bins: { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6-7': 0, '8-9': 0, '10+': 0 }
                },
                mana: {
                  sources: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
                  untappedPctByTurn: { t1: 0, t2: 0, t3: 0 }
                },
                legality: { ok: true, issues: [] },
                power: {
                  score: deck.power_level,
                  band: deck.power_level <= 3 ? 'casual' : deck.power_level <= 6 ? 'mid' : deck.power_level <= 8 ? 'high' : 'cEDH',
                  drivers: [],
                  drags: []
                },
                economy: { priceUSD: 0, ownedPct: 0, missing: 0 },
                tags: [],
                updatedAt: deck.updated_at,
                favorite: false
              } as DeckSummary;
            }

            return summaryData as unknown as DeckSummary;
          } catch (error) {
            console.error(`Error processing deck ${deck.id}:`, error);
            return null;
          }
        })
      );

      return summaries.filter(Boolean) as DeckSummary[];
    } catch (error) {
      console.error('Error fetching deck summaries:', error);
      throw error;
    }
  }

  /**
   * Get detailed summary for a specific deck
   */
  static async getDeckSummary(deckId: string): Promise<DeckSummary | null> {
    try {
      const { data: summaryData, error } = await supabase
        .rpc('compute_deck_summary', { deck_id: deckId });

      if (error) {
        throw error;
      }

      return summaryData as unknown as DeckSummary;
    } catch (error) {
      console.error('Error fetching deck summary:', error);
      throw error;
    }
  }

  /**
   * Toggle favorite status for a deck
   */
  static async toggleFavorite(deckId: string): Promise<{ favorited: boolean; message: string }> {
    try {
      const { data: result, error } = await supabase
        .rpc('toggle_deck_favorite', { deck_id: deckId });

      if (error) {
        throw error;
      }

      const resultObj = result as any;
      if (resultObj.error) {
        throw new Error(resultObj.error);
      }

      return {
        favorited: resultObj.favorited,
        message: resultObj.message
      };
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  /**
   * Get user's favorite decks
   */
  static async getFavoriteDecks(): Promise<any[]> {
    try {
      const { data: favorites, error } = await supabase
        .rpc('get_favorite_decks');

      if (error) {
        throw error;
      }

      return (favorites as any[]) || [];
    } catch (error) {
      console.error('Error fetching favorite decks:', error);
      throw error;
    }
  }

  /**
   * Duplicate a deck
   */
  static async duplicateDeck(deckId: string): Promise<string> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get original deck
      const { data: originalDeck, error: deckError } = await supabase
        .from('user_decks')
        .select('*')
        .eq('id', deckId)
        .single();

      if (deckError) {
        throw deckError;
      }

      // Create new deck
      const { data: newDeck, error: createError } = await supabase
        .from('user_decks')
        .insert({
          user_id: session.user.id,
          name: `${originalDeck.name} (Copy)`,
          format: originalDeck.format,
          colors: originalDeck.colors,
          power_level: originalDeck.power_level,
          description: originalDeck.description,
          is_public: false
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Copy deck cards
      const { data: originalCards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', deckId);

      if (cardsError) {
        throw cardsError;
      }

      if (originalCards && originalCards.length > 0) {
        const newCards = originalCards.map(card => ({
          deck_id: newDeck.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          is_commander: card.is_commander,
          is_sideboard: card.is_sideboard
        }));

        const { error: insertError } = await supabase
          .from('deck_cards')
          .insert(newCards);

        if (insertError) {
          throw insertError;
        }
      }

      return newDeck.id;
    } catch (error) {
      console.error('Error duplicating deck:', error);
      throw error;
    }
  }

  /**
   * Export deck in various formats
   */
  static async exportDeck(deckId: string, format: 'arena' | 'txt' | 'mtgo'): Promise<Blob> {
    try {
      // Get deck cards
      const { data: deckCards, error } = await supabase
        .from('deck_cards')
        .select('card_name, quantity, is_commander, is_sideboard')
        .eq('deck_id', deckId);

      if (error) {
        throw error;
      }

      let exportText = '';
      const mainboard = deckCards?.filter(card => !card.is_sideboard) || [];
      const sideboard = deckCards?.filter(card => card.is_sideboard) || [];

      switch (format) {
        case 'arena':
          // Arena format
          exportText = 'Deck\n';
          mainboard.forEach(card => {
            exportText += `${card.quantity} ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\nSideboard\n';
            sideboard.forEach(card => {
              exportText += `${card.quantity} ${card.card_name}\n`;
            });
          }
          break;

        case 'mtgo':
          // MTGO format (similar to arena but different header)
          mainboard.forEach(card => {
            exportText += `${card.quantity} ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\n';
            sideboard.forEach(card => {
              exportText += `SB: ${card.quantity} ${card.card_name}\n`;
            });
          }
          break;

        case 'txt':
        default:
          // Plain text format
          mainboard.forEach(card => {
            exportText += `${card.quantity}x ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\nSideboard:\n';
            sideboard.forEach(card => {
              exportText += `${card.quantity}x ${card.card_name}\n`;
            });
          }
          break;
      }

      return new Blob([exportText], { type: 'text/plain' });
    } catch (error) {
      console.error('Error exporting deck:', error);
      throw error;
    }
  }

  /**
   * Get storage container linked to deck (if any)
   */
  static async getDeckStorage(deckId: string): Promise<any | null> {
    try {
      const { data: container, error } = await supabase
        .from('storage_containers')
        .select('*')
        .eq('deck_id', deckId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return container;
    } catch (error) {
      console.error('Error fetching deck storage:', error);
      throw error;
    }
  }
}