import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { MarkAsSoldModal } from '@/components/marketplace/MarkAsSoldModal';
import { 
  Package, 
  DollarSign,
  Edit,
  Trash2,
  CheckCircle,
  Calendar
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

export default function Marketplace() {
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  useEffect(() => {
    loadMyListings();
  }, []);


  const loadMyListings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
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

      if (error) throw error;
      setMyListings((data as any) || []);
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
      loadMyListings();
    } catch (error) {
      console.error('Error marking as sold:', error);
      showError('Error', 'Failed to record sale');
    }
  };

  const handleShowSoldModal = (listing: Listing) => {
    setSelectedListing(listing);
    setShowSoldModal(true);
  };

  const totalListingValue = myListings.reduce((sum, listing) => 
    sum + (listing.price_usd * listing.qty), 0
  );

  const getCardImage = (listing: Listing) => {
    return listing.cards?.image_uris?.normal || listing.cards?.image_uris?.small;
  };

  if (loading) {
    return (
      <StandardPageLayout
        title="Marketplace"
        description="Buy and sell Magic cards with other players"
      >
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="My Sales"
      description="Manage your card listings and track sales"
    >
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Active Listings</p>
                  <p className="text-2xl font-bold">{myListings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Total Listing Value</p>
                  <p className="text-2xl font-bold">${totalListingValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Listings */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {myListings.map((listing) => (
              <Card key={listing.id} className="overflow-hidden">
                <div className="relative">
                  {getCardImage(listing) ? (
                    <img 
                      src={getCardImage(listing)} 
                      alt={listing.cards?.name || listing.card_id}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  {listing.foil && (
                    <Badge className="absolute top-2 right-2 bg-yellow-500">
                      Foil
                    </Badge>
                  )}
                  <Badge 
                    className="absolute top-2 left-2" 
                    variant={listing.status === 'active' ? 'default' : 'secondary'}
                  >
                    {listing.status || 'Draft'}
                  </Badge>
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

                  <div className="grid grid-cols-3 gap-1">
                    <Button size="sm" variant="outline" className="text-xs">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs"
                      onClick={() => handleShowSoldModal(listing)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Sold
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs"
                      onClick={() => deleteListing(listing.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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
        </div>

        <MarkAsSoldModal
          isOpen={showSoldModal}
          onClose={() => {
            setShowSoldModal(false);
            setSelectedListing(null);
          }}
          listing={selectedListing}
          onMarkAsSold={handleMarkAsSold}
        />
      </div>
    </StandardPageLayout>
  );
}