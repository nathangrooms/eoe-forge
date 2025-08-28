import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Filter, X } from 'lucide-react';

interface SearchFiltersProps {
  filters: {
    sets: string[];
    types: string[];
    colors: string[];
    mechanics: string[];
  };
  onFiltersChange: (filters: any) => void;
}

const POPULAR_SETS = [
  { code: 'BLB', name: 'Bloomburrow' },
  { code: 'DSK', name: 'Duskmourn: House of Horror' },
  { code: 'OTJ', name: 'Outlaws of Thunder Junction' },
  { code: 'MKM', name: 'Murders at Karlov Manor' },
  { code: 'LCI', name: 'The Lost Caverns of Ixalan' }
];

const TYPES = [
  'Creature', 'Instant', 'Sorcery', 'Enchantment', 
  'Artifact', 'Planeswalker', 'Land', 'Battle'
];

const COLORS = [
  { symbol: 'W', name: 'White', color: '#FFFBD5' },
  { symbol: 'U', name: 'Blue', color: '#0E68AB' },
  { symbol: 'B', name: 'Black', color: '#150B00' },
  { symbol: 'R', name: 'Red', color: '#D3202A' },
  { symbol: 'G', name: 'Green', color: '#00733E' }
];

const MTG_MECHANICS = [
  'Flying', 'Trample', 'Vigilance', 'Menace', 'Lifelink', 'Deathtouch', 'Haste', 'Reach'
];

export const SearchFilters = ({ filters, onFiltersChange }: SearchFiltersProps) => {
  const toggleFilter = (category: string, value: string) => {
    const currentValues = filters[category as keyof typeof filters];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    
    onFiltersChange({
      ...filters,
      [category]: newValues
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      sets: [],
      types: [],
      colors: [],
      mechanics: []
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
            className="h-6 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sets */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            SETS
          </Label>
          <div className="space-y-2">
            {POPULAR_SETS.map((set) => (
              <div key={set.code} className="flex items-center space-x-2">
                <Checkbox
                  id={set.code}
                  checked={filters.sets.includes(set.code)}
                  onCheckedChange={() => toggleFilter('sets', set.code)}
                />
                <Label htmlFor={set.code} className="text-sm cursor-pointer">
                  {set.code}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Types */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            TYPES
          </Label>
          <div className="flex flex-wrap gap-1">
            {TYPES.map((type) => (
              <Badge
                key={type}
                variant={filters.types.includes(type) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleFilter('types', type)}
              >
                {type}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Colors */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            COLORS
          </Label>
          <div className="flex space-x-1">
            {COLORS.map((color) => (
              <button
                key={color.symbol}
                onClick={() => toggleFilter('colors', color.symbol)}
                className={`
                  w-8 h-8 rounded-full border-2 text-xs font-bold
                  ${filters.colors.includes(color.symbol) 
                    ? 'border-primary ring-2 ring-primary/50' 
                    : 'border-border hover:border-primary/50'
                  }
                `}
                style={{ 
                  backgroundColor: color.color,
                  color: color.symbol === 'W' ? '#000' : '#fff'
                }}
              >
                {color.symbol}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Mechanics */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            MECHANICS
          </Label>
          <div className="flex flex-wrap gap-1">
            {MTG_MECHANICS.map((mechanic) => (
              <Badge
                key={mechanic}
                variant={filters.mechanics.includes(mechanic) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleFilter('mechanics', mechanic)}
              >
                {mechanic}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};