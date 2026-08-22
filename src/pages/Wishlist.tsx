import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  Heart,
  Download,
  LayoutGrid,
  Rows3,
  Layers,
  Printer,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { ListToProxiesPanel } from '@/components/shopping';
import { proxyCandidatesFromWishlist } from '@/lib/shopping';
import { useOpenCard } from '@/components/cards';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { WishlistQuickStats } from '@/components/wishlist/WishlistQuickStats';
import { WishlistCardGrid } from '@/components/wishlist/WishlistCardGrid';
import { WishlistListView } from '@/components/wishlist/WishlistListView';
import { WishlistByDeck, type DeckGap, type DeckGapCard } from '@/components/wishlist/WishlistByDeck';
import { WishlistBuyPanel } from '@/components/wishlist/WishlistBuyPanel';
import {
  MoveToCollectionPanel,
  type MoveToCollectionValues,
} from '@/components/wishlist/MoveToCollectionPanel';
import { formatPrice, toNumber } from '@/components/collection/browser/types';
import { pickPrintingsByName } from '@/lib/wishlist/printing';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { usePagedItems } from '@/hooks/usePagination';
import { ActiveFilterChips, CardFilterSheet, useCardFilterState } from '@/components/filters';
import { matchesCardFilter, toLocalCard } from '@/lib/cards/local-filter';
import {
  FacetChip,
  FilterBar,
  FilterButton,
  ListingFrame,
  ListingSearch,
  PageTabs,
  SortControl,
  matchedLabel,
  resultSentence,
  totalActiveFilters,
  useListingView,
  type ListingMode,
  type SortOption,
} from '@/components/listing';

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

type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

/**
 * The two ways to look at a wishlist.
 *
 * No table, deliberately. A collection table earns its columns because
 * condition, quantity and value are all facts about a copy you hold; a wishlist
 * row is a card you do not own yet, and the only column it could add is the
 * price, which the tile already prints.
 */
const MODES: ListingMode[] = [
  { id: 'grid', label: 'Image grid', icon: LayoutGrid, layout: 'grid' },
  { id: 'list', label: 'List', icon: Rows3, layout: 'rows' },
];

/**
 * Sort axis and direction, rather than six baked-in pairs.
 *
 * The old control offered `Newest / Oldest / Price high / Price low / Name /
 * Priority`, which is four axes with the direction spelled into the label on
 * three of them and missing on the fourth. Every one of those six still exists
 * here as an axis plus a direction, and reverse priority, which had no option
 * before, exists now too. Nothing was taken away.
 */
type SortKey = 'added' | 'price' | 'name' | 'priority';

const SORT_OPTIONS: SortOption[] = [
  { value: 'added', label: 'Date added' },
  { value: 'price', label: 'Price' },
  { value: 'name', label: 'Name' },
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

/*
 * Which printing to show when a wishlist row has to be matched by name now
 * lives in `@/lib/wishlist/printing`, because the dashboard's wishlist tile has
 * to answer the same question and was answering it the other way round — it
 * kept the dearest printing while this page kept the cheapest, so the two
 * screens reported $7,315.36 and $7,314.94 for the same four rows. One rule,
 * one file, both callers.
 */

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
  const [proxying, setProxying] = useState(false);
  const [toShopping, setToShopping] = useState(false);

  const [activeTab, setActiveTab] = useState('wishlist');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  /**
   * View mode, sort, card size and page size, in one object.
   *
   * The surface name stays `wishlist` because that is the key `useCardSize` and
   * `usePageSize` have been writing all along, and renaming it would silently
   * reset every reader's card size. The view mode and the sort were plain
   * `useState` before, so they were forgotten on every navigation; they persist
   * now, the same way My Decks and the collection already did.
   */
  const view = useListingView({
    surface: 'wishlist',
    modes: MODES,
    defaultMode: 'grid',
    defaultSortKey: 'added',
    defaultSortDir: 'desc',
    defaultSize: 200,
  });
  const sortKey = view.sortKey as SortKey;

  /**
   * The same filter the card-search pages use, evaluated locally against the
   * wishlist rows. Priority stays separate because it is a property of the
   * *entry*, not of the card, and no Scryfall query can express it.
   */
  const filters = useCardFilterState();

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

      let byName = new Map<string, any>();
      if (unresolvedNames.length > 0) {
        const { data: namedCards } = await supabase
          .from('cards')
          .select(CARD_COLUMNS)
          .in('name', unresolvedNames);

        byName = pickPrintingsByName(namedCards ?? []);
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

    /*
     * Every branch below can tie: two entries added in the same second, two
     * cards at the same price, two entries at the same priority. An order that
     * is not total is not stable, and an unstable order on a paged list shows
     * one card on two pages and hides another entirely. The wishlist row id
     * settles it, because it is the only field guaranteed to differ.
     */
    const tieBreak = (a: WishlistItem, b: WishlistItem) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

    /*
     * One comparison per axis, always ascending, and the direction is applied
     * once at the end. Writing the direction into each branch is how the old
     * six-way switch ended up with three axes that could be reversed and one
     * that could not.
     *
     * "Ascending" for priority means high first, which is what the single
     * `priority` option used to do and what a reader expects from a list of
     * things ranked by how badly they are wanted.
     */
    const ascending = (a: WishlistItem, b: WishlistItem): number => {
      switch (sortKey) {
        case 'added':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price':
          return toNumber(a.card?.prices?.usd) - toNumber(b.card?.prices?.usd);
        case 'name':
          return a.card_name.localeCompare(b.card_name);
        case 'priority': {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
        }
        default:
          return 0;
      }
    };

    const sign = view.sortDir === 'asc' ? 1 : -1;

    items = [...items].sort((a, b) => {
      const ordered = ascending(a, b) * sign;
      // The tie-break is NOT reversed. Reversing it would make the two
      // directions disagree about which of two identical rows comes first, and
      // a page boundary landing between them would drop one.
      return ordered === 0 ? tieBreak(a, b) : ordered;
    });

    return items;
  }, [projected, priorityFilter, sortKey, view.sortDir, filters.state]);


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

  /*
   * The whole list's value used to be summed here for a line under the page
   * title. It is a tile now, and `WishlistQuickStats` computes it through
   * `totalPrices`, which counts the copies it could not price instead of adding
   * them as zero. Two sums over the same rows disagreeing by whatever the
   * unpriced copies are worth is exactly the drift this pass is closing, so
   * there is one, and it is the honest one.
   */

  /**
   * The whole wishlist, ready to print.
   *
   * The whole list rather than the filtered view: the panel lets any card be
   * left out, and a hidden filter silently deciding what does and does not get
   * printed is the kind of surprise a forty card list can hide.
   */
  const proxyCandidates = useMemo(
    () => proxyCandidatesFromWishlist(wishlistItems),
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

  /* Priority lives outside `CardSearchState`, so it has to be added in or the
     badge under-reports and a reader cannot tell why the grid is short. */
  const activeFilterCount = totalActiveFilters(
    filters.activeCount,
    priorityFilter === 'all' ? 0 : 1
  );
  const hasActiveFilter = activeFilterCount > 0;

  /**
   * Page the list after sorting, never before.
   *
   * The whole filtered list stays in hand because the buy panel above the grid
   * totals it: what the wishlist would cost, and how much of it a deck needs.
   * Those are figures about the whole list, so the rows have to be there. What
   * paging cuts is the drawing.
   */
  const pagedWishlist = usePagedItems(filteredItems, {
    pageSize: view.pageSize,
    resetKey: JSON.stringify([filters.state, priorityFilter, sortKey, view.sortDir]),
  });

  /**
   * Keyed on `filters.patch` — which `useCardFilterState` keeps stable — rather
   * than on the controller object, which is rebuilt every render. `ListingSearch`
   * debounces inside an effect keyed on this callback, so a new identity per
   * render would reset the 250ms timer before it ever fired.
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

  /**
   * What the rows on screen are worth, in the shared sentence.
   *
   * The page had no count line at all; the only figures were in the header, and
   * they described the whole wishlist rather than what a filter had left. So a
   * reader who narrowed to three cards still read "94 cards · $4,676" and had
   * no way to see what the three cost.
   */
  const shownValue = useMemo(
    () => filteredItems.reduce((sum, i) => sum + toNumber(i.card?.prices?.usd) * i.quantity, 0),
    [filteredItems]
  );
  const shownCopies = useMemo(
    () => filteredItems.reduce((sum, i) => sum + i.quantity, 0),
    [filteredItems]
  );

  const summary = resultSentence([
    matchedLabel(filteredItems.length, wishlistItems.length, 'entry', 'entries'),
    { value: shownCopies.toLocaleString(), label: 'cards' },
    shownValue > 0 && { value: formatPrice(shownValue) },
  ]);


  return (
    <StandardPageLayout
      title={
        <span className="flex items-center gap-2">
          <Heart className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          Wishlist
        </span>
      }
      description="Cards you want, what they would cost, and which of your decks is waiting on them."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {/* The wishlist is what you WANT; the shopping list is what you are
              actually going to buy. Moving between them was the one step you
              had to do by hand, one card at a time. Owner: "On the wishlist,
              we should also be able to move to shopping list". */}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setToShopping(true)}
            disabled={proxyCandidates.length === 0}
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Add to shopping list
          </Button>
          {/* People proxy a deck to play it before they buy into it, so a
              wishlist is the list most worth printing. One action for all of
              it, not one click per card. */}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setProxying(true)}
            disabled={proxyCandidates.length === 0}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print as proxies
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={exportToCSV}
            disabled={wishlistItems.length === 0}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/*
          The figures, in the tiles My Decks and My Collection use.

          They used to be four boxes with a 40px icon each, and the page title
          carried a second, smaller copy of two of the same numbers. One row,
          one size, one place.
        */}
        <WishlistQuickStats
          items={wishlistItems}
          neededByDeck={neededByDeck}
          ownedByCard={ownedByCard}
          loading={loading}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <PageTabs
            value={activeTab}
            onChange={setActiveTab}
            label="Wishlist sections"
            tabs={[
              {
                id: 'wishlist',
                label: 'Cards',
                icon: Heart,
                // `null` while the rows are still coming, so the badge holds
                // its place instead of shoving the other two tabs sideways
                // the moment the count arrives.
                count: loading ? null : wishlistItems.length,
              },
              {
                id: 'by-deck',
                label: 'Deck gaps',
                icon: Layers,
                count: gapsLoading ? null : deckGaps.length,
              },
              // No count: "Add" is a search panel, not a pile of things.
              { id: 'add', label: 'Add', icon: Search },
            ]}
          />

          <TabsContent value="wishlist" className="mt-4 space-y-4">
            {/*
              One band, and every control that was on the page before is still
              on it.

              The toolbar was three rows: search with filters and sort, then a
              priority row of its own, then the chips. Priority shares the last
              row with the size slider and the view toggle now, which is the
              same arrangement the collection uses for its ownership chips, and
              the bar owns the single clear control so that clearing everything
              actually clears the priority too. It did not before: "Clear all"
              belonged to `ActiveFilterChips`, which knows only about the shared
              filter state, so it left the priority chip on and the list stayed
              narrowed with nothing on screen saying why.
            */}
            {wishlistItems.length > 0 && (
              <FilterBar
                view={view}
                activeCount={activeFilterCount}
                onClear={clearFilters}
                search={
                  <ListingSearch
                    value={filters.state.text ?? ''}
                    onCommit={commitFilterText}
                    placeholder="Name, type, or Scryfall syntax like t:creature mv<=3"
                    label="Search your wishlist"
                  />
                }
                filters={
                  <CardFilterSheet
                    controller={filters}
                    showSort={false}
                    showChips={false}
                    trigger={<FilterButton count={activeFilterCount} />}
                  />
                }
                sort={
                  <SortControl
                    options={SORT_OPTIONS}
                    value={sortKey}
                    onValueChange={next => view.setSortKey(next)}
                    dir={view.sortDir}
                    onToggleDir={view.toggleSortDir}
                  />
                }
                chips={
                  activeFilterCount > 0 ? (
                    <ActiveFilterChips controller={filters} showClear={false} />
                  ) : null
                }
              >
                {/* Priority is a property of the wishlist entry, not of the
                    card, so no Scryfall query can ask for it and it cannot live
                    inside the shared filter. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                    Priority
                  </span>
                  {PRIORITY_FILTERS.map(f => (
                    <FacetChip
                      key={f.value}
                      selected={priorityFilter === f.value}
                      onClick={() => setPriorityFilter(f.value)}
                    >
                      {f.label}
                    </FacetChip>
                  ))}
                </div>
              </FilterBar>
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

            <ListingFrame
              view={view}
              count={pagedWishlist.pageItems.length}
              loading={loading}
              /* Unconditional: `ListingFrame` reserves the line and decides
                 when it has something to say. */
              summary={summary}
              /* The buy panel totals the whole filtered list, so it belongs
                 above the results rather than beside them. */
              beforeResults={
                !loading && filteredItems.length > 0 ? (
                  <WishlistBuyPanel
                    items={filteredItems}
                    filtered={hasActiveFilter}
                    neededByDeck={neededByDeck}
                    onCopyBuyList={copyWishlistBuyList}
                  />
                ) : null
              }
              pager={{
                page: pagedWishlist.page,
                pageCount: pagedWishlist.pageCount,
                onPageChange: pagedWishlist.setPage,
                total: pagedWishlist.total,
                shown: pagedWishlist.pageItems.length,
                noun: 'entry',
                nounPlural: 'entries',
                label: 'Wishlist pages',
              }}
              /* Two different empty screens, because "your filter matched
                 nothing" and "you have never wanted a card" need different
                 words and different ways out. Both were a hand-built panel in
                 `WishlistEmptyState` before, with a heart in a circle; the
                 heart is the frame's `icon` slot now, so the shell is the same
                 one the collection and card search draw. */
              empty={
                hasActiveFilter
                  ? {
                      icon: Heart,
                      title: 'No cards match your filters',
                      description: 'Try widening the search or clearing the priority filter.',
                      onClearFilters: clearFilters,
                    }
                  : {
                      icon: Heart,
                      title: 'Your wishlist is empty',
                      description:
                        'Track the cards you want, set a target price, and see which of your decks are still missing them.',
                      action: { label: 'Add your first card', onClick: () => setActiveTab('add') },
                    }
              }
            >
              {view.mode === 'list' ? (
                <WishlistListView
                  items={pagedWishlist.pageItems}
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
                /* A grid mode arrives inside `ListingFrame`'s own `CardGrid` at
                   the slider's width, so the tiles need no wrapper of their
                   own. */
                <WishlistCardGrid
                  items={pagedWishlist.pageItems}
                  width={view.size}
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
            </ListingFrame>
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
            {/*
              PICKING, not browsing. The whole tab is "add something to the
              wishlist", so a click on a card puts it on the list and the page
              stays here. The heart stays as the named control for the same
              thing, and the eye opens the card's own page. Same rule as the
              storage and deck pickers. Do not "fix" it back to navigating.
            */}
            <EnhancedUniversalCardSearch
              mode="pick"
              onCardAdd={addToWishlist}
              onCardWishlist={addToWishlist}
              showAddButton={false}
              showWishlistButton={true}
            />
          </TabsContent>
        </Tabs>

        <ListToProxiesPanel
          kind="shopping"
          open={toShopping}
          onOpenChange={setToShopping}
          candidates={proxyCandidates}
          sourceLabel="your wishlist"
          description="Everything you want, ready to buy. Leave out anything you are not buying yet."
        />

        <ListToProxiesPanel
          open={proxying}
          onOpenChange={setProxying}
          candidates={proxyCandidates}
          sourceLabel="your wishlist"
          description="Everything you have your eye on. Print it and play the deck before you spend anything."
        />
      </div>
    </StandardPageLayout>
  );
}
