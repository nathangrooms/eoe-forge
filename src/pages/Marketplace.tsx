import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { 
  ShoppingCart, 
  Package, 
  TrendingUp,
  DollarSign,
  Eye,
  Edit,
  Trash2,
  Search
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
}

export default function Marketplace() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadListings();
    loadMyListings();
  }, []);

  const loadListings = async () => {
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setListings(data || []);
    } catch (error) {
      console.error('Error loading listings:', error);
      showError('Error', 'Failed to load marketplace listings');
    }
  };

  const loadMyListings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyListings(data || []);
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

  const filteredListings = listings.filter(listing =>
    listing.card_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalListingValue = myListings.reduce((sum, listing) => 
    sum + (listing.price_usd * listing.qty), 0
  );

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
      title="Marketplace"
      description="Buy and sell Magic cards with other players"
    >
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">My Active Listings</p>
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
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Available Cards</p>
                  <p className="text-2xl font-bold">{listings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList>
            <TabsTrigger value="browse">Browse Cards</TabsTrigger>
            <TabsTrigger value="my-listings">My Listings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="browse" className="space-y-4">
            {/* Search */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cards by ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Listings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredListings.map((listing) => (
                <Card key={listing.id} className="overflow-hidden">
                  <div className="relative">
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                    {listing.foil && (
                      <Badge className="absolute top-2 right-2 bg-yellow-500">
                        Foil
                      </Badge>
                    )}
                  </div>
                  
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-1 truncate">{listing.card_id}</h3>
                    <p className="text-xs text-muted-foreground mb-2">Card ID</p>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{listing.condition || 'NM'}</span>
                      <span className="text-xs text-muted-foreground">Qty: {listing.qty}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-green-600">
                        ${listing.price_usd.toFixed(2)}
                      </span>
                      <Button size="sm" variant="outline">
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredListings.length === 0 && (
              <div className="text-center py-12">
                <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No listings found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search terms' : 'Be the first to list a card for sale!'}
                </p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="my-listings" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {myListings.map((listing) => (
                <Card key={listing.id} className="overflow-hidden">
                  <div className="relative">
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                    {listing.foil && (
                      <Badge className="absolute top-2 right-2 bg-yellow-500">
                        Foil
                      </Badge>
                    )}
                  </div>
                  
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-1 truncate">{listing.card_id}</h3>
                    <p className="text-xs text-muted-foreground mb-2">Card ID</p>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{listing.condition || 'NM'}</span>
                      <span className="text-xs text-muted-foreground">Qty: {listing.qty}</span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-lg font-bold text-green-600">
                        ${listing.price_usd.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {listing.created_at ? new Date(listing.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
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
          </TabsContent>
        </Tabs>
      </div>
    </StandardPageLayout>
  );
}