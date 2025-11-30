import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';

interface FilterState {
  cmcMin: number;
  cmcMax: number;
  colors: string[];
  types: string[];
  keywords: string[];
  rarity: string[];
  legality: string;
}

interface AdvancedCardFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
}

export function AdvancedCardFilters({ onFilterChange, initialFilters }: AdvancedCardFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    cmcMin: initialFilters?.cmcMin || 0,
    cmcMax: initialFilters?.cmcMax || 10,
    colors: initialFilters?.colors || [],
    types: initialFilters?.types || [],
    keywords: initialFilters?.keywords || [],
    rarity: initialFilters?.rarity || [],
    legality: initialFilters?.legality || 'all',
  });

  const cardTypes = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'];
  const colors = [
    { value: 'W', label: 'White', color: 'bg-yellow-100' },
    { value: 'U', label: 'Blue', color: 'bg-blue-100' },
    { value: 'B', label: 'Black', color: 'bg-gray-800' },
    { value: 'R', label: 'Red', color: 'bg-red-100' },
    { value: 'G', label: 'Green', color: 'bg-green-100' },
  ];
  const rarities = ['common', 'uncommon', 'rare', 'mythic'];
  const formats = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander'];

  const updateFilter = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const toggleArrayValue = (key: 'colors' | 'types' | 'keywords' | 'rarity', value: string) => {
    const current = filters[key];
    const newArray = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateFilter(key, newArray);
  };

  const clearFilters = () => {
    const resetFilters: FilterState = {
      cmcMin: 0,
      cmcMax: 10,
      colors: [],
      types: [],
      keywords: [],
      rarity: [],
      legality: 'all',
    };
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  const hasActiveFilters = 
    filters.colors.length > 0 ||
    filters.types.length > 0 ||
    filters.keywords.length > 0 ||
    filters.rarity.length > 0 ||
    filters.legality !== 'all' ||
    filters.cmcMin !== 0 ||
    filters.cmcMax !== 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Advanced Filters
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* CMC Range */}
        <div className="space-y-2">
          <Label>Mana Value (CMC)</Label>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-8">{filters.cmcMin}</span>
            <Slider
              value={[filters.cmcMin, filters.cmcMax]}
              onValueChange={([min, max]) => {
                updateFilter('cmcMin', min);
                updateFilter('cmcMax', max);
              }}
              max={15}
              min={0}
              step={1}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-8">{filters.cmcMax}</span>
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-2">
          <Label>Colors</Label>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <Badge
                key={color.value}
                variant={filters.colors.includes(color.value) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleArrayValue('colors', color.value)}
              >
                {color.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Card Types */}
        <div className="space-y-2">
          <Label>Card Types</Label>
          <div className="flex flex-wrap gap-2">
            {cardTypes.map((type) => (
              <Badge
                key={type}
                variant={filters.types.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleArrayValue('types', type)}
              >
                {type}
              </Badge>
            ))}
          </div>
        </div>

        {/* Rarity */}
        <div className="space-y-2">
          <Label>Rarity</Label>
          <div className="flex flex-wrap gap-2">
            {rarities.map((rarity) => (
              <Badge
                key={rarity}
                variant={filters.rarity.includes(rarity) ? 'default' : 'outline'}
                className="cursor-pointer capitalize"
                onClick={() => toggleArrayValue('rarity', rarity)}
              >
                {rarity}
              </Badge>
            ))}
          </div>
        </div>

        {/* Legality */}
        <div className="space-y-2">
          <Label>Format Legality</Label>
          <Select value={filters.legality} onValueChange={(value) => updateFilter('legality', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              {formats.map((format) => (
                <SelectItem key={format} value={format} className="capitalize">
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Active Filters:</p>
            <div className="flex flex-wrap gap-2">
              {filters.colors.length > 0 && (
                <Badge variant="secondary">
                  Colors: {filters.colors.join(', ')}
                </Badge>
              )}
              {filters.types.length > 0 && (
                <Badge variant="secondary">
                  Types: {filters.types.join(', ')}
                </Badge>
              )}
              {filters.rarity.length > 0 && (
                <Badge variant="secondary">
                  Rarity: {filters.rarity.join(', ')}
                </Badge>
              )}
              {(filters.cmcMin !== 0 || filters.cmcMax !== 10) && (
                <Badge variant="secondary">
                  CMC: {filters.cmcMin}-{filters.cmcMax}
                </Badge>
              )}
              {filters.legality !== 'all' && (
                <Badge variant="secondary" className="capitalize">
                  {filters.legality}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
