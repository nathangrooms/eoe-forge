import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Search, Filter, X } from 'lucide-react';
import { DeckFilters } from '@/hooks/useDeckFilters';

interface DeckSearchFiltersProps {
  filters: DeckFilters;
  onUpdateFilters: (filters: Partial<DeckFilters>) => void;
  onResetFilters: () => void;
  onToggleFormat: (format: string) => void;
  onToggleColor: (color: string) => void;
  hasActiveFilters: boolean;
}

const FORMAT_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'commander', label: 'Commander' },
  { value: 'custom', label: 'Custom' }
];

const COLOR_OPTIONS = [
  { value: 'W', label: 'White', color: 'bg-yellow-100 text-yellow-900' },
  { value: 'U', label: 'Blue', color: 'bg-blue-100 text-blue-900' },
  { value: 'B', label: 'Black', color: 'bg-gray-800 text-gray-100' },
  { value: 'R', label: 'Red', color: 'bg-red-100 text-red-900' },
  { value: 'G', label: 'Green', color: 'bg-green-100 text-green-900' }
];

export const DeckSearchFilters = ({
  filters,
  onUpdateFilters,
  onResetFilters,
  onToggleFormat,
  onToggleColor,
  hasActiveFilters
}: DeckSearchFiltersProps) => {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Search Input */}
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search decks..."
          value={filters.searchQuery}
          onChange={(e) => onUpdateFilters({ searchQuery: e.target.value })}
          className="pl-10"
        />
      </div>

      {/* Filter Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {(filters.format.length + filters.colors.length + 
                  (filters.searchQuery ? 1 : 0) + 
                  (filters.minPower !== 1 || filters.maxPower !== 10 ? 1 : 0))}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Filters</h4>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResetFilters}
                  className="h-8 px-2"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Format Filter */}
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map(format => (
                  <Badge
                    key={format.value}
                    variant={filters.format.includes(format.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => onToggleFormat(format.value)}
                  >
                    {format.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Color Filter */}
            <div className="space-y-2">
              <Label>Colors</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(color => (
                  <Badge
                    key={color.value}
                    variant={filters.colors.includes(color.value) ? 'default' : 'outline'}
                    className={`cursor-pointer ${filters.colors.includes(color.value) ? color.color : ''}`}
                    onClick={() => onToggleColor(color.value)}
                  >
                    {color.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Power Level Range */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Power Level</Label>
                <span className="text-sm text-muted-foreground">
                  {filters.minPower} - {filters.maxPower}
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Min: {filters.minPower}</Label>
                  <Slider
                    value={[filters.minPower]}
                    onValueChange={([value]) => onUpdateFilters({ minPower: value })}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max: {filters.maxPower}</Label>
                  <Slider
                    value={[filters.maxPower]}
                    onValueChange={([value]) => onUpdateFilters({ maxPower: value })}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
