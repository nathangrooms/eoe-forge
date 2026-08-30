import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { MarkAsSoldInline } from '@/components/marketplace/MarkAsSoldInline';
import {
  MessageNotificationBadge,
  useUnreadByListing,
} from '@/components/marketplace/MessageNotificationBadge';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { listingCopies } from '@/components/marketplace/listingCounts';
import { PriceSearchPanel } from '@/components/marketplace/PriceSearchPanel';
import { PriceTrendCard } from '@/components/marketplace/PriceTrendCard';
import { PriceWatchlist } from '@/components/marketplace/PriceWatchlist';
import { ShoppingList } from '@/components/marketplace/ShoppingList';
import { CardGrid, CardImage, cardDetailPath } from '@/components/cards';
import { EmptyState, PageTabs } from '@/components/listing';
import { CardPrices } from '@/components/pricing';
import { readAmount } from '@/lib/pricing';
import {
  Package,
  Edit,
  Trash2,
  CheckCircle,
  Calendar,
  MessageCircle,
  Search,
  TrendingUp,
  Star
} from 'lucide-react';

interface Listing {
  id: string;
  card_id: string;
  condition: string | null;
  foil: boolean | null;
  qty: number;
  price_usd: number;
  created_at: string | null;
  user_id: string;
  status: string | null;
  currency: string | null;
  note: string | null;
  updated_at: string | null;
  visibility: string | null;
  cards?: {
    id: string;
    name: string;
    image_uris: any;
    prices: any;
    /** Which finishes this printing was actually made in. Tells "no foil price"
        apart from "never printed in foil", which `CardPrices` says out loud. */
    finishes: string[] | null;
    set_code: string;
    rarity: string;
  };
}

interface ShoppingListItem {
  id: string;
  /** The card this row is about. Absent on rows saved before card links existed. */
  cardId?: string;
  name: string;
  set_code?: string;
  image_uri?: string;
  estimatedPrice: number;
  quantity: number;
  purchased: boolean;
  purchaseUrl?: string;
  notes?: string;
}

interface WatchlistItem {
  id: string;
  /** The card this row is about. Absent on rows saved before card links existed. */
  cardId?: string;
  name: string;
  set_code: string;
  image_uri?: string;
  /** Null when no shop quotes this printing. Never 0: see PriceWatchlist. */
  currentPrice: number | null;
  targetPrice?: number;
  alertEnabled: boolean;
  addedAt: string;
  priceChange?: number;
  purchaseUrl: string;
}

export default function Marketplace() {
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [soldListings, setSoldListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  /** Which listing card has its inline "record this sale" form expanded. */
  const [sellingListingId, setSellingListingId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [activeTab, setActiveTab] = useState('search');
  /* Controlled, because the uncontrolled `defaultValue` version reset to "For
     sale" whenever anything above it re-rendered, which includes marking a card
     sold from the Sold tab. */
  const [listingsTab, setListingsTab] = useState('for-sale');

  /* One read and one realtime channel for the page, rather than one of each per
     listing tile. See `MessageNotificationBadge`: the per-tile version threw on
     the second tile and took the whole tab down with it. */
  const unreadByListing = useUnreadByListing();

  useEffect(() => {
    loadMyListings();
    loadWatchlist();
    loadShoppingList();
  }, []);

  const loadWatchlist = () => {
    const saved = localStorage.getItem('price_watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse watchlist:', e);
      }
    }
  };

  const handleAddToWatchlist = (card: any) => {
    const newItem: WatchlistItem = {
      id: crypto.randomUUID(),
      cardId: card.id,
      name: card.name,
      set_code: card.set_code,
      image_uri: card.image_uri,
      /* `|| 0` was here, and the search panel hands us `parseFloat(usd || '0')`,
         so a printing with no USD price arrived as 0 and was saved as a price.
         `readAmount` returns null for anything that is not a real amount. */
      currentPrice: readAmount(card.lowestPrice) ?? readAmount(card.averagePrice),
      alertEnabled: true,
      addedAt: new Date().toISOString(),
      priceChange: card.priceChange7d,
      purchaseUrl: card.prices?.[0]?.url || '#'
    };

    const updated = [...watchlist, newItem];
    setWatchlist(updated);
    localStorage.setItem('price_watchlist', JSON.stringify(updated));
  };

  const loadShoppingList = () => {
    const saved = localStorage.getItem('shopping_list');
    if (saved) {
      try {
        setShoppingList(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse shopping list:', e);
      }
    }
  };

  // Single source of truth for the shopping list. ShoppingList used to be
  // mounted twice with no props, so each copy read and wrote localStorage
  // independently and clobbered the other.
  const persistShoppingList = (updated: ShoppingListItem[]) => {
    setShoppingList(updated);
    localStorage.setItem('shopping_list', JSON.stringify(updated));
  };

  const handleAddToShoppingList = (card: any) => {
    const newItem: ShoppingListItem = {
      id: crypto.randomUUID(),
      cardId: card.id,
      name: card.name,
      set_code: card.set_code,
      image_uri: card.image_uri,
      estimatedPrice: card.tcgplayerPrice || card.averagePrice || 0,
      quantity: 1,
      purchased: false,
      purchaseUrl: card.tcgplayerUrl || card.prices?.[0]?.url,
      notes: ''
    };

    persistShoppingList([...shoppingList, newItem]);
    showSuccess('Added to Shopping List', `${card.name} added to your shopping list`);
  };

  const handleRemoveFromWatchlist = (id: string) => {
    const updated = watchlist.filter(item => item.id !== id);
    setWatchlist(updated);
    localStorage.setItem('price_watchlist', JSON.stringify(updated));
  };

  const loadMyListings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Load active/draft listings
      const { data: activeData, error: activeError } = await supabase
        .from('listings')
        .select(`
          *,
          cards(
            id,
            name,
            image_uris,
            prices,
            finishes,
            set_code,
            rarity
          )
        `)
        .eq('user_id', session.user.id)
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false });

      if (activeError) throw activeError;
      setMyListings((activeData as any) || []);

      // Load sold listings
      const { data: soldData, error: soldError } = await supabase
        .from('listings')
        .select(`
          *,
          cards(
            id,
            name,
            image_uris,
            prices,
            finishes,
            set_code,
            rarity
          )
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'sold')
        .order('updated_at', { ascending: false });

      if (soldError) throw soldError;
      setSoldListings((soldData as any) || []);
    } catch (error) {
      console.error('Error loading my listings:', error);
      showError('Error', 'Failed to load your listings');
    } finally {
      setLoading(false);
    }
  };

  const deleteListing = async (listingId: string) => {
    try {
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId);

      if (error) throw error;

      showSuccess('Listing Deleted', 'Your listing has been removed');
      loadMyListings();
    } catch (error) {
      console.error('Error deleting listing:', error);
      showError('Error', 'Failed to delete listing');
    }
  };

  const handleMarkAsSold = async (data: {
    listing_id: string;
    sale_price_usd: number;
    platform: string;
    buyer_info?: string;
    notes?: string;
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError('Authentication Error', 'Please log in to record a sale');
        return;
      }

      const listing = myListings.find(l => l.id === data.listing_id);
      if (!listing) return;

      // Create sale record
      const { error: saleError } = await supabase
        .from('sales')
        .insert({
          user_id: session.user.id,
          listing_id: data.listing_id,
          card_id: listing.card_id,
          qty: listing.qty,
          foil: listing.foil || false,
          condition: listing.condition || 'NM',
          sale_price_usd: data.sale_price_usd,
          platform: data.platform,
          buyer_info: data.buyer_info,
          notes: data.notes,
        });

      if (saleError) throw saleError;

      // Update listing status to sold
      const { error: updateError } = await supabase
        .from('listings')
        .update({ status: 'sold' })
        .eq('id', data.listing_id);

      if (updateError) throw updateError;

      // Immediately update local state for instant UI feedback
      setMyListings(prev => prev.filter(l => l.id !== data.listing_id));
      setSoldListings(prev => [{
        ...listing,
        status: 'sold',
        updated_at: new Date().toISOString()
      }, ...prev]);

      // Remove from collection
      const { error: collectionError } = await supabase
        .from('user_collections')
        .delete()
        .eq('user_id', session.user.id)
        .eq('card_id', listing.card_id)
        .eq('foil', listing.foil ? 1 : 0);

      if (collectionError) {
        console.warn('Could not remove from collection:', collectionError);
      }

      showSuccess('Card Sold!', `${listing.cards?.name || listing.card_id} marked as sold and removed from collection`);

      // Reload to ensure sync with database
      await loadMyListings();
    } catch (error) {
      console.error('Error marking as sold:', error);
      showError('Error', 'Failed to record sale');
    }
  };

  const totalListingValue = myListings.reduce((sum, listing) =>
    sum + (listing.price_usd * listing.qty), 0
  );

  /* The same `qty` the total above is multiplied by, counted on its own, so
     the Listings tile can say what the Listing value tile is the price of.
     Without it the header showed a row count beside a copies total. */
  const myListingCopies = listingCopies(myListings);

  const renderListingCard = (listing: Listing) => {
    const cardName = listing.cards?.name ?? listing.card_id;
    /* Owner: "Marketplace doesnt let you click into a card detail page". The
       art and the name are one link to `/cards/:id` — the listing's own
       controls (edit, message, sold, delete) stay where they are. */
    const cardPath = cardDetailPath({ card_id: listing.card_id, name: listing.cards?.name });

    return (
      <Card key={listing.id} className="overflow-hidden hover:shadow-lg transition-shadow">
        {/* The listing card goes through the shared `CardImage`, which keeps the
            real 488×680 geometry and picks the Scryfall resolution for the
            rendered size. This was a hand-rolled <img> in a fixed 256px-tall box. */}
        <div className="p-3 pb-0">
          <Link
            to={cardPath ?? '#'}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${cardName}`}
          >
            <CardImage
              card={{
                name: cardName,
                image_uris: listing.cards?.image_uris,
              }}
              fill
              interactive
              title={`Open ${cardName}`}
            >
              {listing.foil && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  Foil
                </span>
              )}
              {listing.status === 'draft' && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  Draft
                </span>
              )}
            </CardImage>
          </Link>
        </div>

        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-1 truncate">
            <Link to={cardPath ?? '#'} className="hover:underline">
              {cardName}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            {listing.cards?.set_code?.toUpperCase()} • {listing.cards?.rarity}
          </p>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{listing.condition || 'NM'}</span>
            <span className="text-xs text-muted-foreground">Qty: {listing.qty}</span>
          </div>

          {/* The asking price, then every price we actually hold for this exact
              printing.

              This was one number labelled "Market", read from `prices.usd`
              alone. We store six slots per printing, so a seller pricing a foil
              was being compared against the normal copy, and a printing with no
              `usd` showed nothing at all beside the ask with no explanation.
              `CardPrices` names the shop and the finish for each figure, and
              says "No price yet" in words rather than printing a zero. */}
          <div className="mb-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              {/* `price_usd` is the ask on a sold listing too: what the card
                  actually went for is recorded in `sales`, not here. So a sold
                  tile says what it was listed at rather than pretending to
                  report the sale. */}
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {listing.status === 'sold' ? 'Listed at' : 'Asking'}
              </span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                ${listing.price_usd.toFixed(2)}
              </span>
            </div>

            {listing.cards && (
              <CardPrices
                card={listing.cards}
                surface="inset"
                /* The tile is a quarter of a wide screen at most, and the buy
                   row would wrap under every price. Buying is on the card page,
                   one click away through the art. */
                showBuyLinks={false}
                heading="Market prices"
              />
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              {listing.created_at ? new Date(listing.created_at).toLocaleDateString() : ''}
            </span>
          </div>

          <div className="flex gap-2">
            {listing.status !== 'sold' && (
              <>
                <Button size="sm" variant="secondary" className="flex-1" asChild>
                  <Link to={`/marketplace/listing/${listing.id}/edit`}>
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Link>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1 relative" asChild>
                  <Link to={`/marketplace/messages/${listing.id}`}>
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Msg
                    <MessageNotificationBadge
                      count={unreadByListing[listing.id] ?? 0}
                      className="absolute -top-1 -right-1"
                    />
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    setSellingListingId(sellingListingId === listing.id ? null : listing.id)
                  }
                  aria-expanded={sellingListingId === listing.id}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Sold
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="destructive"
              className="aspect-square p-0 h-9 w-9 flex-shrink-0"
              onClick={() => deleteListing(listing.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Recording the sale happens in the card itself, with the asking price
              and condition still on screen. */}
          {sellingListingId === listing.id && (
            <MarkAsSoldInline
              listing={listing}
              onCancel={() => setSellingListingId(null)}
              onMarkAsSold={handleMarkAsSold}
            />
          )}
        </CardContent>
      </Card>
    );
  };

  // Loading skeleton
  if (loading) {
    return (
      <StandardPageLayout
        title="Marketplace"
        description="Compare prices across platforms and find the best deals"
      >
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="Marketplace"
      description="Compare prices across platforms and find the best deals"
    >
      <div className="space-y-6">
        {/* Price sources and the four live counters, in one strip. */}
        <MarketplaceHeader
          watchlistCount={watchlist.length}
          myListingsCount={myListings.length}
          myListingCopies={myListingCopies}
          totalListingValue={totalListingValue}
          shoppingListCount={shoppingList.filter(i => !i.purchased).length}
        />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/*
            The page's four sections, in the control every other page uses.

            This was a `grid w-full grid-cols-4` of full-width triggers, which
            is a fifth tab treatment and the only one that stretched each tab to
            a quarter of the screen whatever its label said. Sentence case, too:
            "Price Search" and "My Listings" were the only Title Case labels in
            the product.
          */}
          <PageTabs
            value={activeTab}
            onChange={setActiveTab}
            label="Marketplace sections"
            tabs={[
              { id: 'search', label: 'Price search', shortLabel: 'Search', icon: Search },
              { id: 'trends', label: 'Trends', icon: TrendingUp },
              {
                id: 'watchlist',
                label: 'Watchlist',
                shortLabel: 'Watch',
                icon: Star,
                count: loading ? null : watchlist.length,
              },
              {
                id: 'listings',
                label: 'My listings',
                shortLabel: 'Sell',
                icon: Package,
                count: loading ? null : myListings.length,
              },
            ]}
          />

          {/* Price Search Tab */}
          <TabsContent value="search" className="mt-6">
            <PriceSearchPanel
              onAddToWatchlist={handleAddToWatchlist}
              onAddToShoppingList={handleAddToShoppingList}
            />
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="mt-6">
            <PriceTrendCard />
          </TabsContent>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PriceWatchlist
                items={watchlist}
                onRemove={handleRemoveFromWatchlist}
              />
              <ShoppingList items={shoppingList} onUpdate={persistShoppingList} />
            </div>
          </TabsContent>

          {/* My Listings Tab */}
          <TabsContent value="listings" className="mt-6 space-y-6">
            {/* No stat tiles here: "Active listings", "Sold items" and "Total
                value" repeated the header strip's Listings/Listing value and the
                sub-tab counts below, so on an empty account the tab opened with
                three more zeroes and pushed the listings themselves down. */}

            {/* Listings Sub-tabs */}
            {/* The same strip again one level down, rather than a sixth skin.
                It is controlled now as well: `defaultValue` meant the sub-tab
                snapped back to For sale whenever the page above it
                re-rendered, which includes marking a card sold. */}
            <PageTabs
              value={listingsTab}
              onChange={setListingsTab}
              label="Your listings"
              tabs={[
                {
                  id: 'for-sale',
                  label: 'For sale',
                  icon: Package,
                  count: loading ? null : myListings.length,
                },
                {
                  id: 'sold',
                  label: 'Sold',
                  icon: CheckCircle,
                  count: loading ? null : soldListings.length,
                },
              ]}
            />

            {/*
              `CardGrid` rather than a breakpoint table of columns. A listing
              tile has a natural width and the grid reflows to it, which is what
              every other grid in the product does; `grid-cols-1 md:2 lg:3 xl:4`
              gave a 1600px screen four 380px tiles and a 1100px screen three
              340px ones, so the same tile was a different size on every
              machine.
            */}
            {listingsTab === 'for-sale' &&
              (myListings.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No listings yet"
                  description="Mark a card for sale in your collection and it turns up here."
                  actions={
                    <Button size="sm" asChild>
                      <Link to="/collection">Go to your collection</Link>
                    </Button>
                  }
                />
              ) : (
                <CardGrid width={300}>{myListings.map(renderListingCard)}</CardGrid>
              ))}

            {listingsTab === 'sold' &&
              (soldListings.length === 0 ? (
                <EmptyState
                  icon={CheckCircle}
                  title="Nothing sold yet"
                  description="Cards you mark as sold are kept here with what you asked for them."
                />
              ) : (
                <CardGrid width={300}>{soldListings.map(renderListingCard)}</CardGrid>
              ))}
          </TabsContent>
        </Tabs>

      </div>
    </StandardPageLayout>
  );
}
