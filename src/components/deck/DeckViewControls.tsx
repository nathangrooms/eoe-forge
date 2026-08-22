import { LayoutGrid, Rows3 } from 'lucide-react';
import type { ListingMode, SortOption } from '@/components/listing';

/**
 * What My Decks offers: two ways to look at a deck library, six ways to order
 * it, and where the choice is remembered.
 *
 * ## This file used to draw the controls, and no longer does
 *
 * It held a count line, a sort select, a direction button, a segmented view
 * toggle and a `useDeckViewPrefs` hook, all written out here. Every one of
 * those was written out again on four other pages, with the shells drifted
 * apart — and the fix that made this one's selected chip visible
 * (`variant="default"` rather than `variant="secondary"`, 15.80:1 against
 * 1.09:1) was applied here and nowhere else. `FilterBar` and `useListingView`
 * draw them for every listing now, so what is left is the three facts that are
 * genuinely My Decks': its modes, its sort axes, and its storage key.
 *
 * ## Two things My Decks does not have, on purpose
 *
 * **No card size control.** A deck tile is not a card. Its width is set by
 * `DECK_GRID_CLASS`, which caps the grid at two columns so the commander's art
 * stays big, and handing it a `CardSizeSlider` would be conformity for its own
 * sake. Both modes below are `rows` and neither is `sized`, which is how a
 * surface says so.
 *
 * **No pager.** Thirteen accounts, and the largest real library is nine decks.
 * A pager over nine rows is chrome with nothing to do. The page passes no
 * `pager` and `ListingFrame` draws none. Add it when a real account crosses a
 * page.
 */

/** Where the mode, sort axis and direction are remembered. Do not rename. */
export const DECK_VIEW_SURFACE = 'deckmatrix.decks.view';

export type DeckSortKey = 'updated' | 'name' | 'power' | 'value' | 'cards' | 'completion';

export const DECK_LISTING_MODES: ListingMode[] = [
  { id: 'grid', label: 'Grid view', icon: LayoutGrid, layout: 'rows' },
  { id: 'list', label: 'List view', icon: Rows3, layout: 'rows' },
];

export const DECK_SORT_OPTIONS: SortOption[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'cards', label: 'Card count' },
  { value: 'value', label: 'Deck value' },
  { value: 'completion', label: 'Collection %' },
  { value: 'power', label: 'Power level' },
];
