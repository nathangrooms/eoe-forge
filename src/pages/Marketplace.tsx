import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { MarkAsSoldModal } from '@/components/marketplace/MarkAsSoldModal';
import { EditListingModal } from '@/components/marketplace/EditListingModal';
import { MessagingDrawer } from '@/components/marketplace/MessagingDrawer';
import { MessageNotificationBadge } from '@/components/marketplace/MessageNotificationBadge';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { PriceSearchPanel } from '@/components/marketplace/PriceSearchPanel';
import { PriceTrendCard } from '@/components/marketplace/PriceTrendCard';
import { PriceWatchlist } from '@/components/marketplace/PriceWatchlist';
import { ShoppingList } from '@/components/marketplace/ShoppingList';
import { QuickPriceStats } from '@/components/marketplace/QuickPriceStats';
import { 
  Package, 
  DollarSign,
  Edit,
  Trash2,
  CheckCircle,
  Calendar,
  MessageCircle,
  Search,
  TrendingUp,
  Star,
  ShoppingCart
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
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMessagingDrawer, setShowMessagingDrawer] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [activeTab, setActiveTab] = useState('search');

  useEffect(() => {
    loadMyListings();
    loadWatchlist();
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

  const handleShowSoldModal = (listing: Listing) => {
    setSelectedListing(listing);
    setShowSoldModal(true);
  };

  const handleShowEditModal = (listing: Listing) => {
    setSelectedListing(listing);
    setShowEditModal(true);
  };

  const handleUpdateListing = async (data: {
    id: string;
    price_usd: number;
    qty: number;
    condition: string;
    note?: string;
    status: string;
  }) => {
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          price_usd: data.price_usd,
          qty: data.qty,
          condition: data.condition,
          note: data.note,
          status: data.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id);

      if (error) throw error;
      
      showSuccess('Listing Updated', 'Your changes have been saved');
      loadMyListings();
    } catch (error) {
      console.error('Error updating listing:', error);
      showError('Error', 'Failed to update listing');
    }
  };

  const totalListingValue = myListings.reduce((sum, listing) => 
    sum + (listing.price_usd * listing.qty), 0
  );

  const getCardImage = (listing: Listing) => {
    return listing.cards?.image_uris?.normal || listing.cards?.image_uris?.small;
  };

  const renderListingCard = (listing: Listing) => (
    <Card key={listing.id} className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        {getCardImage(listing) ? (
          <img 
            src={getCardImage(listing)} 
            alt={listing.cards?.name || listing.card_id}
            className="w-full h-64 object-contain bg-background"
          />
        ) : (
          <div className="w-full h-64 bg-muted flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {listing.foil && (
          <Badge className="absolute top-2 right-2 bg-yellow-500">
            Foil
          </Badge>
        )}
        {listing.status === 'draft' && (
          <Badge className="absolute top-2 left-2" variant="secondary">
            Draft
          </Badge>
        )}
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
          <span className="text-lg font-bold text-green-600">
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
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => handleShowEditModal(listing)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 relative"
                onClick={() => {
                  setSelectedListing(listing);
                  setShowMessagingDrawer(true);
                }}
              >
                <MessageCircle className="h-3 w-3 mr-1" />
                Msg
                <MessageNotificationBadge 
                  listingId={listing.id}
                  className="absolute -top-1 -right-1"
                />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => handleShowSoldModal(listing)}
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
        {/* Header */}
        <MarketplaceHeader 
          totalWatchlist={watchlist.length}
          totalSavings={0}
        />

        {/* Quick Stats */}
        <QuickPriceStats 
          watchlistCount={watchlist.length}
          myListingsCount={myListings.length}
          totalListingValue={totalListingValue}
          savedAmount={0}
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
            <PriceSearchPanel onAddToWatchlist={handleAddToWatchlist} />
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PriceTrendCard />
              <ShoppingList />
            </div>
          </TabsContent>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PriceWatchlist 
                items={watchlist} 
                onRemove={handleRemoveFromWatchlist}
              />
              <ShoppingList />
            </div>
          </TabsContent>

          {/* My Listings Tab */}
          <TabsContent value="listings" className="mt-6 space-y-6">
            {/* Listing Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Active Listings</p>
                      <p className="text-2xl font-bold">{myListings.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sold Items</p>
                      <p className="text-2xl font-bold">{soldListings.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-purple-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <p className="text-2xl font-bold">${totalListingValue.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

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

        {/* Modals */}
        <MarkAsSoldModal
          isOpen={showSoldModal}
          onClose={() => {
            setShowSoldModal(false);
            setSelectedListing(null);
          }}
          listing={selectedListing}
          onMarkAsSold={handleMarkAsSold}
        />

        <EditListingModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedListing(null);
          }}
          listing={selectedListing}
          onSave={handleUpdateListing}
        />

        {selectedListing && (
          <MessagingDrawer
            open={showMessagingDrawer}
            onClose={() => {
              setShowMessagingDrawer(false);
              setSelectedListing(null);
            }}
            listingId={selectedListing.id}
            sellerId={selectedListing.user_id}
            cardName={selectedListing.cards?.name || selectedListing.card_id}
          />
        )}
      </div>
    </StandardPageLayout>
  );
}
