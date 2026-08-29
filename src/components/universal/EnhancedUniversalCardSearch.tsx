import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { cardDetailPath, CardGridSkeleton } from '@/components/cards';
import {
  FIELD,
  FilterBar,
  FilterButton,
  ListingFrame,
  ListingSearch,
  SURFACE,
  resultSentence,
  useListingView,
  type ListingMode,
} from '@/components/listing';
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
  Search,
  Zap,
} from 'lucide-react';

/**
 * The card search surface.
 *
 * Three structural changes from the versions this replaces:
 *
 * - **One filter.** The bespoke `AdvancedFilterPanel` is gone; filter state is
 *   owned by `useCardFilterState` and edited through the shared
 *   `CardFilterPanel`, so the same facets, the same URL encoding and the same
 *   query builder now serve every card surface in the product.
 * - **No borders.** The segmented controls, the autocomplete dropdown, the
 *   result containers and every input in here were hairline-bordered boxes.
 *   They are surfaces and shadows now.
 * - **One listing vocabulary.** The search box, the toolbar, the view toggle,
 *   the size slider, the count line, the pager and the empty panels come from
 *   `@/components/listing` and are the same objects My Collection and My Decks
 *   use. This file used to draw all of them, including a `SEGMENTED` shell of
 *   its own that had drifted to `rounded-lg bg-muted/40` while the collection's
 *   was `rounded-md bg-muted`.
 *
 * ## Nothing here lost a control, and three things had to move to keep that true
 *
 * The audit's whole point is that a page keeps what it genuinely needs, so:
 *
 * 1. **Browse views are a row, so they go in `facets`, not `presets`.** Five
 *    named views with words on them do not fit a control cluster.
 * 2. **The grid keeps its size slider** through `ListingMode.sized`, because
 *    `UniversalCardDisplay` lays its own `CardGrid` out — its arrow-key
 *    navigation measures the live column count off that element — and a mode
 *    that draws its own grid still has a card width.
 * 3. **Rows-per-page stays with the fetch.** Changing it has to move the page
 *    number so the reader keeps their place, and only `useAdvancedCardSearch`
 *    knows which row is first on screen.
 *
 * The one control that went is the `RotateCcw` reset button, and it went
 * because `FilterBar` draws exactly the same action beside the chips. Two
 * clears sitting next to each other is how "Clear all" came to clear half of
 * the collection's filters without anybody noticing.
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
   *
   * Prefer `mode="pick"`, which says the same thing and also turns the card
   * body into the add control. This stays for callers that intercept the click
   * themselves and want nothing else to change.
   */
  suppressNavigate?: boolean;
  /**
   * ## What a click on a card means, and the one place it means something else
   *
   * `'browse'` is the default and is the standing rule everywhere in this
   * product: a card is a link to `/cards/:id`, because on a browsing surface
   * the thing you want is the card.
   *
   * `'pick'` is a scoped exception, and it exists because of a real report from
   * the owner about storage: *"if i click add cards currently, its not good UI,
   * often also goes to card page instead of adding properly."* He was right,
   * and the cause was this component being mounted as a PICKER while still
   * behaving like a browser. Halfway through filing a box, a click that
   * navigates away throws the whole task on the floor.
   *
   * So: **while the user is adding or filing, a click on the card body adds
   * that card** and the page does not move. The card's own page is still one
   * click away, through the small eye control on the tile, which is the
   * explicit affordance for it. Body picks, eye opens.
   *
   * DO NOT "fix" this back to navigating. If both behaviours are wanted on one
   * surface, they are both already here, and the split between them is body
   * versus affordance rather than one or the other.
   *
   * ### Who mounts this, and as what
   *
   * Storage was the surface the complaint came from, but it was never the only
   * picker. Every mount is listed here so the next person can see at a glance
   * that `'pick'` is the majority case and `'browse'` is the exception:
   *
   * | Mount | Mode | Why |
   * |---|---|---|
   * | `pages/Cards.tsx` | `browse` | The card search page. You came to look at cards. |
   * | `components/storage/StorageQuickAddPanel.tsx` | `pick` | Filling a box. |
   * | `pages/Collection.tsx` (Add tab) | `pick` | Adding to a collection, deck or box. |
   * | `pages/DeckBuilder.tsx` (Cards tab) | `pick` | Adding to, or swapping into, a deck. |
   * | `pages/Wishlist.tsx` (Add tab) | `pick` | Adding to the wishlist. |
   *
   * If you add a mount, decide which it is. "Am I here to look at a card, or to
   * put a card somewhere?" answers it every time.
   */
  mode?: 'browse' | 'pick';
  /** Called when the query text settles, so a page can mirror it elsewhere. */
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  showFilters?: boolean;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  onCardWishlist?: (card: any) => void;
  /**
   * Show the shopping-list and proxy-list buttons on every result.
   *
   * Off by default because most mounts of this component are pickers, where the
   * body click already means "put this somewhere". The dedicated card search
   * page turns it on: browsing is exactly when a player decides to buy or proxy
   * something.
   */
  showListButtons?: boolean;
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
 * 230px sits in `CardImage`'s `lg` band, which is five cards across the 1136px
 * content band and a card you can actually read.
 *
 * It used to be 190, deliberately, because the grid arrived holding a whole
 * Scryfall page of 175 cards and the `lg` band adds a blur-up placeholder
 * request per card: ~350 requests on first paint. A page is 24 cards now, so
 * that argument is gone, and the standing complaint that cards render too small
 * is what is left. The size slider still covers 90px to 320px either way.
 */
const DEFAULT_CARD_WIDTH = 230;

/**
 * The three ways to read a set of search results.
 *
 * The ids are the words this surface has always written to
 * `dm.cardSearch.view`, so a reader who is on the table stays on the table.
 *
 * All three are `rows` because `UniversalCardDisplay` lays out whichever one is
 * showing, including the grid. `sized` puts the card-width slider back on the
 * grid, which is the fact `layout` alone could not express: a mode that draws
 * its own grid still has a card width. A table and a text list do not, which is
 * why neither of those carries it.
 */
const VIEW_MODES: ListingMode[] = [
  { id: 'grid', label: 'Card grid', icon: Grid3x3, layout: 'rows', sized: true },
  { id: 'list', label: 'Table', icon: List, layout: 'rows' },
  { id: 'compact', label: 'Text list', icon: Rows3, layout: 'rows' },
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
  mode = 'browse',
  onQueryChange,
  placeholder = 'Name, type, or Scryfall syntax like t:creature mv<=3',
  showFilters = true,
  showAddButton = true,
  showWishlistButton = true,
  onCardWishlist,
  showListButtons = false,
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

  /*
   * View mode under one key, card size under another, and both are the keys
   * this component has always written.
   *
   * `dm.cardSearch.view` is shared by all five mounts, because grid-versus-table
   * is how you like to read results wherever you are. The card size is per
   * mount, because how big a card should be depends on how much room the
   * surface has: `card-search` on the full page, `deck-builder` beside a
   * decklist. Folding them onto one key would have reset one or the other for
   * every existing reader, which is why `sizeSurface` exists.
   */
  const view = useListingView({
    surface: VIEW_STORAGE_KEY,
    sizeSurface: sizeKey,
    modes: VIEW_MODES,
    defaultMode: 'grid',
    defaultSize: DEFAULT_CARD_WIDTH,
  });
  const viewMode = view.mode as CardViewMode;
  const cardWidth = view.size;

  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    results,
    loading,
    error,
    totalResults,
    pageCount,
    hasNext,
    page,
    setPage,
    pageSize,
    setPageSize,
    searchWithState,
    clearResults,
  } = useAdvancedCardSearch({ urlSync, sizeKey });

  /* ------------------------- Search box drafting ------------------------ */
  /*
   * `ListingSearch` holds the draft and the debounce now. All this keeps is a
   * mirror of the uncommitted text, because Scryfall's name autocomplete has to
   * run against what is being typed rather than against what has settled — see
   * `onDraftChange`. Nothing filters off it.
   *
   * The debounce goes from 300ms to the shared 250ms. The audit found 250, 300,
   * 400 and 220 across the product with no reason recorded for any of them.
   */
  const committedText = searchState.text ?? '';
  const [draft, setDraft] = useState(committedText);

  const commitNow = useCallback(
    (text: string) => patch({ text: text.trim() ? text : undefined }),
    [patch]
  );

  const suggestions = useCardNameSuggestions(draft);

  /* ------------------------------ Effects ------------------------------- */
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
      /* Esc inside the box is `ListingSearch`'s own, and it clears the draft.
         This adds the blur, which is the part a shared field cannot decide:
         only a page with a `/` shortcut knows that Esc should hand the keyboard
         back to the page. */
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
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

  /* Turning the page puts you at the top of the new page. `ListingFrame` does
     that for every listing now, off an anchor above the results, so the local
     copy of this and the ref it scrolled to are both gone. */

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

  const picking = mode === 'pick';

  const handleCardClick = (card: any) => {
    /* Clicking a search result opens the full card page — while BROWSING. A
       docked pane was tried here and rejected: on a browsing surface the
       expectation is to go TO the card, not to preview it beside the grid.

       In `mode="pick"` the click adds instead, and the page stays put. See the
       `mode` prop for why that exception exists and why it must not be undone.

       onCardSelect still fires first either way, so embedded consumers that
       want to intercept the click keep their behaviour and opt out of the
       navigation by passing suppressNavigate. */
    onCardSelect?.(card);
    if (picking) {
      onCardAdd?.(card);
      return;
    }
    if (suppressNavigate) return;
    const path = cardDetailPath(card);
    if (path) navigate(path);
  };

  /** The explicit affordance: the eye on a tile always opens the card page. */
  const handleCardOpen = (card: any) => {
    const path = cardDetailPath(card);
    if (path) navigate(path);
  };

  /* The one clear on this surface, wired to `FilterBar`'s single control.
     `ListingSearch` empties itself when `value` comes back blank, so the box
     does not have to be reset separately. */
  const handleReset = useCallback(() => {
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


  /**
   * The count line, in the shared sentence.
   *
   * A browse view says what the grid is showing rather than how much of it,
   * because "Commander-legal nonland cards in EDHREC play order" is the more
   * useful fact when nobody has asked a question yet. The moment there is a
   * query, the figure is the answer.
   */
  const summary =
    !hasCriteria && browseView
      ? browseView.caption
      : totalResults === null
        ? 'Search results'
        : resultSentence([
            {
              value: totalResults.toLocaleString(),
              label: totalResults === 1 ? 'card matched' : 'cards matched',
            },
          ]);

  /**
   * What to say when there is nothing on screen, and there are three of those.
   *
   * A page past the end of the results is not the same thing as a query that
   * matched nothing, and neither is the same as a picker nobody has typed into
   * yet. They used to be three hand-built panels differing in padding and in
   * whether the icon circle was 16px or 20px.
   */
  const empty =
    page > 1
      ? {
          title: `Nothing on page ${page.toLocaleString()}`,
          description: 'This search does not go that far.',
          action: { label: 'Back to page 1', onClick: () => setPage(1) },
        }
      : hasCriteria
        ? {
            title: 'No cards matched',
            description:
              'Scryfall parsed the query but nothing matched. Loosen a filter, or check the syntax reference beside the search box.',
            icon: Search,
            onClearFilters: handleReset,
          }
        : {
            /* The blank slate survives only where there is nothing else to
               show: an embedded picker with no browse views configured. */
            title: 'Search every Magic card',
            description: 'Type a card name, or use Scryfall syntax.',
            icon: Search,
            actions: (
              <>
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
              </>
            ),
          };

  return (
    <div className="space-y-4">
      <FilterBar
        /* `showViewModes={false}` (storage quick add) hides the toggle and
           keeps the size slider, which is what it has always done. The bar gets
           a copy holding one mode rather than the view being built with one:
           `dm.cardSearch.view` is shared with the card page, and writing `grid`
           back to it from a surface that offers only the grid would reset that
           reader's table on `/cards`. */
        view={showViewModes ? view : { ...view, modes: [view.activeMode] }}
        activeCount={filters.activeCount}
        onClear={handleReset}
        search={
          <ListingSearch
            value={committedText}
            onCommit={commitNow}
            onDraftChange={setDraft}
            onFocusChange={setShowSuggestions}
            onSubmit={() => setShowSuggestions(false)}
            inputRef={searchInputRef}
            placeholder={placeholder}
            label="Search cards"
            suggestions={
              showSuggestions && suggestions.length > 0 ? (
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
                      /* The pointer-down blurs the field and the blur unmounts
                         this list, so without it the click lands on nothing. */
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
              ) : null
            }
          />
        }
        filters={
          showFilters ? (
            <CardFilterSheet
              controller={filters}
              showChips={false}
              trigger={<FilterButton count={facetCount} />}
            />
          ) : null
        }
        presets={
          <>
            {showPresets && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-9 gap-1.5">
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
                  className="h-9 w-9"
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
          </>
        }
        sort={
          <>
            <Select
              value={shownUnique}
              onValueChange={(unique: 'cards' | 'prints' | 'art') => patch({ unique })}
            >
              {/* Flexible on a phone, fixed from `sm`. Both of these carried a
                  hard pixel width, so the row could not shrink and the sort
                  direction button beside them was drawn 38px past the right
                  edge of a 390px screen, where the page shell's
                  `overflow-x: hidden` clipped it out of reach. */}
              <SelectTrigger
                className={cn(FIELD, 'h-9 min-w-0 flex-1 sm:w-[132px] sm:flex-none')}
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

            <Select value={shownOrder} onValueChange={(order: SortField) => patch({ order })}>
              <SelectTrigger
                className={cn(FIELD, 'h-9 min-w-0 flex-1 sm:w-[140px] sm:flex-none')}
                aria-label="Sort results by"
              >
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
              variant="secondary"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => patch({ dir: shownDir === 'asc' ? 'desc' : 'asc' })}
              title={shownDir === 'desc' ? 'Sort ascending' : 'Sort descending'}
              aria-label={shownDir === 'desc' ? 'Sort ascending' : 'Sort descending'}
            >
              {shownDir === 'desc' ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </>
        }
        facets={
          /* THE BROWSE VIEWS.

             Only while the filter is untouched: the moment there is a query,
             the query is the subject of the page, and a competing set of
             "views" beside it would be lying about what the grid contains.

             They sit in `facets` rather than `presets` because `facets` is a
             full row of the page's own narrowing controls, and five named views
             with words on them are a row. See the note on `FilterBar`. */
          browseViews && browseViews.length > 0 && !hasCriteria ? (
            <>
              <span className="mr-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Browse
              </span>
              {browseViews.map(v => (
                <Button
                  key={v.id}
                  variant={v.id === browseView?.id ? 'default' : 'secondary'}
                  size="sm"
                  className="h-8"
                  onClick={() => selectBrowse(v.id)}
                  aria-pressed={v.id === browseView?.id}
                >
                  {v.label}
                </Button>
              ))}
            </>
          ) : null
        }
        chips={
          /* Suppressed when the only "filter" is the query text: the search box
             is already showing it, and a chip repeating it verbatim is noise on
             this surface. */
          facetCount > 0 ? <ActiveFilterChips controller={filters} showClear={false} /> : null
        }
      />

      <ListingFrame
        view={view}
        count={results.length}
        /* A refetch with rows already on screen keeps the rows and marks the
           pager busy. Only an empty first load gets the skeleton. */
        loading={loading && results.length === 0}
        summary={summary}
        skeleton={<CardGridSkeleton width={cardWidth} count={Math.min(pageSize, 12)} />}
        beforeResults={
          error ? (
            <div className="rounded-xl bg-card p-6 shadow-lg shadow-black/20">
              <p className="mb-1 text-sm font-medium text-destructive">
                Scryfall could not run that search
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="secondary" size="sm" onClick={handleReset} className="mt-3">
                Clear search
              </Button>
            </div>
          ) : null
        }
        pager={
          results.length > 0
            ? {
                page,
                pageCount,
                hasNext,
                onPageChange: setPage,
                total: totalResults,
                shown: results.length,
                /* Rows per page belongs to the fetch here, not to the view: the
                   hook moves the page number so the row being read stays on
                   screen, and only it knows which row that is. */
                pageSize,
                onPageSizeChange: setPageSize,
                busy: loading,
                label: 'Search result pages',
              }
            : null
        }
        /* An error already says what happened, in the panel above. A second
           panel underneath it guessing at why would be two explanations. */
        empty={error ? { title: 'Nothing to show' } : empty}
      >
        {/* Full width, every time. A card detail pane used to dock to the right
            of these results; clicking a card goes to `/cards/:id` instead, so
            the grid keeps the whole page.

            `UniversalCardDisplay` lays out all three modes including the grid,
            which is why every mode is declared `rows`. */}
        <UniversalCardDisplay
          cards={results}
          viewMode={viewMode}
          cardWidth={cardWidth}
          sort={tableSort}
          onSortChange={handleSortKey}
          onCardClick={handleCardClick}
          // Only while picking. On a browsing surface the body click already
          // opens the card, so a second control that does the same thing is
          // noise.
          onCardOpen={picking ? handleCardOpen : undefined}
          onCardAdd={showAddButton ? onCardAdd : undefined}
          onCardWishlist={showWishlistButton ? onCardWishlist : undefined}
          showWishlistButton={showWishlistButton}
          showListButtons={showListButtons}
        />
      </ListingFrame>
    </div>
  );
}
