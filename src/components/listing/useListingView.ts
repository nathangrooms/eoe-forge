import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useCardSize, CARD_WIDTH_DEFAULT } from '@/components/cards';
import { usePageSize } from '@/hooks/usePagination';
import {
  readListingView,
  writeListingView,
  resolveMode,
  type ListingViewState,
  type SortDirection,
} from './listing-view';

/**
 * One surface's view: which mode, how big the cards are, how it is sorted, how
 * many rows a page holds.
 *
 * Every one of those was already remembered somewhere, under a different key,
 * by a different piece of code: `useDeckViewPrefs` for My Decks, a local
 * `loadView` in `CollectionBrowser`, `deck-view-prefs.ts` for the deck page,
 * `PreconDensity` for precons. They are the same four facts. This is where they
 * live now, and the surface name is the only thing that varies.
 *
 * ```tsx
 * const view = useListingView({ surface: 'deckmatrix.collection.view', modes: MODES, defaultSize: 200 });
 * <FilterBar view={view} … />
 * <ListingFrame view={view} …>{tiles}</ListingFrame>
 * ```
 *
 * The hook is deliberately not a component. `FilterBar` draws the size slider
 * and the mode toggle while `ListingFrame` draws what they control, and the two
 * sit in different parts of the page, so the state has to be something a page
 * holds and hands to both. That is the same shape play mode uses for its four
 * action sources feeding one table.
 */

export interface ListingMode {
  /** Stable id. It is what gets written to storage, so do not rename casually. */
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * `grid` puts the body in a `CardGrid` at the slider's width and shows the
   * slider. `rows` renders the body as given and hides it, because a table has
   * no card width to set.
   */
  layout: 'grid' | 'rows';
  /**
   * This mode draws cards at a width the reader chooses, so the size slider
   * applies. Defaults to `layout === 'grid'`, which is what almost every mode
   * wants and why this is usually absent.
   *
   * It exists because "who lays the body out" and "is there a card width" are
   * two facts, and `layout` was doing duty for both. Card search's grid lays
   * itself out: its results carry arrow-key navigation that measures the live
   * column count off the grid element, so the grid has to be the one the
   * component itself rendered. Nesting it inside the frame's `CardGrid` would
   * be two grids, and hiding the slider would take away a control the page has
   * always had.
   */
  sized?: boolean;
}

export interface UseListingViewOptions {
  /**
   * localStorage key for this surface. Omit for a listing inside a panel whose
   * view is not worth remembering.
   *
   * Keep the existing key when converting a page: `useCardSize` and
   * `usePageSize` derive their own keys from it, so a new name silently resets
   * every reader's card size and page size along with their view mode.
   */
  surface?: string;
  /**
   * A separate bucket for the card size and the rows-per-page, when a surface
   * genuinely remembers those under a different name from its view mode.
   *
   * There is one of these and it is card search. The search component is
   * mounted five times — the card page, the deck builder, the collection's Add
   * tab, the wishlist's, storage quick add — and it has always written **one**
   * view mode for all five (`dm.cardSearch.view`) while keeping **a card size
   * per mount** (`dm.card-size.card-search`, `…deck-builder`, and so on). Both
   * halves of that are defensible: grid-versus-table is how you like to read
   * results anywhere, and how big a card should be depends on how much room
   * the surface has. Collapsing them onto one key would reset one or the other
   * for every existing reader.
   *
   * Defaults to `surface`, which is what every other listing wants.
   */
  sizeSurface?: string;
  modes: readonly ListingMode[];
  defaultMode?: string;
  defaultSortKey?: string;
  defaultSortDir?: SortDirection;
  /** Card width in px for a `grid` mode's first visit. */
  defaultSize?: number;
}

export interface ListingView {
  modes: readonly ListingMode[];
  mode: string;
  activeMode: ListingMode;
  setMode: (id: string) => void;

  sortKey: string;
  setSortKey: (key: string) => void;
  sortDir: SortDirection;
  setSortDir: (dir: SortDirection) => void;
  toggleSortDir: () => void;

  /** Minimum card width in px, straight into `CardGrid`. */
  size: number;
  setSize: (width: number) => void;

  pageSize: number;
  setPageSize: (size: number) => void;

  surface?: string;
  /** The bucket `size` and `pageSize` are remembered under. See `sizeSurface`. */
  sizeSurface: string;
}

export function useListingView({
  surface,
  sizeSurface,
  modes,
  defaultMode,
  defaultSortKey = 'name',
  defaultSortDir = 'asc',
  defaultSize = CARD_WIDTH_DEFAULT,
}: UseListingViewOptions): ListingView {
  const ids = useMemo(() => modes.map(m => m.id), [modes]);

  const initial = useMemo<ListingViewState>(
    () =>
      readListingView(surface, ids, {
        mode: resolveMode(defaultMode, ids),
        sortKey: defaultSortKey,
        sortDir: defaultSortDir,
      }),
    // Read once per surface. Re-reading on every render would fight the setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surface]
  );

  const [state, setState] = useState<ListingViewState>(initial);

  // Switching surface (a tabbed page, a container that is its own listing)
  // adopts that surface's remembered view rather than carrying the last one in.
  useEffect(() => setState(initial), [initial]);

  useEffect(() => writeListingView(surface, state), [surface, state]);

  const sizeKey = sizeSurface ?? surface ?? 'listing';
  const [size, setSize] = useCardSize(sizeKey, defaultSize);
  const [pageSize, setPageSize] = usePageSize(sizeKey);

  const setMode = useCallback(
    (id: string) => setState(prev => ({ ...prev, mode: resolveMode(id, ids, prev.mode) })),
    [ids]
  );
  const setSortKey = useCallback((sortKey: string) => setState(prev => ({ ...prev, sortKey })), []);
  const setSortDir = useCallback((sortDir: SortDirection) => setState(prev => ({ ...prev, sortDir })), []);
  const toggleSortDir = useCallback(
    () => setState(prev => ({ ...prev, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' })),
    []
  );

  const activeMode = modes.find(m => m.id === state.mode) ?? modes[0];

  return {
    modes,
    mode: activeMode.id,
    activeMode,
    setMode,
    sortKey: state.sortKey,
    setSortKey,
    sortDir: state.sortDir,
    setSortDir,
    toggleSortDir,
    size,
    setSize,
    pageSize,
    setPageSize,
    surface,
    sizeSurface: sizeKey,
  };
}
