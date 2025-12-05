import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CardSearchState, 
  Color, 
  Rarity, 
  Format, 
  COLOR_SYMBOLS, 
  RARITY_INFO,
  buildScryfallQuery 
} from '@/lib/scryfall/query-builder';
import { 
  Plus, 
  X, 
  Copy, 
  Wand2,
  Palette,
  Type,
  BarChart3,
  Trophy,
  Settings,
  DollarSign
} from 'lucide-react';

interface AdvancedFilterPanelProps {
  searchState: CardSearchState;
  onStateChange: (state: CardSearchState) => void;
  className?: string;
}

const CARD_TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 
  'planeswalker', 'land', 'battle', 'tribal'
];

const SUPERTYPES = [
  'legendary', 'basic', 'snow', 'world', 'ongoing'
];

const FORMATS: Format[] = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 
  'commander', 'pauper', 'historic'
];

const GAMES = ['paper', 'mtgo', 'arena'];

export function AdvancedFilterPanel({ 
  searchState, 
  onStateChange,
  className = "" 
}: AdvancedFilterPanelProps) {
  const [activeTab, setActiveTab] = useState("colors");

  const updateState = <K extends keyof CardSearchState>(
    key: K, 
    value: CardSearchState[K]
  ) => {
    onStateChange({ ...searchState, [key]: value });
  };

  const toggleArrayItem = <T,>(
    array: T[] | undefined, 
    item: T,
    key: keyof CardSearchState
  ) => {
    const current = array || [];
    const newArray = current.includes(item)
      ? current.filter(i => i !== item)
      : [...current, item];
    updateState(key, newArray as any);
  };

  const { q } = buildScryfallQuery(searchState);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Advanced Filters
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(q)}
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy Query
          </Button>
        </CardTitle>
        
        {/* Live Query Preview */}
        {q && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <Label className="text-xs text-muted-foreground">Generated Query:</Label>
            <code className="text-xs font-mono block mt-1">{q}</code>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto gap-1">
            <TabsTrigger value="colors" className="text-xs px-2 py-1.5">
              <Palette className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Colors</span>
            </TabsTrigger>
            <TabsTrigger value="types" className="text-xs px-2 py-1.5">
              <Type className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Types</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs px-2 py-1.5">
              <BarChart3 className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="formats" className="text-xs px-2 py-1.5">
              <Trophy className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Formats</span>
            </TabsTrigger>
            <TabsTrigger value="price" className="text-xs px-2 py-1.5">
              <DollarSign className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Price</span>
            </TabsTrigger>
            <TabsTrigger value="extras" className="text-xs px-2 py-1.5">
              <Settings className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Extras</span>
            </TabsTrigger>
          </TabsList>

          {/* Colors Tab */}
          <TabsContent value="colors" className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Color Identity</Label>
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-4">
                {(Object.keys(COLOR_SYMBOLS) as Color[]).map((color) => {
                  const info = COLOR_SYMBOLS[color];
                  const isSelected = searchState.colors?.value.includes(color);
                  return (
                    <button
                      key={color}
                      onClick={() => {
                        const current = searchState.colors || { mode: "any", value: [] };
                        const newValue = isSelected
                          ? current.value.filter(c => c !== color)
                          : [...current.value, color];
                        updateState('colors', { ...current, value: newValue });
                      }}
                      className={`
                        relative px-3 py-2 rounded-lg border-2 transition-all duration-200 
                        flex flex-col items-center gap-1 font-medium text-sm
                        ${isSelected 
                          ? `${info.className} ring-2 ring-primary/20 shadow-md` 
                          : `${info.className} opacity-60 hover:opacity-100`
                        }
                      `}
                    >
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${isSelected ? 'bg-white/30' : 'bg-white/20'}
                      `}>
                        {info.symbol}
                      </div>
                      <span className="text-xs">{info.name}</span>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full"></div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Color Mode</Label>
                <Select 
                  value={searchState.colors?.mode || "any"} 
                  onValueChange={(value: "any" | "exact" | "atleast") => 
                    updateState('colors', { 
                      ...searchState.colors, 
                      mode: value,
                      value: searchState.colors?.value || []
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any of these colors</SelectItem>
                    <SelectItem value="exact">Exactly these colors</SelectItem>
                    <SelectItem value="atleast">At least these colors</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Commander Identity</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COLOR_SYMBOLS) as Color[]).map((color) => {
                  const info = COLOR_SYMBOLS[color];
                  const isSelected = searchState.identity?.includes(color);
                  return (
                    <button
                      key={`id-${color}`}
                      onClick={() => toggleArrayItem(searchState.identity, color, 'identity')}
                      className={`
                        px-2 py-1 rounded-full border transition-all text-xs font-medium
                        ${isSelected 
                          ? `${info.className} ring-1 ring-primary/20` 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {info.symbol} {info.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Types Tab */}
          <TabsContent value="types" className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Card Types</Label>
              <div className="flex flex-wrap gap-2">
                {CARD_TYPES.map((type) => {
                  const isSelected = searchState.types?.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleArrayItem(searchState.types, type, 'types')}
                      className={`
                        px-3 py-1.5 rounded-full border transition-all text-sm font-medium capitalize
                        ${isSelected 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Supertypes</Label>
              <div className="flex flex-wrap gap-2">
                {SUPERTYPES.map((type) => {
                  const isSelected = searchState.supertypes?.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleArrayItem(searchState.supertypes, type, 'supertypes')}
                      className={`
                        px-3 py-1.5 rounded-full border transition-all text-sm font-medium capitalize
                        ${isSelected 
                          ? 'bg-secondary text-secondary-foreground border-secondary' 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Rarities</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RARITY_INFO) as Rarity[]).map((rarity) => {
                  const info = RARITY_INFO[rarity];
                  const isSelected = searchState.rarities?.includes(rarity);
                  return (
                    <button
                      key={rarity}
                      onClick={() => toggleArrayItem(searchState.rarities, rarity, 'rarities')}
                      className={`
                        px-3 py-1.5 rounded-full border transition-all text-sm font-medium
                        ${isSelected 
                          ? `bg-background border-border ring-2 ring-primary/20 ${info.className}` 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {info.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Mana Value: {searchState.mv?.min || 0} - {searchState.mv?.max || 20}
              </Label>
              <Slider
                value={[searchState.mv?.min || 0, searchState.mv?.max || 20]}
                onValueChange={([min, max]) => updateState('mv', { min, max })}
                max={20}
                step={1}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                Power: {searchState.pow?.min || 0} - {searchState.pow?.max || 20}
              </Label>
              <Slider
                value={[searchState.pow?.min || 0, searchState.pow?.max || 20]}
                onValueChange={([min, max]) => updateState('pow', { min, max })}
                max={20}
                step={1}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                Toughness: {searchState.tou?.min || 0} - {searchState.tou?.max || 20}
              </Label>
              <Slider
                value={[searchState.tou?.min || 0, searchState.tou?.max || 20]}
                onValueChange={([min, max]) => updateState('tou', { min, max })}
                max={20}
                step={1}
                className="mt-2"
              />
            </div>
          </TabsContent>

          {/* Formats Tab */}
          <TabsContent value="formats" className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Legal Formats</Label>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((format) => {
                  const isSelected = searchState.legal?.some(l => l.format === format && l.state === 'legal');
                  return (
                    <button
                      key={format}
                      onClick={() => {
                        const current = searchState.legal || [];
                        const newLegal = isSelected
                          ? current.filter(l => !(l.format === format && l.state === 'legal'))
                          : [...current.filter(l => l.format !== format), { format, state: 'legal' as const }];
                        updateState('legal', newLegal);
                      }}
                      className={`
                        px-3 py-1.5 rounded-full border transition-all text-sm font-medium capitalize
                        ${isSelected 
                          ? 'bg-green-100 text-green-800 border-green-300' 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {format}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Game Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {GAMES.map((game) => {
                  const isSelected = searchState.game?.includes(game as any);
                  return (
                    <button
                      key={game}
                      onClick={() => toggleArrayItem(searchState.game, game as any, 'game')}
                      className={`
                        px-3 py-1.5 rounded-full border transition-all text-sm font-medium capitalize
                        ${isSelected 
                          ? 'bg-blue-100 text-blue-800 border-blue-300' 
                          : 'bg-background border-border hover:bg-accent'
                        }
                      `}
                    >
                      {game}
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Price Tab */}
          <TabsContent value="price" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price-min">Min Price (USD)</Label>
                <Input
                  id="price-min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={searchState.price?.usdMin || ''}
                  onChange={(e) => updateState('price', {
                    ...searchState.price,
                    usdMin: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <Label htmlFor="price-max">Max Price (USD)</Label>
                <Input
                  id="price-max"
                  type="number"
                  min="0"
                  step="0.01"
                  value={searchState.price?.usdMax || ''}
                  onChange={(e) => updateState('price', {
                    ...searchState.price,
                    usdMax: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  placeholder="1000.00"
                />
              </div>
            </div>
          </TabsContent>

          {/* Extras Tab */}
          <TabsContent value="extras" className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'foil', label: 'Foil Only' },
                { key: 'nonfoil', label: 'Non-foil Only' },
                { key: 'showcase', label: 'Showcase' },
                { key: 'reprint', label: 'Reprints' },
                { key: 'reserved', label: 'Reserved List' },
                { key: 'promo', label: 'Promotional' }
              ].map(({ key, label }) => {
                const isSelected = searchState.extras?.[key as keyof typeof searchState.extras];
                return (
                  <button
                    key={key}
                    onClick={() => updateState('extras', {
                      ...searchState.extras,
                      [key]: !isSelected
                    })}
                    className={`
                      px-3 py-2 rounded-lg border transition-all text-sm font-medium
                      ${isSelected 
                        ? 'bg-accent text-accent-foreground border-accent' 
                        : 'bg-background border-border hover:bg-accent'
                      }
                    `}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="artist">Artist</Label>
              <Input
                id="artist"
                value={searchState.artist || ''}
                onChange={(e) => updateState('artist', e.target.value)}
                placeholder="e.g., Seb McKinnon"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={searchState.language || ''} onValueChange={(value) => updateState('language', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any language</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="zhs">Chinese Simplified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}