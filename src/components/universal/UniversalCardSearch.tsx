import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdvancedSearchFilters } from '@/components/deck-builder/AdvancedSearchFilters';
import { useCardSearch } from '@/hooks/useCardSearch';
import { SearchResultsSkeleton } from '@/components/ui/loading-skeleton';
import { UniversalCardDisplay } from './UniversalCardDisplay';
import { UniversalCardModal } from './UniversalCardModal';
import { showSuccess } from '@/components/ui/toast-helpers';
import { 
  Search, 
  Filter, 
  X, 
  Settings,
  Grid3x3,
  List,
  LayoutGrid
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

export function UniversalCardSearch({
  onCardSelect,
  onCardAdd,
  placeholder = "Search Magic: The Gathering cards...",
  showFilters = true,
  showAddButton = true,
  showWishlistButton = false,
  showViewModes = true,
  initialQuery = '',
  compact = false
}: UniversalCardSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [filters, setFilters] = useState({});
  const [activeFilterChips, setActiveFilterChips] = useState<Array<{
    type: string;
    value: string;
    label: string;
  }>>([]);

  const { cards, loading, error } = useCardSearch(query, filters);

  const handleFilterChange = (newFilters: Record<string, any>) => {
    setFilters(newFilters);
    
    // Update filter chips
    const chips: Array<{type: string; value: string; label: string}> = [];
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== '' && (!Array.isArray(value) || value.length > 0)) {
        if (Array.isArray(value)) {
          value.forEach((v: string) => {
            chips.push({ type: key, value: v, label: `${key}: ${v}` });
          });
        } else {
          chips.push({ type: key, value: value as string, label: `${key}: ${value}` });
        }
      }
    });
    
    setActiveFilterChips(chips);
  };

  const removeFilterChip = (chipToRemove: {type: string; value: string; label: string}) => {
    const newFilters = { ...filters } as Record<string, any>;
    const currentValue = newFilters[chipToRemove.type];
    
    if (Array.isArray(currentValue)) {
      const newArray = currentValue.filter((v: string) => v !== chipToRemove.value);
      newFilters[chipToRemove.type] = newArray.length > 0 ? newArray : undefined;
    } else {
      newFilters[chipToRemove.type] = undefined;
    }
    
    setFilters(newFilters);
    setActiveFilterChips(prev => prev.filter(chip => chip !== chipToRemove));
  };

  const clearAllFilters = () => {
    setFilters({});
    setActiveFilterChips([]);
  };

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowCardModal(true);
    onCardSelect?.(card);
  };

  const handleAddCard = (card: any) => {
    onCardAdd?.(card);
    showSuccess("Card Added", `Added ${card.name}`);
  };

  const addSyntaxExample = (syntax: string) => {
    setQuery(prev => prev ? `${prev} ${syntax}` : syntax);
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="space-y-3">
        {/* Main Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-10 pr-4"
          />
        </div>

        {/* Search Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {showFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={showAdvancedFilters ? 'bg-primary/10' : ''}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterChips.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilterChips.length}
                  </Badge>
                )}
              </Button>
            )}

            {/* Active Filter Chips */}
            {activeFilterChips.map((chip, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {chip.label}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 ml-1"
                  onClick={() => removeFilterChip(chip)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}

            {activeFilterChips.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          {/* View Mode Controls */}
          {showViewModes && (
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="px-2"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="px-2"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('compact')}
                className="px-2"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <AdvancedSearchFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              onAddSyntaxExample={addSyntaxExample}
            />
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      <div className="space-y-4">
        {loading ? (
          <SearchResultsSkeleton />
        ) : error ? (
          <Card className="p-6 text-center">
            <p className="text-destructive">Error: {error}</p>
          </Card>
        ) : cards.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {cards.length} cards
              </p>
            </div>
            
            <UniversalCardDisplay
              cards={cards}
              viewMode={viewMode}
              onCardClick={handleCardClick}
              onCardAdd={showAddButton ? handleAddCard : undefined}
              showWishlistButton={showWishlistButton}
              compact={compact}
            />
          </div>
        ) : query ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No cards found for "{query}"</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your search or filters
            </p>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Enter a search term to find cards</p>
            <p className="text-sm text-muted-foreground mt-2">
              Supports Scryfall syntax like "t:creature cmc:3"
            </p>
          </Card>
        )}
      </div>

      {/* Card Detail Modal */}
      <UniversalCardModal
        card={selectedCard}
        open={showCardModal}
        onOpenChange={setShowCardModal}
        onCardAdd={onCardAdd}
        showAddButton={showAddButton}
        showWishlistButton={showWishlistButton}
      />
    </div>
  );
}