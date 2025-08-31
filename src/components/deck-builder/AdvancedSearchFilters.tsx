import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Filter, 
  X, 
  Search,
  Palette,
  Crown,
  Zap,
  Shield,
  Star,
  Calendar,
  DollarSign
} from 'lucide-react';
import { BASIC_COLORS, GUILDS, SHARDS, WEDGES } from '@/lib/magic/colors';
import { SUPERTYPES, CARD_TYPES } from '@/lib/magic/types';
import { ALL_FORMATS, FORMAT_CATEGORIES } from '@/lib/magic/formats';

interface AdvancedSearchFiltersProps {
  filters: Record<string, any>;
  onFiltersChange: (filters: Record<string, any>) => void;
  onAddSyntaxExample: (syntax: string) => void;
}

export function AdvancedSearchFilters({ 
  filters, 
  onFiltersChange, 
  onAddSyntaxExample 
}: AdvancedSearchFiltersProps) {
  const updateFilter = (key: string, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const removeFilter = (key: string) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Filter className="h-5 w-5 mr-2" />
          Advanced Search & Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="colors" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="colors">
              <Palette className="h-4 w-4 mr-1" />
              Colors
            </TabsTrigger>
            <TabsTrigger value="types">
              <Crown className="h-4 w-4 mr-1" />
              Types
            </TabsTrigger>
            <TabsTrigger value="stats">
              <Zap className="h-4 w-4 mr-1" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="formats">
              <Shield className="h-4 w-4 mr-1" />
              Formats
            </TabsTrigger>
            <TabsTrigger value="sets">
              <Calendar className="h-4 w-4 mr-1" />
              Sets
            </TabsTrigger>
            <TabsTrigger value="price">
              <DollarSign className="h-4 w-4 mr-1" />
              Price
            </TabsTrigger>
          </TabsList>

          {/* Colors Tab */}
          <TabsContent value="colors" className="space-y-4">
            <div className="space-y-3">
              <Label>Color Identity</Label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(BASIC_COLORS).map(([symbol, color]) => (
                  <Button
                    key={symbol}
                    variant={filters.colors?.includes(symbol) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const current = filters.colors || [];
                      const updated = current.includes(symbol)
                        ? current.filter((c: string) => c !== symbol)
                        : [...current, symbol];
                      updateFilter('colors', updated);
                    }}
                    className="flex items-center space-x-1"
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span>{symbol}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Color Operator</Label>
              <Select 
                value={filters.colorOperator || 'exact'} 
                onValueChange={(value) => updateFilter('colorOperator', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exactly these colors</SelectItem>
                  <SelectItem value="contains">Contains these colors</SelectItem>
                  <SelectItem value="subset">At most these colors</SelectItem>
                  <SelectItem value="superset">At least these colors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Guild Combinations</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(GUILDS).map(([key, guild]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateFilter('colors', guild.colors);
                      updateFilter('colorOperator', 'exact');
                    }}
                    className="text-xs"
                  >
                    {guild.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Shard Combinations</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(SHARDS).map(([key, shard]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateFilter('colors', shard.colors);
                      updateFilter('colorOperator', 'exact');
                    }}
                    className="text-xs"
                  >
                    {shard.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Wedge Combinations</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(WEDGES).map(([key, wedge]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateFilter('colors', wedge.colors);
                      updateFilter('colorOperator', 'exact');
                    }}
                    className="text-xs"
                  >
                    {wedge.name}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Types Tab */}
          <TabsContent value="types" className="space-y-4">
            <div className="space-y-3">
              <Label>Supertypes</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SUPERTYPES.map((supertype) => (
                  <Button
                    key={supertype}
                    variant={filters.supertypes?.includes(supertype) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const current = filters.supertypes || [];
                      const updated = current.includes(supertype)
                        ? current.filter((t: string) => t !== supertype)
                        : [...current, supertype];
                      updateFilter('supertypes', updated);
                    }}
                    className="text-xs"
                  >
                    {supertype}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Card Types</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CARD_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant={filters.types?.includes(type) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const current = filters.types || [];
                      const updated = current.includes(type)
                        ? current.filter((t: string) => t !== type)
                        : [...current, type];
                      updateFilter('types', updated);
                    }}
                    className="text-xs"
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Rarity</Label>
              <Select 
                value={filters.rarity || 'any'} 
                onValueChange={(value) => updateFilter('rarity', value === 'any' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any rarity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Rarity</SelectItem>
                  <SelectItem value="common">Common</SelectItem>
                  <SelectItem value="uncommon">Uncommon</SelectItem>
                  <SelectItem value="rare">Rare</SelectItem>
                  <SelectItem value="mythic">Mythic Rare</SelectItem>
                  <SelectItem value="special">Special</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mana Value (CMC)</Label>
                <div className="flex space-x-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.cmcMin || ''}
                    onChange={(e) => updateFilter('cmcMin', e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.cmcMax || ''}
                    onChange={(e) => updateFilter('cmcMax', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Power</Label>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Min"
                    value={filters.powerMin || ''}
                    onChange={(e) => updateFilter('powerMin', e.target.value)}
                  />
                  <Input
                    placeholder="Max"
                    value={filters.powerMax || ''}
                    onChange={(e) => updateFilter('powerMax', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Toughness</Label>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Min"
                    value={filters.toughnessMin || ''}
                    onChange={(e) => updateFilter('toughnessMin', e.target.value)}
                  />
                  <Input
                    placeholder="Max"
                    value={filters.toughnessMax || ''}
                    onChange={(e) => updateFilter('toughnessMax', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Loyalty</Label>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Min"
                    value={filters.loyaltyMin || ''}
                    onChange={(e) => updateFilter('loyaltyMin', e.target.value)}
                  />
                  <Input
                    placeholder="Max"
                    value={filters.loyaltyMax || ''}
                    onChange={(e) => updateFilter('loyaltyMax', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Formats Tab */}
          <TabsContent value="formats" className="space-y-4">
            {Object.entries(FORMAT_CATEGORIES).map(([categoryKey, category]) => (
              <div key={categoryKey} className="space-y-3">
                <Label>{category.name}</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {category.formats.map((formatCode) => {
                    const format = ALL_FORMATS[formatCode];
                    return (
                      <Button
                        key={formatCode}
                        variant={filters.format === formatCode ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateFilter('format', formatCode)}
                        className="text-xs"
                      >
                        {format.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Sets Tab */}
          <TabsContent value="sets" className="space-y-4">
            <div className="space-y-3">
              <Label>Set Code</Label>
              <Input
                placeholder="e.g., NEO, VOW, MID"
                value={filters.setCode || ''}
                onChange={(e) => updateFilter('setCode', e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>Recent Sets</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { code: 'BRO', name: 'The Brothers War' },
                  { code: 'ONE', name: 'Phyrexia: All Will Be One' },
                  { code: 'MOM', name: 'March of the Machine' },
                  { code: 'MAT', name: 'March Aftermath' },
                  { code: 'LTR', name: 'LOTR: Tales of Middle-earth' },
                  { code: 'WOE', name: 'Wilds of Eldraine' },
                  { code: 'LCI', name: 'Lost Caverns of Ixalan' },
                  { code: 'MKM', name: 'Murders at Karlov Manor' }
                ].map((set) => (
                  <Button
                    key={set.code}
                    variant={filters.setCode === set.code ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateFilter('setCode', set.code)}
                    className="text-xs"
                  >
                    {set.code}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Price Tab */}
          <TabsContent value="price" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>USD Price</Label>
                <div className="flex space-x-2">
                  <Input
                    type="number"
                    placeholder="Min $"
                    value={filters.priceMin || ''}
                    onChange={(e) => updateFilter('priceMin', e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Max $"
                    value={filters.priceMax || ''}
                    onChange={(e) => updateFilter('priceMax', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Price Ranges</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Budget (<$1)', min: 0, max: 1 },
                  { label: 'Casual ($1-5)', min: 1, max: 5 },
                  { label: 'Competitive ($5-20)', min: 5, max: 20 },
                  { label: 'Premium ($20+)', min: 20, max: 999999 }
                ].map((range) => (
                  <Button
                    key={range.label}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateFilter('priceMin', range.min.toString());
                      updateFilter('priceMax', range.max === 999999 ? '' : range.max.toString());
                    }}
                    className="text-xs"
                  >
                    {range.label}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Active Filters */}
        {Object.keys(filters).length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Active Filters</Label>
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                Clear All
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(filters).map(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return null;
                
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                return (
                  <Badge key={key} variant="secondary" className="flex items-center space-x-1">
                    <span className="text-xs">
                      {key}: {displayValue}
                    </span>
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeFilter(key)}
                    />
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Syntax Examples */}
        <div className="mt-6 space-y-3">
          <Label>Search Syntax Examples</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { syntax: 'c:red t:creature', description: 'Red creatures' },
              { syntax: 'mv>=4 mv<=6', description: 'CMC 4-6' },
              { syntax: 'pow>=3 t:creature', description: 'Creatures with power 3+' },
              { syntax: 'o:"enters the battlefield"', description: 'ETB effects' },
              { syntax: 'is:commander', description: 'Commander legal' },
              { syntax: 'r:mythic usd>=10', description: 'Expensive mythics' }
            ].map((example) => (
              <Button
                key={example.syntax}
                variant="outline"
                size="sm"
                onClick={() => onAddSyntaxExample(example.syntax)}
                className="text-xs text-left justify-start h-auto p-2"
              >
                <div>
                  <div className="font-mono text-xs text-primary">{example.syntax}</div>
                  <div className="text-muted-foreground">{example.description}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}