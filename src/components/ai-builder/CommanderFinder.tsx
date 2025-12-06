import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Search, Loader2 } from 'lucide-react';

const MANA_COLORS = [
  { color: 'W', name: 'White', bg: '#F9FAF4', text: '#000' },
  { color: 'U', name: 'Blue', bg: '#0E68AB', text: '#fff' },
  { color: 'B', name: 'Black', bg: '#150B00', text: '#fff' },
  { color: 'R', name: 'Red', bg: '#D3202A', text: '#fff' },
  { color: 'G', name: 'Green', bg: '#00733E', text: '#fff' }
];

const PLAYSTYLES = [
  { value: '', label: 'Any Playstyle' },
  { value: 'aggro', label: 'Aggro', keywords: '(o:haste OR o:"first strike" OR o:"double strike")' },
  { value: 'voltron', label: 'Voltron', keywords: '(o:equipment OR o:aura OR o:attach)' },
  { value: 'tribal', label: 'Tribal', keywords: '(o:"creature type" OR o:"each creature you control")' },
  { value: 'control', label: 'Control', keywords: '(o:counter OR o:destroy OR o:exile)' },
  { value: 'combo', label: 'Combo', keywords: '(o:whenever OR o:sacrifice)' },
  { value: 'tokens', label: 'Tokens', keywords: '(o:token OR o:create)' },
  { value: 'artifacts', label: 'Artifacts', keywords: '(o:artifact)' },
  { value: 'spellslinger', label: 'Spellslinger', keywords: '(o:instant OR o:sorcery OR o:"you cast")' },
  { value: 'lifegain', label: 'Lifegain', keywords: '(o:"gain life" OR o:lifelink)' },
  { value: 'graveyard', label: 'Graveyard', keywords: '(o:graveyard OR o:"return from")' },
  { value: 'ramp', label: 'Ramp', keywords: '(o:"search your library for" OR o:"add {" OR o:"put a land")' },
  { value: 'draw', label: 'Card Draw', keywords: '(o:"draw card" OR o:"draw a card" OR o:"draw cards")' }
];

interface CommanderFinderProps {
  onSelectCommander: (commander: any) => void;
}

export function CommanderFinder({ onSelectCommander }: CommanderFinderProps) {
  const [finderColors, setFinderColors] = useState<string[]>([]);
  const [finderPlaystyle, setFinderPlaystyle] = useState('');
  const [finderResults, setFinderResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const toggleColor = (color: string) => {
    setFinderColors(prev => 
      prev.includes(color) 
        ? prev.filter(c => c !== color)
        : [...prev, color]
    );
  };

  const searchCommanders = async () => {
    if (finderColors.length === 0 && !finderPlaystyle) return;
    
    setSearching(true);
    try {
      let query = 't:legendary t:creature';
      
      // Add color identity filter
      if (finderColors.length > 0) {
        const colorString = finderColors.sort().join('');
        query += ` id:${colorString}`;
      }
      
      // Add playstyle-based oracle text filters
      if (finderPlaystyle) {
        const playstyle = PLAYSTYLES.find(p => p.value === finderPlaystyle);
        if (playstyle?.keywords) {
          query += ` ${playstyle.keywords}`;
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
      setFinderResults((data.data || []).slice(0, 12));
    } catch (error) {
      console.error('Commander finder search error:', error);
      setFinderResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mt-8 p-6 border-2 border-dashed border-primary/30 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5">
      <h4 className="font-semibold mb-2 text-lg flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-accent" />
        Don't know what commander to pick?
      </h4>
      <p className="text-sm text-muted-foreground mb-6">
        Filter commanders by colors and playstyle to find your perfect match
      </p>

      <div className="space-y-6">
        {/* Color Selector */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Color Identity</Label>
          <div className="flex flex-wrap gap-2">
            {MANA_COLORS.map(({ color, name, bg, text }) => (
              <Button
                key={color}
                variant={finderColors.includes(color) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleColor(color)}
                className={`transition-all ${finderColors.includes(color) ? 'ring-2 ring-offset-2 ring-primary' : 'hover:scale-105'}`}
                style={finderColors.includes(color) ? {
                  backgroundColor: bg,
                  color: text,
                  borderColor: bg
                } : {}}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>

        {/* Playstyle Selector */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Playstyle</Label>
          <Select value={finderPlaystyle} onValueChange={setFinderPlaystyle}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Select a playstyle..." />
            </SelectTrigger>
            <SelectContent>
              {PLAYSTYLES.map(playstyle => (
                <SelectItem key={playstyle.value || 'any'} value={playstyle.value || 'any'}>
                  {playstyle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search Button */}
        <Button 
          onClick={searchCommanders}
          disabled={searching || (finderColors.length === 0 && !finderPlaystyle)}
          className="w-full md:w-auto"
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

        {/* Results */}
        {finderResults.length > 0 && (
          <div className="pt-4 border-t border-border/50">
            <h5 className="font-medium mb-4 text-sm text-muted-foreground">
              Found {finderResults.length} matching commanders
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <p className="text-white text-sm font-bold truncate">{card.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
