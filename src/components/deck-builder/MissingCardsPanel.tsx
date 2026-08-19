import { useState, useEffect } from 'react';
import { readAmount } from '@/lib/pricing';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CardImage } from '@/components/cards';
import { Search, Plus, Heart, DollarSign, Package, Printer, ShoppingCart, Loader2 } from 'lucide-react';
import { AddToListButton } from '@/components/shopping';
import { showListItemCount, useCardLists, type ListKind } from '@/lib/shopping';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface MissingCard {
  card_id: string;
  card_name: string;
  quantity: number;
  /** USD for all the copies still needed, or null when we have no price. */
  estimated_price?: number | null;
  rarity?: string;
  type_line?: string;
  set_name?: string;
  image_uri?: string;
}

interface MissingCardsPanelProps {
  deckId: string;
  deckName: string;
}

/**
 * The deck's shopping list, on its own page.
 *
 * This was `MissingCardsDrawer` — an 80vh drawer over the deck list. A list you
 * work through, price up and buy from is a destination, so it lives at
 * `/deck/:id/missing` with a real URL and no overlay.
 */
export function MissingCardsPanel({ deckId, deckName }: MissingCardsPanelProps) {
  const [missingCards, setMissingCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [addingAll, setAddingAll] = useState<ListKind | null>(null);
  const addMany = useCardLists(state => state.addMany);

  useEffect(() => {
    if (deckId) {
      loadMissingCards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const loadMissingCards = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get deck cards that are not in user's collection
      const { data: deckCards, error: deckError } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity')
        .eq('deck_id', deckId)
        .eq('is_sideboard', false);

      if (deckError) throw deckError;

      if (!deckCards || deckCards.length === 0) {
        setMissingCards([]);
        return;
      }

      // Get user's collection
      const { data: userCards, error: collectionError } = await supabase
        .from('user_collections')
        .select('card_id, quantity')
        .eq('user_id', session.user.id);

      if (collectionError) throw collectionError;

      // Create a map of owned cards
      const ownedCardsMap = new Map<string, number>();
      userCards?.forEach(card => {
        ownedCardsMap.set(card.card_id, card.quantity);
      });

      // Find missing cards with accurate count
      const missing: MissingCard[] = [];
      const cardDetailsCache = new Map();

      for (const deckCard of deckCards) {
        const owned = ownedCardsMap.get(deckCard.card_id) || 0;
        const needed = Math.max(0, deckCard.quantity - owned);

        if (needed > 0) {
          // Check cache first
          let cardDetails = cardDetailsCache.get(deckCard.card_id);

          if (!cardDetails) {
            // Get card details
            const { data, error: cardError } = await supabase
              .from('cards')
              .select('rarity, type_line, image_uris, prices')
              .eq('id', deckCard.card_id)
              .single();

            if (!cardError && data) {
              cardDetails = data;
              cardDetailsCache.set(deckCard.card_id, data);
            }
          }

          /* null, not 0, when we have no price. A missing price used to be
             added to the buy total as zero, which told a player the deck was
             cheaper to finish than it is. */
          const unit = readAmount((cardDetails?.prices as any)?.usd);
          const estimatedPrice = unit == null ? null : unit * needed;

          const imageUris = cardDetails?.image_uris as any;
          missing.push({
            card_id: deckCard.card_id,
            card_name: deckCard.card_name,
            quantity: needed,
            estimated_price: estimatedPrice,
            rarity: cardDetails?.rarity,
            type_line: cardDetails?.type_line,
            image_uri: imageUris?.normal || imageUris?.large
          });
        }
      }

      // Unpriced cards sort last rather than pretending to be the cheapest.
      setMissingCards(missing.sort((a, b) => (b.estimated_price ?? -1) - (a.estimated_price ?? -1)));
    } catch (error) {
      console.error('Error loading missing cards:', error);
      showError('Error', 'Failed to load missing cards');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Every missing card onto one of the lists in one press, and in one request.
   *
   * This is the surface where a bulk action earns its place: somebody looking
   * at twenty cards their deck is short of does not want to press twenty
   * buttons. The quantity is the shortfall, so a deck needing two copies asks
   * for two, and the database raises the quantity of anything already on the
   * list rather than writing a second row for it.
   *
   * It used to be a `for` loop of one `card_list_add` per card, which made a
   * fifty card shortfall fifty round trips. That is the shape that has taken
   * this project down twice, so it goes through `card_list_add_many` now: one
   * statement whatever the size of the deck.
   */
  const addAll = async (kind: ListKind) => {
    if (missingCards.length === 0) return;
    setAddingAll(kind);
    try {
      await addMany({
        kind,
        source: 'deck',
        // Kept so that when the parcel arrives weeks later, filing already
        // knows which deck was waiting on it.
        sourceDeckId: deckId,
        items: missingCards.map(card => ({
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
        })),
      });
      showSuccess(
        kind === 'proxy' ? 'On your proxy list' : 'On your shopping list',
        `${showListItemCount(missingCards.length)} from “${deckName}”.`
      );
    } catch (error: any) {
      showError('Could not add them all', error?.message ?? 'Please try again.');
    } finally {
      setAddingAll(null);
    }
  };

  const addToWishlist = async (card: MissingCard) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('wishlist')
        .upsert({
          user_id: session.user.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          priority: 'medium'
        }, {
          onConflict: 'user_id,card_id'
        });

      if (error) throw error;

      showSuccess('Added to Wishlist', `${card.card_name} added to your wishlist`);
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Error', 'Failed to add card to wishlist');
    }
  };

  const addToCollection = async (card: MissingCard) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('user_collections')
        .upsert({
          user_id: session.user.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          set_code: 'unknown', // Would need to determine set
          condition: 'near_mint'
        }, {
          onConflict: 'user_id,card_id'
        });

      if (error) throw error;

      showSuccess('Added to Collection', `${card.card_name} added to your collection`);

      // Remove from missing cards list
      setMissingCards(prev => prev.filter(c => c.card_id !== card.card_id));
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Error', 'Failed to add card to collection');
    }
  };

  const filteredCards = missingCards.filter(card => {
    const matchesSearch = card.card_name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'all') return true;

    // An unpriced card belongs in no price band. It used to land in "under $2",
    // which is a guess dressed as a filter result.
    const price = card.estimated_price;
    if (price == null) return false;
    switch (filter) {
      case 'high': return price >= 10;
      case 'medium': return price >= 2 && price < 10;
      case 'low': return price < 2;
      default: return true;
    }
  });

  const totalValue = missingCards.reduce((sum, card) => sum + (card.estimated_price ?? 0), 0);
  const unpricedCount = missingCards.filter(card => card.estimated_price == null).length;

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-sm">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{missingCards.length}</div>
          <div className="text-xs text-muted-foreground">cards missing from “{deckName}”</div>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium tabular-nums">{totalValue.toFixed(2)}</span>
            <span className="text-muted-foreground">estimated</span>
          </div>
          {unpricedCount > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {unpricedCount === 1
                ? '1 card here has no price, so the real cost is higher.'
                : `${unpricedCount} cards here have no price, so the real cost is higher.`}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Proxy the whole shortfall, because playing the deck before paying
              for it is why a player is looking at this list at all. */}
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => addAll('proxy')}
            disabled={addingAll !== null || missingCards.length === 0}
          >
            {addingAll === 'proxy' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Proxy them all
          </Button>
          <Button
            className="gap-2"
            onClick={() => addAll('shopping')}
            disabled={addingAll !== null || missingCards.length === 0}
          >
            {addingAll === 'shopping' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Add them all to my shopping list
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search missing cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'high', 'medium', 'low'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === 'all' ? 'All' : `$${f === 'high' ? '10+' : f === 'medium' ? '2-10' : '<2'}`}
            </Button>
          ))}
        </div>
      </div>

      {/* Missing Cards List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full ring-2 ring-muted-foreground ring-offset-0 border-t-transparent" />
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="rounded-xl bg-card py-16 text-center shadow-sm">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">No missing cards found</h3>
          <p className="text-muted-foreground">
            {searchQuery ? 'Try adjusting your search or filters' : 'You own all cards in this deck!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCards.map((card) => (
            <Card key={card.card_id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="w-16 flex-shrink-0">
                  <CardImage
                    card={{
                      name: card.card_name,
                      image_uris: card.image_uri
                        ? { normal: card.image_uri, large: card.image_uri }
                        : undefined,
                    }}
                    size="sm"
                    fill
                    hideFlip
                  />
                </div>

                {/* Card Details */}
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0">
                      <h4 className="truncate font-medium">{card.card_name}</h4>
                      <p className="truncate text-sm text-muted-foreground">
                        {card.type_line}
                      </p>
                    </div>
                    <div className="ml-2 flex-shrink-0 text-right">
                      <div className="text-sm font-medium">
                        Need {card.quantity}
                      </div>
                      <div className="text-sm tabular-nums text-muted-foreground">
                        {card.estimated_price == null
                          ? 'No price'
                          : `$${card.estimated_price.toFixed(2)}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {card.rarity && (
                        <Badge variant="secondary" className="capitalize">
                          {card.rarity}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* The same button as the card page and card search, so
                          the action reads the same wherever it is taken. Proxy
                          sits beside shopping because this is the exact list
                          somebody proxies: the cards the deck needs and you do
                          not own yet. */}
                      <AddToListButton
                        card={{ id: card.card_id, name: card.card_name }}
                        kind="shopping"
                        quantity={card.quantity}
                        source="deck"
                        deckId={deckId}
                      />
                      <AddToListButton
                        card={{ id: card.card_id, name: card.card_name }}
                        kind="proxy"
                        quantity={card.quantity}
                        source="deck"
                        deckId={deckId}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addToWishlist(card)}
                      >
                        <Heart className="mr-1 h-3 w-3" />
                        Wishlist
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => addToCollection(card)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Mark as Owned
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default MissingCardsPanel;
