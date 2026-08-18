import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UniversalCardDisplay,
  type CardSortKey,
  type CardViewMode,
} from './UniversalCardDisplay';
import {
  ActiveFilterChips,
  CardFilterSheet,
  useCardFilterState,
} from '@/components/filters/CardFilterPanel';
import { cardDetailPath, CardGridSkeleton, CardSizeSlider, useCardSize } from '@/components/cards';
import { useAdvancedCardSearch } from '@/hooks/useAdvancedCardSearch';
import { cn } from '@/lib/utils';
import {
  PRESET_QUERIES,
  SORT_OPTIONS,
  type CardSearchState,
  type SortField,
} from '@/lib/scryfall/query-builder';
import {
  ArrowDown,
  ArrowUp,
  Grid3x3,
  HelpCircle,
  List,
  Rows3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

/**
 * The card search surface.
 *
 * Two structural changes from the version this replaces:
 *
 * - **One filter.** The bespoke `AdvancedFilterPanel` is gone; filter state is
 *   owned by `useCardFilterState` and edited through the shared
 *   `CardFilterPanel`, so the same facets, the same URL encoding and the same
 *   query builder now serve every card surface in the product.
 * - **No borders.** The segmented controls, the autocomplete dropdown, the
 *   result containers and every input in here were hairline-bordered boxes.
 *   They are surfaces and shadows now.
 */

/**
 * A named starting view for the grid, shown when no filter is set.
 *
 * Each one is a real Scryfall query and the caption names it, so an arriving
 * user can see what the grid is showing rather than being handed an unexplained
 * pile of cards. Typing into the box replaces the browse view with the search.
 */
export interface BrowseView {
  id: string;
  label: string;
  /** One line naming the source and the ordering. Rendered above the grid. */
  caption: string;
  state: CardSearchState;
}

interface EnhancedUniversalCardSearchProps {
  onCardAdd?: (card: any) => void;
  onCardSelect?: (card: any) => void;
  /**
   * Starting views for an untouched filter. Given these, the surface arrives
   * full of real cards instead of an empty box; without them it keeps the
   * blank slate, which is what embedded pickers want.
   */
  browseViews?: BrowseView[];
  /**
   * Keep the selection inside this component instead of navigating to the card
   * page. Set by embedded pickers (add-to-deck, commander choice) where leaving
   * the page would abandon what the user is doing.
   */
  suppressNavigate?: boolean;
  /** Called when the query text settles, so a page can mirror it elsewhere. */
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  showFilters?: boolean;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  onCardWishlist?: (card: any) => void;
  showViewModes?: boolean;
  initialQuery?: string;
  showPresets?: boolean;
  /**
   * Mirror the filter into the page URL, making a search linkable.
   *
   * Off by default because most mounts of this component are embedded in a tab
   * or a dialog (deck builder, storage, wishlist) where the URL belongs to the
   * host page. The dedicated `/cards` page turns it on.
   */
  urlSync?: boolean;
  /** localStorage bucket for the card-size preference. */
  sizeKey?: string;
}

const VIEW_STORAGE_KEY = 'dm.cardSearch.view';
const BROWSE_STORAGE_KEY = 'dm.cardSearch.browse';

/**
 * 190px puts six cards across the 1136px content band, and sits in `CardImage`'s
 * `md` band — which is the point. `lg` adds a blur-up placeholder request per
 * card, and this grid now arrives pre-filled with a full Scryfall page, so that
 * would be ~350 requests on first paint instead of ~175 for no visible gain.
 * The size slider still reaches `lg`/`xl` for anyone who wants bigger cards.
 */
const DEFAULT_CARD_WIDTH = 190;

/** Borderless field skin. `Input`/`SelectTrigger` ship with `border border-input`. */
const FIELD = 'border-0 bg-muted/50 focus:ring-1 focus:ring-ring focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0';
/** Flat popover surface — depth from shadow, never from a hairline. */
const SURFACE = 'border-0 bg-popover shadow-xl shadow-black/40';
/** Segmented-control shell: a recessed tint instead of a box. */
const SEGMENTED = 'flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5';

const VIEW_MODES: { mode: CardViewMode; label: string; icon: typeof Grid3x3 }[] = [
  { mode: 'grid', label: 'Card grid', icon: Grid3x3 },
  { mode: 'list', label: 'Table', icon: List },
  { mode: 'compact', label: 'Text list', icon: Rows3 },
];

/** Sort axes the results table can also drive from its own column headers. */
const TABLE_SORT_KEYS = new Set<string>([
  'name', 'cmc', 'set', 'rarity', 'power', 'toughness', 'usd', 'released', 'edhrec',
]);

const SYNTAX_EXAMPLES: { token: string; meaning: string }[] = [
  { token: 't:creature', meaning: 'Card type' },
  { token: 'c:rg', meaning: 'Colors (red and green)' },
  { token: 'id:wu', meaning: 'Commander color identity' },
  { token: 'mv<=3', meaning: 'Mana value' },
  { token: 'o:"draw a card"', meaning: 'Oracle text' },
  { token: 'f:commander', meaning: 'Format legality' },
  { token: 'r:mythic', meaning: 'Rarity' },
  { token: 'usd<5', meaning: 'Price in USD' },
  { token: 'is:commander', meaning: 'Can head an EDH deck' },
  { token: '-t:land', meaning: 'Negate any term' },
];

/** Free text that contains an operator is Scryfall syntax, not a card name. */
const looksLikeSyntax = (text: string) => /[:<>=!]|(^|\s)-\S/.test(text);

/** Scryfall card-name autocomplete, with the in-flight request cancelled on change. */
function useCardNameSuggestions(text: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2 || looksLikeSyntax(query)) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions((data?.data ?? []).slice(0, 8));
      } catch {
        /* aborted or offline — suggestions are optional */
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return suggestions;
}

/** Monospace key hint. Flat tint, because a `kbd` used to be a bordered box. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
      {children}
    </kbd>
  );
}

export function EnhancedUniversalCardSearch({
  onCardAdd,
  onCardSelect,
  browseViews,
  suppressNavigate = false,
  onQueryChange,
  placeholder = 'Search Magic cards — name, or Scryfall syntax like t:creature mv<=3',
  showFilters = true,
  showAddButton = true,
  showWishlistButton = true,
  onCardWishlist,
  showViewModes = true,
  initialQuery = '',
  showPresets = true,
  urlSync = false,
  sizeKey = 'search',
}: EnhancedUniversalCardSearchProps) {
  const navigate = useNavigate();
  // One filter state, shared with every other card surface. `initialState` is
  // seeded once and only into an untouched URL, so "clear all" really clears.
  const filters = useCardFilterState({
    urlSync,
    initialState: initialQuery ? { text: initialQuery } : undefined,
  });
  const { state: searchState, patch, reset: resetFilters } = filters;

  const [showSuggestions, setShowSuggestions] = useState(false);

  /* --------------------------- Browse views --------------------------- */
  const [browseId, setBrowseId] = useState<string>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(BROWSE_STORAGE_KEY) : null;
    return stored && browseViews?.some(v => v.id === stored) ? stored : browseViews?.[0]?.id ?? '';
  });
  const browseView = useMemo(
    () => browseViews?.find(v => v.id === browseId) ?? browseViews?.[0] ?? null,
    [browseViews, browseId]
  );

  const [cardWidth, setCardWidth] = useCardSize(sizeKey, DEFAULT_CARD_WIDTH);

  const [viewMode, setViewMode] = useState<CardViewMode>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null;
    return stored === 'list' || stored === 'compact' || stored === 'grid' ? stored : 'grid';
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    results,
    loading,
    loadingMore,
    error,
    hasMore,
    totalResults,
    searchWithState,
    loadMore,
    clearResults,
  } = useAdvancedCardSearch();

  /* ------------------------- Search box drafting ------------------------ */
  // The box holds its own draft and commits on a debounce. Writing straight
  // into the controller would push a URL replace on every keystroke.
  const committedText = searchState.text ?? '';
  const [draft, setDraft] = useState(committedText);
  const lastCommitted = useRef(committedText);

  // Adopt external changes — a removed chip, "clear all", a shared link —
  // without stomping on what is being typed.
  useEffect(() => {
    if (committedText !== lastCommitted.current) {
      lastCommitted.current = committedText;
      setDraft(committedText);
    }
  }, [committedText]);

  useEffect(() => {
    if (draft === lastCommitted.current) return;
    const timer = window.setTimeout(() => {
      lastCommitted.current = draft;
      patch({ text: draft.trim() ? draft : undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, patch]);

  const commitNow = useCallback(
    (text: string) => {
      lastCommitted.current = text;
      setDraft(text);
      patch({ text: text.trim() ? text : undefined });
    },
    [patch]
  );

  const suggestions = useCardNameSuggestions(draft);

  /* ------------------------------ Effects ------------------------------- */
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // A caller-owned mirror of the query text (Cards.tsx used to keep `?q=`).
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  useEffect(() => {
    onQueryChangeRef.current?.(committedText);
  }, [committedText]);

  // Seed the box when an embedded caller changes `initialQuery` after mount.
  const seenInitial = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery === seenInitial.current) return;
    seenInitial.current = initialQuery;
    commitNow(initialQuery);
  }, [initialQuery, commitNow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setDraft('');
        setShowSuggestions(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasCriteria = filters.query !== '*';

  /**
   * What is actually sent to Scryfall.
   *
   * With no criteria this is the active browse view rather than nothing, so the
   * page arrives full. The result options the user drives — sort field,
   * direction, uniqueness — are layered on top of the view, because those
   * controls belong to the grid whichever query filled it.
   */
  const effectiveState = useMemo<CardSearchState | null>(() => {
    if (hasCriteria) return searchState;
    if (!browseView) return null;
    return {
      ...browseView.state,
      unique: searchState.unique ?? browseView.state.unique,
      order: searchState.order ?? browseView.state.order,
      dir: searchState.dir ?? browseView.state.dir,
    };
  }, [hasCriteria, searchState, browseView]);

  /** Sort/uniqueness the toolbar should display — the browse view's, until overridden. */
  const shownOrder = effectiveState?.order ?? 'name';
  const shownDir = effectiveState?.dir ?? 'asc';
  const shownUnique = effectiveState?.unique ?? 'cards';

  // The whole filter state participates: the hook keys its cache on the full
  // request URL, not on the query token alone, so sort and uniqueness count.
  useEffect(() => {
    if (effectiveState) searchWithState(effectiveState);
    else clearResults();
  }, [effectiveState, searchWithState, clearResults]);

  const selectBrowse = useCallback((id: string) => {
    setBrowseId(id);
    try {
      localStorage.setItem(BROWSE_STORAGE_KEY, id);
    } catch {
      /* private mode — the view just does not persist */
    }
  }, []);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, results.length]);

  /* ------------------------------ Handlers ------------------------------ */
  const handleSortKey = useCallback(
    (key: CardSortKey) => {
      patch(
        shownOrder === key
          ? { dir: shownDir === 'asc' ? 'desc' : 'asc' }
          : { order: key as CardSearchState['order'], dir: 'asc' }
      );
    },
    [patch, shownOrder, shownDir]
  );

  const handleCardClick = (card: any) => {
    /* Clicking a search result opens the full card page, every time. A docked
       pane was tried here and rejected: on a browsing surface the expectation
       is to go TO the card, not to preview it beside the grid.

       onCardSelect still fires first, so embedded consumers that use this
       search as a picker (add-to-deck, commander choice) keep their behaviour
       and opt out of the navigation by passing suppressNavigate. */
    onCardSelect?.(card);
    if (suppressNavigate) return;
    const path = cardDetailPath(card);
    if (path) navigate(path);
  };

  const handleReset = useCallback(() => {
    lastCommitted.current = '';
    setDraft('');
    setShowSuggestions(false);
    resetFilters();
    clearResults();
  }, [resetFilters, clearResults]);

  /** Active facets excluding the free-text box, which has its own input. */
  const facetCount = filters.activeCount - (committedText.trim() ? 1 : 0);

  const tableSort = useMemo(
    () =>
      TABLE_SORT_KEYS.has(shownOrder)
        ? { key: shownOrder as CardSortKey, dir: shownDir }
        : undefined,
    [shownOrder, shownDir]
  );

  const presetButtons = useMemo(() => PRESET_QUERIES.slice(0, 4), []);

  return (
    <div className="space-y-4">
      {/* ---------------------------- Search bar ---------------------------- */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={searchInputRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 140)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setShowSuggestions(false);
                  commitNow(draft);
                }
              }}
              placeholder={placeholder}
              aria-label="Search cards"
              className={cn(FIELD, 'h-11 w-full pl-10 text-base')}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />

            {showSuggestions && suggestions.length > 0 && (
              <div
                className={cn(
                  'absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg py-1',
                  SURFACE
                )}
              >
                {suggestions.map(name => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      commitNow(name);
                      setShowSuggestions(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {showFilters && (
              <CardFilterSheet
                controller={filters}
                showChips={false}
                trigger={
                  <Button variant="secondary" className="h-11 gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">Filters</span>
                    {/* Facets only. The text box is not a "filter" the sheet can show. */}
                    {facetCount > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.7rem] font-bold leading-none text-primary-foreground">
                        {facetCount}
                      </span>
                    )}
                  </Button>
                }
              />
            )}

            {showPresets && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="h-11 gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Presets</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className={cn(SURFACE, 'w-80 p-1')}>
                  {PRESET_QUERIES.map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => commitNow(preset.query)}
                      className="block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="block text-sm font-medium text-popover-foreground">
                        {preset.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-11 w-11"
                  aria-label="Search syntax help"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className={cn(SURFACE, 'w-80')}>
                <p className="mb-3 text-sm font-medium text-popover-foreground">Search syntax</p>
                <dl className="space-y-1.5">
                  {SYNTAX_EXAMPLES.map(ex => (
                    <div key={ex.token} className="flex items-baseline justify-between gap-3">
                      <dt>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                          {ex.token}
                        </code>
                      </dt>
                      <dd className="text-xs text-muted-foreground">{ex.meaning}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
                  Press <Key>/</Key> to focus search, <Key>Esc</Key> to clear. Arrow keys move
                  through results and <Key>Enter</Key> opens a card.
                </p>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={handleReset}
              disabled={filters.activeCount === 0 && !draft}
              aria-label="Reset search"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/*
          Removable chips for whatever the filter sheet set. Suppressed when the
          only "filter" is the query text — the search box is already showing it,
          and a chip repeating it verbatim is noise on this surface.
        */}
        {facetCount > 0 && <ActiveFilterChips controller={filters} />}

        {/* ------------------------- Browse views -------------------------- */}
        {/* Only while the filter is untouched: the moment there is a query, the
            query is the subject of the page and a competing set of "views"
            beside it would be lying about what the grid contains. */}
        {browseViews && browseViews.length > 0 && !hasCriteria && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Browse
            </span>
            {browseViews.map(view => (
              <Button
                key={view.id}
                variant={view.id === browseView?.id ? 'default' : 'secondary'}
                size="sm"
                className="h-8"
                onClick={() => selectBrowse(view.id)}
                aria-pressed={view.id === browseView?.id}
              >
                {view.label}
              </Button>
            ))}
          </div>
        )}

        {/* ------------------------ Results toolbar ------------------------ */}
        {(results.length > 0 || loading) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {loading
                ? 'Searching…'
                : !hasCriteria && browseView
                  ? `${browseView.caption} — showing ${results.length.toLocaleString()} of ${totalResults.toLocaleString()}`
                  : `Showing ${results.length.toLocaleString()} of ${totalResults.toLocaleString()} cards`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {viewMode === 'grid' && (
                <CardSizeSlider
                  storageKey={sizeKey}
                  value={cardWidth}
                  onValueChange={setCardWidth}
                  className="hidden sm:flex"
                />
              )}

              {showViewModes && (
                <div className={SEGMENTED} role="group" aria-label="Result layout">
                  {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                    <Button
                      key={mode}
                      variant={viewMode === mode ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode(mode)}
                      className="h-8 rounded-md px-2"
                      aria-pressed={viewMode === mode}
                      title={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              )}

              <Select
                value={shownUnique}
                onValueChange={(unique: 'cards' | 'prints' | 'art') => patch({ unique })}
              >
                <SelectTrigger
                  className={cn(FIELD, 'h-8 w-[132px]')}
                  aria-label="Result uniqueness"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={SURFACE}>
                  <SelectItem value="cards">Unique cards</SelectItem>
                  <SelectItem value="prints">All printings</SelectItem>
                  <SelectItem value="art">Unique art</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={shownOrder}
                onValueChange={(order: SortField) => patch({ order })}
              >
                <SelectTrigger className={cn(FIELD, 'h-8 w-[140px]')} aria-label="Sort results by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={SURFACE}>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ dir: shownDir === 'asc' ? 'desc' : 'asc' })}
                className="h-8 bg-muted/40 px-2"
                title={shownDir === 'desc' ? 'Sort ascending' : 'Sort descending'}
                aria-label={shownDir === 'desc' ? 'Sort ascending' : 'Sort descending'}
              >
                {shownDir === 'desc' ? (
                  <ArrowDown className="h-4 w-4" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------ Results ----------------------------- */}
      {/* Full width, every time. A card detail pane used to dock to the right of
          these results; clicking a card now goes to `/cards/:id` instead, so
          the grid keeps the whole page. */}
      <div className="space-y-4">
        {loading && results.length === 0 && <CardGridSkeleton width={cardWidth} count={18} />}

        {error && (
          <div className="rounded-xl bg-card p-6 shadow-lg shadow-black/20">
            <p className="mb-1 text-sm font-medium text-destructive">
              Scryfall could not run that search
            </p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" onClick={handleReset} className="mt-3">
              Clear search
            </Button>
          </div>
        )}

        {results.length > 0 && (
          <>
            <UniversalCardDisplay
              cards={results}
              viewMode={viewMode}
              cardWidth={cardWidth}
              sort={tableSort}
              onSortChange={handleSortKey}
              onCardClick={handleCardClick}
              onCardAdd={showAddButton ? onCardAdd : undefined}
              onCardWishlist={showWishlistButton ? onCardWishlist : undefined}
              showWishlistButton={showWishlistButton}
            />

            <div ref={sentinelRef} className="h-px" aria-hidden />

            {hasMore && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more cards'}
                </Button>
              </div>
            )}

            {!hasMore && (
              <p className="text-center text-xs text-muted-foreground">
                End of results — {totalResults.toLocaleString()} cards matched.
              </p>
            )}
          </>
        )}

        {!loading && !error && results.length === 0 && hasCriteria && (
          <div className="rounded-xl bg-card p-8 text-center shadow-lg shadow-black/20">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
            <h3 className="mb-1 text-base font-medium text-foreground">No cards matched</h3>
            <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
              Scryfall parsed the query but nothing matched. Loosen a filter, or check the syntax
              reference in the help menu.
            </p>
            <Button variant="secondary" onClick={handleReset}>
              Clear search
            </Button>
          </div>
        )}

        {/* The blank slate survives only where there is nothing else to show:
            an embedded picker with no browse views configured. */}
        {!loading && !error && results.length === 0 && !hasCriteria && !browseView && (
          <div className="rounded-xl bg-card p-8 text-center shadow-lg shadow-black/20">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
            <h3 className="mb-1 text-base font-medium text-foreground">Search every Magic card</h3>
            <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
              Type a card name, or use Scryfall syntax. Press <Key>/</Key> from anywhere to jump to
              the search box.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {presetButtons.map(preset => (
                <Button
                  key={preset.name}
                  variant="secondary"
                  size="sm"
                  onClick={() => commitNow(preset.query)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
