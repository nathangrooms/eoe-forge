import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, X, SortAsc, SortDesc } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface CollectionSearchProps {
  onSearchChange: (query: string) => void;
  onFiltersChange: (filters: any) => void;
  totalResults: number;
}

export function CollectionSearch({ onSearchChange, onFiltersChange, totalResults }: CollectionSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeFilters, setActiveFilters] = useState<any>({});

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearchChange(value);
  };

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...activeFilters, [key]: value };
    if (!value || value === '') {
      delete newFilters[key];
    }
    setActiveFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    setActiveFilters({});
    setSearchQuery('');
    onSearchChange('');
    onFiltersChange({});
  };

  const toggleSort = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
    handleFilterChange('sortOrder', newOrder);
  };

  const handleSortByChange = (value: string) => {
    setSortBy(value);
    handleFilterChange('sortBy', value);
  };

  const activeFilterCount = Object.keys(activeFilters).length + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your collection..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filter Collection</h4>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear All
                  </Button>
                )}
              </div>
              
              <Separator />
              
              {/* Sort Options */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Sort By</Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={handleSortByChange}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="price">Price</SelectItem>
                      <SelectItem value="quantity">Quantity</SelectItem>
                      <SelectItem value="set">Set</SelectItem>
                      <SelectItem value="rarity">Rarity</SelectItem>
                      <SelectItem value="cmc">Mana Cost</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSort}
                    className="px-3"
                  >
                    {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Rarity Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Rarity</Label>
                <Select 
                  value={activeFilters.rarity || ''} 
                  onValueChange={(value) => handleFilterChange('rarity', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any rarity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any rarity</SelectItem>
                    <SelectItem value="common">Common</SelectItem>
                    <SelectItem value="uncommon">Uncommon</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="mythic">Mythic Rare</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Colors Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Colors</Label>
                <div className="flex flex-wrap gap-2">
                  {['W', 'U', 'B', 'R', 'G'].map((color) => {
                    const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
                    const isActive = activeFilters.colors?.includes(color);
                    return (
                      <Button
                        key={color}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const currentColors = activeFilters.colors || [];
                          const newColors = isActive 
                            ? currentColors.filter((c: string) => c !== color)
                            : [...currentColors, color];
                          handleFilterChange('colors', newColors.length > 0 ? newColors : null);
                        }}
                        className="h-8 px-3"
                      >
                        {colorNames[color]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Condition Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Condition</Label>
                <Select 
                  value={activeFilters.condition || ''} 
                  onValueChange={(value) => handleFilterChange('condition', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any condition</SelectItem>
                    <SelectItem value="mint">Mint</SelectItem>
                    <SelectItem value="near_mint">Near Mint</SelectItem>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="light_played">Light Played</SelectItem>
                    <SelectItem value="played">Played</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          onClick={toggleSort}
          className="flex items-center gap-2"
        >
          {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
        </Button>
      </div>

      {/* Active Filters */}
      {(searchQuery || Object.keys(activeFilters).length > 0) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">
            {totalResults} cards found
          </span>
          {searchQuery && (
            <Badge variant="secondary" className="flex items-center gap-1">
              "{searchQuery}"
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleSearchChange('')}
              />
            </Badge>
          )}
          {Object.entries(activeFilters).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="flex items-center gap-1">
              {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleFilterChange(key, null)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}