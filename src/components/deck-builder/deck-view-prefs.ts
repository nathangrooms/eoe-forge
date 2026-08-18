import { useCallback, useEffect, useState } from 'react';

export type DeckViewMode = 'grid' | 'table' | 'text';
export type DeckGroupBy = 'type' | 'color' | 'cmc' | 'none';
export type DeckSortKey = 'name' | 'cmc' | 'quantity' | 'price' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface DeckViewPrefs {
  mode: DeckViewMode;
  groupBy: DeckGroupBy;
  sortKey: DeckSortKey;
  sortDir: SortDirection;
  /** Minimum card width in px, drives the grid's auto-fill track size. */
  cardSize: number;
}

export const DEFAULT_DECK_VIEW_PREFS: DeckViewPrefs = {
  mode: 'grid',
  groupBy: 'type',
  sortKey: 'cmc',
  sortDir: 'asc',
  cardSize: 150,
};

export const CARD_SIZE_MIN = 90;
export const CARD_SIZE_MAX = 260;

const STORAGE_KEY = 'deckmatrix.deckView';

/** View preferences for the deck grid, persisted so they survive a reload. */
export function useDeckViewPrefs() {
  const [prefs, setPrefs] = useState<DeckViewPrefs>(() => {
    if (typeof window === 'undefined') return DEFAULT_DECK_VIEW_PREFS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_DECK_VIEW_PREFS;
      return { ...DEFAULT_DECK_VIEW_PREFS, ...(JSON.parse(raw) as Partial<DeckViewPrefs>) };
    } catch {
      return DEFAULT_DECK_VIEW_PREFS;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences simply don't persist */
    }
  }, [prefs]);

  const update = useCallback(<K extends keyof DeckViewPrefs>(key: K, value: DeckViewPrefs[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  return { prefs, update };
}
