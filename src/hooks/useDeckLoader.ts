import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDeckStore } from '@/stores/deckStore';
import { showError, showSuccess } from '@/components/ui/toast-helpers';

export interface LoadDeckOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  silent?: boolean;
}

/**
 * Custom hook for loading decks from Supabase
 * Consolidates duplicate deck loading logic across the app
 */
export const useDeckLoader = () => {
  const [loading, setLoading] = useState(false);
  const deck = useDeckStore();

  const loadDeck = async (deckId: string, options: LoadDeckOptions = {}) => {
    setLoading(true);
    
    try {
      const result = await deck.loadDeck(deckId);
      
      if (result.success) {
        deck.setCurrentDeckId(deckId);
        if (!options.silent) {
          showSuccess('Deck Loaded', 'Deck loaded successfully');
        }
        options.onSuccess?.();
        return { success: true };
      } else {
        const errorMsg = result.error || 'Failed to load deck';
        if (!options.silent) {
          showError('Load Failed', errorMsg);
        }
        options.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (!options.silent) {
        showError('Load Failed', errorMsg);
      }
      options.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const loadDeckSummary = async (deckId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('compute_deck_summary', { deck_id: deckId });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error loading deck summary:', error);
      return { success: false, error };
    }
  };

  return {
    loadDeck,
    loadDeckSummary,
    loading
  };
};
