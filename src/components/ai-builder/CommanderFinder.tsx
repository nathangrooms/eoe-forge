import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sparkles, Search, Loader2, Target, Users, Zap, Shield, Scroll, Crown, Heart, Skull, Flame, Leaf, Droplet } from 'lucide-react';

const MANA_COLORS = [
  { color: 'W', name: 'White', icon: '☀️', bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-100', border: 'border-amber-400' },
  { color: 'U', name: 'Blue', icon: '💧', bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
  { color: 'B', name: 'Black', icon: '💀', bg: 'bg-gray-800', text: 'text-white', border: 'border-gray-900' },
  { color: 'R', name: 'Red', icon: '🔥', bg: 'bg-red-500', text: 'text-white', border: 'border-red-600' },
  { color: 'G', name: 'Green', icon: '🌲', bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' },
  { color: 'C', name: 'Colorless', icon: '◇', bg: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-100', border: 'border-gray-400' }
];

const PLAYSTYLES = [
  { value: 'aggro', label: 'Aggro', icon: Zap, description: 'Fast, aggressive, attack-focused', keywords: '(o:haste OR o:"first strike" OR o:"double strike" OR o:attack)' },
  { value: 'voltron', label: 'Voltron', icon: Shield, description: 'Commander damage focused', keywords: '(o:equipment OR o:aura OR o:attach OR o:"equipped creature")' },
  { value: 'control', label: 'Control', icon: Target, description: 'Disrupt opponents, slow game', keywords: '(o:counter OR o:destroy OR o:exile OR o:"opponents can\'t")' },
  { value: 'combo', label: 'Combo', icon: Sparkles, description: 'Win via card combos', keywords: '(o:infinite OR o:untap OR o:whenever)' },
  { value: 'tokens', label: 'Tokens', icon: Users, description: 'Create token armies', keywords: '(o:token OR o:create)' },
  { value: 'aristocrats', label: 'Aristocrats', icon: Skull, description: 'Sacrifice for value', keywords: '(o:sacrifice OR o:"when dies" OR o:"whenever a creature dies")' },
  { value: 'spellslinger', label: 'Spellslinger', icon: Scroll, description: 'Instants/sorceries matter', keywords: '(o:"instant or sorcery" OR o:"you cast" OR o:prowess OR o:magecraft)' },
  { value: 'tribal', label: 'Tribal', icon: Crown, description: 'Creature type synergy', keywords: '(o:"creature type" OR o:"creatures you control" OR o:"each creature")' },
  { value: 'lifegain', label: 'Lifegain', icon: Heart, description: 'Gain life, drain opponents', keywords: '(o:"gain life" OR o:lifelink OR o:"you gain")' },
  { value: 'graveyard', label: 'Graveyard', icon: Skull, description: 'Use cards from graveyard', keywords: '(o:graveyard OR o:"from your graveyard" OR o:reanimate OR o:flashback)' },
  { value: 'ramp', label: 'Ramp/Lands', icon: Leaf, description: 'Land/mana focused', keywords: '(o:landfall OR o:"search your library for" OR o:"add mana" OR o:"put a land")' },
  { value: 'draw', label: 'Card Draw', icon: Droplet, description: 'Draw lots of cards', keywords: '(o:"draw card" OR o:"draw a card" OR o:"draw cards" OR o:wheels)' }
];

// Tribal types for filtering
const TRIBAL_TYPES = [
  'Elves', 'Goblins', 'Zombies', 'Vampires', 'Dragons', 'Angels', 'Demons', 'Wizards',
  'Humans', 'Merfolk', 'Soldiers', 'Knights', 'Beasts', 'Dinosaurs', 'Slivers', 'Spirits',
  'Cats', 'Dogs', 'Rats', 'Birds', 'Rogues', 'Warriors', 'Clerics', 'Shamans'
];

// CMC categories
const CMC_RANGES = [
  { value: 'low', label: '1-3 CMC', description: 'Fast, early game commander', min: 0, max: 3 },
  { value: 'mid', label: '4-5 CMC', description: 'Mid-game value engine', min: 4, max: 5 },
  { value: 'high', label: '6+ CMC', description: 'Late game powerhouse', min: 6, max: 20 }
];

interface CommanderFinderProps {
  onSelectCommander: (commander: any) => void;
}

export function CommanderFinder({ onSelectCommander }: CommanderFinderProps) {
  const [finderColors, setFinderColors] = useState<string[]>([]);
  const [selectedPlaystyles, setSelectedPlaystyles] = useState<string[]>([]);
  const [selectedCmcRange, setSelectedCmcRange] = useState<string | null>(null);
  const [selectedTribal, setSelectedTribal] = useState<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState(false);
  const [finderResults, setFinderResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleColor = (color: string) => {
    setFinderColors(prev => 
      prev.includes(color) 
        ? prev.filter(c => c !== color)
        : [...prev, color]
    );
  };

  const togglePlaystyle = (value: string) => {
    setSelectedPlaystyles(prev =>
      prev.includes(value)
        ? prev.filter(p => p !== value)
        : [...prev, value]
    );
  };

  const searchCommanders = async () => {
    if (finderColors.length === 0 && selectedPlaystyles.length === 0 && !selectedTribal) return;
    
    setSearching(true);
    try {
      let query = 't:legendary t:creature';
      
      // Add color identity filter
      if (finderColors.length > 0) {
        if (finderColors.includes('C')) {
          // Colorless commander
          query += ' id:c';
        } else {
          const colorString = finderColors.filter(c => c !== 'C').sort().join('');
          query += ` id<=${colorString}`;
        }
      }
      
      // Add CMC filter
      if (selectedCmcRange) {
        const range = CMC_RANGES.find(r => r.value === selectedCmcRange);
        if (range) {
          query += ` cmc>=${range.min} cmc<=${range.max}`;
        }
      }
      
      // Add tribal filter
      if (selectedTribal) {
        query += ` t:${selectedTribal}`;
      }
      
      // Add partner filter
      if (partnerSearch) {
        query += ' o:partner';
      }
      
      // Add playstyle-based oracle text filters (combine with OR)
      if (selectedPlaystyles.length > 0) {
        const keywordGroups = selectedPlaystyles.map(style => {
          const playstyle = PLAYSTYLES.find(p => p.value === style);
          return playstyle?.keywords || '';
        }).filter(Boolean);
        
        if (keywordGroups.length === 1) {
          query += ` ${keywordGroups[0]}`;
        } else if (keywordGroups.length > 1) {
          // For multiple playstyles, use any of them
          query += ` (${keywordGroups.join(' OR ')})`;
        }
      }
      
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=edhrec`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setFinderResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      setFinderResults((data.data || []).slice(0, 20));
    } catch (error) {
      console.error('Commander finder search error:', error);
      setFinderResults([]);
    } finally {
      setSearching(false);
    }
  };

  const activeFiltersCount = finderColors.length + selectedPlaystyles.length + 
    (selectedCmcRange ? 1 : 0) + (selectedTribal ? 1 : 0) + (partnerSearch ? 1 : 0);

  return (
    <Card className="mt-8 border-2 border-dashed border-primary/30 bg-gradient-to-br from-accent/5 to-primary/5">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            Don't know what commander to pick?
          </h4>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary">{activeFiltersCount} filters active</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Find your perfect commander by selecting colors, playstyle, and other preferences
        </p>

        <div className="space-y-6">
          {/* Color Selector */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Color Identity</Label>
            <div className="flex flex-wrap gap-2">
              {MANA_COLORS.map(({ color, name, icon, bg, text, border }) => (
                <Button
                  key={color}
                  variant="outline"
                  size="sm"
                  onClick={() => toggleColor(color)}
                  className={`transition-all ${
                    finderColors.includes(color) 
                      ? `${bg} ${text} ${border} ring-2 ring-offset-2 ring-primary scale-105` 
                      : 'hover:scale-105'
                  }`}
                >
                  <span className="mr-1">{icon}</span>
                  {name}
                </Button>
              ))}
            </div>
          </div>

          {/* Playstyle Selector - Button Grid */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Playstyle</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {PLAYSTYLES.map(({ value, label, icon: Icon, description }) => (
                <Button
                  key={value}
                  variant={selectedPlaystyles.includes(value) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => togglePlaystyle(value)}
                  className={`flex flex-col items-center h-auto py-3 px-2 transition-all ${
                    selectedPlaystyles.includes(value) 
                      ? 'ring-2 ring-offset-2 ring-primary scale-105 bg-primary text-primary-foreground' 
                      : 'hover:scale-105 hover:bg-muted'
                  }`}
                  title={description}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Advanced Filters Toggle */}
          <div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? '− Hide' : '+ Show'} Advanced Filters
            </Button>
          </div>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="space-y-6 p-4 bg-muted/30 rounded-lg border border-border/50">
              {/* CMC Range */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Commander Mana Value</Label>
                <div className="flex flex-wrap gap-2">
                  {CMC_RANGES.map(({ value, label, description }) => (
                    <Button
                      key={value}
                      variant={selectedCmcRange === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCmcRange(selectedCmcRange === value ? null : value)}
                      className={selectedCmcRange === value ? 'ring-2 ring-offset-1 ring-primary' : ''}
                      title={description}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tribal Filter */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Tribal (Creature Type)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TRIBAL_TYPES.map(tribe => (
                    <Button
                      key={tribe}
                      variant={selectedTribal === tribe ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTribal(selectedTribal === tribe ? null : tribe)}
                      className={`text-xs h-7 ${selectedTribal === tribe ? 'ring-1 ring-offset-1 ring-primary' : ''}`}
                    >
                      {tribe}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Partner Filter */}
              <div className="flex items-center gap-3">
                <Button
                  variant={partnerSearch ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPartnerSearch(!partnerSearch)}
                  className={partnerSearch ? 'ring-2 ring-offset-1 ring-primary' : ''}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Partner Commanders Only
                </Button>
                <span className="text-xs text-muted-foreground">
                  Show only commanders with Partner ability
                </span>
              </div>
            </div>
          )}

          {/* Search Button */}
          <div className="flex gap-3">
            <Button 
              onClick={searchCommanders}
              disabled={searching || (finderColors.length === 0 && selectedPlaystyles.length === 0 && !selectedTribal)}
              className="flex-1 md:flex-none"
            >
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Commanders
                </>
              )}
            </Button>
            
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFinderColors([]);
                  setSelectedPlaystyles([]);
                  setSelectedCmcRange(null);
                  setSelectedTribal(null);
                  setPartnerSearch(false);
                  setFinderResults([]);
                }}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Results */}
          {finderResults.length > 0 && (
            <div className="pt-4 border-t border-border/50">
              <h5 className="font-medium mb-4 text-sm text-muted-foreground">
                Found {finderResults.length} matching commanders
              </h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {finderResults.map((card: any) => (
                  <div
                    key={card.id}
                    className="group cursor-pointer transition-all duration-300"
                    onClick={() => onSelectCommander(card)}
                  >
                    <div className="relative rounded-xl overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-xl group-hover:shadow-primary/20 transition-all transform group-hover:scale-105">
                      <img 
                        src={card.image_uris?.normal || card.image_uris?.large || '/placeholder.svg'} 
                        alt={card.name}
                        className="w-full h-auto"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-white text-sm font-bold truncate">{card.name}</p>
                        <p className="text-white/70 text-xs">CMC: {card.cmc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No results message */}
          {finderResults.length === 0 && searching === false && activeFiltersCount > 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Click "Find Commanders" to search with your filters</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
