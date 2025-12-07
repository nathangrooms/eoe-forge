import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { 
  Heart, 
  Plus, 
  Download,
  Grid3X3,
  List,
  LayoutGrid,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  X
} from 'lucide-react';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { WishlistQuickStats } from '@/components/wishlist/WishlistQuickStats';
import { WishlistCardGrid } from '@/components/wishlist/WishlistCardGrid';
import { WishlistListView } from '@/components/wishlist/WishlistListView';
import { WishlistByDeck } from '@/components/wishlist/WishlistByDeck';
import { WishlistEmptyState } from '@/components/wishlist/WishlistEmptyState';
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

type ViewMode = 'grid' | 'compact' | 'list';
type SortOption = 'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'name-asc' | 'priority';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest' },
  { value: 'date-asc', label: 'Oldest' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'name-asc', label: 'Name' },
  { value: 'priority', label: 'Priority' },
];

const PRIORITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export default function Wishlist() {
  const { user } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [decksLoading, setDecksLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  
  // View & filter state
  const [activeTab, setActiveTab] = useState('wishlist');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Load data
  useEffect(() => {
    if (user) {
      loadWishlist();
      loadUserDecks();
    }
    
    const handleUpdate = () => loadWishlist();
    window.addEventListener('wishlist-updated', handleUpdate);
    return () => window.removeEventListener('wishlist-updated', handleUpdate);
  }, [user]);

  const loadWishlist = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const { data: wishlistData, error } = await supabase
        .from('wishlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!wishlistData?.length) {
        setWishlistItems([]);
        return;
      }

      // Batch fetch cards
      const cardIds = [...new Set(wishlistData.map(i => i.card_id))];
      const { data: cardsData } = await supabase
        .from('cards')
        .select('id, name, set_code, type_line, colors, color_identity, rarity, cmc, mana_cost, prices, image_uris')
        .in('id', cardIds);

      const cardsMap = new Map(cardsData?.map(c => [c.id, c]) || []);

      setWishlistItems(wishlistData.map(item => {
        const cardData = cardsMap.get(item.card_id);
        return {
          ...item,
          card: cardData ? {
            id: cardData.id,
            name: cardData.name,
            set_code: cardData.set_code,
            type_line: cardData.type_line,
            colors: cardData.colors || [],
            color_identity: cardData.color_identity || [],
            rarity: cardData.rarity || 'common',
            cmc: cardData.cmc || 0,
            mana_cost: cardData.mana_cost || '',
            prices: (cardData.prices as any) || {},
            image_uris: (cardData.image_uris as any) || {},
          } : {
            name: item.card_name,
            set_code: 'UNK',
            type_line: 'Unknown',
            colors: [],
            rarity: 'common',
            prices: {},
            image_uris: {},
          }
        };
      }));
    } catch (error) {
      console.error('Error loading wishlist:', error);
      showError('Failed to load wishlist');
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
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setUserDecks(data || []);
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setDecksLoading(false);
    }
  };

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    let items = [...wishlistItems];
    
    if (priorityFilter !== 'all') {
      items = items.filter(i => i.priority === priorityFilter);
    }
    
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
        case 'priority': {
          const order = { high: 0, medium: 1, low: 2 };
          return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
        }
        default:
          return 0;
      }
    });
    
    return items;
  }, [wishlistItems, priorityFilter, sortBy]);

  // Actions
  const addToWishlist = useCallback(async (card: any) => {
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
        showSuccess('Updated', `Increased quantity of ${card.name}`);
      } else {
        await supabase
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium',
            alert_enabled: true,
          });
        showSuccess('Added', `${card.name} added to wishlist`);
      }
      
      loadWishlist();
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist');
    }
  }, [user]);

  const removeFromWishlist = useCallback(async (itemId: string) => {
    try {
      await supabase.from('wishlist').delete().eq('id', itemId);
      showSuccess('Removed', 'Card removed from wishlist');
      loadWishlist();
    } catch (error) {
      console.error('Error removing:', error);
      showError('Failed to remove');
    }
  }, []);

  const updatePriority = useCallback(async (itemId: string, priority: string) => {
    try {
      await supabase.from('wishlist').update({ priority }).eq('id', itemId);
      loadWishlist();
    } catch (error) {
      console.error('Error updating priority:', error);
    }
  }, []);

  const updateTargetPrice = useCallback(async (itemId: string, price: number | null) => {
    try {
      await supabase.from('wishlist').update({ target_price_usd: price }).eq('id', itemId);
      showSuccess('Updated', 'Target price set');
      loadWishlist();
    } catch (error) {
      console.error('Error updating target price:', error);
    }
  }, []);

  const toggleAlert = useCallback(async (itemId: string, enabled: boolean) => {
    try {
      await supabase.from('wishlist').update({ alert_enabled: enabled }).eq('id', itemId);
      loadWishlist();
    } catch (error) {
      console.error('Error toggling alert:', error);
    }
  }, []);

  const addToCollection = useCallback(async (item: WishlistItem) => {
    if (!user || !item.card) return;

    try {
      await supabase.from('user_collections').insert({
        user_id: user.id,
        card_id: item.card_id,
        card_name: item.card_name,
        set_code: item.card.set_code || 'UNK',
        quantity: item.quantity,
        condition: 'near_mint',
      });

      await supabase.from('wishlist').delete().eq('id', item.id);
      showSuccess('Moved', `${item.card_name} moved to collection`);
      loadWishlist();
    } catch (error) {
      console.error('Error moving to collection:', error);
      showError('Failed to move to collection');
    }
  }, [user]);

  const openBuyLink = useCallback((item: WishlistItem) => {
    const cardName = encodeURIComponent(item.card_name);
    const tcgPlayerUrl = `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${cardName}&view=grid`;
    window.open(tcgPlayerUrl, '_blank');
  }, []);

  const handleBuyAll = useCallback((items: WishlistItem[]) => {
    // Open TCGPlayer mass entry or shopping list
    const cardList = items.map(i => `${i.quantity} ${i.card_name}`).join('\n');
    const tcgUrl = `https://www.tcgplayer.com/massentry?productline=Magic`;
    window.open(tcgUrl, '_blank');
    // Could also copy card list to clipboard
    navigator.clipboard.writeText(cardList);
    showSuccess('Copied', 'Card list copied to clipboard');
  }, []);

  const exportToCSV = useCallback(() => {
    const csv = [
      'Card Name,Quantity,Priority,Set,Price USD,Total,Target Price,Note',
      ...wishlistItems.map(i => [
        `"${i.card_name}"`,
        i.quantity,
        i.priority,
        i.card?.set_code?.toUpperCase() || 'UNK',
        i.card?.prices?.usd || '0',
        (parseFloat(i.card?.prices?.usd || '0') * i.quantity).toFixed(2),
        i.target_price_usd || '',
        `"${i.note || ''}"`,
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wishlist.csv';
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Exported', 'Wishlist exported as CSV');
  }, [wishlistItems]);

  const handleCardClick = useCallback((item: WishlistItem) => {
    setSelectedItem(item);
    setShowCardModal(true);
  }, []);

  const hasActiveFilter = priorityFilter !== 'all';

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Heart className="h-6 w-6 text-rose-500" />
              Wishlist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track prices, set alerts, and find the best deals
            </p>
          </div>
          
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Quick Stats */}
        <WishlistQuickStats items={wishlistItems} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="bg-muted/50 p-1 h-auto">
              <TabsTrigger value="wishlist" className="gap-2 data-[state=active]:bg-background">
                <Heart className="h-4 w-4" />
                <span className="hidden sm:inline">My Cards</span>
                {wishlistItems.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {wishlistItems.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="by-deck" className="gap-2 data-[state=active]:bg-background">
                <Layers className="h-4 w-4" />
                <span className="hidden sm:inline">By Deck</span>
              </TabsTrigger>
              <TabsTrigger value="add" className="gap-2 data-[state=active]:bg-background">
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Add Cards</span>
              </TabsTrigger>
            </TabsList>

            {/* View Controls - Only on wishlist tab */}
            {activeTab === 'wishlist' && wishlistItems.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Priority Filter */}
                <div className="flex items-center gap-1 border rounded-lg p-0.5">
                  {PRIORITY_FILTERS.map((f) => (
                    <Button
                      key={f.value}
                      size="sm"
                      variant={priorityFilter === f.value ? 'secondary' : 'ghost'}
                      className={cn(
                        "h-7 px-2 text-xs",
                        priorityFilter === f.value && f.value === 'high' && "text-rose-500",
                        priorityFilter === f.value && f.value === 'medium' && "text-amber-500",
                        priorityFilter === f.value && f.value === 'low' && "text-slate-500"
                      )}
                      onClick={() => setPriorityFilter(f.value as PriorityFilter)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                {/* Sort */}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* View Toggle */}
                <div className="flex border rounded-lg p-0.5">
                  <Button
                    size="sm"
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    className="h-7 px-2"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
                    className="h-7 px-2"
                    onClick={() => setViewMode('compact')}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    className="h-7 px-2"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Wishlist Tab */}
          <TabsContent value="wishlist" className="mt-4">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-[5/7] rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <WishlistEmptyState
                hasFilter={hasActiveFilter}
                onClearFilter={() => setPriorityFilter('all')}
                onAddCards={() => setActiveTab('add')}
              />
            ) : viewMode === 'list' ? (
              <WishlistListView
                items={filteredItems}
                onCardClick={handleCardClick}
                onBuy={openBuyLink}
                onAddToCollection={addToCollection}
                onRemove={removeFromWishlist}
                onUpdatePriority={updatePriority}
                onUpdateTargetPrice={updateTargetPrice}
                onToggleAlert={toggleAlert}
              />
            ) : (
              <WishlistCardGrid
                items={filteredItems}
                viewMode={viewMode}
                onCardClick={handleCardClick}
                onBuy={openBuyLink}
                onAddToCollection={addToCollection}
                onRemove={removeFromWishlist}
                onUpdatePriority={updatePriority}
                onUpdateTargetPrice={updateTargetPrice}
                onToggleAlert={toggleAlert}
              />
            )}
          </TabsContent>

          {/* By Deck Tab */}
          <TabsContent value="by-deck" className="mt-4">
            <WishlistByDeck
              wishlistItems={wishlistItems}
              userDecks={userDecks}
              loading={decksLoading}
              onCardClick={handleCardClick}
              onBuyAll={handleBuyAll}
              onNavigateToDeck={(deckId) => window.location.href = `/decks?deck=${deckId}`}
            />
          </TabsContent>

          {/* Add Cards Tab */}
          <TabsContent value="add" className="mt-4">
            <EnhancedUniversalCardSearch
              onCardWishlist={addToWishlist}
              showWishlistButton={true}
            />
          </TabsContent>
        </Tabs>

        {/* Card Modal */}
        {selectedItem && selectedItem.card && (
          <UniversalCardModal
            card={{
              id: selectedItem.card_id,
              name: selectedItem.card_name,
              ...selectedItem.card,
            }}
            isOpen={showCardModal}
            onClose={() => setShowCardModal(false)}
          />
        )}
      </div>
    </div>
  );
}
