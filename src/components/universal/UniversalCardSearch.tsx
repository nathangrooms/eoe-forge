import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useEnhancedCardSearch } from '@/hooks/useEnhancedCardSearch';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { UniversalCardDisplay } from './UniversalCardDisplay';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { UniversalFilterPanel } from './UniversalFilterPanel';
import { showSuccess } from '@/components/ui/toast-helpers';
import { 
  Search, 
  X, 
  Grid3x3,
  List,
  LayoutGrid,
  HelpCircle,
  ExternalLink,
  SlidersHorizontal
} from 'lucide-react';

interface UniversalCardSearchProps {
  onCardSelect?: (card: any) => void;
  onCardAdd?: (card: any) => void;
  placeholder?: string;
  showFilters?: boolean;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  showViewModes?: boolean;
  initialQuery?: string;
  compact?: boolean;
}

const SCRYFALL_OPERATORS = [
  { syntax: 'legal:FORMAT', description: 'Cards legal in format', example: 'legal:modern' },
  { syntax: 't:TYPE', description: 'Cards of specific type', example: 't:creature' },
  { syntax: 'o:TEXT', description: 'Oracle text contains', example: 'o:"draw a card"' },
  { syntax: 'c:COLORS', description: 'Color identity', example: 'c:ur' },
  { syntax: 'mv:N', description: 'Mana value equals', example: 'mv:3' },
  { syntax: 'mv>=N', description: 'Mana value greater/equal', example: 'mv>=4' },
  { syntax: 'pow:N', description: 'Power equals', example: 'pow:2' },
  { syntax: 'tou:N', description: 'Toughness equals', example: 'tou:3' },
  { syntax: 'is:commander', description: 'Legendary creatures', example: 'is:commander' },
  { syntax: 'format:FORMAT', description: 'Legal in format', example: 'format:standard' },
  { syntax: 'set:CODE', description: 'From specific set', example: 'set:thb' },
  { syntax: 'r:RARITY', description: 'Specific rarity', example: 'r:mythic' }
];

export function UniversalCardSearch({
  onCardSelect,
  onCardAdd,
  placeholder = "Search Magic: The Gathering cards using Scryfall syntax...",
  showFilters = true,
  showAddButton = true,
  showWishlistButton = false,
  showViewModes = true,
  initialQuery = '',
  compact = false
}: UniversalCardSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(initialQuery || searchParams.get('q') || '');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  // Advanced filters
  const [filters, setFilters] = useState({
    colors: [] as string[],
    types: [] as string[],
    formats: [] as string[],
    rarities: [] as string[],
    cmc: [0, 20] as [number, number],
    power: [0, 20] as [number, number],
    toughness: [0, 20] as [number, number],
    priceMin: 0,
    priceMax: 1000
  });

  const { 
    results, 
    loading, 
    error,
    hasMore,
    totalResults,
    searchCards,
    loadMore,
    clearResults
  } = useEnhancedCardSearch();

  useEffect(() => {
    if (query.trim()) {
      handleSearch();
    }
  }, [query]);

  const buildQuery = () => {
    let searchQuery = query;
    
    // Add filter-based query parts
    if (filters.colors.length > 0) {
      searchQuery += ` c:${filters.colors.join('')}`;
    }
    
    if (filters.types.length > 0) {
      searchQuery += ` (${filters.types.map(t => `t:${t}`).join(' OR ')})`;
    }
    
    if (filters.formats.length > 0) {
      searchQuery += ` (${filters.formats.map(f => `legal:${f}`).join(' OR ')})`;
    }
    
    if (filters.rarities.length > 0) {
      searchQuery += ` (${filters.rarities.map(r => `r:${r}`).join(' OR ')})`;
    }
    
    if (filters.cmc[0] > 0 || filters.cmc[1] < 20) {
      if (filters.cmc[0] === filters.cmc[1]) {
        searchQuery += ` mv:${filters.cmc[0]}`;
      } else {
        searchQuery += ` mv>=${filters.cmc[0]} mv<=${filters.cmc[1]}`;
      }
    }

    return searchQuery.trim();
  };

  const handleSearch = async () => {
    const searchQuery = buildQuery();
    if (!searchQuery) return;
    
    setSearchParams({ q: searchQuery });
    await searchCards(searchQuery);
  };

  const handleQuickFilter = (filterQuery: string) => {
    const newQuery = query ? `${query} ${filterQuery}` : filterQuery;
    setQuery(newQuery);
  };

  const clearAllFilters = () => {
    setQuery('');
    setFilters({
      colors: [],
      types: [],
      formats: [],
      rarities: [],
      cmc: [0, 20],
      power: [0, 20],
      toughness: [0, 20],
      priceMin: 0,
      priceMax: 1000
    });
    clearResults();
    setSearchParams({});
  };

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowCardModal(true);
    onCardSelect?.(card);
  };

  const handleCardAdd = (card: any) => {
    onCardAdd?.(card);
    showSuccess("Card Added", `Added ${card.name} successfully`);
  };

  // Quick filter chips
  const quickFilters = [
    { label: 'Creatures', query: 't:creature' },
    { label: 'Instants', query: 't:instant' },
    { label: 'Sorceries', query: 't:sorcery' },
    { label: 'Artifacts', query: 't:artifact' },
    { label: 'Enchantments', query: 't:enchantment' },
    { label: 'Planeswalkers', query: 't:planeswalker' },
    { label: 'Lands', query: 't:land' },
    { label: 'Legendary', query: 'is:commander' },
    { label: 'Modern Legal', query: 'legal:modern' },
    { label: 'Standard Legal', query: 'legal:standard' },
    { label: 'Commander Legal', query: 'legal:commander' }
  ];

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10 pr-10"
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        <Button onClick={handleSearch} disabled={!query.trim()}>
          Search
        </Button>
        
        {showFilters && (
          <Button 
            variant="outline" 
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={showFilterPanel ? 'bg-accent' : ''}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
          </Button>
        )}
        
        <Drawer open={showSyntaxHelp} onOpenChange={setShowSyntaxHelp}>
          <DrawerTrigger asChild>
            <Button variant="outline" size="icon">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Scryfall Search Syntax</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              <p className="text-sm text-muted-foreground">
                Use these operators to build powerful search queries:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SCRYFALL_OPERATORS.map((op, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-1">
                    <div className="font-mono text-sm font-medium">{op.syntax}</div>
                    <div className="text-sm text-muted-foreground">{op.description}</div>
                    <div className="text-xs text-muted-foreground">
                      Example: <code className="bg-muted px-1 rounded">{op.example}</code>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t">
                <Button variant="outline" size="sm" asChild>
                  <a href="https://scryfall.com/docs/syntax" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Full Scryfall Documentation
                  </a>
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        {quickFilters.map((filter) => (
          <Badge
            key={filter.label}
            variant="outline"
            className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors px-3 py-1.5"
            onClick={() => handleQuickFilter(filter.query)}
          >
            {filter.label}
          </Badge>
        ))}
      </div>

      {/* Filter Panel */}
      {showFilters && showFilterPanel && (
        <UniversalFilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearAllFilters}
          className="mb-6"
        />
      )}

      {/* Results Header */}
      {(results.length > 0 || loading) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {totalResults > 0 && (
              <Badge variant="outline">
                {totalResults.toLocaleString()} results
              </Badge>
            )}
          </div>
          
          {showViewModes && (
            <div className="flex items-center space-x-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'compact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('compact')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <p className="text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-4">
        {loading && results.length === 0 ? (
          <SearchResultsSkeleton />
        ) : (
          <>
            <UniversalCardDisplay
              cards={results}
              viewMode={viewMode}
              onCardClick={handleCardClick}
              onCardAdd={showAddButton ? handleCardAdd : undefined}
              showWishlistButton={showWishlistButton}
              compact={compact}
            />
            
            {/* Load More */}
            {hasMore && !loading && (
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loading}
                >
                  Load More Cards
                </Button>
              </div>
            )}
            
            {loading && results.length > 0 && (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Loading more cards...
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card Modal */}
      {selectedCard && (
        <UniversalCardModal
          card={selectedCard}
          isOpen={showCardModal}
          onClose={() => {
            setShowCardModal(false);
            setSelectedCard(null);
          }}
          onAddToCollection={showAddButton ? handleCardAdd : undefined}
          onAddToWishlist={showWishlistButton ? undefined : undefined}
        />
      )}
    </div>
  );
}