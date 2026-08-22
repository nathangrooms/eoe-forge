import { Grid2x2, Grid3x3 } from 'lucide-react';
import type { ListingMode, SortOption } from '@/components/listing';

/**
 * What the precon catalogue offers, and where the choice is remembered.
 *
 * This replaces `PreconFilterBar`, which drew its own borderless field skin,
 * its own segmented density control and its own clear button. All three exist
 * once now, in `@/components/listing`, so the bar above 184 precons is the same
 * bar as the one above a collection.
 *
 * ## Density is a view mode, not a size slider
 *
 * The audit noted precons uses a two-step enum where nine other surfaces use
 * the continuous slider, and it is right that this looks like drift. It is not.
 * `compact` does not just make the tile narrower: `PreconTile` lays itself out
 * differently at that setting, so the two are two ways of drawing a precon
 * rather than one drawing at two widths. That is what a view mode is.
 *
 * There is therefore no card-size slider on this page, and both modes below are
 * declared `rows` with no `sized`, which is how a surface says so. A precon
 * tile is not a card: it carries a whole 626 x 457 artwork crop with a
 * commander's card over it, and the two widths are chosen so that neither is
 * ever cropped.
 */

/**
 * Where the density is remembered. Do not rename.
 *
 * It has always held the bare word `large` or `compact` rather than a payload,
 * which `readListingView` reads, so nobody's choice resets.
 */
export const PRECON_VIEW_SURFACE = 'deckmatrix.precons.density';

export type PreconDensity = 'large' | 'compact';

/**
 * Minimum tile width, per density.
 *
 * `large` is wide enough that the commander's artwork is presented at
 * something like the size it was painted for rather than as a strip. On a
 * 1440px screen that is two columns, which is a beautiful way to look at six
 * precons and a punishing way to look at 184.
 *
 * `compact` is the answer to the volume rather than to the art: four columns
 * inside the same band, the crop still whole, the commander still a readable
 * card, about a quarter of the scroll.
 */
export const TILE_WIDTH: Record<PreconDensity, number> = { large: 380, compact: 260 };

export const PRECON_MODES: ListingMode[] = [
  { id: 'large', label: 'Large tiles', icon: Grid2x2, layout: 'rows' },
  { id: 'compact', label: 'Compact tiles', icon: Grid3x3, layout: 'rows' },
];

/**
 * The sort axes, and what each one shelves the grid by.
 *
 * This was one four-value enum: newest, oldest, name A-Z, by set. It is three
 * axes with a direction now, which is the same four orderings plus name Z-A and
 * set Z-A that had no control before. Nothing was taken away; the wishlist
 * conversion made the identical move for the same reason.
 */
export type PreconSortKey = 'released' | 'name' | 'set';

export const PRECON_SORT_OPTIONS: SortOption[] = [
  { value: 'released', label: 'Release date' },
  { value: 'name', label: 'Name' },
  { value: 'set', label: 'Set' },
];

export const WUBRG = ['W', 'U', 'B', 'R', 'G'];
