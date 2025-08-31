import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UniversalCardDisplay } from './UniversalCardDisplay';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { AdvancedFilterPanel } from '@/components/filters/AdvancedFilterPanel';
import { AutocompleteSearchInput } from '@/components/search/AutocompleteSearchInput';
import { useAdvancedCardSearch } from '@/hooks/useAdvancedCardSearch';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { showSuccess } from '@/components/ui/toast-helpers';
import { 
  CardSearchState, 
  PRESET_QUERIES, 
  buildScryfallQuery
} from '@/lib/scryfall/query-builder';
import { 
  Search, 
  X, 
  Grid3x3,
  List,
  LayoutGrid,
  HelpCircle,
  Filter,
  Sparkles,
  Copy,
  RotateCcw,
  ArrowUpDown,
  BookOpen,
  Zap
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
  initialQuery = ''
}: EnhancedUniversalCardSearchProps) {
  // Don't use URL params for embedded usage to avoid tab conflicts
  const [searchParams] = useSearchParams();
  const isMainCardsPage = false; // Disable URL params for embedded usage
  
  // Local state management
  const [searchState, setSearchState] = useState<CardSearchState>(() => ({
    text: initialQuery,
    unique: 'cards',
    order: 'name',
    dir: 'asc'
  }));
  
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [searchMode, setSearchMode] = useState<'simple' | 'advanced'>('simple');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [page, setPage] = useState(1);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Keyboard shortcuts (simplified for compatibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchState(prev => ({ ...prev, text: '' }));
        clearResults();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle search when state changes
  useEffect(() => {
    // Skip URL updates for embedded usage
    const { q, params } = buildScryfallQuery(searchState);
    
    if (q.trim() || Object.keys(params).length > 0) {
      searchWithState(searchState);
      setPage(1);
    } else {
      clearResults();
    }
  }, [searchState, isMainCardsPage]);

  const handleStateChange = (updates: Partial<CardSearchState>) => {
    setSearchState(prev => ({ ...prev, ...updates }));
  };

  const handlePresetQuery = (query: string) => {
    setSearchState(prev => ({ ...prev, text: query }));
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

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col gap-4">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <Tabs value={searchMode} onValueChange={(mode: 'simple' | 'advanced') => setSearchMode(mode)}>
            <TabsList>
              <TabsTrigger value="simple" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Simple Mode
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Advanced Mode
              </TabsTrigger>
            </TabsList>
          </Tabs>

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

            {/* Keyboard Help */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowKeyboardHelp(true)}
              className="flex items-center gap-1"
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <AutocompleteSearchInput
              value={searchState.text || ''}
              onChange={(value) => handleStateChange({ text: value })}
              onSubmit={() => {}}
              placeholder={placeholder}
              className="w-full"
            />
          </div>

          {showFilters && (
            <Button
              variant="outline"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!searchState.text && Object.keys(searchState).length <= 3}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Preset Queries */}
        {searchMode === 'simple' && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1 mr-2">
              <Zap className="h-3 w-3" />
              Presets:
            </span>
            {PRESET_QUERIES.slice(0, 6).map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => handlePresetQuery(preset.query)}
                className="h-7 text-xs"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        )}

        {/* Results Summary */}
        {(results.length > 0 || loading) && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {loading ? 'Searching...' : `${results.length} cards found`}
              </span>
              {searchState.text && (
                <Badge variant="secondary" className="text-xs">
                  "{searchState.text}"
                </Badge>
              )}
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <Select 
                value={searchState.order || 'name'} 
                onValueChange={(order: 'name' | 'cmc' | 'color' | 'rarity' | 'released' | 'usd' | 'tix' | 'edhrec') => handleStateChange({ order })}
              >
                <SelectTrigger className="w-24 h-8">
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
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>

              <Select 
                value={searchState.unique || 'cards'} 
                onValueChange={(unique: 'cards' | 'prints') => handleStateChange({ unique })}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">Unique</SelectItem>
                  <SelectItem value="prints">Prints</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && searchMode === 'advanced' && (
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
            <p className="text-red-500 mb-2">Search Error</p>
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
                  className="w-full"
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
              Keyboard Shortcuts
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: '/', action: 'Focus search' },
                { key: 'Escape', action: 'Clear last token' },
                { key: 'Ctrl/Cmd + Enter', action: 'Advanced search' },
                { key: 'Ctrl/Cmd + F', action: 'Toggle filters' },
                { key: 'Ctrl/Cmd + K', action: 'Toggle search mode' },
                { key: '?', action: 'Show this help' }
              ].map(shortcut => (
                <div key={shortcut.key} className="flex items-center justify-between p-3 border rounded">
                  <span className="text-sm">{shortcut.action}</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}