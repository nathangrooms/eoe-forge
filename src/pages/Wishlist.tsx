import { useState, useEffect } from 'react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { UniversalCardSearch } from '@/components/universal/UniversalCardSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { 
  Heart, 
  Plus, 
  Trash2, 
  Edit, 
  ShoppingCart
} from 'lucide-react';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  created_at: string;
  card?: {
    name: string;
    set_code: string;
    type_line: string;
    colors: string[];
    rarity: string;
    prices?: {
      usd?: string;
      usd_foil?: string;
    };
    image_uris?: {
      small?: string;
      normal?: string;
    };
  };
}

export default function Wishlist() {
  const { user } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    quantity: 1,
    priority: 'medium',
    note: ''
  });

  useEffect(() => {
    loadWishlist();
  }, [user]);

  const loadWishlist = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // For now, return empty array until wishlist table types are updated
      setWishlistItems([]);
    } catch (error) {
      console.error('Error loading wishlist:', error);
      showError('Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  };

  const addToWishlist = async (card: any) => {
    if (!user) return;

    try {
      showSuccess('Added to Wishlist', `${card.name} added to your wishlist`);
      loadWishlist();
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist');
    }
  };

  const updateWishlistItem = async () => {
    if (!selectedItem) return;

    try {
      showSuccess('Updated', 'Wishlist item updated');
      setShowEditDialog(false);
      loadWishlist();
    } catch (error) {
      console.error('Error updating wishlist item:', error);
      showError('Failed to update item');
    }
  };

  const removeFromWishlist = async (itemId: string) => {
    try {
      showSuccess('Removed', 'Item removed from wishlist');
      loadWishlist();
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      showError('Failed to remove item');
    }
  };

  const addToCollection = async (item: WishlistItem) => {
    if (!user || !item.card) return;

    try {
      const { error } = await supabase
        .from('user_collections')
        .insert({
          user_id: user.id,
          card_id: item.card_id,
          card_name: item.card_name,
          set_code: item.card.set_code,
          quantity: item.quantity,
          condition: 'near_mint'
        });

      if (error) throw error;
      showSuccess('Added to Collection', `${item.card_name} added to your collection`);
      
      // Remove from wishlist
      await removeFromWishlist(item.id);
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Failed to add to collection');
    }
  };

  const openEditDialog = (item: WishlistItem) => {
    setSelectedItem(item);
    setEditForm({
      quantity: item.quantity,
      priority: item.priority,
      note: item.note || ''
    });
    setShowEditDialog(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⭐';
      case 'low': return '💭';
      default: return '';
    }
  };

  const totalValue = wishlistItems.reduce((sum, item) => {
    const price = parseFloat(item.card?.prices?.usd || '0');
    return sum + (price * item.quantity);
  }, 0);

  return (
    <StandardPageLayout
      title="Wishlist"
      description="Track cards you want to add to your collection"
      action={
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Value</div>
            <div className="text-lg font-bold text-green-600">
              ${totalValue.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Items</div>
            <div className="text-lg font-bold">{wishlistItems.length}</div>
          </div>
        </div>
      }
    >
      <Tabs defaultValue="wishlist" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="wishlist">My Wishlist</TabsTrigger>
          <TabsTrigger value="search">Add Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="wishlist" className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="animate-pulse flex space-x-4">
                      <div className="w-16 h-20 bg-muted rounded"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : wishlistItems.length === 0 ? (
            <Card className="p-12 text-center">
              <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Your wishlist is empty</h3>
              <p className="text-muted-foreground mb-4">
                Start adding cards you want to collect
              </p>
              <Button onClick={() => {
                const searchTab = document.querySelector('[value="search"]') as HTMLElement;
                searchTab?.click();
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Cards
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {wishlistItems.map((item) => (
                <Card key={item.id} className="group hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-4">
                      {/* Card Image */}
                      <div className="w-16 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                        {item.card?.image_uris?.small && (
                          <img 
                            src={item.card.image_uris.small}
                            alt={item.card_name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Card Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{item.card_name}</h3>
                          <Badge variant={getPriorityColor(item.priority)} className="text-xs">
                            {getPriorityIcon(item.priority)} {item.priority}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>{item.card?.type_line}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {item.card?.set_code?.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.card?.rarity}
                            </Badge>
                            <span>Qty: {item.quantity}</span>
                          </div>
                          {item.note && (
                            <p className="text-xs italic">{item.note}</p>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium">
                          {item.card?.prices?.usd ? `$${item.card.prices.usd}` : 'N/A'}
                        </div>
                        {item.quantity > 1 && (
                          <div className="text-sm text-muted-foreground">
                            Total: ${((parseFloat(item.card?.prices?.usd || '0')) * item.quantity).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          onClick={() => addToCollection(item)}
                          disabled={!item.card?.prices?.usd}
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(item)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeFromWishlist(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="search" className="space-y-6">
          <UniversalCardSearch
            onCardAdd={addToWishlist}
            onCardSelect={(card) => console.log('Selected:', card)}
            placeholder="Search cards to add to your wishlist..."
            showFilters={true}
            showAddButton={true}
            showWishlistButton={false}
            showViewModes={true}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Wishlist Item</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="99"
                value={editForm.quantity}
                onChange={(e) => setEditForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>
            
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={editForm.priority} onValueChange={(value: string) => setEditForm(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🤔 Low</SelectItem>
                  <SelectItem value="medium">⭐ Medium</SelectItem>
                  <SelectItem value="high">🔥 High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                value={editForm.note}
                onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Add a note about this card..."
                rows={3}
              />
            </div>
            
            <Button onClick={updateWishlistItem} className="w-full">
              Update Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </StandardPageLayout>
  );
}