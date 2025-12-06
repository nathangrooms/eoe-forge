import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Crown, Target, Sparkles, Search, Loader2 } from 'lucide-react';
import { ManaSymbols } from '@/components/ui/mana-symbols';

interface Commander {
  id: string;
  name: string;
  type_line: string;
  oracle_text?: string;
  color_identity: string[];
  colors?: string[];
  cmc: number;
  image_uris?: {
    normal?: string;
    art_crop?: string;
  };
  prices?: {
    usd?: string;
  };
}

interface EnhancedCommanderStepProps {
  commander: Commander | null;
  onCommanderSelect: (commander: Commander) => void;
  onAnalyzeCommander: (commander: Commander) => void;
  analyzingCommander: boolean;
}

const POPULAR_COMMANDERS: Commander[] = [
  { 
    id: 'atraxa',
    name: 'Atraxa, Praetors\' Voice',
    color_identity: ['W', 'U', 'B', 'G'],
    type_line: 'Legendary Creature — Phyrexian Angel Horror',
    cmc: 4,
    oracle_text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg' }
  },
  { 
    id: 'edgar',
    name: 'Edgar Markov', 
    color_identity: ['W', 'B', 'R'],
    type_line: 'Legendary Creature — Vampire Knight',
    cmc: 6,
    oracle_text: 'Eminence — Whenever you cast a Vampire spell, create a 1/1 black Vampire token.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/8/d/8d94b8ec-ecda-43c8-a60e-1ba33e6a54a4.jpg' }
  },
  { 
    id: 'korvold',
    name: 'Korvold, Fae-Cursed King', 
    color_identity: ['B', 'R', 'G'],
    type_line: 'Legendary Creature — Dragon Noble',
    cmc: 5,
    oracle_text: 'Flying\nWhenever Korvold attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/9/2/92ea1575-eb64-43b5-b604-c6e23054f228.jpg' }
  },
  { 
    id: 'yuriko',
    name: 'Yuriko, the Tiger\'s Shadow', 
    color_identity: ['U', 'B'],
    type_line: 'Legendary Creature — Human Ninja',
    cmc: 2,
    oracle_text: 'Commander ninjutsu {U}{B}\nWhenever a Ninja deals combat damage to a player, reveal the top card of your library.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/3/b/3bd81ae6-e628-447a-a36b-597e63ede295.jpg' }
  },
  { 
    id: 'meren',
    name: 'Meren of Clan Nel Toth', 
    color_identity: ['B', 'G'],
    type_line: 'Legendary Creature — Human Shaman',
    cmc: 4,
    oracle_text: 'Whenever another creature you control dies, you get an experience counter.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/1/7/17d6703c-ad79-457b-a1b5-c2284e363085.jpg' }
  },
  { 
    id: 'ur-dragon',
    name: 'The Ur-Dragon', 
    color_identity: ['W', 'U', 'B', 'R', 'G'],
    type_line: 'Legendary Creature — Dragon Avatar',
    cmc: 9,
    oracle_text: 'Eminence — Dragon spells cost {1} less.\nWhenever Dragons attack, draw that many cards.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/7/e/7e78b70b-0c67-4f14-8ad7-c9f8e3f59743.jpg' }
  }
];

export function EnhancedCommanderStep({
  commander,
  onCommanderSelect,
  onAnalyzeCommander,
  analyzingCommander
}: EnhancedCommanderStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Commander[]>([]);
  const [searching, setSearching] = useState(false);
  const [finderColors, setFinderColors] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchCommanders(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchCommanders = async (query: string) => {
    setSearching(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' type:legendary type:creature is:commander')}&unique=cards&order=edhrec`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults((data.data || []).slice(0, 12));
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCommanderClick = async (cmd: Commander) => {
    // Fetch full card data from Scryfall
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}`
      );
      if (response.ok) {
        const fullCard = await response.json();
        onCommanderSelect(fullCard);
        onAnalyzeCommander(fullCard);
      } else {
        onCommanderSelect(cmd);
        onAnalyzeCommander(cmd);
      }
    } catch (error) {
      onCommanderSelect(cmd);
      onAnalyzeCommander(cmd);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const toggleFinderColor = (color: string) => {
    setFinderColors(prev => 
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  };

  if (commander) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5 overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500">
              <Crown className="h-5 w-5 text-white" />
            </div>
            Your Commander
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex gap-6">
            <div className="relative w-48 flex-shrink-0">
              <img 
                src={commander.image_uris?.normal || '/placeholder.svg'} 
                alt={commander.name}
                className="w-full rounded-xl shadow-xl border-2 border-primary/30"
              />
              {analyzingCommander && (
                <div className="absolute inset-0 bg-background/80 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
                    <span className="text-sm text-primary font-medium">Analyzing...</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-2xl font-bold">{commander.name}</h3>
                <p className="text-muted-foreground">{commander.type_line}</p>
              </div>
              
              <div className="flex items-center gap-2">
                <ManaSymbols colors={commander.color_identity || []} size="md" />
                <Badge variant="secondary">CMC {commander.cmc}</Badge>
              </div>
              
              {commander.oracle_text && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  {commander.oracle_text}
                </div>
              )}
              
              <Button 
                variant="outline" 
                onClick={() => onCommanderSelect(null as any)}
                className="mt-4"
              >
                Change Commander
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500">
            <Crown className="h-5 w-5 text-white" />
          </div>
          Choose Your Commander
          <Badge variant="secondary" className="ml-2">Step 1</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-8">
        {/* Search Section */}
        <div className="space-y-4">
          <Label className="text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search for a Commander
          </Label>
          <div className="relative">
            <Input
              placeholder="Search for a legendary creature..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 text-lg pr-12"
            />
            {searching && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
            )}
          </div>
          
          {searchResults.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-2">
              {searchResults.map((card) => (
                <div
                  key={card.id}
                  className="group cursor-pointer"
                  onClick={() => handleCommanderClick(card)}
                >
                  <div className="relative rounded-xl overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-xl group-hover:shadow-primary/30 transition-all duration-300 transform group-hover:scale-[1.02]">
                    <img 
                      src={card.image_uris?.normal || '/placeholder.svg'} 
                      alt={card.name}
                      className="w-full aspect-[488/680] object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <p className="text-white text-sm font-bold truncate">{card.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Popular Commanders */}
        <div className="space-y-4">
          <Label className="text-lg font-semibold flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Popular Commanders
          </Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {POPULAR_COMMANDERS.map((cmd) => (
              <div
                key={cmd.id}
                className="group cursor-pointer"
                onClick={() => handleCommanderClick(cmd)}
              >
                <div className="relative rounded-xl overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/30 transition-all duration-300 transform group-hover:scale-[1.03]">
                  <img 
                    src={cmd.image_uris?.normal || '/placeholder.svg'} 
                    alt={cmd.name}
                    className="w-full aspect-[488/680] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-white text-xs font-bold truncate">{cmd.name}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commander Finder */}
        <div className="p-6 border-2 border-dashed border-primary/30 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5">
          <Label className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-accent" />
            Not sure? Filter by colors
          </Label>
          
          <div className="flex flex-wrap gap-2">
            {[
              { color: 'W', name: 'White', bg: 'hsl(var(--mana-white))', text: '#000' },
              { color: 'U', name: 'Blue', bg: 'hsl(var(--mana-blue))', text: '#fff' },
              { color: 'B', name: 'Black', bg: 'hsl(var(--mana-black))', text: '#fff' },
              { color: 'R', name: 'Red', bg: 'hsl(var(--mana-red))', text: '#fff' },
              { color: 'G', name: 'Green', bg: 'hsl(var(--mana-green))', text: '#fff' }
            ].map(({ color, name, bg, text }) => (
              <Button
                key={color}
                variant={finderColors.includes(color) ? 'default' : 'outline'}
                size="lg"
                onClick={() => toggleFinderColor(color)}
                className="transition-all"
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
      </CardContent>
    </Card>
  );
}
