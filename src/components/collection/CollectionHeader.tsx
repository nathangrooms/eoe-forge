import { useState } from 'react';
import { Search, Filter, Grid3X3, List, BookOpen, Download, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterChip {
  type: string;
  value: string;
  label: string;
}

interface CollectionHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'grid' | 'table' | 'binder';
  onViewModeChange: (mode: 'grid' | 'table' | 'binder') => void;
  filters: FilterChip[];
  onRemoveFilter: (filter: FilterChip) => void;
  onBulkAction: (action: string) => void;
  onAddFilter?: (filter: FilterChip) => void;
  onSearchWithFilters?: () => void;
}

export function CollectionHeader({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  filters,
  onRemoveFilter,
  onBulkAction,
  onAddFilter,
  onSearchWithFilters
}: CollectionHeaderProps) {
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  return (
    <div className="space-y-4 p-4 border-b bg-background/95 backdrop-blur">
      {/* Main Search Bar */}
        <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cards (Scryfall syntax supported)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearchWithFilters?.();
              }
            }}
          />
          {(searchQuery || filters.length > 0) && (
            <Button
              size="sm"
              onClick={onSearchWithFilters}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3"
            >
              <Search className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>

        {/* View Toggle */}
        <div className="flex border rounded-md">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="rounded-r-none"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('table')}
            className="rounded-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'binder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('binder')}
            className="rounded-l-none"
          >
            <BookOpen className="h-4 w-4" />
          </Button>
        </div>

        {/* Bulk Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Bulk Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onBulkAction('import')}>
              <Upload className="h-4 w-4 mr-2" />
              Import Cards
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkAction('export')}>
              <Download className="h-4 w-4 mr-2" />
              Export Collection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkAction('mark-owned')}>
              Mark Selected as Owned
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkAction('add-to-trade')}>
              Add Selected to Trade
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filter Chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter, index) => (
            <Badge 
              key={index} 
              variant="secondary" 
              className="group cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
              onClick={() => onRemoveFilter(filter)}
            >
              <span className="mr-1">{filter.label}</span>
              <X className="h-3 w-3 group-hover:text-destructive-foreground" />
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => filters.forEach(onRemoveFilter)}
            className="h-6 px-2 text-xs"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Advanced Search Panel */}
      {showAdvancedSearch && (
        <div className="bg-muted/30 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Select onValueChange={(value) => onAddFilter?.({ type: 'format', value, label: `Format: ${value}` })}>
              <SelectTrigger>
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="commander">Commander</SelectItem>
                <SelectItem value="pioneer">Pioneer</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => onAddFilter?.({ type: 'color', value, label: `Color: ${value.toUpperCase()}` })}>
              <SelectTrigger>
                <SelectValue placeholder="Colors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="w">White</SelectItem>
                <SelectItem value="u">Blue</SelectItem>
                <SelectItem value="b">Black</SelectItem>
                <SelectItem value="r">Red</SelectItem>
                <SelectItem value="g">Green</SelectItem>
                <SelectItem value="c">Colorless</SelectItem>
              </SelectContent>
            </Select>

            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creature">Creature</SelectItem>
                <SelectItem value="instant">Instant</SelectItem>
                <SelectItem value="sorcery">Sorcery</SelectItem>
                <SelectItem value="artifact">Artifact</SelectItem>
                <SelectItem value="enchantment">Enchantment</SelectItem>
                <SelectItem value="planeswalker">Planeswalker</SelectItem>
                <SelectItem value="land">Land</SelectItem>
              </SelectContent>
            </Select>

            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Rarity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="common">Common</SelectItem>
                <SelectItem value="uncommon">Uncommon</SelectItem>
                <SelectItem value="rare">Rare</SelectItem>
                <SelectItem value="mythic">Mythic</SelectItem>
              </SelectContent>
            </Select>

            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="otj">Outlaws of Thunder Junction</SelectItem>
                <SelectItem value="mkm">Murders at Karlov Manor</SelectItem>
                <SelectItem value="lci">The Lost Caverns of Ixalan</SelectItem>
              </SelectContent>
            </Select>

            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owned">Owned</SelectItem>
                <SelectItem value="wanted">Wanted</SelectItem>
                <SelectItem value="for-trade">For Trade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}