import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, ShoppingCart, ChevronRight, Heart, Plus } from 'lucide-react';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { formatPrice } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';

/** One card a deck still needs after subtracting what the user owns. */
export interface DeckGapCard {
  cardId: string;
  name: string;
  /** Copies the deck list calls for. */
  required: number;
  /** Copies currently in the collection. */
  owned: number;
  /** required - owned, always > 0. */
  missing: number;
  price: number;
  imageUrl?: string;
  /** True when this card is already on the wishlist. */
  onWishlist: boolean;
  wishlistItemId?: string;
}

export interface DeckGap {
  deckId: string;
  name: string;
  format: string;
  colors: string[];
  cards: DeckGapCard[];
  /** Cost of buying every missing copy at current market price. */
  totalCost: number;
}

interface WishlistByDeckProps {
  gaps: DeckGap[];
  loading: boolean;
  onCardClick: (cardId: string) => void;
  onBuyAll: (deck: DeckGap) => void;
  onAddToWishlist: (card: DeckGapCard) => void;
  onNavigateToDeck: (deckId: string) => void;
  hasDecks: boolean;
  onCreateDeck: () => void;
}

/**
 * Real deck-gap analysis: deck list minus owned quantity.
 *
 * The previous version filtered the ENTIRE wishlist by whether a card's colours
 * fit the deck's colours and returned true for every colourless card — so every
 * Sol Ring in the wishlist showed as "needed" by every deck, whether or not it
 * was in the list and whether or not you already owned one.
 */
export function WishlistByDeck({
  gaps,
  loading,
  onCardClick,
  onBuyAll,
  onAddToWishlist,
  onNavigateToDeck,
  hasDecks,
  onCreateDeck,
}: WishlistByDeckProps) {
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!hasDecks) {
    return (
      <Card className="border-dashed p-12 text-center">
        <Layers className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h3 className="mb-2 text-lg font-medium text-foreground">No decks yet</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Build a deck and this tab lists exactly which cards you still need to buy.
        </p>
        <Button onClick={onCreateDeck}>Go to decks</Button>
      </Card>
    );
  }

  if (gaps.length === 0) {
    return (
      <Card className="border-dashed p-12 text-center">
        <Layers className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h3 className="mb-2 text-lg font-medium text-foreground">Every deck is complete</h3>
        <p className="text-sm text-muted-foreground">
          You already own every card in each of your deck lists.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map(deck => {
        const isExpanded = expandedDeck === deck.deckId;
        const missingCopies = deck.cards.reduce((sum, c) => sum + c.missing, 0);
        const wishlisted = deck.cards.filter(c => c.onWishlist).length;

        return (
          <Card key={deck.deckId} className="overflow-hidden">
            <CardContent className="p-0">
              <button
                type="button"
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent"
                onClick={() => setExpandedDeck(isExpanded ? null : deck.deckId)}
                aria-expanded={isExpanded}
              >
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {deck.cards[0]?.imageUrl ? (
                    <img src={deck.cards[0].imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-card-foreground">{deck.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {deck.format}
                    </Badge>
                    <ColorIdentity colors={deck.colors} size="xs" />
                    {wishlisted > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3 w-3" aria-hidden="true" />
                        {wishlisted} on wishlist
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-card-foreground">
                    {formatPrice(deck.totalCost)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {missingCopies} card{missingCopies === 1 ? '' : 's'} missing
                  </div>
                </div>

                <ChevronRight
                  className={cn(
                    'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                  aria-hidden="true"
                />
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-muted/30 p-4">
                  <ul className="mb-4 max-h-72 space-y-1 overflow-y-auto">
                    {deck.cards.map(card => (
                      <li
                        key={card.cardId}
                        className="flex items-center gap-3 rounded border border-border bg-card px-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => onCardClick(card.cardId)}
                          className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted"
                          aria-label={`${card.name} details`}
                        >
                          {card.imageUrl ? (
                            <img
                              src={card.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-card-foreground">
                            {card.name}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            need {card.required} · own {card.owned} · buy {card.missing}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">
                          {formatPrice(card.price * card.missing)}
                        </span>
                        {card.onWishlist ? (
                          <Badge variant="secondary" className="shrink-0 gap-1">
                            <Heart className="h-3 w-3" aria-hidden="true" />
                            Wishlisted
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => onAddToWishlist(card)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Wishlist
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => onBuyAll(deck)}>
                      <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Copy buy list ({formatPrice(deck.totalCost)})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateToDeck(deck.deckId)}
                    >
                      View deck
                      <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
