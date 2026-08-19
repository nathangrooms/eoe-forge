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

export { default as ShoppingListPage, EmptyPanel } from './ShoppingListPage';
export { default as ProxyListPage } from './ProxyListPage';
