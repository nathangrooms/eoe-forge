// Search and filter controls for optimizer cards
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Filter, SortAsc, SortDesc, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOptions {
  search: string;
  priorities: ('high' | 'medium' | 'low')[];
  categories: string[];
  showOwned: boolean;
  sortBy: 'priority' | 'price' | 'name' | 'impact';
  sortOrder: 'asc' | 'desc';
}

interface CardSearchFilterProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  availableCategories: string[];
  placeholder?: string;
}

export function CardSearchFilter({
  filters,
  onFiltersChange,
  availableCategories,
  placeholder = 'Search cards...'
}: CardSearchFilterProps) {
  const updateFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const togglePriority = (priority: 'high' | 'medium' | 'low') => {
    const current = filters.priorities;
    const updated = current.includes(priority)
      ? current.filter(p => p !== priority)
      : [...current, priority];
    updateFilter('priorities', updated);
  };

  const toggleCategory = (category: string) => {
    const current = filters.categories;
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];
    updateFilter('categories', updated);
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      priorities: ['high', 'medium', 'low'],
      categories: availableCategories,
      showOwned: true,
      sortBy: 'priority',
      sortOrder: 'desc'
    });
  };

  const hasActiveFilters = 
    filters.search || 
    filters.priorities.length !== 3 || 
    filters.categories.length !== availableCategories.length ||
    !filters.showOwned;

  const sortOptions = [
    { value: 'priority', label: 'Priority' },
    { value: 'price', label: 'Price' },
    { value: 'name', label: 'Name' },
    { value: 'impact', label: 'Power Impact' }
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pl-9 h-9"
        />
        {filters.search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => updateFilter('search', '')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Priority Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="h-4 w-4 mr-1.5" />
            Priority
            {filters.priorities.length < 3 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {filters.priorities.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by Priority</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filters.priorities.includes('high')}
            onCheckedChange={() => togglePriority('high')}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              High Priority
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filters.priorities.includes('medium')}
            onCheckedChange={() => togglePriority('medium')}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Medium Priority
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filters.priorities.includes('low')}
            onCheckedChange={() => togglePriority('low')}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted-foreground" />
              Low Priority
            </span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Category Filter */}
      {availableCategories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Filter className="h-4 w-4 mr-1.5" />
              Type
              {filters.categories.length < availableCategories.length && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                  {filters.categories.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
            <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableCategories.map(category => (
              <DropdownMenuCheckboxItem
                key={category}
                checked={filters.categories.includes(category)}
                onCheckedChange={() => toggleCategory(category)}
              >
                {category}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            {filters.sortOrder === 'desc' ? (
              <SortDesc className="h-4 w-4 mr-1.5" />
            ) : (
              <SortAsc className="h-4 w-4 mr-1.5" />
            )}
            {sortOptions.find(o => o.value === filters.sortBy)?.label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sortOptions.map(option => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filters.sortBy === option.value}
              onCheckedChange={() => updateFilter('sortBy', option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filters.sortOrder === 'desc'}
            onCheckedChange={() => updateFilter('sortOrder', filters.sortOrder === 'desc' ? 'asc' : 'desc')}
          >
            {filters.sortOrder === 'desc' ? 'High to Low' : 'Low to High'}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={clearFilters}
          className="h-9 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
