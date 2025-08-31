import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { useCardSearch } from '@/hooks/useCardSearch';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { UniversalCardDisplay } from './UniversalCardDisplay';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { showSuccess } from '@/components/ui/toast-helpers';
import { 
  Search, 
  Filter, 
  X, 
  Settings,
  Grid3x3,
  List,
  LayoutGrid,
  HelpCircle,
  ExternalLink
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

const FORMATS = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'historic'
];

const TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle'
];

const COLORS = [
  { value: 'w', label: 'White', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'u', label: 'Blue', color: 'bg-blue-100 text-blue-800' },
  { value: 'b', label: 'Black', color: 'bg-gray-100 text-gray-800' },
  { value: 'r', label: 'Red', color: 'bg-red-100 text-red-800' },
  { value: 'g', label: 'Green', color: 'bg-green-100 text-green-800' },
  { value: 'c', label: 'Colorless', color: 'bg-gray-100 text-gray-600' }
];

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

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
    cards: results, 
    loading, 
    error
  } = useCardSearch(query);
  
  // Mock additional properties until properly implemented
  const hasMore = false;
  const totalResults = results.length;
  const searchCards = async (searchQuery: string) => {
    // This will be implemented with proper Scryfall API integration
    console.log('Searching for:', searchQuery);
  };
  const loadMore = () => {
    console.log('Load more cards');
  };
  const clearResults = () => {
    console.log('Clear results');
  };

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
      {showFilters && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <Button
                key={filter.label}
                variant="outline"
                size="sm"
                onClick={() => handleQuickFilter(filter.query)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {/* Advanced Filters */}
          <Tabs defaultValue="colors" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="colors">Colors</TabsTrigger>
              <TabsTrigger value="types">Types</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="format">Format</TabsTrigger>
            </TabsList>

            <TabsContent value="colors" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <div key={color.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={color.value}
                      checked={filters.colors.includes(color.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilters(prev => ({
                            ...prev,
                            colors: [...prev.colors, color.value]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            colors: prev.colors.filter(c => c !== color.value)
                          }));
                        }
                      }}
                    />
                    <label htmlFor={color.value} className={`text-sm px-2 py-1 rounded ${color.color}`}>
                      {color.label}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="types" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={type}
                      checked={filters.types.includes(type)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilters(prev => ({
                            ...prev,
                            types: [...prev.types, type]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            types: prev.types.filter(t => t !== type)
                          }));
                        }
                      }}
                    />
                    <label htmlFor={type} className="text-sm capitalize">
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Mana Value: {filters.cmc[0]} - {filters.cmc[1]}</label>
                  <Slider
                    value={filters.cmc}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, cmc: value as [number, number] }))}
                    max={20}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="format" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((format) => (
                  <div key={format} className="flex items-center space-x-2">
                    <Checkbox
                      id={format}
                      checked={filters.formats.includes(format)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilters(prev => ({
                            ...prev,
                            formats: [...prev.formats, format]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            formats: prev.formats.filter(f => f !== format)
                          }));
                        }
                      }}
                    />
                    <label htmlFor={format} className="text-sm capitalize">
                      {format}
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Clear Filters */}
          {(filters.colors.length > 0 || filters.types.length > 0 || filters.formats.length > 0) && (
            <Button variant="outline" onClick={clearAllFilters}>
              Clear All Filters
            </Button>
          )}
        </div>
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
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Card Modal */}
      <UniversalCardModal
        card={selectedCard}
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
        onAddToCollection={onCardAdd}
        onAddToDeck={onCardAdd}
      />
    </div>
  );
}