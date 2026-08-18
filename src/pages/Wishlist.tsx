import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  Heart,
  Download,
  Grid3X3,
  List,
  LayoutGrid,
  Layers,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { WishlistQuickStats } from '@/components/wishlist/WishlistQuickStats';
import { WishlistCardGrid } from '@/components/wishlist/WishlistCardGrid';
import { WishlistListView } from '@/components/wishlist/WishlistListView';
import { WishlistByDeck, type DeckGap, type DeckGapCard } from '@/components/wishlist/WishlistByDeck';
import { WishlistEmptyState } from '@/components/wishlist/WishlistEmptyState';
import {
  MoveToCollectionDialog,
  type MoveToCollectionValues,
} from '@/components/wishlist/MoveToCollectionDialog';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
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
    prices?: { usd?: string; usd_foil?: string; eur?: string };
    image_uris?: { small?: string; normal?: string };
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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest' },
  { value: 'date-asc', label: 'Oldest' },
  { value: 'price-desc', label: 'Price high' },
  { value: 'price-asc', label: 'Price low' },
  { value: 'name-asc', label: 'Name' },
  { value: 'priority', label: 'Priority' },
];

const PRIORITY_FILTERS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export default function Wishlist() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [deckGaps, setDeckGaps] = useState<DeckGap[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [gapsLoading, setGapsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<WishlistItem | null>(null);
  const [moving, setMoving] = useState(false);

  const [activeTab, setActiveTab] = useState('wishlist');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  // The wishlist could previously only be filtered by priority, on a list that
  // can run to hundreds of cards.
  const [query, setQuery] = useState('');

  const loadWishlist = useCallback(async () => {
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

      const cardIds = [...new Set(wishlistData.map(i => i.card_id))];
      const { data: cardsData } = await supabase
        .from('cards')
        .select(
          'id, name, set_code, type_line, colors, color_identity, rarity, cmc, mana_cost, prices, image_uris'
        )
        .in('id', cardIds);

      const cardsMap = new Map((cardsData ?? []).map(c => [c.id, c]));

      setWishlistItems(
        wishlistData.map(item => {
          const cardData = cardsMap.get(item.card_id);
          return {
            ...item,
            card: cardData
              ? {
                  id: cardData.id,
                  name: cardData.name,
                  set_code: cardData.set_code,
                  type_line: cardData.type_line,
                  colors: cardData.colors || [],
                  color_identity: cardData.color_identity || [],
                  rarity: cardData.rarity || 'common',
                  cmc: cardData.cmc || 0,
                  mana_cost: cardData.mana_cost || '',
                  prices: (cardData.prices as WishlistItem['card']['prices']) || {},
                  image_uris: (cardData.image_uris as WishlistItem['card']['image_uris']) || {},
                }
              : {
                  name: item.card_name,
                  set_code: '',
                  type_line: '',
                  colors: [],
                  rarity: 'common',
                  prices: {},
                  image_uris: {},
                },
          } as WishlistItem;
        })
      );
    } catch (error) {
      console.error('Error loading wishlist:', error);
      showError('Error', 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Real deck gaps: for each deck, the list's required quantity minus the copies
   * already in the collection. Wishlist membership is annotated, not assumed.
   */
  const loadDeckGaps = useCallback(async () => {
    if (!user) return;
    try {
      setGapsLoading(true);

      const { data: decks, error: decksError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (decksError) throw decksError;
      setUserDecks(decks ?? []);

      if (!decks?.length) {
        setDeckGaps([]);
        return;
      }

      const [{ data: deckCards }, { data: owned }, { data: wishlistRows }] = await Promise.all([
        supabase
          .from('deck_cards')
          .select('deck_id, card_id, card_name, quantity')
          .in(
            'deck_id',
            decks.map(d => d.id)
          )
          .eq('is_sideboard', false),
        supabase
          .from('user_collections')
          .select('card_id, quantity, foil')
          .eq('user_id', user.id),
        supabase.from('wishlist').select('id, card_id').eq('user_id', user.id),
      ]);

      const ownedByCard = new Map<string, number>();
      for (const row of owned ?? []) {
        ownedByCard.set(
          row.card_id,
          (ownedByCard.get(row.card_id) ?? 0) + (row.quantity ?? 0) + (row.foil ?? 0)
        );
      }

      const wishlistByCard = new Map((wishlistRows ?? []).map(r => [r.card_id, r.id]));

      const neededIds = [
        ...new Set(
          (deckCards ?? [])
            .filter(dc => (dc.quantity ?? 0) > (ownedByCard.get(dc.card_id) ?? 0))
            .map(dc => dc.card_id)
        ),
      ];

      const priceById = new Map<string, { price: number; image?: string }>();
      if (neededIds.length > 0) {
        const { data: cardRows } = await supabase
          .from('cards')
          .select('id, prices, image_uris')
          .in('id', neededIds);
        for (const row of cardRows ?? []) {
          const prices = (row.prices ?? {}) as Record<string, string | null>;
          const images = (row.image_uris ?? {}) as Record<string, string>;
          priceById.set(row.id, {
            price: toNumber(prices.usd),
            image: images.small ?? images.normal,
          });
        }
      }

      const gaps: DeckGap[] = decks
        .map(deck => {
          const cards: DeckGapCard[] = (deckCards ?? [])
            .filter(dc => dc.deck_id === deck.id)
            .map(dc => {
              const ownedQty = ownedByCard.get(dc.card_id) ?? 0;
              const required = dc.quantity ?? 0;
              const meta = priceById.get(dc.card_id);
              return {
                cardId: dc.card_id,
                name: dc.card_name,
                required,
                owned: ownedQty,
                missing: required - ownedQty,
                price: meta?.price ?? 0,
                imageUrl: meta?.image,
                onWishlist: wishlistByCard.has(dc.card_id),
                wishlistItemId: wishlistByCard.get(dc.card_id),
              };
            })
            .filter(card => card.missing > 0)
            .sort((a, b) => b.price * b.missing - a.price * a.missing);

          return {
            deckId: deck.id,
            name: deck.name,
            format: deck.format,
            colors: deck.colors ?? [],
            cards,
            totalCost: cards.reduce((sum, c) => sum + c.price * c.missing, 0),
          };
        })
        .filter(gap => gap.cards.length > 0)
        .sort((a, b) => b.totalCost - a.totalCost);

      setDeckGaps(gaps);
    } catch (error) {
      console.error('Error computing deck gaps:', error);
      setDeckGaps([]);
    } finally {
      setGapsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadWishlist();
    loadDeckGaps();

    const handleUpdate = () => {
      loadWishlist();
      loadDeckGaps();
    };
    window.addEventListener('wishlist-updated', handleUpdate);
    return () => window.removeEventListener('wishlist-updated', handleUpdate);
  }, [user, loadWishlist, loadDeckGaps]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = wishlistItems.filter(item => {
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        item.card_name.toLowerCase().includes(q) ||
        (item.card?.type_line ?? '').toLowerCase().includes(q) ||
        (item.card?.set_code ?? '').toLowerCase().includes(q)
      );
    });

    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price-desc':
          return toNumber(b.card?.prices?.usd) - toNumber(a.card?.prices?.usd);
        case 'price-asc':
          return toNumber(a.card?.prices?.usd) - toNumber(b.card?.prices?.usd);
        case 'name-asc':
          return a.card_name.localeCompare(b.card_name);
        case 'priority': {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
        }
        default:
          return 0;
      }
    });

    return items;
  }, [wishlistItems, priorityFilter, sortBy, query]);

  const addToWishlist = useCallback(
    async (card: { id: string; name: string }) => {
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
          await supabase.from('wishlist').insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium',
            alert_enabled: true,
          });
          showSuccess('Added', `${card.name} added to wishlist`);
        }

        await loadWishlist();
        await loadDeckGaps();
      } catch (error) {
        console.error('Error adding to wishlist:', error);
        showError('Error', 'Failed to add to wishlist');
      }
    },
    [user, loadWishlist, loadDeckGaps]
  );

  const removeFromWishlist = useCallback(
    async (itemId: string) => {
      try {
        await supabase.from('wishlist').delete().eq('id', itemId);
        showSuccess('Removed', 'Card removed from wishlist');
        await loadWishlist();
        await loadDeckGaps();
      } catch (error) {
        console.error('Error removing:', error);
        showError('Error', 'Failed to remove');
      }
    },
    [loadWishlist, loadDeckGaps]
  );

  const updatePriority = useCallback(
    async (itemId: string, priority: string) => {
      try {
        await supabase.from('wishlist').update({ priority }).eq('id', itemId);
        await loadWishlist();
      } catch (error) {
        console.error('Error updating priority:', error);
      }
    },
    [loadWishlist]
  );

  const updateTargetPrice = useCallback(
    async (itemId: string, price: number | null) => {
      try {
        await supabase.from('wishlist').update({ target_price_usd: price }).eq('id', itemId);
        showSuccess('Updated', 'Target price set');
        await loadWishlist();
      } catch (error) {
        console.error('Error updating target price:', error);
      }
    },
    [loadWishlist]
  );

  const toggleAlert = useCallback(
    async (itemId: string, enabled: boolean) => {
      try {
        await supabase.from('wishlist').update({ alert_enabled: enabled }).eq('id', itemId);
        await loadWishlist();
      } catch (error) {
        console.error('Error toggling alert:', error);
      }
    },
    [loadWishlist]
  );

  /**
   * Upsert-aware, and records foil / condition / price. The old version issued a
   * bare insert with no existence check, so moving the same card twice produced
   * duplicate rows that double-counted in every value calculation.
   */
  const confirmMoveToCollection = useCallback(
    async (values: MoveToCollectionValues) => {
      const item = moveTarget;
      if (!user || !item) return;

      setMoving(true);
      try {
        const usd = toNumber(item.card?.prices?.usd);
        const usdFoil = toNumber(item.card?.prices?.usd_foil) || usd;
        const unitPrice = values.foil ? usdFoil : usd;

        const { data: existing } = await supabase
          .from('user_collections')
          .select('id, quantity, foil')
          .eq('user_id', user.id)
          .eq('card_id', item.card_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_collections')
            .update({
              quantity: existing.quantity + (values.foil ? 0 : values.quantity),
              foil: (existing.foil ?? 0) + (values.foil ? values.quantity : 0),
              price_usd: unitPrice,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('user_collections').insert({
            user_id: user.id,
            card_id: item.card_id,
            card_name: item.card_name,
            set_code: item.card?.set_code || '',
            quantity: values.foil ? 0 : values.quantity,
            foil: values.foil ? values.quantity : 0,
            // Canonical market grade (NM/LP/MP/HP/DMG); `normalizeCondition`
            // reads both this and the older seven-value vocabulary.
            condition: values.condition,
            price_usd: unitPrice,
          });
        }

        if (values.quantity >= item.quantity) {
          await supabase.from('wishlist').delete().eq('id', item.id);
        } else {
          await supabase
            .from('wishlist')
            .update({ quantity: item.quantity - values.quantity })
            .eq('id', item.id);
        }

        showSuccess('Moved', `${item.card_name} added to your collection`);
        setMoveTarget(null);
        await loadWishlist();
        await loadDeckGaps();
      } catch (error) {
        console.error('Error moving to collection:', error);
        showError('Error', 'Failed to move to collection');
      } finally {
        setMoving(false);
      }
    },
    [user, moveTarget, loadWishlist, loadDeckGaps]
  );

  const openBuyLink = useCallback((item: WishlistItem) => {
    const url = `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(
      item.card_name
    )}&view=grid`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const copyBuyList = useCallback((deck: DeckGap) => {
    const list = deck.cards.map(c => `${c.missing} ${c.name}`).join('\n');
    navigator.clipboard.writeText(list);
    window.open('https://www.tcgplayer.com/massentry?productline=Magic', '_blank', 'noopener,noreferrer');
    showSuccess('Copied', `${deck.cards.length} lines copied for mass entry`);
  }, []);

  const exportToCSV = useCallback(() => {
    const csv = [
      'Card Name,Quantity,Priority,Set,Price USD,Total,Target Price,Note',
      ...wishlistItems.map(i =>
        [
          `"${i.card_name}"`,
          i.quantity,
          i.priority,
          i.card?.set_code?.toUpperCase() || '',
          toNumber(i.card?.prices?.usd).toFixed(2),
          (toNumber(i.card?.prices?.usd) * i.quantity).toFixed(2),
          i.target_price_usd ?? '',
          `"${i.note || ''}"`,
        ].join(',')
      ),
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

  const totalValue = useMemo(
    () => wishlistItems.reduce((sum, i) => sum + toNumber(i.card?.prices?.usd) * i.quantity, 0),
    [wishlistItems]
  );

  const hasActiveFilter = priorityFilter !== 'all' || query.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full space-y-6 px-3 py-2 md:px-6 md:py-4">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground md:text-2xl">
              <Heart className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              Wishlist
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {wishlistItems.length} card{wishlistItems.length === 1 ? '' : 's'} ·{' '}
              {formatPrice(totalValue)}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={wishlistItems.length === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        </div>

        <WishlistQuickStats items={wishlistItems} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col gap-4">
            <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList className="h-auto w-max bg-muted p-1 sm:w-auto">
                <TabsTrigger value="wishlist" className="gap-1.5 whitespace-nowrap sm:gap-2">
                  <Heart className="h-4 w-4" aria-hidden="true" />
                  Cards
                  {wishlistItems.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {wishlistItems.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="by-deck" className="gap-1.5 whitespace-nowrap sm:gap-2">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  Deck gaps
                  {deckGaps.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {deckGaps.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="add" className="gap-1.5 whitespace-nowrap sm:gap-2">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Add
                </TabsTrigger>
              </TabsList>
            </div>

            {activeTab === 'wishlist' && wishlistItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search wishlist"
                  aria-label="Search wishlist"
                  className="h-8 w-full max-w-xs text-sm"
                />

                <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-border p-0.5">
                  {PRIORITY_FILTERS.map(f => (
                    <Button
                      key={f.value}
                      size="sm"
                      variant={priorityFilter === f.value ? 'secondary' : 'ghost'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setPriorityFilter(f.value)}
                      aria-pressed={priorityFilter === f.value}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                  <SelectTrigger className="h-8 w-[130px] flex-shrink-0 text-xs" aria-label="Sort by">
                    <ArrowUpDown className="mr-1 h-3 w-3" aria-hidden="true" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex flex-shrink-0 rounded-lg border border-border p-0.5">
                  {(
                    [
                      { mode: 'grid' as const, icon: Grid3X3, label: 'Grid' },
                      { mode: 'compact' as const, icon: LayoutGrid, label: 'Compact grid' },
                      { mode: 'list' as const, icon: List, label: 'List' },
                    ]
                  ).map(({ mode, icon: Icon, label }) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={viewMode === mode ? 'secondary' : 'ghost'}
                      className={cn('h-7 px-2')}
                      onClick={() => setViewMode(mode)}
                      aria-label={label}
                      aria-pressed={viewMode === mode}
                      title={label}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <TabsContent value="wishlist" className="mt-4">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-[5/7] rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <WishlistEmptyState
                hasFilter={hasActiveFilter}
                onClearFilter={() => {
                  setPriorityFilter('all');
                  setQuery('');
                }}
                onAddCards={() => setActiveTab('add')}
              />
            ) : viewMode === 'list' ? (
              <WishlistListView
                items={filteredItems}
                onCardClick={item => {
                  const full = wishlistItems.find(i => i.id === item.id);
                  if (full) handleCardClick(full);
                }}
                onBuy={item => openBuyLink(item as WishlistItem)}
                onAddToCollection={item =>
                  setMoveTarget(wishlistItems.find(i => i.id === item.id) ?? null)
                }
                onRemove={removeFromWishlist}
                onUpdatePriority={updatePriority}
                onUpdateTargetPrice={updateTargetPrice}
                onToggleAlert={toggleAlert}
              />
            ) : (
              <WishlistCardGrid
                items={filteredItems}
                viewMode={viewMode}
                onCardClick={item => {
                  const full = wishlistItems.find(i => i.id === item.id);
                  if (full) handleCardClick(full);
                }}
                onBuy={item => openBuyLink(item as WishlistItem)}
                onAddToCollection={item =>
                  setMoveTarget(wishlistItems.find(i => i.id === item.id) ?? null)
                }
                onRemove={removeFromWishlist}
                onUpdatePriority={updatePriority}
                onUpdateTargetPrice={updateTargetPrice}
                onToggleAlert={toggleAlert}
              />
            )}
          </TabsContent>

          <TabsContent value="by-deck" className="mt-4">
            <WishlistByDeck
              gaps={deckGaps}
              loading={gapsLoading}
              hasDecks={userDecks.length > 0}
              onCreateDeck={() => navigate('/decks')}
              onCardClick={cardId => {
                const match = wishlistItems.find(i => i.card_id === cardId);
                if (match) handleCardClick(match);
              }}
              onBuyAll={copyBuyList}
              onAddToWishlist={card => addToWishlist({ id: card.cardId, name: card.name })}
              onNavigateToDeck={deckId => navigate(`/decks?deck=${deckId}`)}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <EnhancedUniversalCardSearch onCardWishlist={addToWishlist} showWishlistButton={true} />
          </TabsContent>
        </Tabs>

        {selectedItem?.card && (
          <UniversalCardModal
            card={{ id: selectedItem.card_id, name: selectedItem.card_name, ...selectedItem.card }}
            isOpen={showCardModal}
            onClose={() => setShowCardModal(false)}
          />
        )}

        <MoveToCollectionDialog
          cardName={moveTarget?.card_name}
          defaultQuantity={moveTarget?.quantity ?? 1}
          open={moveTarget !== null}
          onOpenChange={open => {
            if (!open) setMoveTarget(null);
          }}
          onConfirm={confirmMoveToCollection}
          busy={moving}
        />
      </div>
    </div>
  );
}
