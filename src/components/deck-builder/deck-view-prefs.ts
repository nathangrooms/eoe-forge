import { useCallback, useEffect, useState } from 'react';
import { Grid3X3, LayoutList, Type as TypeIcon } from 'lucide-react';
import type { ListingMode, SortOption } from '@/components/listing';

/**
 * What the builder's decklist offers, and where the choices live.
 *
 * ## What this file used to be
 *
 * A fourth `useDeckViewPrefs`. Four separate implementations of "remember how
 * this reader likes to look at a list" existed — this one, `DeckViewControls`'
 * for My Decks, `CollectionBrowser`'s local `loadView`, and precons' density
 * key — and they were the same four facts each time: which mode, which sort
 * axis, which direction, how big the cards are. `useListingView` holds them
 * now, under the key this file has always used, so nobody's mode or sort
 * resets.
 *
 * ## What is left, and why it could not move
 *
 * **Grouping.** The builder's decklist can be cut by card type, by colour, by
 * mana value, or not at all, and no other listing in the product has an axis
 * worth cutting on. It is this surface's own control, so it keeps its own
 * state, and `FilterBar` takes it as a slot rather than learning what a deck
 * is.
 *
 * It has its own storage key now because `useListingView` writes the whole
 * payload under `deckmatrix.deckView` and would drop a field it does not know
 * about. The old blob is read once as a migration, so a reader who had chosen
 * "group by colour" still has it.
 */

export type DeckViewMode = 'grid' | 'table' | 'text';
export type DeckGroupBy = 'type' | 'color' | 'cmc' | 'none';
export type DeckSortKey = 'name' | 'cmc' | 'quantity' | 'price' | 'type';

/** Where the mode, sort axis and direction are remembered. Do not rename. */
export const DECK_BUILD_VIEW_SURFACE = 'deckmatrix.deckView';

/** Card width on a first visit. The figure this surface has always defaulted to. */
export const DEFAULT_DECK_CARD_SIZE = 150;

export const DECK_BUILD_MODES: ListingMode[] = [
  { id: 'grid', label: 'Grid', icon: Grid3X3, layout: 'rows', sized: true },
  { id: 'table', label: 'Table', icon: LayoutList, layout: 'rows' },
  { id: 'text', label: 'Text', icon: TypeIcon, layout: 'rows' },
];

export const DECK_BUILD_SORTS: SortOption[] = [
  { value: 'cmc', label: 'Mana value' },
  { value: 'name', label: 'Name' },
  { value: 'quantity', label: 'Copies' },
  { value: 'price', label: 'Price' },
  { value: 'type', label: 'Type' },
];

export const GROUP_LABELS: Record<DeckGroupBy, string> = {
  type: 'Card type',
  color: 'Colour',
  cmc: 'Mana value',
  none: 'No grouping',
};

const GROUP_KEY = 'deckmatrix.deckView.groupBy';

function isGroupBy(value: unknown): value is DeckGroupBy {
  return value === 'type' || value === 'color' || value === 'cmc' || value === 'none';
}

function readGroupBy(): DeckGroupBy {
  if (typeof window === 'undefined') return 'type';
  try {
    const own = window.localStorage.getItem(GROUP_KEY);
    if (isGroupBy(own)) return own;
    /* Migration, once: the choice used to live inside the view payload, which
       `useListingView` now owns and rewrites without it. Read it out of the old
       blob rather than resetting everybody to "group by card type". */
    const legacy = window.localStorage.getItem(DECK_BUILD_VIEW_SURFACE);
    if (legacy && legacy.startsWith('{')) {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      if (isGroupBy(parsed.groupBy)) return parsed.groupBy;
    }
  } catch {
    /* private mode, or a value an older build wrote */
  }
  return 'type';
}

/** How the decklist is cut into sections. This surface's own control. */
export function useDeckGroupBy(): [DeckGroupBy, (next: DeckGroupBy) => void] {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>(readGroupBy);

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_KEY, groupBy);
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
  }, [groupBy]);

  return [groupBy, useCallback((next: DeckGroupBy) => setGroupBy(next), [])];
}
