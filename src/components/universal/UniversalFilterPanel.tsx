import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { 
  ChevronDown, 
  ChevronUp, 
  X, 
  Filter,
  Palette,
  Type,
  BarChart3,
  Trophy
} from 'lucide-react';

interface UniversalFilterPanelProps {
  filters: {
    colors: string[];
    types: string[];
    formats: string[];
    rarities: string[];
    cmc: [number, number];
    power: [number, number];
    toughness: [number, number];
    priceMin: number;
    priceMax: number;
  };
  onFiltersChange: (filters: any) => void;
  onClearFilters: () => void;
  className?: string;
}

const COLORS = [
  { 
    value: 'w', 
    label: 'White', 
    symbol: 'W',
    className: 'bg-gradient-to-br from-yellow-50 to-orange-50 text-yellow-900 border-yellow-200 hover:from-yellow-100 hover:to-orange-100' 
  },
  { 
    value: 'u', 
    label: 'Blue', 
    symbol: 'U',
    className: 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-900 border-blue-200 hover:from-blue-100 hover:to-indigo-100' 
  },
  { 
    value: 'b', 
    label: 'Black', 
    symbol: 'B',
    className: 'bg-gradient-to-br from-gray-50 to-slate-50 text-gray-900 border-gray-300 hover:from-gray-100 hover:to-slate-100' 
  },
  { 
    value: 'r', 
    label: 'Red', 
    symbol: 'R',
    className: 'bg-gradient-to-br from-red-50 to-pink-50 text-red-900 border-red-200 hover:from-red-100 hover:to-pink-100' 
  },
  { 
    value: 'g', 
    label: 'Green', 
    symbol: 'G',
    className: 'bg-gradient-to-br from-green-50 to-emerald-50 text-green-900 border-green-200 hover:from-green-100 hover:to-emerald-100' 
  },
  { 
    value: 'c', 
    label: 'Colorless', 
    symbol: 'C',
    className: 'bg-gradient-to-br from-stone-50 to-neutral-50 text-stone-700 border-stone-200 hover:from-stone-100 hover:to-neutral-100' 
  }
];

const TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle'
];

const FORMATS = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'historic'
];

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

export function UniversalFilterPanel({
  filters,
  onFiltersChange,
  onClearFilters,
  className = ""
}: UniversalFilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    colors: true,
    types: false,
    stats: false,
    format: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const updateFilter = <K extends keyof typeof filters>(
    key: K, 
    value: typeof filters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: 'colors' | 'types' | 'formats' | 'rarities', value: string) => {
    const currentArray = filters[key];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const hasActiveFilters = 
    filters.colors.length > 0 || 
    filters.types.length > 0 || 
    filters.formats.length > 0 || 
    filters.rarities.length > 0 ||
    filters.cmc[0] > 0 || 
    filters.cmc[1] < 20;

  const getActiveFilterCount = () => {
    return filters.colors.length + 
           filters.types.length + 
           filters.formats.length + 
           filters.rarities.length +
           (filters.cmc[0] > 0 || filters.cmc[1] < 20 ? 1 : 0);
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {getActiveFilterCount()}
              </Badge>
            )}
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Colors Section */}
        <Collapsible open={expandedSections.colors} onOpenChange={() => toggleSection('colors')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <span className="font-medium">Colors</span>
                {filters.colors.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {filters.colors.length}
                  </Badge>
                )}
              </div>
              {expandedSections.colors ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((color) => {
                const isSelected = filters.colors.includes(color.value);
                return (
                  <button
                    key={color.value}
                    onClick={() => toggleArrayFilter('colors', color.value)}
                    className={`
                      relative px-3 py-2 rounded-lg border-2 transition-all duration-200 
                      flex items-center gap-2 font-medium text-sm justify-center
                      ${isSelected 
                        ? `${color.className} ring-2 ring-primary/20 shadow-md` 
                        : `${color.className} opacity-60 hover:opacity-100`
                      }
                    `}
                  >
                    <div className={`
                      w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold
                      ${isSelected ? 'bg-white/30' : 'bg-white/20'}
                    `}>
                      {color.symbol}
                    </div>
                    <span className="text-xs">{color.label}</span>
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full flex items-center justify-center">
                        <div className="w-1 h-1 bg-white rounded-full"></div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Types Section */}
        <Collapsible open={expandedSections.types} onOpenChange={() => toggleSection('types')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                <span className="font-medium">Card Types</span>
                {filters.types.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {filters.types.length}
                  </Badge>
                )}
              </div>
              {expandedSections.types ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((type) => {
                const isSelected = filters.types.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleArrayFilter('types', type)}
                    className={`
                      px-3 py-1.5 rounded-full border transition-all duration-200 text-sm font-medium capitalize
                      ${isSelected 
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                        : 'bg-background border-border hover:border-primary/50 hover:bg-accent'
                      }
                    `}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Stats Section */}
        <Collapsible open={expandedSections.stats} onOpenChange={() => toggleSection('stats')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="font-medium">Stats</span>
                {(filters.cmc[0] > 0 || filters.cmc[1] < 20) && (
                  <Badge variant="secondary" className="text-xs">
                    CMC
                  </Badge>
                )}
              </div>
              {expandedSections.stats ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Mana Value: {filters.cmc[0]} - {filters.cmc[1]}
              </label>
              <Slider
                value={filters.cmc}
                onValueChange={(value) => updateFilter('cmc', value as [number, number])}
                max={20}
                step={1}
                className="mt-2"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Formats Section */}
        <Collapsible open={expandedSections.format} onOpenChange={() => toggleSection('format')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="font-medium">Formats</span>
                {filters.formats.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {filters.formats.length}
                  </Badge>
                )}
              </div>
              {expandedSections.format ? 
                <ChevronUp className="h-4 w-4" /> : 
                <ChevronDown className="h-4 w-4" />
              }
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((format) => {
                const isSelected = filters.formats.includes(format);
                return (
                  <button
                    key={format}
                    onClick={() => toggleArrayFilter('formats', format)}
                    className={`
                      px-3 py-1.5 rounded-full border transition-all duration-200 text-sm font-medium capitalize
                      ${isSelected 
                        ? 'bg-secondary text-secondary-foreground border-secondary shadow-sm' 
                        : 'bg-background border-border hover:border-secondary/50 hover:bg-accent'
                      }
                    `}
                  >
                    {format}
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Rarities */}
        <div>
          <label className="text-sm font-medium mb-2 block">Rarity</label>
          <div className="flex flex-wrap gap-2">
            {RARITIES.map((rarity) => {
              const isSelected = filters.rarities.includes(rarity);
              const rarityColors = {
                common: 'text-gray-600',
                uncommon: 'text-gray-400', 
                rare: 'text-yellow-500',
                mythic: 'text-orange-500'
              };
              
              return (
                <button
                  key={rarity}
                  onClick={() => toggleArrayFilter('rarities', rarity)}
                  className={`
                    px-3 py-1.5 rounded-full border transition-all duration-200 text-sm font-medium capitalize
                    ${isSelected 
                      ? `bg-background border-border ring-2 ring-primary/20 ${rarityColors[rarity as keyof typeof rarityColors]}` 
                      : 'bg-background border-border hover:border-primary/50 hover:bg-accent'
                    }
                  `}
                >
                  {rarity}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}