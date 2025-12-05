import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UniversalCardDisplay } from './UniversalCardDisplay';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { AdvancedFilterPanel } from '@/components/filters/AdvancedFilterPanel';

import { useAdvancedCardSearch } from '@/hooks/useAdvancedCardSearch';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { showSuccess } from '@/components/ui/toast-helpers';
import { 
  CardSearchState, 
  PRESET_QUERIES,
  buildScryfallQuery
} from '@/lib/scryfall/query-builder';
import { 
  Search, 
  Grid3x3,
  List,
  LayoutGrid,
  HelpCircle,
  Filter,
  RotateCcw,
  ArrowUpDown,
  BookOpen,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface EnhancedUniversalCardSearchProps {
  onCardAdd?: (card: any) => void;
  onCardSelect?: (card: any) => void;
  placeholder?: string;
  showFilters?: boolean;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  onCardWishlist?: (card: any) => void;
  showViewModes?: boolean;
  compact?: boolean;
  initialQuery?: string;
  showPresets?: boolean;
}

export function EnhancedUniversalCardSearch({
  onCardAdd,
  onCardSelect,
  placeholder = "Search Magic cards...",
  showFilters = true,
  showAddButton = true,
  showWishlistButton = true,
  onCardWishlist,
  showViewModes = true,
  compact = false,
  initialQuery = '',
  showPresets = true
}: EnhancedUniversalCardSearchProps) {
  // Local state management
  const [searchState, setSearchState] = useState<CardSearchState>(() => ({
    text: initialQuery,
    unique: 'cards',
    order: 'name',
    dir: 'asc'
  }));
  
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showPresetsPanel, setShowPresetsPanel] = useState(false);
  const [page, setPage] = useState(1);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchRef = useRef<string>('');

  // Use the advanced search hook
  const {
    results,
    loading,
    error,
    hasMore,
    searchWithState,
    loadMore,
    clearResults
  } = useAdvancedCardSearch();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchState(prev => ({ ...prev, text: '' }));
        clearResults();
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearResults]);

  // Debounced search function
  const performSearch = useCallback((state: CardSearchState) => {
    const { q } = buildScryfallQuery(state);
    
    // Skip if same query as last search
    if (q === lastSearchRef.current && q !== '*') {
      return;
    }
    
    // Only search if we have meaningful criteria
    const hasSearchCriteria = state.text?.trim() || 
      (state.types && state.types.length > 0) ||
      (state.colors && state.colors.value.length > 0) ||
      (state.rarities && state.rarities.length > 0) ||
      (state.legal && state.legal.length > 0) ||
      (state.sets && state.sets.length > 0);
    
    if (hasSearchCriteria) {
      lastSearchRef.current = q;
      searchWithState(state);
      setPage(1);
    } else {
      lastSearchRef.current = '';
      clearResults();
    }
  }, [searchWithState, clearResults]);

  // Handle search with debounce when state changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchState);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchState, performSearch]);

  const handleStateChange = useCallback((updates: Partial<CardSearchState>) => {
    setSearchState(prev => ({ ...prev, ...updates }));
  }, []);

  const handlePresetQuery = (query: string) => {
    setSearchState(prev => ({ ...prev, text: query }));
    setShowPresetsPanel(false);
    showSuccess('Preset Applied', 'Search query updated');
  };

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowModal(true);
    onCardSelect?.(card);
  };

  const handleCardWishlist = (card: any) => {
    onCardWishlist?.(card);
  };

  const handleCardAdd = (card: any) => {
    onCardAdd?.(card);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      loadMore();
      setPage(nextPage);
    }
  };

  const handleReset = () => {
    setSearchState({
      text: '',
      unique: 'cards',
      order: 'name',
      dir: 'asc'
    });
    setPage(1);
    lastSearchRef.current = '';
    clearResults();
    showSuccess('Search Reset', 'All filters cleared');
  };

  const getViewModeIcon = (mode: string) => {
    switch (mode) {
      case 'grid': return <Grid3x3 className="h-4 w-4" />;
      case 'list': return <List className="h-4 w-4" />;
      case 'compact': return <LayoutGrid className="h-4 w-4" />;
      default: return <Grid3x3 className="h-4 w-4" />;
    }
  };

  // Count active filters
  const activeFilterCount = [
    searchState.types?.length,
    searchState.colors?.value.length,
    searchState.rarities?.length,
    searchState.legal?.length,
    searchState.sets?.length,
    searchState.identity?.length,
    searchState.mv?.min || searchState.mv?.max,
    searchState.pow?.min || searchState.pow?.max,
    searchState.tou?.min || searchState.tou?.max,
    searchState.price?.usdMin || searchState.price?.usdMax,
    searchState.extras?.foil,
    searchState.extras?.nonfoil,
    searchState.extras?.showcase,
    searchState.extras?.reserved
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col gap-3">
        {/* Search Input Row */}
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchState.text || ''}
              onChange={(e) => handleStateChange({ text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  performSearch(searchState);
                }
              }}
              placeholder={placeholder}
              className="pl-10 w-full text-base" // text-base (16px) prevents iOS zoom
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>

          <div className="flex gap-2">
            {showFilters && (
              <Button
                variant={showAdvancedFilters ? "default" : "outline"}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}

            {showPresets && (
              <Button
                variant="outline"
                onClick={() => setShowPresetsPanel(!showPresetsPanel)}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">Presets</span>
                {showPresetsPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!searchState.text && activeFilterCount === 0}
              title="Reset search"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Presets Panel */}
        {showPresets && showPresetsPanel && (
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground flex items-center gap-1 mr-2 w-full sm:w-auto">
                <Zap className="h-3 w-3" />
                Quick Presets:
              </span>
              {PRESET_QUERIES.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetQuery(preset.query)}
                  className="h-8 text-xs"
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* View Controls & Results Summary */}
        {(results.length > 0 || loading) && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {loading ? 'Searching...' : `${results.length} cards found`}
              </span>
              {searchState.text && (
                <Badge variant="secondary" className="text-xs max-w-[200px] truncate">
                  "{searchState.text}"
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              {showViewModes && (
                <div className="flex items-center border rounded-lg">
                  {(['grid', 'list', 'compact'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={viewMode === mode ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode(mode)}
                      className="h-8 px-2"
                    >
                      {getViewModeIcon(mode)}
                    </Button>
                  ))}
                </div>
              )}

              {/* Sort Controls */}
              <Select 
                value={searchState.order || 'name'} 
                onValueChange={(order: 'name' | 'cmc' | 'color' | 'rarity' | 'released' | 'usd' | 'tix' | 'edhrec') => handleStateChange({ order })}
              >
                <SelectTrigger className="w-20 sm:w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="cmc">CMC</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="rarity">Rarity</SelectItem>
                  <SelectItem value="usd">Price</SelectItem>
                  <SelectItem value="released">Date</SelectItem>
                  <SelectItem value="edhrec">EDHREC</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStateChange({ 
                  dir: searchState.dir === 'asc' ? 'desc' : 'asc' 
                })}
                className="h-8 px-2"
                title={searchState.dir === 'asc' ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>

              {/* Help Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyboardHelp(true)}
                className="h-8 px-2 hidden sm:flex"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && showAdvancedFilters && (
        <AdvancedFilterPanel
          searchState={searchState}
          onStateChange={handleStateChange}
        />
      )}

      {/* Search Results */}
      <div className="space-y-4">
        {loading && results.length === 0 && <SearchResultsSkeleton />}
        
        {error && (
          <Card className="p-6 text-center">
            <p className="text-destructive mb-2">Search Error</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={handleReset} className="mt-3">
              Try Again
            </Button>
          </Card>
        )}

        {results.length > 0 && (
          <>
            <UniversalCardDisplay
              cards={results}
              viewMode={viewMode}
              onCardClick={handleCardClick}
              onCardAdd={showAddButton ? handleCardAdd : undefined}
              onCardWishlist={showWishlistButton ? handleCardWishlist : undefined}
              showWishlistButton={showWishlistButton}
              compact={compact}
            />

            {hasMore && (
              <div className="text-center">
                <Button 
                  onClick={handleLoadMore} 
                  disabled={loading}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {loading ? 'Loading...' : 'Load More Cards'}
                </Button>
              </div>
            )}
          </>
        )}

        {!loading && !error && results.length === 0 && searchState.text && (
          <Card className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No cards found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search terms or filters
            </p>
            <Button variant="outline" onClick={handleReset}>
              Clear Search
            </Button>
          </Card>
        )}

        {!loading && !error && results.length === 0 && !searchState.text && activeFilterCount === 0 && (
          <Card className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Search for Cards</h3>
            <p className="text-muted-foreground">
              Enter a card name, type, or use filters to find cards
            </p>
          </Card>
        )}
      </div>

      {/* Card Modal */}
      {selectedCard && (
        <UniversalCardModal
          card={selectedCard}
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedCard(null);
          }}
          onAddToCollection={showAddButton ? handleCardAdd : undefined}
          onAddToWishlist={showWishlistButton ? onCardWishlist : undefined}
        />
      )}

      {/* Keyboard Help Modal */}
      <Drawer open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Search Tips & Shortcuts
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: '/', action: 'Focus search' },
                { key: 'Escape', action: 'Clear search' },
                { key: 'Enter', action: 'Execute search' }
              ].map(shortcut => (
                <div key={shortcut.key} className="flex items-center justify-between p-3 border rounded">
                  <span className="text-sm">{shortcut.action}</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Search Syntax</h4>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <code className="bg-muted px-2 py-1 rounded">t:creature</code> - Card type
                <code className="bg-muted px-2 py-1 rounded">c:red</code> - Color
                <code className="bg-muted px-2 py-1 rounded">mv&lt;=3</code> - Mana value
                <code className="bg-muted px-2 py-1 rounded">o:"draw a card"</code> - Oracle text
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
