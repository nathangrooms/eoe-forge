import { useState, useEffect } from 'react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UniversalCardDisplay } from '@/components/universal/UniversalCardDisplay';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { 
  Heart, 
  Plus, 
  Trash2, 
  Edit, 
  ShoppingCart,
  Download,
  ExternalLink
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
    id?: string;
    name: string;
    set_code: string;
    type_line: string;
    colors: string[];
    color_identity?: string[];
    rarity: string;
    cmc?: number;
    mana_cost?: string;
    oracle_text?: string;
    power?: string;
    toughness?: string;
    keywords?: string[];
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

interface UserDeck {
  id: string;
  name: string;
  format: string;
  colors: string[];
}

export default function Wishlist() {
  const { user } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [decksLoading, setDecksLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [editForm, setEditForm] = useState({
    quantity: 1,
    priority: 'medium',
    note: ''
  });

  useEffect(() => {
    if (user) {
      loadWishlist();
      loadUserDecks();
    }
  }, [user]);

  const loadWishlist = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // First, load wishlist items without joins to avoid errors
      const { data: wishlistData, error: wishlistError } = await (supabase as any)
        .from('wishlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (wishlistError) throw wishlistError;

      if (!wishlistData || wishlistData.length === 0) {
        setWishlistItems([]);
        return;
      }

      // For now, just use basic card data from card names
      // This will show the wishlist with basic information while we resolve the card data fetching
      const transformedData = wishlistData.map((item: any) => ({
        ...item,
        card: {
          id: item.card_id,
          name: item.card_name,
          type_line: 'Loading...',
          colors: [],
          color_identity: [],
          rarity: 'common',
          image_uris: {},
          prices: { usd: '0.00' },
          set_code: 'UNK'
        }
      }));
      
      setWishlistItems(transformedData);

      // Attempt to fetch additional card data from Scryfall for enhanced display
      if (wishlistData.length > 0) {
        setTimeout(async () => {
          try {
            const updatedItems = await Promise.all(
              wishlistData.map(async (item: any) => {
                try {
                  const response = await fetch(`https://api.scryfall.com/cards/${item.card_id}`);
                  if (response.ok) {
                    const cardData = await response.json();
                    return {
                      ...item,
                      card: cardData
                    };
                  }
                } catch (error) {
                  console.warn(`Failed to fetch card ${item.card_id}:`, error);
                }
                return {
                  ...item,
                  card: {
                    id: item.card_id,
                    name: item.card_name,
                    type_line: 'Unknown',
                    colors: [],
                    color_identity: [],
                    rarity: 'common',
                    image_uris: {},
                    prices: { usd: '0.00' },
                    set_code: 'UNK'
                  }
                };
              })
            );
            setWishlistItems(updatedItems);
          } catch (error) {
            console.warn('Failed to enhance wishlist with card data:', error);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error loading wishlist:', error);
      showError('Failed to load wishlist');
      setWishlistItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadUserDecks = async () => {
    if (!user) return;

    try {
      setDecksLoading(true);
      const { data, error } = await supabase
        .from('user_decks')
        .select('id, name, format, colors')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserDecks(data || []);
    } catch (error) {
      console.error('Error loading user decks:', error);
    } finally {
      setDecksLoading(false);
    }
  };

  const addToWishlist = async (card: any) => {
    if (!user) return;

    try {
      // Check if card already exists in wishlist
      const { data: existing } = await (supabase as any)
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        // Update quantity if already exists
        const { error } = await (supabase as any)
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);

        if (error) throw error;
        showSuccess('Updated Wishlist', `Increased quantity of ${card.name}`);
      } else {
        // Add new item
        const { error } = await (supabase as any)
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium'
          });

        if (error) throw error;
        showSuccess('Added to Wishlist', `${card.name} added to your wishlist`);
      }
      
      loadWishlist();
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist');
    }
  };

  const updateWishlistItem = async () => {
    if (!selectedItem) return;

    try {
      const { error } = await (supabase as any)
        .from('wishlist')
        .update({
          quantity: editForm.quantity,
          priority: editForm.priority,
          note: editForm.note || null
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
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
      const { error } = await (supabase as any)
        .from('wishlist')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
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
      // Add to collection using the collection API
      const { error: collectionError } = await supabase
        .from('user_collections')
        .insert({
          user_id: user.id,
          card_id: item.card_id,
          card_name: item.card_name,
          set_code: item.card.set_code || 'UNK',
          quantity: item.quantity,
          condition: 'near_mint'
        });

      if (collectionError) throw collectionError;

      // Remove from wishlist after successful collection addition
      const { error: wishlistError } = await (supabase as any)
        .from('wishlist')
        .delete()
        .eq('id', item.id);

      if (wishlistError) throw wishlistError;

      showSuccess('Moved to Collection', `${item.card_name} moved from wishlist to collection`);
      
      // Reload wishlist to reflect changes
      loadWishlist();
    } catch (error) {
      console.error('Error moving to collection:', error);
      showError('Failed to move to collection');
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

  const exportToMoxfield = () => {
    const moxfieldFormat = wishlistItems.map(item => 
      `${item.quantity} ${item.card_name}`
    ).join('\n');
    
    const blob = new Blob([moxfieldFormat], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wishlist_moxfield.txt';
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export Complete', 'Wishlist exported for Moxfield');
  };

  const exportToCSV = () => {
    const csvData = [
      'Card Name,Quantity,Priority,Price,Total Value,Note',
      ...wishlistItems.map(item => [
        item.card_name,
        item.quantity,
        item.priority,
        item.card?.prices?.usd || '0',
        (parseFloat(item.card?.prices?.usd || '0') * item.quantity).toFixed(2),
        item.note || ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wishlist.csv';
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Export Complete', 'Wishlist exported as CSV');
  };

  const getWishlistForDeck = (deck: UserDeck) => {
    return wishlistItems.filter(item => {
      // Get the card's color identity - try multiple sources
      let cardColors: string[] = [];
      
      if (item.card?.color_identity && Array.isArray(item.card.color_identity)) {
        cardColors = item.card.color_identity;
      } else if (item.card?.colors && Array.isArray(item.card.colors)) {
        cardColors = item.card.colors;
      }
      
      // Debug logging to see what we're working with
      console.log(`Checking card "${item.card_name}" for deck "${deck.name}":`, {
        cardColors,
        deckColors: deck.colors,
        cardData: item.card
      });
      
      // If deck has no colors (colorless), include all colorless cards and artifacts
      if (deck.colors.length === 0) {
        return cardColors.length === 0 || 
               (item.card?.type_line && item.card.type_line.toLowerCase().includes('artifact'));
      }
      
      // If card has no colors, it can go in any deck (colorless/artifact cards)
      if (cardColors.length === 0) {
        return true;
      }
      
      // Check if all card colors are contained within the deck's color identity
      const isCompatible = cardColors.every(color => deck.colors.includes(color));
      
      console.log(`Card "${item.card_name}" compatibility:`, {
        cardColors,
        deckColors: deck.colors,
        isCompatible
      });
      
      return isCompatible;
    });
  };

  const getDeckWishlistValue = (deck: UserDeck) => {
    const deckWishlist = getWishlistForDeck(deck);
    return deckWishlist.reduce((sum, item) => {
      const price = parseFloat(item.card?.prices?.usd || '0');
      return sum + (price * item.quantity);
    }, 0);
  };

  // Convert wishlist items to card format for UniversalCardDisplay
  const formatWishlistItemsAsCards = (items: WishlistItem[]) => {
    return items.map(item => ({
      // Use the full card data from the join
      ...item.card,
      id: item.card?.id || item.card_id,
      name: item.card?.name || item.card_name,
      // Add wishlist-specific metadata
      wishlistQuantity: item.quantity,
      wishlistPriority: item.priority,
      wishlistNote: item.note,
      wishlistId: item.id,
      // Ensure we have the required fields
      type_line: item.card?.type_line || 'Unknown',
      colors: item.card?.colors || [],
      rarity: item.card?.rarity || 'common',
      image_uris: item.card?.image_uris || {},
      prices: item.card?.prices || {}
    }));
  };

  const handleCardAdd = (card: any) => {
    // Find the original wishlist item
    const wishlistItem = wishlistItems.find(item => item.id === card.wishlistId);
    if (wishlistItem) {
      addToCollection(wishlistItem);
    }
  };

  const handleCardClick = (card: any) => {
    // Find the original wishlist item
    const wishlistItem = wishlistItems.find(item => item.id === card.wishlistId);
    if (wishlistItem) {
      openEditDialog(wishlistItem);
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToMoxfield}>
              <Download className="h-4 w-4 mr-2" />
              Moxfield
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="wishlist">My Wishlist</TabsTrigger>
          <TabsTrigger value="by-deck">By Deck</TabsTrigger>
          <TabsTrigger value="search">Add Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="wishlist" className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i}>
                  <div className="aspect-[5/7] bg-muted animate-pulse"></div>
                  <CardContent className="p-3">
                    <div className="h-4 bg-muted rounded animate-pulse mb-2"></div>
                    <div className="h-3 bg-muted rounded animate-pulse"></div>
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
            <UniversalCardDisplay
              cards={formatWishlistItemsAsCards(wishlistItems)}
              viewMode={viewMode}
              onCardClick={handleCardClick}
              onCardAdd={handleCardAdd}
              showWishlistButton={false}
            />
          )}
        </TabsContent>

        {/* By Deck Tab */}
        <TabsContent value="by-deck" className="space-y-6">
          {decksLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-3">
                      <div className="h-6 bg-muted rounded w-1/3"></div>
                      <div className="h-4 bg-muted rounded w-2/3"></div>
                      <div className="h-8 bg-muted rounded"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : userDecks.length === 0 ? (
            <Card className="p-12 text-center">
              <h3 className="text-lg font-medium mb-2">No decks found</h3>
              <p className="text-muted-foreground mb-4">
                Create some decks to see wishlist recommendations for each deck
              </p>
              <Button onClick={() => window.location.href = '/decks'}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Deck
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {userDecks.map((deck) => {
                const deckWishlist = getWishlistForDeck(deck);
                const deckValue = getDeckWishlistValue(deck);
                
                return (
                  <Card key={deck.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">{deck.name}</h3>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">
                                {deck.format}
                              </Badge>
                              <div className="flex gap-1">
                                {deck.colors.length > 0 ? deck.colors.map((color, index) => (
                                  <div
                                    key={index}
                                    className={`w-4 h-4 rounded-full border ${
                                      color === 'W' ? 'bg-yellow-100 border-yellow-400' :
                                      color === 'U' ? 'bg-blue-500 border-blue-600' :
                                      color === 'B' ? 'bg-gray-800 border-gray-900' :
                                      color === 'R' ? 'bg-red-500 border-red-600' :
                                      color === 'G' ? 'bg-green-500 border-green-600' :
                                      'bg-gray-400 border-gray-500'
                                    }`}
                                  />
                                )) : (
                                  <div className="text-xs text-muted-foreground">Colorless</div>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                (Colors: {deck.colors.length > 0 ? deck.colors.join(', ') : 'None'})
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Wishlist Value</div>
                          <div className="text-lg font-bold text-green-600">
                            ${deckValue.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {deckWishlist.length} cards
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                        <h4 className="text-sm font-medium mb-2">Debug Info:</h4>
                        <div className="text-xs space-y-1">
                          <div>Total Wishlist Items: {wishlistItems.length}</div>
                          <div>Deck Colors: [{deck.colors.join(', ')}]</div>
                          <div>Compatible Cards Found: {deckWishlist.length}</div>
                          <div>Compatible Card Names: {deckWishlist.map(item => item.card_name).join(', ') || 'None'}</div>
                        </div>
                      </div>
                      
                      {deckWishlist.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">Compatible Wishlist Cards</h4>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const cardNames = deckWishlist.map(item => 
                                  `${item.quantity} ${item.card_name}`
                                ).join('\n');
                                
                                const blob = new Blob([cardNames], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${deck.name}_wishlist.txt`;
                                a.click();
                                URL.revokeObjectURL(url);
                                showSuccess('Export Complete', `${deck.name} wishlist exported`);
                              }}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Export
                            </Button>
                          </div>
                          
                          <UniversalCardDisplay
                            cards={formatWishlistItemsAsCards(deckWishlist)}
                            viewMode="compact"
                            onCardClick={handleCardClick}
                            onCardAdd={handleCardAdd}
                            compact={true}
                            showWishlistButton={false}
                          />
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No wishlist cards are compatible with this deck's colors</p>
                          <p className="text-sm mt-1">
                            This deck uses colors: {deck.colors.length > 0 ? deck.colors.join(', ') : 'None (Colorless)'}
                          </p>
                          <p className="text-xs mt-2">
                            Add cards to your wishlist that match or are colorless!
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <EnhancedUniversalCardSearch
            onCardAdd={addToWishlist}
            onCardWishlist={addToWishlist}
            onCardSelect={(card) => console.log('Selected:', card)}
            placeholder="Search cards to add to your wishlist..."
            showFilters={true}
            showAddButton={false}
            showWishlistButton={true}
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