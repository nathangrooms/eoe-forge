import { useState, useEffect } from 'react';
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
  X, 
  Grid3x3,
  List,
  LayoutGrid,
  HelpCircle,
  ExternalLink,
  SlidersHorizontal,
  Zap,
  RotateCcw
} from 'lucide-react';

interface EnhancedUniversalCardSearchProps {
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

export function EnhancedUniversalCardSearch({
  onCardSelect,
  onCardAdd,
  placeholder = "Search Magic: The Gathering cards using Scryfall syntax...",
  showFilters = true,
  showAddButton = true,
  showWishlistButton = false,
  showViewModes = true,
  initialQuery = '',
  compact = false
}: EnhancedUniversalCardSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  
  // Search state for advanced mode
  const [searchState, setSearchState] = useState<CardSearchState>({
    text: initialQuery || searchParams.get('q') || '',
    unique: 'cards',
    order: 'name',
    dir: 'asc'
  });

  const { 
    results, 
    loading, 
    error,
    hasMore,
    totalResults,
    searchWithState,
    loadMore,
    clearResults,
    currentState
  } = useAdvancedCardSearch();

  useEffect(() => {
    if (searchState.text || Object.keys(searchState).length > 4) {
      handleSearch();
    }
  }, [searchState]);

  const handleSearch = async () => {
    if (!searchState || Object.keys(searchState).length === 0) return;
    
    const { q } = buildScryfallQuery(searchState);
    if (q) {
      setSearchParams({ q });
    }
    await searchWithState(searchState);
  };

  const handleQuickSearch = (query: string) => {
    setSearchState(prev => ({ ...prev, text: query }));
  };

  const applyPreset = (presetKey: string) => {
    const preset = PRESET_QUERIES[presetKey];
    if (preset) {
      setSearchState({ ...preset, unique: 'cards', order: 'name', dir: 'asc' });
    }
  };

  const clearAllFilters = () => {
    setSearchState({
      text: '',
      unique: 'cards',
      order: 'name',
      dir: 'asc'
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

  // Quick filter presets for simple mode
  const quickFilters = [
    { label: 'Creatures', action: () => setSearchState(prev => ({ ...prev, types: ['creature'] })) },
    { label: 'Instants', action: () => setSearchState(prev => ({ ...prev, types: ['instant'] })) },
    { label: 'Sorceries', action: () => setSearchState(prev => ({ ...prev, types: ['sorcery'] })) },
    { label: 'Artifacts', action: () => setSearchState(prev => ({ ...prev, types: ['artifact'] })) },
    { label: 'Enchantments', action: () => setSearchState(prev => ({ ...prev, types: ['enchantment'] })) },
    { label: 'Planeswalkers', action: () => setSearchState(prev => ({ ...prev, types: ['planeswalker'] })) },
    { label: 'Lands', action: () => setSearchState(prev => ({ ...prev, types: ['land'] })) },
    { label: 'Legendary', action: () => setSearchState(prev => ({ ...prev, supertypes: ['legendary'] })) },
    { label: 'Modern Legal', action: () => setSearchState(prev => ({ ...prev, legal: [{ format: 'modern', state: 'legal' }] })) },
    { label: 'Standard Legal', action: () => setSearchState(prev => ({ ...prev, legal: [{ format: 'standard', state: 'legal' }] })) },
    { label: 'Commander Legal', action: () => setSearchState(prev => ({ ...prev, legal: [{ format: 'commander', state: 'legal' }] })) }
  ];

  const { q: currentQuery } = buildScryfallQuery(searchState);

  return (
    <div className="space-y-6">
      {/* Mode Toggle & Search Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Tabs value={mode} onValueChange={(value) => setMode(value as 'simple' | 'advanced')}>
            <TabsList>
              <TabsTrigger value="simple">Simple Mode</TabsTrigger>
              <TabsTrigger value="advanced">Advanced Mode</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Select value={searchState.order || 'name'} onValueChange={(value) => setSearchState(prev => ({ ...prev, order: value as any }))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="cmc">Mana Value</SelectItem>
                <SelectItem value="usd">Price</SelectItem>
                <SelectItem value="released">Release Date</SelectItem>
                <SelectItem value="rarity">Rarity</SelectItem>
                <SelectItem value="edhrec">EDHREC Rank</SelectItem>
              </SelectContent>
            </Select>

            <Select value={searchState.unique || 'cards'} onValueChange={(value) => setSearchState(prev => ({ ...prev, unique: value as any }))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cards">Unique</SelectItem>
                <SelectItem value="prints">All Prints</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={mode === 'simple' ? "Search by name, type, or text..." : placeholder}
              value={searchState.text || ''}
              onChange={(e) => setSearchState(prev => ({ ...prev, text: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 pr-10"
            />
            {searchState.text && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchState(prev => ({ ...prev, text: '' }))}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <Button onClick={handleSearch} disabled={!currentQuery}>
            Search
          </Button>
          
          <Button variant="outline" onClick={clearAllFilters}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          
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

        {/* Current Query Preview */}
        {currentQuery && mode === 'advanced' && (
          <div className="p-2 bg-muted rounded-md">
            <Label className="text-xs text-muted-foreground">Query:</Label>
            <code className="text-xs font-mono block mt-1">{currentQuery}</code>
          </div>
        )}
      </div>

      {/* Quick Filters & Presets */}
      <div className="space-y-4">
        {mode === 'simple' && (
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <Badge
                key={filter.label}
                variant="outline"
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors px-3 py-1.5"
                onClick={filter.action}
              >
                {filter.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Preset Queries */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground flex items-center">
            <Zap className="h-3 w-3 mr-1" />
            Presets:
          </span>
          {Object.keys(PRESET_QUERIES).map((presetKey) => (
            <Badge
              key={presetKey}
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80 transition-colors px-2 py-1"
              onClick={() => applyPreset(presetKey)}
            >
              {presetKey.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {mode === 'advanced' && showFilters && (
        <AdvancedFilterPanel
          searchState={searchState}
          onStateChange={setSearchState}
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