import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Search, 
  Package, 
  Crown, 
  ChevronRight, 
  Loader2, 
  Save,
  Calendar,
  Layers
} from 'lucide-react';

interface PreconListItem {
  id: string;
  name: string;
  set: string;
  filename: string;
}

interface PreconCard {
  quantity: number;
  card_name: string;
  scryfall_id: string;
  is_commander: boolean;
}

interface PreconDeck {
  name: string;
  set: string;
  format: string;
  cards: PreconCard[];
  totalCards: number;
}

export default function Precons() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [precons, setPrecons] = useState<PreconListItem[]>([]);
  const [bySet, setBySet] = useState<Record<string, PreconListItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [selectedPrecon, setSelectedPrecon] = useState<PreconListItem | null>(null);
  const [preconDetails, setPreconDetails] = useState<PreconDeck | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);

  // Fetch precon list on mount
  useEffect(() => {
    fetchPreconList();
  }, []);

  const fetchPreconList = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-precons', {
        body: null,
      });

      // The function uses GET params, so we need to call it differently
      const response = await fetch(
        `https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/fetch-precons?action=list`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch precons');
      
      const result = await response.json();
      setPrecons(result.precons || []);
      setBySet(result.bySet || {});
    } catch (error) {
      console.error('Error fetching precons:', error);
      toast.error('Failed to load precon decks');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreconDetails = async (precon: PreconListItem) => {
    setLoadingDetails(true);
    setSelectedPrecon(precon);
    setPreconDetails(null);
    
    try {
      const response = await fetch(
        `https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/fetch-precons?action=get&deck=${encodeURIComponent(precon.id)}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch precon details');
      
      const result = await response.json();
      setPreconDetails(result);
    } catch (error) {
      console.error('Error fetching precon details:', error);
      toast.error('Failed to load deck details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const savePreconToDeck = async () => {
    if (!preconDetails || !user) return;
    
    setSavingDeck(true);
    try {
      // Create the deck
      const { data: deck, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: `${preconDetails.name} (Precon)`,
          format: 'commander',
          colors: [],
          power_level: 5,
          description: `Official precon deck from ${preconDetails.set}`
        })
        .select()
        .single();

      if (deckError) throw deckError;

      // Find commander(s)
      const commanders = preconDetails.cards.filter(c => c.is_commander);
      const mainboardCards = preconDetails.cards.filter(c => !c.is_commander);

      // Insert cards - we need to look up card IDs from our cards table
      const cardInserts = [];
      
      for (const card of preconDetails.cards) {
        // Try to find the card in our database by scryfall_id or name
        let cardId = card.scryfall_id;
        
        if (!cardId) {
          // Look up by name
          const { data: foundCard } = await supabase
            .from('cards')
            .select('id')
            .ilike('name', card.card_name)
            .limit(1)
            .single();
          
          if (foundCard) {
            cardId = foundCard.id;
          }
        }

        if (cardId) {
          cardInserts.push({
            deck_id: deck.id,
            card_id: cardId,
            card_name: card.card_name,
            quantity: card.quantity,
            is_commander: card.is_commander,
            is_sideboard: false
          });
        }
      }

      if (cardInserts.length > 0) {
        const { error: cardsError } = await supabase
          .from('deck_cards')
          .insert(cardInserts);

        if (cardsError) {
          console.error('Error inserting cards:', cardsError);
        }
      }

      toast.success(`Saved "${preconDetails.name}" to your decks!`);
      navigate(`/deck-builder?deck=${deck.id}`);
    } catch (error) {
      console.error('Error saving precon:', error);
      toast.error('Failed to save deck');
    } finally {
      setSavingDeck(false);
    }
  };

  // Filter precons based on search
  const filteredSets = useMemo(() => {
    if (!searchQuery) return bySet;
    
    const query = searchQuery.toLowerCase();
    const filtered: Record<string, PreconListItem[]> = {};
    
    for (const [set, decks] of Object.entries(bySet)) {
      const matchingDecks = decks.filter(
        d => d.name.toLowerCase().includes(query) || 
             d.set.toLowerCase().includes(query)
      );
      if (matchingDecks.length > 0) {
        filtered[set] = matchingDecks;
      }
    }
    
    return filtered;
  }, [bySet, searchQuery]);

  const sortedSets = useMemo(() => {
    return Object.keys(filteredSets).sort((a, b) => {
      // Sort by year if present in set name
      const yearA = a.match(/\d{4}/)?.[0] || '0';
      const yearB = b.match(/\d{4}/)?.[0] || '0';
      return yearB.localeCompare(yearA) || a.localeCompare(b);
    });
  }, [filteredSets]);

  return (
    <div className="w-full px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Precon Decks</h1>
            <p className="text-sm text-muted-foreground">
              Browse and save official Commander preconstructed decks
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Layers className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{precons.length}</p>
                <p className="text-xs text-muted-foreground">Total Precons</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{Object.keys(bySet).length}</p>
                <p className="text-xs text-muted-foreground">Sets</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 hidden md:block">
            <CardContent className="p-4 flex items-center gap-3">
              <Crown className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">Commander</p>
                <p className="text-xs text-muted-foreground">Format</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search precon decks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 text-base"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Precon List */}
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Available Precons</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {sortedSets.map((setName) => (
                    <div key={setName} className="space-y-2">
                      <button
                        onClick={() => setSelectedSet(selectedSet === setName ? null : setName)}
                        className="flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {filteredSets[setName].length}
                          </Badge>
                          <span className="font-medium text-sm">{setName}</span>
                        </div>
                        <ChevronRight className={`h-4 w-4 transition-transform ${selectedSet === setName ? 'rotate-90' : ''}`} />
                      </button>
                      
                      {selectedSet === setName && (
                        <div className="ml-4 space-y-1">
                          {filteredSets[setName].map((precon) => (
                            <button
                              key={precon.id}
                              onClick={() => fetchPreconDetails(precon)}
                              className={`w-full text-left p-3 rounded-lg transition-colors ${
                                selectedPrecon?.id === precon.id 
                                  ? 'bg-primary/10 border border-primary/30' 
                                  : 'hover:bg-accent'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <span className="text-sm font-medium truncate">{precon.name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Precon Details */}
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Deck Details</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {loadingDetails ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="pt-4 space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              </div>
            ) : preconDetails ? (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{preconDetails.name}</h3>
                      <p className="text-sm text-muted-foreground">{preconDetails.set}</p>
                    </div>
                    <Badge>{preconDetails.totalCards} cards</Badge>
                  </div>
                  
                  <Button 
                    onClick={savePreconToDeck}
                    disabled={savingDeck}
                    className="w-full"
                  >
                    {savingDeck ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save to My Decks
                  </Button>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Commanders */}
                    {preconDetails.cards.filter(c => c.is_commander).length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2 flex items-center gap-2">
                          <Crown className="h-4 w-4 text-amber-500" />
                          Commander
                        </h4>
                        <div className="space-y-1">
                          {preconDetails.cards.filter(c => c.is_commander).map((card, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-primary/5">
                              <span className="text-muted-foreground w-6">{card.quantity}x</span>
                              <span className="font-medium">{card.card_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Main Deck */}
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                        Main Deck ({preconDetails.cards.filter(c => !c.is_commander).reduce((s, c) => s + c.quantity, 0)} cards)
                      </h4>
                      <div className="space-y-1 max-h-[300px]">
                        {preconDetails.cards.filter(c => !c.is_commander).map((card, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border/50">
                            <span className="text-muted-foreground w-6">{card.quantity}x</span>
                            <span>{card.card_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Select a precon deck to view its details
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
