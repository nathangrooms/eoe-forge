import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { deckPowerFromStored, type DeckPower } from '@/lib/deck/power';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, CheckCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Which of your decks you could nearly finish from the cards you already own.
 *
 * ## It used to ask the database once per card
 *
 * The previous version looped over every deck, then over every card in that
 * deck, and inside that inner loop ran
 * `from('cards').select('prices').eq('id', …).single()` for each card it did not
 * find in the collection. A ten deck account with hundred card decks meant a
 * thousand round trips, fired from an analytics panel that loads on tab open.
 *
 * That is the exact pattern behind the two outages and the disk IO warning
 * recorded in CLAUDE.md, and it was sitting on the collection page. It is three
 * queries now, whatever the account holds: the decks, every deck's cards in one
 * `in` filter, and one `cards` read for the distinct missing ids. The
 * arithmetic that follows is identical, so the numbers on screen do not change.
 */

interface DeckRecommendation {
  id: string;
  name: string;
  format: string;
  colors: string[];
  power: DeckPower | null;
  totalCards: number;
  ownedCards: number;
  missingCards: number;
  ownershipPercent: number;
  estimatedCost: number;
  /** Missing copies the catalogue holds no USD price for, so the cost is a floor. */
  unpricedMissing: number;
}

interface CollectionDeckRecommendationsProps {
  collectionCards: any[];
}

export function CollectionDeckRecommendations({ collectionCards }: CollectionDeckRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<DeckRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRecommendations([]);
        return;
      }

      /* Query 1 of 3: the decks. */
      const { data: decks, error: decksError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, edh_analysis')
        .eq('user_id', user.id);

      if (decksError) throw decksError;
      if (!decks || decks.length === 0) {
        setRecommendations([]);
        return;
      }

      /* Query 2 of 3: every card of every deck, in one read. This was a query
         per deck. */
      const { data: deckCards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('deck_id, card_id, quantity')
        .in('deck_id', decks.map(d => d.id));

      if (cardsError) throw cardsError;

      const ownedCardIds = new Set(collectionCards.map(c => c.card_id));

      const byDeck = new Map<string, { card_id: string; quantity: number }[]>();
      const missingIds = new Set<string>();
      for (const row of deckCards ?? []) {
        if (!byDeck.has(row.deck_id)) byDeck.set(row.deck_id, []);
        byDeck.get(row.deck_id)!.push({ card_id: row.card_id, quantity: row.quantity });
        if (row.card_id && !ownedCardIds.has(row.card_id)) missingIds.add(row.card_id);
      }

      /* Query 3 of 3: the price of every card missing from any deck, once each.
         The distinct set matters: the same staple is missing from several decks
         and the old loop fetched it once per deck per copy. */
      const prices = new Map<string, number>();
      if (missingIds.size > 0) {
        const { data: priced, error: priceError } = await supabase
          .from('cards')
          .select('id, prices')
          .in('id', [...missingIds]);

        if (priceError) throw priceError;
        for (const row of priced ?? []) {
          /* A missing price stays missing. `parseFloat(x || '0')` is how a card
             with no USD quote comes to be counted as free, and this figure is
             what somebody budgets against. */
          const raw = (row.prices as { usd?: string | null } | null)?.usd;
          const value = raw == null || raw === '' ? NaN : Number(raw);
          if (Number.isFinite(value)) prices.set(row.id, value);
        }
      }

      const analyzed: DeckRecommendation[] = [];

      for (const deck of decks) {
        let ownedCount = 0;
        let totalCount = 0;
        let missingValue = 0;
        let unpricedMissing = 0;

        for (const card of byDeck.get(deck.id) ?? []) {
          totalCount += card.quantity;
          if (ownedCardIds.has(card.card_id)) {
            ownedCount += card.quantity;
          } else {
            const price = prices.get(card.card_id);
            if (price === undefined) unpricedMissing += card.quantity;
            else missingValue += price * card.quantity;
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
            // The canonical score, or null. This used to read
            // `deck.power_level || 5`, so every recommendation claimed
            // "Power 5/10" whatever the deck actually was.
            power: deckPowerFromStored(
              (deck.edh_analysis as { deckmatrix?: unknown } | null)?.deckmatrix,
              null
            ),
            totalCards: totalCount,
            ownedCards: ownedCount,
            missingCards: totalCount - ownedCount,
            ownershipPercent,
            estimatedCost: missingValue,
            unpricedMissing,
          });
        }
      }

      // Sort by ownership percentage (prioritize decks closest to completion)
      analyzed.sort((a, b) => b.ownershipPercent - a.ownershipPercent);

      setRecommendations(analyzed.slice(0, 5));
    } catch (error: unknown) {
      console.error('Failed to load deck recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [collectionCards]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleViewDeck = (deckId: string) => {
    navigate(`/deck/${deckId}`);
  };

  const getOwnershipColor = (percent: number) => {
    // Completion is a neutral metric, not a semantic signal — the palette is
    // reserved for MTG meaning.
    if (percent >= 80) return 'text-foreground';
    if (percent >= 60) return 'text-foreground/80';
    return 'text-muted-foreground';
  };

  const getOwnershipLabel = (percent: number) => {
    if (percent >= 80) return 'Almost Complete';
    if (percent >= 60) return 'Mostly Complete';
    return 'Needs Cards';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Nearly there
        </CardTitle>
        <CardDescription>
          Decks you own most of already. Between 30% and 95% complete.
        </CardDescription>
      </CardHeader>
      {/* One reserved box, whatever state this is in. The panel used to be 210px
          while it worked and 238px once it gave up, which moved everything below
          it down by 28px after the page looked finished. The list scrolls
          inside the box instead of resizing it. */}
      <CardContent className="h-[236px] overflow-y-auto">
        {loading ? (
          <div className="flex h-full flex-col justify-center gap-3" aria-hidden="true">
            {[0, 1].map(i => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <p className="text-sm">Nothing to suggest yet.</p>
            <p className="mt-1 text-sm">
              Build a deck and this shows how close you are to finishing it from cards you own.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.id} className="p-4 rounded-lg bg-card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{rec.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {rec.format}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {rec.colors.length > 0 && (
                        <ColorIdentity colors={rec.colors} size="xs" />
                      )}
                      {rec.power && (
                        <>
                          <span>•</span>
                          <PowerScoreBadge power={rec.power} />
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
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
                    {rec.estimatedCost > 0 &&
                      /* "at least" when some of the missing cards have no price
                         we can read. The figure is a floor then, and somebody
                         budgets against it. */
                      ` • ${rec.unpricedMissing > 0 ? 'at least ' : ''}$${rec.estimatedCost.toFixed(2)} to finish`}
                    {rec.estimatedCost === 0 && rec.unpricedMissing > 0 && ' • no prices yet for what is missing'}
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
