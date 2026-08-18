import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { AdvancedFilterPanel } from '@/components/filters/AdvancedFilterPanel';
import { useAdvancedCardSearch } from '@/hooks/useAdvancedCardSearch';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import {
  CardSearchState,
  PRESET_QUERIES,
  countActiveFilters,
  hasSearchCriteria,
} from '@/lib/scryfall/query-builder';
import {
  ArrowDown,
  ArrowUp,
  Filter,
  Grid3x3,
  HelpCircle,
  List,
  Rows3,
  RotateCcw,
  Search,
  Zap,
} from 'lucide-react';

interface EnhancedUniversalCardSearchProps {
  onCardAdd?: (card: any) => void;
  onCardSelect?: (card: any) => void;
  /** Called when the query text settles, so a page can mirror it into the URL. */
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  showFilters?: boolean;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  onCardWishlist?: (card: any) => void;
  showViewModes?: boolean;
  initialQuery?: string;
  showPresets?: boolean;
}

const VIEW_STORAGE_KEY = 'dm.cardSearch.view';
const DENSITY_STORAGE_KEY = 'dm.cardSearch.density';

const VIEW_MODES: { mode: CardViewMode; label: string; icon: typeof Grid3x3 }[] = [
  { mode: 'grid', label: 'Card grid', icon: Grid3x3 },
  { mode: 'list', label: 'Table', icon: List },
  { mode: 'compact', label: 'Text list', icon: Rows3 },
];

const SORT_OPTIONS: { value: CardSortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'usd', label: 'Price' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
  { value: 'released', label: 'Release date' },
  { value: 'edhrec', label: 'EDHREC rank' },
  { value: 'power', label: 'Power' },
];

const DENSITY_STEPS: { value: number; label: string }[] = [
  { value: 0, label: 'L' },
  { value: 2, label: 'M' },
  { value: 4, label: 'S' },
];

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

export function EnhancedUniversalCardSearch({
  onCardAdd,
  onCardSelect,
  onQueryChange,
  placeholder = 'Search Magic cards — name, or Scryfall syntax like t:creature mv<=3',
  showFilters = true,
  showAddButton = true,
  showWishlistButton = true,
  onCardWishlist,
  showViewModes = true,
  initialQuery = '',
  showPresets = true,
}: EnhancedUniversalCardSearchProps) {
  const [searchState, setSearchState] = useState<CardSearchState>(() => ({
    text: initialQuery,
    unique: 'cards',
    order: 'name',
    dir: 'asc',
  }));

  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [viewMode, setViewMode] = useState<CardViewMode>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null;
    return stored === 'list' || stored === 'compact' || stored === 'grid' ? stored : 'grid';
  });
  const [density, setDensity] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(DENSITY_STORAGE_KEY) : null;
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) ? 2 : parsed;
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a caller passing an inline arrow does not retrigger the
  // debounce effect on every render.
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;

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

  const suggestions = useCardNameSuggestions(searchState.text ?? '');

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, String(density));
  }, [density]);

  // Keep the box in sync when the page arrives with ?q=…
  useEffect(() => {
    setSearchState(prev => (prev.text === initialQuery ? prev : { ...prev, text: initialQuery }));
  }, [initialQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchState(prev => ({ ...prev, text: '' }));
        setShowSuggestions(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search. Every field of searchState — including order, dir and the
  // numeric ranges — participates, because the hook keys its cache on the full
  // request URL rather than on the query token alone.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasSearchCriteria(searchState)) searchWithState(searchState);
      else clearResults();
      onQueryChangeRef.current?.(searchState.text ?? '');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchState, searchWithState, clearResults]);

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

  const handleStateChange = useCallback((updates: Partial<CardSearchState>) => {
    setSearchState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSortKey = useCallback((key: CardSortKey) => {
    setSearchState(prev =>
      prev.order === key
        ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { ...prev, order: key, dir: 'asc' }
    );
  }, []);

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowModal(true);
    onCardSelect?.(card);
  };

  const handleReset = () => {
    setSearchState({ text: '', unique: 'cards', order: 'name', dir: 'asc' });
    setShowSuggestions(false);
    clearResults();
  };

  const activeFilterCount = useMemo(() => countActiveFilters(searchState), [searchState]);
  const hasCriteria = useMemo(() => hasSearchCriteria(searchState), [searchState]);
  const sort = useMemo(
    () => ({ key: (searchState.order ?? 'name') as CardSortKey, dir: searchState.dir ?? 'asc' }),
    [searchState.order, searchState.dir]
  );

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
              value={searchState.text || ''}
              onChange={e => {
                handleStateChange({ text: e.target.value });
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 140)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setShowSuggestions(false);
                  searchWithState(searchState);
                }
              }}
              placeholder={placeholder}
              aria-label="Search cards"
              className="w-full pl-10 text-base"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {suggestions.map(name => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      handleStateChange({ text: name });
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
              <Button
                variant={showAdvancedFilters ? 'default' : 'outline'}
                onClick={() => setShowAdvancedFilters(v => !v)}
                aria-expanded={showAdvancedFilters}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}

            {showPresets && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Presets</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-1">
                  {PRESET_QUERIES.map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleStateChange({ text: preset.query })}
                      className="block w-full rounded-sm px-3 py-2 text-left transition-colors hover:bg-accent"
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
                <Button variant="outline" size="icon" aria-label="Search syntax help">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
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
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  Press <kbd className="rounded border border-border px-1">/</kbd> to focus search,{' '}
                  <kbd className="rounded border border-border px-1">Esc</kbd> to clear. Use the
                  arrow keys to move through results and{' '}
                  <kbd className="rounded border border-border px-1">Enter</kbd> to open a card.
                </p>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              disabled={!searchState.text && activeFilterCount === 0}
              aria-label="Reset search"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ------------------------ Results toolbar ------------------------ */}
        {(results.length > 0 || loading) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {loading
                ? 'Searching…'
                : `Showing ${results.length.toLocaleString()} of ${totalResults.toLocaleString()} cards`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {showViewModes && (
                <div className="flex items-center rounded-md border border-border">
                  {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                    <Button
                      key={mode}
                      variant={viewMode === mode ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode(mode)}
                      className="h-8 rounded-sm px-2"
                      aria-pressed={viewMode === mode}
                      title={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              )}

              {viewMode === 'grid' && (
                <div className="flex items-center rounded-md border border-border" role="group" aria-label="Card size">
                  {DENSITY_STEPS.map(step => (
                    <Button
                      key={step.label}
                      variant={density === step.value ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setDensity(step.value)}
                      className="h-8 w-8 rounded-sm p-0 text-xs font-medium"
                      aria-pressed={density === step.value}
                      title={`${step.label} cards`}
                    >
                      {step.label}
                    </Button>
                  ))}
                </div>
              )}

              <Select
                value={searchState.unique ?? 'cards'}
                onValueChange={(unique: 'cards' | 'prints' | 'art') => handleStateChange({ unique })}
              >
                <SelectTrigger className="h-8 w-[104px]" aria-label="Result uniqueness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">Unique cards</SelectItem>
                  <SelectItem value="prints">All printings</SelectItem>
                  <SelectItem value="art">Unique art</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={searchState.order ?? 'name'}
                onValueChange={(order: CardSortKey) => handleStateChange({ order })}
              >
                <SelectTrigger className="h-8 w-[132px]" aria-label="Sort results by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStateChange({ dir: searchState.dir === 'asc' ? 'desc' : 'asc' })}
                className="h-8 px-2"
                title={searchState.dir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                aria-label={searchState.dir === 'asc' ? 'Sort descending' : 'Sort ascending'}
              >
                {searchState.dir === 'asc' ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {showFilters && showAdvancedFilters && (
        <AdvancedFilterPanel searchState={searchState} onStateChange={setSearchState} />
      )}

      {/* ------------------------------ Results ----------------------------- */}
      <div className="space-y-4">
        {loading && results.length === 0 && <CardGridSkeleton />}

        {error && (
          <Card className="border-destructive/40 p-6">
            <p className="mb-1 text-sm font-medium text-destructive">Scryfall could not run that search</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={handleReset} className="mt-3">
              Clear search
            </Button>
          </Card>
        )}

        {results.length > 0 && (
          <>
            <UniversalCardDisplay
              cards={results}
              viewMode={viewMode}
              density={density}
              sort={sort}
              onSortChange={handleSortKey}
              onCardClick={handleCardClick}
              onCardAdd={showAddButton ? onCardAdd : undefined}
              onCardWishlist={showWishlistButton ? onCardWishlist : undefined}
              showWishlistButton={showWishlistButton}
            />

            <div ref={sentinelRef} className="h-px" aria-hidden />

            {hasMore && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
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
          <Card className="p-8 text-center">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
            <h3 className="mb-1 text-base font-medium text-foreground">No cards matched</h3>
            <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
              Scryfall parsed the query but nothing matched. Loosen a filter, or check the syntax
              reference in the help menu.
            </p>
            <Button variant="outline" onClick={handleReset}>
              Clear search
            </Button>
          </Card>
        )}

        {!loading && !error && results.length === 0 && !hasCriteria && (
          <Card className="p-8 text-center">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
            <h3 className="mb-1 text-base font-medium text-foreground">Search every Magic card</h3>
            <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
              Type a card name, or use Scryfall syntax. Press{' '}
              <kbd className="rounded border border-border px-1 text-xs">/</kbd> from anywhere to
              jump to the search box.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {PRESET_QUERIES.slice(0, 4).map(preset => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handleStateChange({ text: preset.query })}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {selectedCard && (
        <UniversalCardModal
          card={selectedCard}
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedCard(null);
          }}
          onAddToCollection={showAddButton ? onCardAdd : undefined}
          onAddToWishlist={showWishlistButton ? onCardWishlist : undefined}
        />
      )}
    </div>
  );
}
