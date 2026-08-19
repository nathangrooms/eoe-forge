import { useCallback, useMemo, useState } from 'react';

/**
 * Deck list filtering.
 *
 * Two things were broken here. The power filter read `deck.power_level` /
 * `deck.powerLevel`, neither of which exists on a deck summary, so it resolved
 * to the literal `5` for every deck — dragging Min above 5 filtered out 100%
 * of decks. And colour filtering matched `deck.colors` with a plain OR, when
 * the operation Commander players actually need is colour *identity* with
 * Scryfall-style operators.
 */

export type ColorMatchMode = 'includes' | 'exactly' | 'atMost';

export interface DeckFilters {
  format: string[];
  colors: string[];
  colorMode: ColorMatchMode;
  minPower: number;
  maxPower: number;
  searchQuery: string;
  /**
   * Show only decks marked favourite.
   *
   * Favourites used to be a separate block on the collection page, which is a
   * page about cards. A favourite is a way of narrowing your decks, so it
   * belongs here with the other ways of doing that. Owner: "Favourite decks
   * probably doesn't need to be on the my collection page. makes me think the
   * my decks page needs a 'show favourites' button though".
   */
  favoritesOnly: boolean;
}

export interface DeckItem {
  id: string;
  name: string;
  format: string;
  colors?: string[];
  identity?: string[];
  power?: { score: number; stale: boolean } | null;
  favorite?: boolean;
}

export const COLOR_MATCH_LABELS: Record<ColorMatchMode, string> = {
  includes: 'Includes any (id>=)',
  exactly: 'Exactly (id=)',
  atMost: 'At most (id<=)',
};

const initialFilters: DeckFilters = {
  format: [],
  colors: [],
  colorMode: 'includes',
  minPower: 1,
  maxPower: 10,
  searchQuery: '',
  favoritesOnly: false,
};

/** Colour identity, falling back to the deck's colour list when unset. */
function identityOf(deck: DeckItem): string[] {
  const identity = deck.identity?.length ? deck.identity : deck.colors;
  return (identity ?? []).filter(Boolean);
}

function matchesColors(deck: DeckItem, selected: string[], mode: ColorMatchMode): boolean {
  const identity = new Set(identityOf(deck));
  const wanted = selected.filter(c => c !== 'C');
  const colorlessSelected = selected.includes('C');

  if (colorlessSelected && identity.size === 0) return true;
  if (wanted.length === 0) return colorlessSelected ? identity.size === 0 : true;

  switch (mode) {
    case 'exactly':
      return identity.size === wanted.length && wanted.every(c => identity.has(c));
    case 'atMost':
      return Array.from(identity).every(c => wanted.includes(c));
    case 'includes':
    default:
      return wanted.some(c => identity.has(c));
  }
}

export const useDeckFilters = <T extends DeckItem>(decks: T[]) => {
  const [filters, setFilters] = useState<DeckFilters>(initialFilters);

  const powerNarrowed = filters.minPower !== 1 || filters.maxPower !== 10;

  const filteredDecks = useMemo(() => {
    return decks.filter(deck => {
      if (filters.favoritesOnly && !deck.favorite) return false;

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        if (!deck.name.toLowerCase().includes(query)) return false;
      }

      if (filters.format.length > 0 && !filters.format.includes(deck.format)) {
        return false;
      }

      if (filters.colors.length > 0 && !matchesColors(deck, filters.colors, filters.colorMode)) {
        return false;
      }

      if (powerNarrowed) {
        // A deck with no current score is never silently hidden: filtering on a
        // stale number would drop decks out of the list on the strength of a
        // score that no longer describes them.
        const power = deck.power;
        if (power && !power.stale) {
          if (power.score < filters.minPower || power.score > filters.maxPower) return false;
        }
      }

      return true;
    });
  }, [decks, filters, powerNarrowed]);

  const updateFilters = useCallback((newFilters: Partial<DeckFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => setFilters(initialFilters), []);

  const toggleFormat = useCallback((format: string) => {
    setFilters(prev => ({
      ...prev,
      format: prev.format.includes(format)
        ? prev.format.filter(f => f !== format)
        : [...prev.format, format],
    }));
  }, []);

  const toggleColor = useCallback((color: string) => {
    setFilters(prev => ({
      ...prev,
      colors: prev.colors.includes(color)
        ? prev.colors.filter(c => c !== color)
        : [...prev.colors, color],
    }));
  }, []);

  const activeFilterCount =
    filters.format.length +
    filters.colors.length +
    (filters.searchQuery ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0) +
    (powerNarrowed ? 1 : 0);

  return {
    filters,
    filteredDecks,
    updateFilters,
    resetFilters,
    toggleFormat,
    toggleColor,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
};
