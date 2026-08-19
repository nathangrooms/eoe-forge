/**
 * Lists of cards, in one place.
 *
 * The shopping list and the proxy list are the same primitive with two
 * endings. Read `list.ts` for the shape, `assemble.ts` for how the shopping
 * list is merged out of four sources, and `exportFormats.ts` for the shop
 * syntaxes and where each one was confirmed.
 *
 * ```tsx
 * import { AddToListButton } from '@/components/shopping';
 * <AddToListButton card={card} kind="shopping" />
 * ```
 */

export {
  cardKey,
  copiesNeeded,
  isArriving,
  isAwaitingFiling,
  FINISH_LABEL,
  type CardListItem,
  type Finish,
  type ItemSource,
  type ItemStatus,
  type ListKind,
} from './list.ts';

export {
  assembleShoppingList,
  daysSince,
  waitingFor,
  type AssembledList,
  type AssembleInput,
  type DeckShortfallRow,
  type Reason,
  type ReasonKind,
  type ShoppingEntry,
  type WishlistSourceRow,
} from './assemble.ts';

export {
  EXPORT_TARGETS,
  exportFileName,
  formatExport,
  mergeLines,
  type ExportFormat,
  type ExportLine,
  type ExportOptions,
  type ExportTarget,
} from './exportFormats.ts';

export {
  describePlatformGap,
  paidTotals,
  platformTotals,
  type CostLine,
  type PaidTotal,
  type PlatformTotal,
} from './totals.ts';

export {
  addToList,
  fileArrival,
  loadDeckShortfalls,
  loadFilingDestinations,
  loadListItems,
  loadListingsFor,
  loadPrintings,
  loadWishlistSource,
  markArrived,
  markBought,
  removeItem,
  resetItem,
  setQuantity,
  type AddToListInput,
  type FileInput,
  type FilingDestinations,
  type ListingMatch,
  type MarkBoughtInput,
} from './api.ts';

export { useCardLists } from './store.ts';
