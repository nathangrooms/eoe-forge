import { supabase } from '@/integrations/supabase/client';
import { EDHPowerCalculator } from '@/lib/deckbuilder/score/edh-power-calculator';
import { auditLogger } from '@/lib/audit/auditLogger';

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
   * Get list of deck summaries for current user (optimized - uses DB function)
   */
  static async getDeckSummaries(): Promise<DeckSummary[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get deck IDs only first
      const { data: decks, error } = await supabase
        .from('user_decks')
        .select('id')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!decks || decks.length === 0) return [];

      // Use the optimized RPC function for each deck
      const summaries = await Promise.all(
        decks.map(async ({ id }) => {
          try {
            const summary = await this.getDeckSummary(id);
            return summary;
          } catch (error) {
            console.error(`Error loading summary for deck ${id}:`, error);
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

      // Log deck creation
      await auditLogger.logDeckCreate(newDeck.id, newDeck.name, newDeck.format);

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
      const commander = deckCards?.find(card => card.is_commander);
      const mainboard = deckCards?.filter(card => !card.is_sideboard && !card.is_commander) || [];
      const sideboard = deckCards?.filter(card => card.is_sideboard) || [];

      switch (format) {
        case 'arena':
          // Arena format
          exportText = 'Deck\n';
          if (commander) {
            exportText += `1 ${commander.card_name} (Commander)\n`;
          }
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
          if (commander) {
            exportText += `1 ${commander.card_name} (Commander)\n`;
          }
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
          if (commander) {
            exportText += `1x ${commander.card_name} (Commander)\n\n`;
          }
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