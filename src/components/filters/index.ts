/**
 * The card filter. One implementation, reused on every surface with card search.
 *
 * ```tsx
 * const filters = useCardFilterState();          // URL-synced, shareable
 * const { data } = useQuery({
 *   queryKey: ['cards', filters.query, filters.params],
 *   queryFn: () => searchCards(filters.query, filters.params),
 * });
 *
 * <CardFilterSheet controller={filters} />       // mobile + compact desktop
 * <CardFilterPanel controller={filters} />       // inline sidebar
 * <ActiveFilterChips controller={filters} />     // removable chips over results
 * ```
 */

export {
  CardFilterPanel,
  CardFilterSheet,
  ActiveFilterChips,
  useCardFilterState,
  useSetCatalog,
  type CardFilterController,
  type CardFilterPanelProps,
  type CardFilterSheetProps,
  type UseCardFilterStateOptions,
  type ScryfallSetSummary,
} from './CardFilterPanel';

export { AdvancedFilterPanel } from './AdvancedFilterPanel';
