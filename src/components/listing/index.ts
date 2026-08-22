/**
 * The shared listing vocabulary.
 *
 * Twenty-odd pages list something, and each of them had grown its own answer to
 * the same five questions: how big is a metric, where do the filters go, what
 * does a search box look like, how do results lay out, and how does somebody
 * change the size of a card. `docs/design/CONSISTENCY.md` counted the drift:
 * six metric rows, ten segmented controls, four ways to page, six phrasings of
 * "how many results".
 *
 * Nothing here is new. Each piece is the best existing implementation of its
 * job, lifted out of the page that had it and given the extension points the
 * audit found were genuinely needed.
 *
 * ```tsx
 * const view = useListingView({ surface: 'my.page.view', modes: MODES, defaultSize: 200 });
 *
 * <MetricRow metrics={figures} columns={6} loading={loading} />
 *
 * <FilterBar
 *   search={<ListingSearch value={text} onCommit={setText} placeholder="Name or type" />}
 *   filters={<CardFilterSheet controller={filters} trigger={<FilterButton count={n} />} />}
 *   facets={myPagesOwnChips}
 *   chips={<ActiveFilterChips controller={filters} showClear={false} />}
 *   activeCount={n}
 *   onClear={clearEverything}
 *   view={view}
 * />
 *
 * <ListingFrame view={view} count={rows.length} summary={sentence} pager={pager} empty={…}>
 *   {rows.map(row => <MyTile key={row.id} row={row} width={view.size} />)}
 * </ListingFrame>
 * ```
 *
 * ## The rule for adding to this
 *
 * A page's own controls are passed IN, as a slot. If you find yourself adding a
 * `mode="cardSearch"` or a `showOwnership` boolean, that is the drift coming
 * back wearing a uniform: the component has learned what page it is on. Add a
 * slot instead, and if the thing genuinely has nowhere to go, say so out loud
 * rather than reaching for a flag.
 *
 * A page keeps whatever it genuinely needs. Card search keeps its browse views
 * and presets because it passes them in. The collection keeps condition and
 * foil because it passes them in. My Decks keeps having no size control because
 * it does not ask for one. Nothing is removed to make the shapes match.
 *
 * And when a real feature will not fit the slot it was meant for, the slot
 * moves rather than the feature. Card search's five browse views were supposed
 * to go in `presets`; `presets` turned out to be a cluster of compact controls
 * beside the filter trigger, and five named views with words on them are a row,
 * so they go in `facets` instead. Its grid keeps the size slider through
 * `ListingMode.sized` because it lays its own grid out and still has a card
 * width. Its rows-per-page stays with the fetch that knows which row is on
 * screen. Three extension points, no flags, and every control still there.
 */

export {
  FIELD,
  SURFACE,
  TOOLBAR,
  SEGMENTED,
  METRIC_TILE,
  SEARCH_DEBOUNCE_MS,
  readListingView,
  writeListingView,
  listingViewPayload,
  resolveMode,
  matchedLabel,
  resultSentence,
  totalActiveFilters,
  type ListingViewState,
  type MetricGround,
  type ResultPart,
  type SortDirection,
} from './listing-view';

export {
  useListingView,
  type ListingMode,
  type ListingView,
  type UseListingViewOptions,
} from './useListingView';

export {
  MetricRow,
  MetricTile,
  type Metric,
  type MetricRowProps,
} from './MetricRow';

export { ListingSearch, useSearchText, type ListingSearchProps } from './ListingSearch';

export { ViewModeToggle, type ViewModeToggleProps } from './ViewModeToggle';

export { PageTabs, type PageTab, type PageTabsProps } from './PageTabs';

export {
  FilterBar,
  FilterButton,
  SortControl,
  FacetChip,
  RemovableChip,
  type FilterBarProps,
  type SortOption,
} from './FilterBar';

export { EmptyState, type EmptyStateProps } from './EmptyState';

export {
  ListingFrame,
  ResultSummary,
  type ListingFrameProps,
  type ListingPager,
  type ListingEmpty,
} from './ListingFrame';
