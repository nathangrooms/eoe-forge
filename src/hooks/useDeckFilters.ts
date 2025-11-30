import { useState, useMemo } from 'react';

export interface DeckFilters {
  format: string[];
  colors: string[];
  minPower: number;
  maxPower: number;
  searchQuery: string;
}

export interface DeckItem {
  id: string;
  name: string;
  format: string;
  colors?: string[];
  power_level?: number;
  powerLevel?: number;
}

const initialFilters: DeckFilters = {
  format: [],
  colors: [],
  minPower: 1,
  maxPower: 10,
  searchQuery: ''
};

/**
 * Custom hook for filtering and searching decks
 * Provides centralized deck filtering logic
 */
export const useDeckFilters = <T extends DeckItem>(decks: T[]) => {
  const [filters, setFilters] = useState<DeckFilters>(initialFilters);

  const filteredDecks = useMemo(() => {
    return decks.filter(deck => {
      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        if (!deck.name.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Format filter
      if (filters.format.length > 0) {
        if (!filters.format.includes(deck.format)) {
          return false;
        }
      }

      // Colors filter (deck must contain at least one of the selected colors)
      if (filters.colors.length > 0) {
        const deckColors = deck.colors || [];
        const hasMatchingColor = filters.colors.some(color => 
          deckColors.includes(color)
        );
        if (!hasMatchingColor) {
          return false;
        }
      }

      // Power level filter
      const deckPower = deck.power_level || deck.powerLevel || 5;
      if (deckPower < filters.minPower || deckPower > filters.maxPower) {
        return false;
      }

      return true;
    });
  }, [decks, filters]);

  const updateFilters = (newFilters: Partial<DeckFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  const toggleFormat = (format: string) => {
    setFilters(prev => ({
      ...prev,
      format: prev.format.includes(format)
        ? prev.format.filter(f => f !== format)
        : [...prev.format, format]
    }));
  };

  const toggleColor = (color: string) => {
    setFilters(prev => ({
      ...prev,
      colors: prev.colors.includes(color)
        ? prev.colors.filter(c => c !== color)
        : [...prev.colors, color]
    }));
  };

  return {
    filters,
    filteredDecks,
    updateFilters,
    resetFilters,
    toggleFormat,
    toggleColor,
    hasActiveFilters: filters.format.length > 0 || 
                      filters.colors.length > 0 || 
                      filters.searchQuery !== '' ||
                      filters.minPower !== 1 ||
                      filters.maxPower !== 10
  };
};
