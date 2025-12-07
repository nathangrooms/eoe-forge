// Filter controls for optimizer results
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DollarSign, Filter, SortAsc, Package, Zap, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OptimizerFiltersState {
  maxBudget: number;
  sortBy: 'priority' | 'price-low' | 'price-high' | 'playability';
  showOnlyOwned: boolean;
  priorityFilter: 'all' | 'high' | 'medium' | 'low';
}

interface OptimizerFiltersProps {
  filters: OptimizerFiltersState;
  onChange: (filters: OptimizerFiltersState) => void;
  totalSuggestions: number;
  visibleSuggestions: number;
  totalCostChange: number;
}

export function OptimizerFilters({
  filters,
  onChange,
  totalSuggestions,
  visibleSuggestions,
  totalCostChange
}: OptimizerFiltersProps) {
  const hasActiveFilters = filters.showOnlyOwned || filters.priorityFilter !== 'all' || filters.maxBudget < 100;

  const resetFilters = () => {
    onChange({
      maxBudget: 100,
      sortBy: 'priority',
      showOnlyOwned: false,
      priorityFilter: 'all'
    });
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {visibleSuggestions} of {totalSuggestions} suggestions
          </Badge>
          
          <Badge 
            variant="outline" 
            className={cn(
              "text-sm px-3 py-1",
              totalCostChange > 0 ? "text-amber-400 border-amber-400/30" :
              totalCostChange < 0 ? "text-green-400 border-green-400/30" :
              "text-muted-foreground"
            )}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            {totalCostChange >= 0 ? '+' : ''}{totalCostChange.toFixed(2)} total
          </Badge>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <SortAsc className="h-4 w-4 text-muted-foreground" />
          <Select 
            value={filters.sortBy} 
            onValueChange={(v) => onChange({ ...filters, sortBy: v as any })}
          >
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">By Priority</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="playability">By Playability</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={filters.priorityFilter === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onChange({ 
                  ...filters, 
                  priorityFilter: filters.priorityFilter === 'high' ? 'all' : 'high' 
                })}
                className="h-9 px-3"
              >
                <AlertTriangle className="h-4 w-4 mr-1 text-destructive" />
                Critical
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show only critical replacements</TooltipContent>
          </Tooltip>
        </div>

        {/* Owned Only Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={filters.showOnlyOwned ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ ...filters, showOnlyOwned: !filters.showOnlyOwned })}
              className="h-9 px-3"
            >
              <Package className="h-4 w-4 mr-1" />
              In Collection
            </Button>
          </TooltipTrigger>
          <TooltipContent>Only show cards you own</TooltipContent>
        </Tooltip>

        {/* Budget Slider */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">Max per card:</span>
          <Slider
            value={[filters.maxBudget]}
            onValueChange={([v]) => onChange({ ...filters, maxBudget: v })}
            min={1}
            max={100}
            step={1}
            className="w-24"
          />
          <span className="text-sm font-medium w-12">${filters.maxBudget}</span>
        </div>
      </div>
    </div>
  );
}
