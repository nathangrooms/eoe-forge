import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { 
  Heart, 
  Plus, 
  Download,
  ExternalLink,
  ShoppingCart,
  TrendingDown,
  Bell,
  DollarSign,
  Package,
  Filter,
  Grid3X3,
  List,
  AlertTriangle,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { WishlistImportFromURL } from '@/components/wishlist/WishlistImportFromURL';
import { WishlistDeckNeeds } from '@/components/wishlist/WishlistDeckNeeds';
import { cn } from '@/lib/utils';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  created_at: string;
  target_price_usd?: number;
  alert_enabled?: boolean;
  last_notified_at?: string;
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
      eur?: string;
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

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'high', label: 'High Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'low', label: 'Low Priority' },
];

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'name-asc', label: 'Name: A-Z' },
  { value: 'priority', label: 'Priority' },
];

export default function Wishlist() {
  const { user } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [decksLoading, setDecksLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [activeTab, setActiveTab] = useState('wishlist');

  useEffect(() => {
    if (user) {
      loadWishlist();
      loadUserDecks();
    }
    
    const handleWishlistUpdate = () => loadWishlist();
    window.addEventListener('wishlist-updated', handleWishlistUpdate);
    return () => window.removeEventListener('wishlist-updated', handleWishlistUpdate);
  }, [user]);

  const loadWishlist = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Single optimized query with join
      const { data: wishlistData, error: wishlistError } = await supabase
        .from('wishlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (wishlistError) throw wishlistError;

      if (!wishlistData || wishlistData.length === 0) {
        setWishlistItems([]);
        return;
      }

      // Batch fetch card details efficiently
      const cardIds = [...new Set(wishlistData.map(item => item.card_id))];
      
      const { data: cardsData } = await supabase
        .from('cards')
        .select('id, name, set_code, type_line, colors, color_identity, rarity, cmc, mana_cost, prices, image_uris')
        .in('id', cardIds);

      const cardsMap = new Map(cardsData?.map(card => [card.id, card]) || []);

      const transformedData = wishlistData.map((item: any) => ({
        ...item,
        card: cardsMap.get(item.card_id) || {
          id: item.card_id,
          name: item.card_name,
          type_line: 'Unknown',
          colors: [],
          rarity: 'common',
          image_uris: {},
          prices: {},
          set_code: 'UNK'
        }
      }));
      
      setWishlistItems(transformedData);
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

  // Memoized filtered and sorted items
  const filteredItems = useMemo(() => {
    let items = [...wishlistItems];
    
    // Apply priority filter
    if (priorityFilter !== 'all') {
      items = items.filter(item => item.priority === priorityFilter);
    }
    
    // Apply sorting
    items.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price-desc':
          return parseFloat(b.card?.prices?.usd || '0') - parseFloat(a.card?.prices?.usd || '0');
        case 'price-asc':
          return parseFloat(a.card?.prices?.usd || '0') - parseFloat(b.card?.prices?.usd || '0');
        case 'name-asc':
          return a.card_name.localeCompare(b.card_name);
        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                 (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
        default:
          return 0;
      }
    });
    
    return items;
  }, [wishlistItems, priorityFilter, sortBy]);

  // Stats calculations
  const stats = useMemo(() => {
    const totalValue = wishlistItems.reduce((sum, item) => {
      const price = parseFloat(item.card?.prices?.usd || '0');
      return sum + (price * item.quantity);
    }, 0);
    
    const highPriorityCount = wishlistItems.filter(i => i.priority === 'high').length;
    const alertsEnabled = wishlistItems.filter(i => i.alert_enabled && i.target_price_usd).length;
    const priceDrops = wishlistItems.filter(i => {
      if (!i.target_price_usd || !i.card?.prices?.usd) return false;
      return parseFloat(i.card.prices.usd) <= i.target_price_usd;
    }).length;
    
    return { totalValue, highPriorityCount, alertsEnabled, priceDrops };
  }, [wishlistItems]);

  const addToWishlist = async (card: any) => {
    if (!user) return;

    try {
      const { data: existing } = await supabase
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
        showSuccess('Updated Wishlist', `Increased quantity of ${card.name}`);
      } else {
        await supabase
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium'
          });
        showSuccess('Added to Wishlist', `${card.name} added`);
      }
      
      loadWishlist();
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist');
    }
  };

  const removeFromWishlist = async (itemId: string) => {
    try {
      await supabase.from('wishlist').delete().eq('id', itemId);
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
      await supabase.from('user_collections').insert({
        user_id: user.id,
        card_id: item.card_id,
        card_name: item.card_name,
        set_code: item.card.set_code || 'UNK',
        quantity: item.quantity,
        condition: 'near_mint'
      });

      await supabase.from('wishlist').delete().eq('id', item.id);
      showSuccess('Moved to Collection', `${item.card_name} moved from wishlist to collection`);
      loadWishlist();
    } catch (error) {
      console.error('Error moving to collection:', error);
      showError('Failed to move to collection');
    }
  };

  const openBuyLinks = (item: WishlistItem) => {
    const cardName = encodeURIComponent(item.card_name);
    const setCode = item.card?.set_code?.toUpperCase() || '';
    
    // TCGPlayer affiliate-ready link structure
    const tcgPlayerUrl = `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${cardName}&view=grid`;
    window.open(tcgPlayerUrl, '_blank');
  };

  const exportToCSV = () => {
    const csvData = [
      'Card Name,Quantity,Priority,Set,Price USD,Total Value,Target Price,Note',
      ...wishlistItems.map(item => [
        `"${item.card_name}"`,
        item.quantity,
        item.priority,
        item.card?.set_code?.toUpperCase() || 'UNK',
        item.card?.prices?.usd || '0',
        (parseFloat(item.card?.prices?.usd || '0') * item.quantity).toFixed(2),
        item.target_price_usd || '',
        `"${item.note || ''}"`
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

  const getWishlistForDeck = (deck: UserDeck) => {
    return wishlistItems.filter(item => {
      const cardColors = item.card?.color_identity || item.card?.colors || [];
      if (deck.colors.length === 0) {
        return cardColors.length === 0 || item.card?.type_line?.toLowerCase().includes('artifact');
      }
      if (cardColors.length === 0) return true;
      return cardColors.every(color => deck.colors.includes(color));
    });
  };

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'low': return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const isPriceBelowTarget = (item: WishlistItem) => {
    if (!item.target_price_usd || !item.card?.prices?.usd) return false;
    return parseFloat(item.card.prices.usd) <= item.target_price_usd;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Heart className="h-6 w-6 text-red-500" />
              Wishlist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track cards you want and find the best prices
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportToMoxfield}>
              <Download className="h-4 w-4 mr-2" />
              Moxfield
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-lg font-bold text-green-500">${stats.totalValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Cards</p>
                  <p className="text-lg font-bold">{wishlistItems.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">High Priority</p>
                  <p className="text-lg font-bold">{stats.highPriorityCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  stats.priceDrops > 0 ? "bg-green-500/10" : "bg-amber-500/10"
                )}>
                  <TrendingDown className={cn(
                    "h-5 w-5",
                    stats.priceDrops > 0 ? "text-green-500" : "text-amber-500"
                  )} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price Drops</p>
                  <p className={cn(
                    "text-lg font-bold",
                    stats.priceDrops > 0 ? "text-green-500" : ""
                  )}>{stats.priceDrops}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="wishlist" className="data-[state=active]:bg-background">
                <Heart className="h-4 w-4 mr-2" />
                My Wishlist
              </TabsTrigger>
              <TabsTrigger value="by-deck" className="data-[state=active]:bg-background">
                <Sparkles className="h-4 w-4 mr-2" />
                By Deck
              </TabsTrigger>
              <TabsTrigger value="add" className="data-[state=active]:bg-background">
                <Plus className="h-4 w-4 mr-2" />
                Add Cards
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'wishlist' && (
              <div className="flex items-center gap-2">
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px] h-9">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[160px] h-9">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Wishlist Tab */}
          <TabsContent value="wishlist" className="mt-0">
            {/* Import & Deck Needs */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <WishlistImportFromURL onImportComplete={loadWishlist} />
              <WishlistDeckNeeds />
            </div>
            
            {loading ? (
              <div className={cn(
                viewMode === 'grid' 
                  ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                  : "space-y-3"
              )}>
                {[...Array(8)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-[5/7]" />
                    <CardContent className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-medium mb-2">
                  {priorityFilter !== 'all' ? 'No cards match your filter' : 'Your wishlist is empty'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {priorityFilter !== 'all' 
                    ? 'Try changing the priority filter'
                    : 'Start adding cards you want to collect'}
                </p>
                <Button onClick={() => setActiveTab('add')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Cards
                </Button>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredItems.map((item) => (
                  <Card 
                    key={item.id} 
                    className="overflow-hidden group hover:shadow-lg transition-all hover:border-primary/50"
                  >
                    <div className="aspect-[5/7] relative bg-muted">
                      {item.card?.image_uris?.normal ? (
                        <img 
                          src={item.card.image_uris.normal}
                          alt={item.card_name}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowCardModal(true);
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center text-muted-foreground cursor-pointer"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowCardModal(true);
                          }}
                        >
                          No Image
                        </div>
                      )}
                      
                      {/* Priority Badge */}
                      <Badge 
                        className={cn(
                          "absolute top-2 left-2 text-xs",
                          getPriorityStyles(item.priority)
                        )}
                      >
                        {item.priority}
                      </Badge>
                      
                      {/* Price Drop Indicator */}
                      {isPriceBelowTarget(item) && (
                        <Badge className="absolute top-2 right-2 bg-green-500 text-white">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Deal!
                        </Badge>
                      )}
                      
                      {/* Quick Actions Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => openBuyLinks(item)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <ShoppingCart className="h-4 w-4 mr-1" />
                          Buy
                        </Button>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => addToCollection(item)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <CardContent className="p-3">
                      <h3 
                        className="font-medium text-sm truncate cursor-pointer hover:text-primary"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowCardModal(true);
                        }}
                      >
                        {item.card_name}
                      </h3>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {item.card?.set_code?.toUpperCase() || 'UNK'}
                        </span>
                        <span className={cn(
                          "text-sm font-medium",
                          isPriceBelowTarget(item) ? "text-green-500" : ""
                        )}>
                          {item.card?.prices?.usd ? `$${item.card.prices.usd}` : 'N/A'}
                        </span>
                      </div>
                      {item.quantity > 1 && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          ×{item.quantity}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="overflow-hidden hover:border-primary/50 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                          {item.card?.image_uris?.small ? (
                            <img 
                              src={item.card.image_uris.small}
                              alt={item.card_name}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => {
                                setSelectedItem(item);
                                setShowCardModal(true);
                              }}
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                              N/A
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 
                            className="font-medium truncate cursor-pointer hover:text-primary"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowCardModal(true);
                            }}
                          >
                            {item.card_name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {item.card?.set_code?.toUpperCase() || 'UNK'}
                            </Badge>
                            <Badge className={cn("text-xs", getPriorityStyles(item.priority))}>
                              {item.priority}
                            </Badge>
                            {item.quantity > 1 && (
                              <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className={cn(
                            "font-medium",
                            isPriceBelowTarget(item) ? "text-green-500" : ""
                          )}>
                            {item.card?.prices?.usd ? `$${item.card.prices.usd}` : 'N/A'}
                          </div>
                          {isPriceBelowTarget(item) && (
                            <Badge className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              Below Target
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => openBuyLinks(item)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <ShoppingCart className="h-4 w-4 mr-1" />
                            Buy
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => addToCollection(item)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* By Deck Tab */}
          <TabsContent value="by-deck" className="mt-0">
            {decksLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-1/3 mb-3" />
                      <Skeleton className="h-4 w-2/3 mb-4" />
                      <Skeleton className="h-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : userDecks.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-medium mb-2">No decks found</h3>
                <p className="text-muted-foreground mb-4">
                  Create decks to see which wishlist cards fit each deck
                </p>
                <Button onClick={() => window.location.href = '/decks'}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Deck
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {userDecks.map((deck) => {
                  const deckWishlist = getWishlistForDeck(deck);
                  if (deckWishlist.length === 0) return null;
                  
                  const deckValue = deckWishlist.reduce((sum, item) => {
                    return sum + (parseFloat(item.card?.prices?.usd || '0') * item.quantity);
                  }, 0);
                  
                  return (
                    <Card key={deck.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold">{deck.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                {deck.format}
                              </Badge>
                              <div className="flex gap-0.5">
                                {deck.colors.map((color, i) => (
                                  <div
                                    key={i}
                                    className={cn(
                                      "w-4 h-4 rounded-full border",
                                      color === 'W' ? 'bg-amber-100 border-amber-400' :
                                      color === 'U' ? 'bg-blue-500 border-blue-600' :
                                      color === 'B' ? 'bg-gray-800 border-gray-900' :
                                      color === 'R' ? 'bg-red-500 border-red-600' :
                                      color === 'G' ? 'bg-green-500 border-green-600' :
                                      'bg-gray-400'
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-green-500">
                              ${deckValue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {deckWishlist.length} cards needed
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {deckWishlist.slice(0, 8).map((item) => (
                            <div
                              key={item.id}
                              className="w-16 h-22 bg-muted rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                              onClick={() => {
                                setSelectedItem(item);
                                setShowCardModal(true);
                              }}
                            >
                              {item.card?.image_uris?.small ? (
                                <img 
                                  src={item.card.image_uris.small}
                                  alt={item.card_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-1 text-center">
                                  {item.card_name.split(' ').slice(0, 2).join(' ')}
                                </div>
                              )}
                            </div>
                          ))}
                          {deckWishlist.length > 8 && (
                            <div className="w-16 h-22 bg-muted rounded flex items-center justify-center text-sm text-muted-foreground">
                              +{deckWishlist.length - 8}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                
                {userDecks.every(deck => getWishlistForDeck(deck).length === 0) && (
                  <Card className="p-12 text-center border-dashed">
                    <h3 className="text-lg font-medium mb-2">No matching cards</h3>
                    <p className="text-muted-foreground">
                      None of your wishlist cards match your deck color identities
                    </p>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Add Cards Tab */}
          <TabsContent value="add" className="mt-0">
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

        {/* Card Modal */}
        {selectedItem && (
          <UniversalCardModal
            card={selectedItem.card || { 
              id: selectedItem.card_id, 
              name: selectedItem.card_name, 
              type_line: '', 
              colors: [], 
              rarity: 'common' 
            }}
            isOpen={showCardModal}
            onClose={() => {
              setShowCardModal(false);
              setSelectedItem(null);
            }}
            onAddToCollection={() => addToCollection(selectedItem)}
            onAddToWishlist={() => {}}
          />
        )}
      </div>
    </div>
  );
}
