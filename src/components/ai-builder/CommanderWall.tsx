import type { ReactNode } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import { CardGrid, CardGridSkeleton, CardImage, cardSizeForWidth } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import {
  FilterBar,
  ListingFrame,
  ListingSearch,
  resultSentence,
  useListingView,
  type ListingMode,
} from '@/components/listing';
import { cn } from '@/lib/utils';
import { CommanderFinder } from './CommanderFinder';
import { countActiveFilters, describeFilters, type CommanderFilters } from './commander-query';

/**
 * The wall of commanders, once.
 *
 * ## Why this exists
 *
 * There were two of these and they were the same screen: `NewDeck` and the deck
 * generator's `CommanderStage`. Both mounted `CommanderFinder`, both drew a
 * borderless search box with a clear cross in it, both drew a `CardSizeSlider`
 * on the right of that row, both drew a heading saying whether you were looking
 * at the most-played wall or at search results, both drew a `CardGrid` of
 * `CardImage` picks with the same hover strip and the same EDHREC rank, both
 * drew a `Pager` underneath, and both had their own copy of "a page turn starts
 * at the top of the wall".
 *
 * They had already drifted: 172px default card width against 168, `hidden
 * lg:flex` on the slider against `hidden xl:flex`, a 350ms debounce against
 * 400ms, one showing a selection ring and one not because only one of them
 * keeps you on the page after you pick. That is the audit's whole argument in
 * miniature, and it is the same law CLAUDE.md records for play mode: one
 * surface, several sources of what fills it.
 *
 * ## What each side still decides
 *
 * Everything that is genuinely different is a prop. The size bucket, so the two
 * pages remember their own card width. The heading. Whether a pick leaves a
 * ring on the card, which is the real difference: New Deck keeps you here with
 * a commander chosen, the generator moves you to the next step. And who runs
 * the query, because one of them layers the typed name onto the finder's
 * filters and the other swaps between three sources.
 *
 * Nothing was removed from either. Every commander filter is still on the
 * finder: six colour identities, twelve playstyles, three mana value bands,
 * twenty-four creature types, the pairable predicate and four sort orders.
 */

/**
 * One mode. `ViewModeToggle` draws nothing for a single mode, so this costs no
 * chrome, and `sized` keeps the card-width slider both pages already had.
 *
 * `rows` rather than `grid` because the wall draws its own `CardGrid`: the
 * picks carry a selection ring that has to sit on the tile, and the eager-load
 * cutoff counts across the page rather than per section.
 */
const WALL_MODES: ListingMode[] = [
  { id: 'wall', label: 'Commanders', icon: TrendingUp, layout: 'rows', sized: true },
];

export interface CommanderWallProps {
  /* ------------------------------- results ------------------------------ */
  cards: any[];
  loading: boolean;
  error?: string | null;
  /** Scryfall's own count, when it reported one. Never estimated. */
  total?: number | null;
  page: number;
  /** Null when no total came back. The pager then shows no page count. */
  pageCount: number | null;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;

  /* -------------------------------- query ------------------------------- */
  /** The committed search text. The box holds its own draft. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: CommanderFilters;
  onFiltersChange: (filters: CommanderFilters) => void;
  sortOrder: string;
  onSortOrderChange: (order: string) => void;
  /** Runs the finder's query. */
  onRunFinder: () => void;
  onClearFinder: () => void;
  finderSearching?: boolean;
  /** Matches the last run reported, so the finder can say what it found. */
  finderResultCount?: number | null;

  /* ------------------------------ presentation -------------------------- */
  /** localStorage bucket for this page's card width and rows per page. */
  sizeKey: string;
  defaultSize?: number;
  /** What the grid is showing. "Most played commanders", "Search results". */
  heading: string;
  /** One line under the heading naming the ordering, when there is one. */
  headingHint?: string;
  /**
   * Ring the chosen commander.
   *
   * New Deck keeps you on the page with a commander picked, so the card has to
   * say which one. The generator moves to the next step on a click, so there is
   * nothing to mark.
   */
  selectedId?: string | null;
  onSelect: (card: any) => void;
  /** Verb for the tile's title attribute. "Use", "Build a deck for". */
  selectVerb?: string;
  /** Slot: anything the page wants between the bar and the results. */
  beforeResults?: ReactNode;
  className?: string;
}

export function CommanderWall({
  cards,
  loading,
  error = null,
  total = null,
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search commanders, partners and backgrounds',
  filters,
  onFiltersChange,
  sortOrder,
  onSortOrderChange,
  onRunFinder,
  onClearFinder,
  finderSearching = false,
  finderResultCount = null,
  sizeKey,
  defaultSize = 172,
  heading,
  headingHint,
  selectedId = null,
  onSelect,
  selectVerb = 'Use',
  beforeResults,
  className,
}: CommanderWallProps) {
  const view = useListingView({ surface: sizeKey, modes: WALL_MODES, defaultSize });
  const activeFilters = countActiveFilters(filters);
  const filterSummary = describeFilters(filters);

  /**
   * `large` is a 672px scan. At the sizes this grid renders that is four times
   * the pixels a 2x display can resolve, paid once per commander across a wall
   * of them. `normal` (488px) still over-samples every size below `xl`, which
   * is the only token this drops through to the default ladder for.
   */
  const imageQuality = cardSizeForWidth(view.size) === 'xl' ? undefined : ('normal' as const);

  return (
    <div className={cn('space-y-4', className)}>
      <FilterBar
        view={view}
        activeCount={activeFilters + (searchValue.trim() ? 1 : 0)}
        onClear={() => {
          onClearFinder();
          onSearchChange('');
        }}
        search={
          <ListingSearch
            value={searchValue}
            onCommit={next => onSearchChange(next ?? '')}
            placeholder={searchPlaceholder}
            label="Search commanders"
          />
        }
        facets={
          /* The finder is a row of the page's own narrowing controls, and it is
             the one control this screen is really about. Owner, on the version
             that hid it behind a button: *"worked better when commander finder
             was actually on the screen not a right menu."* So it is `facets`,
             which is a full row, rather than the filter slot, which is a
             trigger. Design law 3 reserves the slide-over for an aside;
             choosing the commander is not an aside here, it is the step. */
          <CommanderFinder
            filters={filters}
            onFiltersChange={onFiltersChange}
            sortOrder={sortOrder}
            onSortOrderChange={onSortOrderChange}
            onSearch={onRunFinder}
            onClear={onClearFinder}
            searching={finderSearching}
            resultCount={finderResultCount}
            className="w-full"
          />
        }
      >
        {/* What the grid is showing, and why. */}
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {!searchValue.trim() && activeFilters === 0 && (
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          {heading}
        </h2>
        {headingHint && <span className="text-xs text-muted-foreground">{headingHint}</span>}
        {activeFilters > 0 && filterSummary && (
          <span className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
            {filterSummary}
          </span>
        )}
      </FilterBar>

      <ListingFrame
        view={view}
        count={cards.length}
        loading={loading}
        summary={
          total === null
            ? undefined
            : resultSentence([
                {
                  value: total.toLocaleString(),
                  label: total === 1 ? 'commander' : 'commanders',
                },
              ])
        }
        skeleton={<CardGridSkeleton width={view.size} count={Math.min(pageSize, 12)} />}
        beforeResults={
          <>
            {error && (
              <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{error}</p>
            )}
            {beforeResults}
          </>
        }
        pager={{
          page,
          pageCount,
          onPageChange,
          total,
          shown: cards.length,
          /* Rows per page belongs to the fetch, which pages Scryfall and keeps
             the reader's place when the size changes. */
          pageSize,
          onPageSizeChange,
          noun: 'commander',
          label: 'Commander pages',
        }}
        empty={{
          title: 'No commanders match',
          description: searchValue.trim()
            ? `Nothing came back for “${searchValue.trim()}”.`
            : 'Try removing a filter.',
          icon: Search,
          onClearFilters:
            activeFilters > 0 || searchValue.trim()
              ? () => {
                  onClearFinder();
                  onSearchChange('');
                }
              : undefined,
        }}
      >
        <CardGrid width={view.size}>
          {cards.map((card: any, i: number) => {
            const chosen = Boolean(selectedId) && selectedId === card.id;
            return (
              <button
                key={card.id ?? card.name}
                type="button"
                onClick={() => onSelect(card)}
                aria-pressed={selectedId === null ? undefined : chosen}
                /* The accessible name, spelled out. Without it the name is
                   computed from the tile's own content and comes out as
                   "Syr Konrad, the GrimEDHREC #258B" - the card name, the rank
                   and the colour identity run together with no separator,
                   which is what a screen reader reads aloud. */
                aria-label={`${selectVerb} ${card.name}`}
                title={`${selectVerb} ${card.name}`}
                className={cn(
                  'group/pick block w-full rounded-lg text-left transition-shadow',
                  chosen && 'shadow-[0_0_0_3px_hsl(var(--foreground))]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
              >
                <CardImage
                  card={card}
                  width={view.size}
                  quality={imageQuality}
                  fill
                  interactive
                  eager={i < 12}
                  hideFlip
                >
                  {/* Sits on card art, so light-on-dark is correct here. */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-200 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.7rem] font-semibold text-white">
                        {card.name}
                      </span>
                      {typeof card.edhrec_rank === 'number' && (
                        <span className="block text-[0.65rem] tabular-nums text-white/70">
                          EDHREC #{card.edhrec_rank.toLocaleString()}
                        </span>
                      )}
                    </span>
                    <ColorIdentity colors={card.color_identity} size="xs" />
                  </span>
                </CardImage>
              </button>
            );
          })}
        </CardGrid>
      </ListingFrame>
    </div>
  );
}

export default CommanderWall;
