import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Heart, Plus, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';

interface FavoriteDeck {
  deck_id: string;
  user_decks: {
    id: string;
    name: string;
    format: string;
    colors: string[];
    power_level: number;
    updated_at: string;
  };
}

export function FavoriteDecksPreview() {
  const [favoriteDecks, setFavoriteDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadFavoriteDecks();
  }, []);

  const loadFavoriteDecks = async () => {
    try {
      // Load both database and local favorite decks
      const allSummaries = await DeckAPI.getDeckSummaries();
      const favorites = allSummaries.filter(deck => deck.favorite).slice(0, 4);
      setFavoriteDecks(favorites);
    } catch (error) {
      console.error('Error loading favorite decks:', error);
    } finally {
      setLoading(false);
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
        {colors.slice(0, 3).map((color, index) => (
          <div 
            key={index}
            className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Favorite Decks</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (favoriteDecks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Heart className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="font-medium mb-2">No Favorite Decks</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add some decks to your favorites to see them here
          </p>
          <Button variant="outline" onClick={() => navigate('/decks')}>
            <Plus className="h-4 w-4 mr-2" />
            Browse Decks
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Favorite Decks</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/decks')}>
          View All
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {favoriteDecks.map((deck) => {
          return (
            <Card 
              key={deck.id} 
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => {
                if (deck.name.includes('(Local)')) {
                  navigate('/decks');
                } else {
                  navigate(`/decks/${deck.id}`);
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate text-sm">{deck.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {deck.format}
                      </Badge>
                      {deck.format === 'commander' && (
                        <Crown className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                  </div>
                  <Heart className="h-4 w-4 text-red-500 fill-current" />
                </div>
                
                <div className="flex items-center justify-between">
                  {deck.colors.length > 0 && getColorIndicator(deck.colors)}
                  <div className="text-xs text-muted-foreground">
                    Power {deck.power.score}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}