import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Sparkles, TrendingUp, CheckCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DeckRecommendation {
  id: string;
  name: string;
  format: string;
  colors: string[];
  powerLevel: number;
  totalCards: number;
  ownedCards: number;
  missingCards: number;
  ownershipPercent: number;
  estimatedCost: number;
}

interface CollectionDeckRecommendationsProps {
  collectionCards: any[];
}

export function CollectionDeckRecommendations({ collectionCards }: CollectionDeckRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<DeckRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadRecommendations();
  }, [collectionCards]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all user's decks
      const { data: decks, error: decksError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, power_level')
        .eq('user_id', user.id);

      if (decksError) throw decksError;
      if (!decks || decks.length === 0) {
        setRecommendations([]);
        return;
      }

      // Build a map of owned cards for quick lookup
      const ownedCardIds = new Set(collectionCards.map(c => c.card_id));

      // Analyze each deck
      const analyzed: DeckRecommendation[] = [];

      for (const deck of decks) {
        // Get deck cards
        const { data: deckCards, error: cardsError } = await supabase
          .from('deck_cards')
          .select('card_id, card_name, quantity')
          .eq('deck_id', deck.id);

        if (cardsError || !deckCards) continue;

        // Calculate ownership
        let ownedCount = 0;
        let totalCount = 0;
        let missingValue = 0;

        for (const card of deckCards) {
          totalCount += card.quantity;
          if (ownedCardIds.has(card.card_id)) {
            ownedCount += card.quantity;
          } else {
            // Try to get price for missing card
            const { data: cardData } = await supabase
              .from('cards')
              .select('prices')
              .eq('id', card.card_id)
              .single();

            if (cardData?.prices) {
              const price = parseFloat((cardData.prices as any).usd || '0');
              missingValue += price * card.quantity;
            }
          }
        }

        const ownershipPercent = totalCount > 0 ? (ownedCount / totalCount) * 100 : 0;

        // Only recommend decks that are partially complete (between 30% and 95%)
        if (ownershipPercent >= 30 && ownershipPercent < 95) {
          analyzed.push({
            id: deck.id,
            name: deck.name,
            format: deck.format,
            colors: deck.colors || [],
            powerLevel: deck.power_level || 5,
            totalCards: totalCount,
            ownedCards: ownedCount,
            missingCards: totalCount - ownedCount,
            ownershipPercent,
            estimatedCost: missingValue,
          });
        }
      }

      // Sort by ownership percentage (prioritize decks closest to completion)
      analyzed.sort((a, b) => b.ownershipPercent - a.ownershipPercent);

      setRecommendations(analyzed.slice(0, 5));
    } catch (error: any) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDeck = (deckId: string) => {
    navigate(`/deck-builder?deck=${deckId}`);
  };

  const getOwnershipColor = (percent: number) => {
    if (percent >= 80) return 'text-emerald-500';
    if (percent >= 60) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getOwnershipLabel = (percent: number) => {
    if (percent >= 80) return 'Almost Complete';
    if (percent >= 60) return 'Mostly Complete';
    return 'Needs Cards';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Deck Recommendations
        </CardTitle>
        <CardDescription>
          Decks you can build with your collection
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Analyzing your collection...
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">No deck recommendations available.</p>
            <p className="text-sm">Create some decks to see what you can build!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.id} className="p-4 rounded-lg border bg-card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{rec.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {rec.format}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {rec.colors.length > 0 && (
                        <div className="flex gap-0.5">
                          {rec.colors.map((color) => (
                            <div
                              key={color}
                              className="w-4 h-4 rounded-full border"
                              style={{
                                backgroundColor:
                                  color === 'W' ? '#f0e68c' :
                                  color === 'U' ? '#0e68ab' :
                                  color === 'B' ? '#150b00' :
                                  color === 'R' ? '#d32029' :
                                  color === 'G' ? '#00733e' :
                                  '#ccc'
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <span>•</span>
                      <span>Power {rec.powerLevel}/10</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewDeck(rec.id)}
                  >
                    View
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className={`h-4 w-4 ${getOwnershipColor(rec.ownershipPercent)}`} />
                      <span className="font-medium">
                        {rec.ownedCards} / {rec.totalCards} cards owned
                      </span>
                    </div>
                    <Badge className={getOwnershipColor(rec.ownershipPercent)}>
                      {rec.ownershipPercent.toFixed(0)}%
                    </Badge>
                  </div>
                  <Progress value={rec.ownershipPercent} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    {getOwnershipLabel(rec.ownershipPercent)} • {rec.missingCards} cards needed
                    {rec.estimatedCost > 0 && ` • ~$${rec.estimatedCost.toFixed(2)} to complete`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
