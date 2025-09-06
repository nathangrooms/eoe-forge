import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Search, X, Star, TrendingUp } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { showSuccess } from '@/components/ui/toast-helpers';

interface CommanderSelectorProps {
  currentCommander?: any;
}

const POPULAR_COMMANDERS = [
  { name: 'Atraxa, Praetors\' Voice', colors: ['W', 'U', 'B', 'G'], popularity: 95 },
  { name: 'Edgar Markov', colors: ['W', 'B', 'R'], popularity: 88 },
  { name: 'The Ur-Dragon', colors: ['W', 'U', 'B', 'R', 'G'], popularity: 85 },
  { name: 'Korvold, Fae-Cursed King', colors: ['B', 'R', 'G'], popularity: 82 },
  { name: 'Muldrotha, the Gravetide', colors: ['B', 'G', 'U'], popularity: 80 },
  { name: 'Aesi, Tyrant of Gyre Strait', colors: ['U', 'G'], popularity: 78 },
  { name: 'Kaalia of the Vast', colors: ['W', 'B', 'R'], popularity: 76 },
  { name: 'Yuriko, the Tiger\'s Shadow', colors: ['U', 'B'], popularity: 74 },
];

export function CommanderSelector({ currentCommander }: CommanderSelectorProps) {
  const { setCommander } = useDeckStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      // First try fuzzy search for the exact name
      const fuzzyResponse = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(query)}`
      );
      
      if (fuzzyResponse.ok) {
        const fuzzyCard = await fuzzyResponse.json();
        // Check if it's a legendary creature
        if (fuzzyCard.type_line?.toLowerCase().includes('legendary') && 
            fuzzyCard.type_line?.toLowerCase().includes('creature')) {
          setSearchResults([fuzzyCard]);
          return;
        }
      }

      // Fallback to search with legendary creature filter
      const searchString = `t:legendary t:creature ${query}`;
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchString)}&order=edhrec`
      );
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching commanders:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery) {
        searchCommanders(searchQuery);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleCommanderSelect = async (card: any) => {
    const commanderCard = {
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.color_identity || card.colors || [],
      mana_cost: card.mana_cost,
      quantity: 1,
      category: 'commanders' as const,
      mechanics: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices
    };

    setCommander(commanderCard);
    
    // Also save the commander to the database immediately
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Get current deck ID from URL or state
        const urlParams = new URLSearchParams(window.location.search);
        const deckId = urlParams.get('deck');
        
        if (deckId) {
          console.log('Saving commander to deck:', deckId, card.name);
          
          // Remove existing commander first
          await supabase
            .from('deck_cards')
            .delete()
            .eq('deck_id', deckId)
            .eq('is_commander', true);
          
          // Add new commander
          const { error } = await supabase
            .from('deck_cards')
            .insert({
              deck_id: deckId,
              card_id: card.id,
              card_name: card.name,
              quantity: 1,
              is_commander: true,
              is_sideboard: false
            });
            
          if (error) {
            console.error('Error saving commander:', error);
          } else {
            console.log('Commander saved successfully');
          }
        }
      }
    } catch (error) {
      console.error('Error in handleCommanderSelect:', error);
    }
    
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    showSuccess('Commander Set', `${card.name} is now your commander!`);
  };

  const searchPopularCommander = async (commanderName: string) => {
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(commanderName)}`
      );
      
      if (response.ok) {
        const card = await response.json();
        handleCommanderSelect(card);
      }
    } catch (error) {
      console.error('Error fetching popular commander:', error);
    }
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      U: 'bg-blue-100 text-blue-800 border-blue-300',
      B: 'bg-gray-100 text-gray-800 border-gray-300',
      R: 'bg-red-100 text-red-800 border-red-300',
      G: 'bg-green-100 text-green-800 border-green-300'
    };
    
    return (
      <div className="flex gap-1">
        {colors.map(color => (
          <div 
            key={color}
            className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Current Commander Display */}
      {currentCommander ? (
        <Card className="relative overflow-hidden bg-muted/30 border-primary/30">
          <div className="absolute top-4 right-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCommander(undefined as any)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              {currentCommander.image_uris?.normal && (
                <div className="relative">
                  <img 
                    src={currentCommander.image_uris.normal} 
                    alt={currentCommander.name}
                    className="w-32 h-auto rounded-lg shadow-lg border-2 border-primary/30"
                  />
                  <div className="absolute -top-3 -right-3 bg-primary rounded-full p-2 shadow-lg">
                    <Crown className="h-5 w-5 text-primary-foreground" />
                  </div>
                </div>
              )}
              
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-bold text-2xl mb-1">
                    {currentCommander.name}
                  </h3>
                  <p className="text-lg text-muted-foreground">{currentCommander.type_line}</p>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap">
                  {currentCommander.mana_cost && (
                    <Badge variant="outline" className="font-mono text-sm">
                      {currentCommander.mana_cost}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    CMC {currentCommander.cmc}
                  </Badge>
                  {currentCommander.colors.length > 0 && getColorIndicator(currentCommander.colors)}
                </div>
                
                <div className="flex items-center justify-between">
                  {currentCommander.prices?.usd && (
                    <p className="text-lg font-semibold text-green-600">
                      ${currentCommander.prices.usd}
                    </p>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => setShowSearch(true)}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Change Commander
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-2 border-primary/30 bg-muted/30">
          <CardContent className="p-8 text-center">
            <Crown className="h-16 w-16 mx-auto mb-4 text-primary" />
            <h3 className="text-xl font-bold mb-2">Choose Your Commander</h3>
            <p className="text-muted-foreground mb-6">
              Select a legendary creature to lead your deck into battle
            </p>
            <Button 
              onClick={() => setShowSearch(true)}
              size="lg"
            >
              <Crown className="h-5 w-5 mr-2" />
              Find Your Commander
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Popular Commanders */}
      {!showSearch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              Popular Commanders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {POPULAR_COMMANDERS.map((commander, index) => (
                <button
                  key={commander.name}
                  onClick={() => searchPopularCommander(commander.name)}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent hover:border-primary transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">#{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium">{commander.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getColorIndicator(commander.colors)}
                        <span className="text-xs text-muted-foreground">
                          {commander.popularity}% popularity
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commander Search */}
      {showSearch && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Commanders
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for legendary creatures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {loading && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-muted-foreground">Searching commanders...</p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {searchResults.slice(0, 12).map((card) => (
                  <button
                    key={card.id}
                    onClick={() => handleCommanderSelect(card)}
                    className="group bg-card border rounded-lg p-3 hover:border-primary hover:shadow-md transition-all text-left"
                  >
                    <div className="flex gap-3">
                      {card.image_uris?.small && (
                        <img 
                          src={card.image_uris.small} 
                          alt={card.name}
                          className="w-16 h-auto rounded border group-hover:shadow-sm"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm group-hover:text-primary truncate">
                          {card.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {card.type_line}
                        </p>
                        <div className="flex items-center gap-2">
                          {card.mana_cost && (
                            <Badge variant="outline" className="text-xs font-mono">
                              {card.cmc}
                            </Badge>
                          )}
                          {card.color_identity && getColorIndicator(card.color_identity)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery && !loading && searchResults.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No commanders found matching "{searchQuery}"</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try searching for legendary creatures like "Atraxa" or "Edgar Markov"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}