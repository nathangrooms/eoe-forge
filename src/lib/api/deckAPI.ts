import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/stores/deckStore';

export interface SavedDeck {
  id: string;
  name: string;
  format: string;
  colors: string[];
  power_level: number;
  description?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  cards: SavedDeckCard[];
}

export interface SavedDeckCard {
  card_id: string;
  card_name: string;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
}

export class DeckAPI {
  static async saveDeck(deck: {
    name: string;
    format: string;
    colors: string[];
    power_level: number;
    description?: string;
    is_public?: boolean;
    cards: Card[];
    commander?: Card;
  }): Promise<{ success: boolean; deckId?: string; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // First, create or update the deck
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deck.name,
          format: deck.format,
          colors: deck.colors,
          power_level: deck.power_level,
          description: deck.description || '',
          is_public: deck.is_public || false
        })
        .select()
        .single();

      if (deckError) {
        console.error('Error saving deck:', deckError);
        return { success: false, error: deckError.message };
      }

      // Then save all the cards
      const cardInserts = deck.cards.map(card => ({
        deck_id: deckData.id,
        card_id: card.id,
        card_name: card.name,
        quantity: card.quantity,
        is_commander: false,
        is_sideboard: false
      }));

      // Add commander if it exists
      if (deck.commander) {
        cardInserts.push({
          deck_id: deckData.id,
          card_id: deck.commander.id,
          card_name: deck.commander.name,
          quantity: 1,
          is_commander: true,
          is_sideboard: false
        });
      }

      if (cardInserts.length > 0) {
        const { error: cardsError } = await supabase
          .from('deck_cards')
          .insert(cardInserts);

        if (cardsError) {
          console.error('Error saving deck cards:', cardsError);
          // Clean up the deck if card saving failed
          await supabase.from('user_decks').delete().eq('id', deckData.id);
          return { success: false, error: cardsError.message };
        }
      }

      return { success: true, deckId: deckData.id };
    } catch (error) {
      console.error('Unexpected error saving deck:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }

  static async loadDeck(deckId: string): Promise<{ success: boolean; deck?: SavedDeck; error?: string }> {
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
      const { data: cardData, error: cardError } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', deckId);

      if (cardError) {
        console.error('Error loading deck cards:', cardError);
        return { success: false, error: cardError.message };
      }

      const deck: SavedDeck = {
        id: deckData.id,
        name: deckData.name,
        format: deckData.format,
        colors: deckData.colors,
        power_level: deckData.power_level,
        description: deckData.description,
        is_public: deckData.is_public,
        created_at: deckData.created_at,
        updated_at: deckData.updated_at,
        cards: cardData || []
      };

      return { success: true, deck };
    } catch (error) {
      console.error('Unexpected error loading deck:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }

  static async updateDeck(deckId: string, updates: Partial<{
    name: string;
    format: string;
    colors: string[];
    power_level: number;
    description: string;
    is_public: boolean;
    cards: Card[];
    commander?: Card;
  }>): Promise<{ success: boolean; error?: string }> {
    try {
      // Update deck metadata if provided
      if (Object.keys(updates).some(key => key !== 'cards' && key !== 'commander')) {
        const deckUpdates = { ...updates };
        delete deckUpdates.cards;
        delete deckUpdates.commander;

        const { error: deckError } = await supabase
          .from('user_decks')
          .update(deckUpdates)
          .eq('id', deckId);

        if (deckError) {
          console.error('Error updating deck:', deckError);
          return { success: false, error: deckError.message };
        }
      }

      // Update cards if provided
      if (updates.cards !== undefined) {
        // Delete existing cards
        const { error: deleteError } = await supabase
          .from('deck_cards')
          .delete()
          .eq('deck_id', deckId);

        if (deleteError) {
          console.error('Error deleting old deck cards:', deleteError);
          return { success: false, error: deleteError.message };
        }

        // Insert new cards
        const cardInserts = updates.cards.map(card => ({
          deck_id: deckId,
          card_id: card.id,
          card_name: card.name,
          quantity: card.quantity,
          is_commander: false,
          is_sideboard: false
        }));

        // Add commander if it exists
        if (updates.commander) {
          cardInserts.push({
            deck_id: deckId,
            card_id: updates.commander.id,
            card_name: updates.commander.name,
            quantity: 1,
            is_commander: true,
            is_sideboard: false
          });
        }

        if (cardInserts.length > 0) {
          const { error: cardsError } = await supabase
            .from('deck_cards')
            .insert(cardInserts);

          if (cardsError) {
            console.error('Error updating deck cards:', cardsError);
            return { success: false, error: cardsError.message };
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error updating deck:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }

  static async deleteDeck(deckId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Delete the deck (cascade will handle deck_cards)
      const { error } = await supabase
        .from('user_decks')
        .delete()
        .eq('id', deckId);

      if (error) {
        console.error('Error deleting deck:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error deleting deck:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }

  static async toggleFavorite(deckId: string): Promise<{ success: boolean; isFavorite?: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Check if already favorited
      const { data: existing } = await supabase
        .from('favorite_decks')
        .select('*')
        .eq('user_id', user.id)
        .eq('deck_id', deckId)
        .single();

      if (existing) {
        // Remove from favorites
        const { error } = await supabase
          .from('favorite_decks')
          .delete()
          .eq('user_id', user.id)
          .eq('deck_id', deckId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, isFavorite: false };
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('favorite_decks')
          .insert({
            user_id: user.id,
            deck_id: deckId
          });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, isFavorite: true };
      }
    } catch (error) {
      console.error('Unexpected error toggling favorite:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }

  static async getUserDecks(): Promise<{ success: boolean; decks?: SavedDeck[]; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data: decks, error } = await supabase
        .from('user_decks')
        .select(`
          *,
          deck_cards(*)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading user decks:', error);
        return { success: false, error: error.message };
      }

      const formattedDecks: SavedDeck[] = (decks || []).map(deck => ({
        id: deck.id,
        name: deck.name,
        format: deck.format,
        colors: deck.colors,
        power_level: deck.power_level,
        description: deck.description,
        is_public: deck.is_public,
        created_at: deck.created_at,
        updated_at: deck.updated_at,
        cards: deck.deck_cards || []
      }));

      return { success: true, decks: formattedDecks };
    } catch (error) {
      console.error('Unexpected error loading user decks:', error);
      return { success: false, error: 'Unexpected error occurred' };
    }
  }
}