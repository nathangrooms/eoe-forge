/**
 * Card lists on screen: the shopping list and the proxy list.
 *
 * They are one primitive with two endings, so they share this folder rather
 * than growing into two systems that drift. Shopping buys; proxies print.
 *
 * The one thing every other surface needs is `AddToListButton`. Put it wherever
 * a card is shown and the action looks and behaves the same everywhere.
 *
 * ```tsx
 * import { AddToListButton } from '@/components/shopping';
 * <AddToListButton card={card} kind="shopping" />
 * <AddToListButton card={card} kind="proxy" display="icon" />
 * ```
 */

export {
  AddToListButton,
  AddToListActions,
  resolveAddable,
  type AddableCard,
  type AddToListButtonProps,
} from './AddToListButton';

export { CartNavButton } from './CartNavButton';
export { CollectionArriving } from './CollectionArriving';
export { ArrivingCards, type ArrivingCardsProps } from './ArrivingCards';
export { MarkBoughtPanel, type MarkBoughtPanelProps } from './MarkBoughtPanel';
export { FileArrivalPanel, type FileArrivalPanelProps } from './FileArrivalPanel';
export { ListExportPanel, type ListExportPanelProps } from './ListExportPanel';
export { PlatformTotals, type PlatformTotalsProps } from './PlatformTotals';
export { PastPurchases } from './PastPurchases';
export { ShoppingEntryTile, ShoppingEntryRow } from './ShoppingEntryTile';
export { MarketplaceShoppingLead } from './MarketplaceShoppingLead';

/**
 * Pasting a whole list of cards onto a list. The proxy page's front door, and
 * the shopping list can mount the same box with `kind="shopping"`.
 */
export { PasteCardList, type PasteCardListProps } from './PasteCardList';

/**
 * A list you already keep, turned into proxies in one action. The shopping
 * list, the wishlist and the proxy page's own "bring cards in" all mount this
 * rather than each writing their own convert button.
 */
export { ListToProxiesPanel, type ListToProxiesPanelProps } from './ListToProxiesPanel';

/**
 * Changing which printing of a card gets printed. The shelf inside it is the
 * same `PrintingPicker` the card page uses; this is the slide-over around it,
 * and the only difference between its two callers is whether picking one
 * writes itself. `useProxyArt` is the half that writes.
 */
export { ChangeArtPanel, type ChangeArtPanelProps } from './ChangeArtPanel';

/**
 * The proxy list, written out and taken somewhere else. It knows no formats of
 * its own: `writeDeckList` in `@/lib/decklist` writes them, beside the parser
 * that reads the same shapes back in.
 */
export { ProxyExportPanel, type ProxyExportPanelProps } from './ProxyExportPanel';
export {
  useProxyArt,
  type ArtSaveState,
  type ProxyArt,
  type RowArtState,
} from './useProxyArt';

export { default as ShoppingListPage, EmptyPanel } from './ShoppingListPage';
export { default as ProxyListPage } from './ProxyListPage';
