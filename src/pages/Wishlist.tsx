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
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  Heart,
  Download,
  LayoutGrid,
  List,
  Layers,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import { useOpenCard } from '@/components/cards';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { WishlistQuickStats } from '@/components/wishlist/WishlistQuickStats';
import { WishlistCardGrid } from '@/components/wishlist/WishlistCardGrid';
import { WishlistListView } from '@/components/wishlist/WishlistListView';
import { WishlistByDeck, type DeckGap, type DeckGapCard } from '@/components/wishlist/WishlistByDeck';
import { WishlistEmptyState } from '@/components/wishlist/WishlistEmptyState';
import { WishlistBuyPanel } from '@/components/wishlist/WishlistBuyPanel';
import {
  MoveToCollectionPanel,
  type MoveToCollectionValues,
} from '@/components/wishlist/MoveToCollectionPanel';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
import { CardGridSkeleton, CardSizeSlider, useCardSize } from '@/components/cards';
import { ActiveFilterChips, CardFilterSheet, useCardFilterState } from '@/components/filters';
import { matchesCardFilter, toLocalCard } from '@/lib/cards/local-filter';
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
  /**
   * The full `cards` row. Deliberately untyped: it is handed straight to
   * `CardImage` and `toLocalCard`, both of which reconcile the Scryfall and
   * Supabase shapes themselves.
   */
  card?: any;
}

interface UserDeck {
  id: string;
  name: string;
  format: string;
  colors: string[];
}

type ViewMode = 'grid' | 'list';
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

/** Every column the shared card filter can interrogate, plus `faces` to flip. */
const CARD_COLUMNS =
  'id, name, set_code, collector_number, type_line, oracle_text, colors, color_identity, rarity, cmc, mana_cost, prices, image_uris, legalities, keywords, layout, faces, power, toughness, loyalty, is_reserved';

/**
 * Which printing to show when a wishlist row has to be matched by name.
 *
 * Cheapest priced printing with an image wins; a printing with no price at all
 * loses to any that has one, so the total never falls back to zero when a
 * priced alternative exists. Deterministic, so the same card does not change
 * face between loads.
 */
function printingRank(card: any): number {
  const usd = toNumber(card?.prices?.usd);
  const hasImage = Boolean(card?.image_uris?.normal || card?.image_uris?.large);
  if (usd <= 0) return Number.MAX_SAFE_INTEGER - (hasImage ? 1 : 0);
  return hasImage ? usd : usd + 1_000_000;
}

export default function Wishlist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const openCard = useOpenCard();

  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [deckGaps, setDeckGaps] = useState<DeckGap[]>([]);
  const [userDecks, setUserDecks] = useState<UserDeck[]>([]);
  /** Copies already in the collection, keyed by card id — read with the gaps. */
  const [ownedByCard, setOwnedByCard] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [gapsLoading, setGapsLoading] = useState(true);
  const [moveTarget, setMoveTarget] = useState<WishlistItem | null>(null);
  const [moving, setMoving] = useState(false);

  const [activeTab, setActiveTab] = useState('wishlist');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  /**
   * The same filter the card-search pages use, evaluated locally against the
   * wishlist rows. Priority stays separate because it is a property of the
   * *entry*, not of the card, and no Scryfall query can express it.
   */
  const filters = useCardFilterState();
  const [cardWidth, setCardWidth] = useCardSize('wishlist');

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
        // Every column the shared filter can ask about — oracle text, legality,
        // keywords, P/T — plus `faces` so double-faced cards can flip.
        .select(CARD_COLUMNS)
        .in('id', cardIds);

      const cardsMap = new Map((cardsData ?? []).map(c => [c.id, c]));

      /**
       * Second pass: rows whose `card_id` is not in `cards`, matched by name.
       *
       * Eleven of the owner's 94 wishlist rows point at a Scryfall printing id
       * that this database does not hold — card sync has been stalled since
       * January, and one legacy row stores the slug `sol-ring` rather than a
       * uuid at all. Every one of them is a real card with exactly one other
       * printing already in `cards`: Underground Sea, Volcanic Island, Tundra,
       * Plateau, Scrubland, Lion's Eye Diamond, Lotus Petal, Mox Diamond,
       * Demonic Consultation, Intuition and Sol Ring.
       *
       * They used to render as blank grey tiles priced $0.00, and — worse —
       * the page's headline total counted them as nothing, understating a
       * $4,676 wishlist as $2,318. Falling back to the name shows the real
       * card, the real art and a real price. The printing chosen is the
       * cheapest one carrying a USD price, which is the honest answer to the
       * question a wishlist actually asks: what would this cost me to buy.
       */
      const unresolvedNames = [
        ...new Set(
          wishlistData.filter(i => !cardsMap.has(i.card_id)).map(i => i.card_name).filter(Boolean)
        ),
      ];

      const byName = new Map<string, any>();
      if (unresolvedNames.length > 0) {
        const { data: namedCards } = await supabase
          .from('cards')
          .select(CARD_COLUMNS)
          .in('name', unresolvedNames);

        for (const row of namedCards ?? []) {
          const key = String(row.name).toLowerCase();
          const existing = byName.get(key);
          if (!existing || printingRank(row) < printingRank(existing)) byName.set(key, row);
        }
      }

      setWishlistItems(
        wishlistData.map(item => {
          const cardData =
            cardsMap.get(item.card_id) ?? byName.get((item.card_name ?? '').toLowerCase());
          return {
            ...item,
            // The row is passed through whole; nothing is dropped on the way in,
            // which is what makes the advanced facets work on the wishlist.
            card: cardData ?? {
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
        setOwnedByCard(new Map());
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

      setOwnedByCard(ownedByCard);

      const wishlistByCard = new Map((wishlistRows ?? []).map(r => [r.card_id, r.id]));

      const neededIds = [
        ...new Set(
          (deckCards ?? [])
            .filter(dc => (dc.quantity ?? 0) > (ownedByCard.get(dc.card_id) ?? 0))
            .map(dc => dc.card_id)
        ),
      ];

      const priceById = new Map<string, { price: number; images?: Record<string, string> }>();
      if (neededIds.length > 0) {
        const { data: cardRows } = await supabase
          .from('cards')
          .select('id, prices, image_uris')
          .in('id', neededIds);
        for (const row of cardRows ?? []) {
          const prices = (row.prices ?? {}) as Record<string, string | null>;
          // The whole image set travels, so the row thumbnail and the deck face
          // can each ask for the resolution they are actually drawn at.
          priceById.set(row.id, {
            price: toNumber(prices.usd),
            images: (row.image_uris ?? {}) as Record<string, string>,
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
                images: meta?.images,
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

  /** Projected once per load, not once per keystroke. */
  const projected = useMemo(
    () =>
      wishlistItems.map(item => ({
        item,
        local: toLocalCard(item.card, { name: item.card_name }),
      })),
    [wishlistItems]
  );

  const filteredItems = useMemo(() => {
    let items = projected
      .filter(({ item, local }) => {
        if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
        return matchesCardFilter(local, filters.state);
      })
      .map(({ item }) => item);

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
  }, [projected, priorityFilter, sortBy, filters.state]);

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

  /* Owner: "Wishlist also doesnt need right side, should open full window".
     A wishlist row is a card you are shopping for, so the click goes to the
     card page rather than to a `?card=` pane docked beside the grid. */
  const handleCardClick = useCallback(
    (item: { card_id?: string; card_name?: string }) => {
      openCard({ card_id: item.card_id, name: item.card_name });
    },
    [openCard]
  );

  const totalValue = useMemo(
    () => wishlistItems.reduce((sum, i) => sum + toNumber(i.card?.prices?.usd) * i.quantity, 0),
    [wishlistItems]
  );

  /**
   * Card ids at least one deck is genuinely short of, straight out of the gap
   * calculation — deck requirement minus copies owned. This is what turns
   * "94 cards you fancy" into "these are the ones a deck is waiting on".
   */
  const neededByDeck = useMemo(
    () => new Set(deckGaps.flatMap(gap => gap.cards.map(card => card.cardId))),
    [deckGaps]
  );

  /**
   * Copy the visible rows in the `N Card Name` shape every mass-entry box
   * accepts, then open one. Same mechanism as the per-deck buy list, applied to
   * whatever the filters have narrowed the wishlist to.
   */
  const copyWishlistBuyList = useCallback((items: WishlistItem[]) => {
    const list = items.map(i => `${i.quantity} ${i.card_name}`).join('\n');
    navigator.clipboard.writeText(list);
    window.open(
      'https://www.tcgplayer.com/massentry?productline=Magic',
      '_blank',
      'noopener,noreferrer'
    );
    showSuccess('Copied', `${items.length} lines copied for mass entry`);
  }, []);

  const activeFilterCount = filters.activeCount + (priorityFilter === 'all' ? 0 : 1);
  const hasActiveFilter = activeFilterCount > 0;

  /**
   * Keyed on `filters.patch` — which `useCardFilterState` keeps stable — rather
   * than on the controller object, which is rebuilt every render. WishlistSearchBox
   * debounces inside an effect keyed on this callback, so a new identity per render
   * would reset the 250ms timer before it ever fired.
   */
  const { patch: patchFilters } = filters;
  const commitFilterText = useCallback(
    (next: string | undefined) => patchFilters({ text: next }),
    [patchFilters]
  );

  const clearFilters = useCallback(() => {
    setPriorityFilter('all');
    filters.reset();
  }, [filters]);

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

          <Button variant="secondary" size="sm" onClick={exportToCSV} disabled={wishlistItems.length === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        </div>

        <WishlistQuickStats
          items={wishlistItems}
          neededByDeck={neededByDeck}
          ownedByCard={ownedByCard}
        />

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
              <div className="space-y-3 rounded-lg bg-card p-3 shadow-lg shadow-black/20">
                <div className="flex flex-wrap items-center gap-2">
                  <WishlistSearchBox
                    value={filters.state.text ?? ''}
                    onCommit={commitFilterText}
                  />

                  <CardFilterSheet
                    controller={filters}
                    showSort={false}
                    showChips={false}
                    trigger={
                      <Button variant="secondary" size="sm" className="h-8 shrink-0 gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                        Filters
                        {activeFilterCount > 0 && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold leading-none text-primary-foreground">
                            {activeFilterCount}
                          </span>
                        )}
                      </Button>
                    }
                  />

                  <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                    <SelectTrigger
                      className="h-8 w-[130px] shrink-0 border-0 bg-muted/50 text-xs"
                      aria-label="Sort by"
                    >
                      <ArrowUpDown className="mr-1 h-3 w-3" aria-hidden="true" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-0">
                      {SORT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="ml-auto flex items-center gap-3">
                    {viewMode === 'grid' && (
                      <CardSizeSlider
                        storageKey="wishlist"
                        value={cardWidth}
                        onValueChange={setCardWidth}
                        showValue={false}
                        className="hidden sm:flex"
                      />
                    )}
                    <div className="flex shrink-0 items-center gap-1 rounded-md bg-muted/40 p-0.5">
                      {(
                        [
                          { mode: 'grid' as const, icon: LayoutGrid, label: 'Card grid' },
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
                </div>

                {/* Priority is a property of the wishlist entry, not the card. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                    Priority
                  </span>
                  {PRIORITY_FILTERS.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setPriorityFilter(f.value)}
                      aria-pressed={priorityFilter === f.value}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        priorityFilter === f.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {filters.activeCount > 0 && <ActiveFilterChips controller={filters} />}
              </div>
            )}
          </div>

          <TabsContent value="wishlist" className="mt-4 space-y-4">
            {!loading && filteredItems.length > 0 && (
              <WishlistBuyPanel
                items={filteredItems}
                filtered={hasActiveFilter}
                neededByDeck={neededByDeck}
                onCopyBuyList={copyWishlistBuyList}
              />
            )}
            {moveTarget && (
              <MoveToCollectionPanel
                key={moveTarget.id}
                cardName={moveTarget.card_name}
                defaultQuantity={moveTarget.quantity ?? 1}
                onCancel={() => setMoveTarget(null)}
                onConfirm={confirmMoveToCollection}
                busy={moving}
              />
            )}
            {loading ? (
              <CardGridSkeleton width={cardWidth} count={12} />
            ) : filteredItems.length === 0 ? (
              <WishlistEmptyState
                hasFilter={hasActiveFilter}
                onClearFilter={clearFilters}
                onAddCards={() => setActiveTab('add')}
              />
            ) : viewMode === 'list' ? (
              <WishlistListView
                items={filteredItems}
                onCardClick={handleCardClick}
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
                width={cardWidth}
                onCardClick={handleCardClick}
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
              onCardClick={cardId => openCard(cardId)}
              onBuyAll={copyBuyList}
              onAddToWishlist={card => addToWishlist({ id: card.cardId, name: card.name })}
              onNavigateToDeck={deckId => navigate(`/decks?deck=${deckId}`)}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <EnhancedUniversalCardSearch onCardWishlist={addToWishlist} showWishlistButton={true} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Debounced free-text box for the wishlist toolbar.
 *
 * The same 250ms commit the collection browser uses, so typing into a
 * several-hundred-card wishlist does not re-run the predicate per keystroke.
 */
function WishlistSearchBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);

  useEffect(() => {
    if (value !== committed) {
      setCommitted(value);
      setDraft(value);
    }
    // Adopts external changes (chip removal, clear all) without stomping typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (draft === committed) return;
    const id = window.setTimeout(() => {
      setCommitted(draft);
      onCommit(draft.trim() ? draft : undefined);
    }, 250);
    return () => window.clearTimeout(id);
  }, [draft, committed, onCommit]);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Name, type, or Scryfall syntax"
        aria-label="Search wishlist"
        spellCheck={false}
        className="h-8 border-0 bg-muted/50 pl-8 text-sm focus-visible:ring-1 focus-visible:ring-offset-0"
      />
    </div>
  );
}
