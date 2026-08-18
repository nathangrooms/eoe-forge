import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { MarkAsSoldInline } from '@/components/marketplace/MarkAsSoldInline';
import { MessageNotificationBadge } from '@/components/marketplace/MessageNotificationBadge';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { PriceSearchPanel } from '@/components/marketplace/PriceSearchPanel';
import { PriceTrendCard } from '@/components/marketplace/PriceTrendCard';
import { PriceWatchlist } from '@/components/marketplace/PriceWatchlist';
import { ShoppingList } from '@/components/marketplace/ShoppingList';
import { CardImage } from '@/components/cards';
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
    set_code: string;
    rarity: string;
  };
}

interface ShoppingListItem {
  id: string;
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
  name: string;
  set_code: string;
  image_uri?: string;
  currentPrice: number;
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
      name: card.name,
      set_code: card.set_code,
      image_uri: card.image_uri,
      currentPrice: card.lowestPrice || card.averagePrice || 0,
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

  const renderListingCard = (listing: Listing) => (
    <Card key={listing.id} className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* The listing card goes through the shared `CardImage`, which keeps the
          real 488×680 geometry and picks the Scryfall resolution for the
          rendered size. This was a hand-rolled <img> in a fixed 256px-tall box. */}
      <div className="p-3 pb-0">
        <CardImage
          card={{
            name: listing.cards?.name ?? listing.card_id,
            image_uris: listing.cards?.image_uris,
          }}
          fill
          title={listing.cards?.name ?? listing.card_id}
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
      </div>

      <CardContent className="p-4">
        <h3 className="font-medium text-sm mb-1 truncate">
          {listing.cards?.name || listing.card_id}
        </h3>
        <p className="text-xs text-muted-foreground mb-2">
          {listing.cards?.set_code?.toUpperCase()} • {listing.cards?.rarity}
        </p>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{listing.condition || 'NM'}</span>
          <span className="text-xs text-muted-foreground">Qty: {listing.qty}</span>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-semibold tabular-nums text-foreground">
            ${listing.price_usd.toFixed(2)}
          </span>
          {listing.cards?.prices?.usd && (
            <span className="text-xs text-muted-foreground">
              Market: ${parseFloat(listing.cards.prices.usd).toFixed(2)}
            </span>
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
                    listingId={listing.id}
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

  // Loading skeleton
  if (loading) {
    return (
      <StandardPageLayout
        title="Marketplace"
        description="Compare prices and find the best deals"
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
          totalListingValue={totalListingValue}
          shoppingListCount={shoppingList.filter(i => !i.purchased).length}
        />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="search" className="flex items-center gap-2 py-3">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Price Search</span>
              <span className="sm:hidden">Search</span>
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2 py-3">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Trends</span>
              <span className="sm:hidden">Trends</span>
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="flex items-center gap-2 py-3">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Watchlist</span>
              <span className="sm:hidden">Watch</span>
              {watchlist.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs justify-center">
                  {watchlist.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="listings" className="flex items-center gap-2 py-3">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">My Listings</span>
              <span className="sm:hidden">Sell</span>
              {myListings.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs justify-center">
                  {myListings.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

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
            <Tabs defaultValue="for-sale" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="for-sale" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  For Sale ({myListings.length})
                </TabsTrigger>
                <TabsTrigger value="sold" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Sold ({soldListings.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="for-sale" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {myListings.map(renderListingCard)}
                </div>

                {myListings.length === 0 && (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No listings yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start by marking cards for sale in your collection.
                    </p>
                    <Button asChild>
                      <a href="/collection">Go to Collection</a>
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sold" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {soldListings.map(renderListingCard)}
                </div>

                {soldListings.length === 0 && (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No sold items yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Items you mark as sold will appear here.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

      </div>
    </StandardPageLayout>
  );
}
