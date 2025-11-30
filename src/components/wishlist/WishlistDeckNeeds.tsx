import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ExternalLink, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Link } from 'react-router-dom';

interface WishlistCard {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  category: string | null;
}

interface DeckNeed {
  deckId: string;
  deckName: string;
  deckFormat: string;
  missingCards: {
    cardName: string;
    cardId: string;
    neededQty: number;
    wishlistQty: number;
  }[];
}

export function WishlistDeckNeeds() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deckNeeds, setDeckNeeds] = useState<DeckNeed[]>([]);

  useEffect(() => {
    if (!user) return;
    loadDeckNeeds();
  }, [user]);

  const loadDeckNeeds = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Get user's wishlist
      const { data: wishlistData, error: wishlistError } = await supabase
        .from('wishlist')
        .select('*')
        .eq('user_id', user.id);

      if (wishlistError) throw wishlistError;
      if (!wishlistData || wishlistData.length === 0) {
        setDeckNeeds([]);
        return;
      }

      // Get user's decks
      const { data: decksData, error: decksError } = await supabase
        .from('user_decks')
        .select('id, name, format')
        .eq('user_id', user.id);

      if (decksError) throw decksError;
      if (!decksData || decksData.length === 0) {
        setDeckNeeds([]);
        return;
      }

      // For each deck, check which wishlist cards are needed
      const needs: DeckNeed[] = [];
      
      for (const deckInfo of decksData) {
        const { data: deckCards } = await supabase
          .from('deck_cards')
          .select('card_name, quantity')
          .eq('deck_id', deckInfo.id)
          .eq('is_sideboard', false);

        if (!deckCards) continue;

        // Get user's collection
        const { data: collectionCards } = await supabase
          .from('user_collections')
          .select('card_name, quantity')
          .eq('user_id', user.id);

        const collectionMap = new Map<string, number>();
        collectionCards?.forEach(c => {
          collectionMap.set(c.card_name.toLowerCase(), (collectionMap.get(c.card_name.toLowerCase()) || 0) + c.quantity);
        });

        const missingCards: DeckNeed['missingCards'] = [];

        for (const deckCard of deckCards) {
          const owned = collectionMap.get(deckCard.card_name.toLowerCase()) || 0;
          const needed = Math.max(0, deckCard.quantity - owned);

          if (needed > 0) {
            // Check if it's on wishlist
            const wishlistItem = wishlistData.find(
              w => w.card_name.toLowerCase() === deckCard.card_name.toLowerCase()
            );

            if (wishlistItem) {
              missingCards.push({
                cardName: deckCard.card_name,
                cardId: wishlistItem.card_id,
                neededQty: needed,
                wishlistQty: wishlistItem.quantity,
              });
            }
          }
        }

        if (missingCards.length > 0) {
          needs.push({
            deckId: deckInfo.id,
            deckName: deckInfo.name,
            deckFormat: deckInfo.format,
            missingCards,
          });
        }
      }

      setDeckNeeds(needs);
    } catch (error) {
      console.error('Error loading deck needs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (deckNeeds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Wishlist Cards Needed for Decks
          </CardTitle>
          <CardDescription>
            Track which wishlist cards you need to complete your decks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-medium mb-2">All Set!</h3>
            <p className="text-sm text-muted-foreground">
              No wishlist cards are needed for your current decks
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Wishlist Cards Needed for Decks
        </CardTitle>
        <CardDescription>
          {deckNeeds.reduce((sum, d) => sum + d.missingCards.length, 0)} wishlist cards needed across {deckNeeds.length} deck{deckNeeds.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {deckNeeds.map((deckNeed) => (
          <div key={deckNeed.deckId} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{deckNeed.deckName}</h4>
                <Badge variant="outline" className="text-xs">
                  {deckNeed.deckFormat}
                </Badge>
              </div>
              <Link to={`/deck-builder?deck=${deckNeed.deckId}`}>
                <Button size="sm" variant="ghost">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            
            <div className="space-y-2">
              {deckNeed.missingCards.map((card, idx) => (
                <div 
                  key={`${card.cardId}-${idx}`}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                >
                  <span className="truncate flex-1">{card.cardName}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Need {card.neededQty}
                    </Badge>
                    {card.wishlistQty > card.neededQty && (
                      <AlertCircle className="h-4 w-4 text-warning" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}