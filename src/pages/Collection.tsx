import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package,
  Plus,
  Search,
  BarChart3,
  Download,
  Layers,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionCardDisplay } from '@/components/collection/CollectionCardDisplay';
import { AddToDeckPanel } from '@/components/collection/AddToDeckPanel';
import { StorageAPI } from '@/lib/api/storageAPI';
import { useOpenCard } from '@/components/cards';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { FavoriteDecksPreview } from '@/components/collection/FavoriteDecksPreview';
import { CollectionArriving } from '@/components/shopping';

import { StorageTab } from '@/components/storage/StorageTab';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import type { CollectionStats, CollectionCard } from '@/types/collection';
import { CollectionAPI } from '@/server/routes/collection';
import { canPriceOwnedCopies, priceUSD } from '@/features/collection/value';

import { TCGPlayerPriceSync } from '@/components/collection/TCGPlayerPriceSync';
import { CollectionExport } from '@/components/collection/CollectionExport';
import { CollectionBackupRestore } from '@/components/collection/CollectionBackupRestore';
import { InsuranceReport } from '@/components/collection/InsuranceReport';
import { PriceHistoryChart } from '@/components/collection/PriceHistoryChart';
import { CollectionDeckRecommendations } from '@/components/collection/CollectionDeckRecommendations';
import { CollectionValueTrends } from '@/components/collection/CollectionValueTrends';
import { EnhancedPriceAlerts } from '@/components/collection/EnhancedPriceAlerts';
import { CollectionQuickStats } from '@/components/collection/CollectionQuickStats';
import { CollectionEmptyState } from '@/components/collection/CollectionEmptyState';
import { CollectionLoadingSkeleton } from '@/components/collection/CollectionLoadingSkeleton';
import { AnalyticsHeader } from '@/components/collection/AnalyticsHeader';
import { AddCardsHeader } from '@/components/collection/AddCardsHeader';
import { useAuth } from '@/components/AuthProvider';

const TABS = ['collection', 'analytics', 'add-cards', 'storage'] as const;

/**
 * One valuation rule for the whole page: non-foil copies at `usd`, foil copies
 * at `usd_foil` (falling back to `usd`). The stale denormalised `price_usd`
 * column is never read for display — four different totals used to disagree
 * across the Collection tab, the analytics header and the insurance report.
 */
function valueOfItem(item: CollectionCard): number {
  if (!item.card) return 0;
  const nonFoil = priceUSD(item.card, false);
  const foil = priceUSD(item.card, true) || nonFoil;
  return (item.quantity || 0) * nonFoil + (item.foil || 0) * foil;
}

/**
 * Whether the copies the user actually owns can be priced.
 *
 * Not "does this printing have any price": `Nissa, Genesis Mage` has a foil
 * price of $1.42 and no non-foil price, and the owner holds two non-foils, so
 * the printing is priced and the stack is not. Asking the wider question let
 * her into "Most Valuable Cards" ranked at $0.00 each. Non-foil copies need
 * `usd`; foil copies take `usd_foil` and fall back to `usd`.
 *
 * The rule itself moved to `canPriceOwnedCopies` in features/collection so the
 * dashboard could share it. The dashboard had the wider version and reported a
 * different count for the same collection. The move also dropped `usd_etched`,
 * which the version here read and the valuation never has; no owned row is
 * etched-only today, checked, so nothing on this page changes.
 */
function hasPrice(item: CollectionCard): boolean {
  return canPriceOwnedCopies(item.card?.prices, item.quantity || 0, item.foil || 0);
}

function deckCategory(typeLine: string): DeckCard['category'] {
  if (typeLine.includes('Land')) return 'lands';
  if (typeLine.includes('Creature')) return 'creatures';
  if (typeLine.includes('Instant')) return 'instants';
  if (typeLine.includes('Sorcery')) return 'sorceries';
  if (typeLine.includes('Planeswalker')) return 'planeswalkers';
  if (typeLine.includes('Artifact')) return 'artifacts';
  if (typeLine.includes('Enchantment')) return 'enchantments';
  return 'other';
}

type TopValueCard = CollectionCard & { calculatedValue: number };

export default function Collection() {
  const { snapshot, loading, error, load, refresh } = useCollectionStore();

  const { addCardToDeck, decks } = useDeckManagementStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  /* Clicking a card goes to the card page. It used to dock a detail pane to the
     right of the grid; the owner asked for the card itself, not a preview of
     it. The right-hand column here is now only ever an action panel. */
  const openCard = useOpenCard();

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  /**
   * Storage is the one tab with a route of its own (`/collection/storage`, and
   * `/collection/storage/:containerId` for a container), because a container is
   * a destination people link to. Everything else stays a `?tab=` value.
   */
  const onStorageRoute = location.pathname.startsWith('/collection/storage');
  const [currentTab, setCurrentTab] = useState(() =>
    location.pathname.startsWith('/collection/storage')
      ? 'storage'
      : searchParams.get('tab') || 'collection'
  );

  const [deckTarget, setDeckTarget] = useState<CollectionCard | null>(null);

  const [deckAdditionConfig, setDeckAdditionConfig] = useState({
    selectedDeckId: '',
    selectedBoxId: '',
    addToCollection: true,
    addToDeck: false,
    addToBox: false,
  });

  useEffect(() => {
    load();
    // Loaded once on mount; `refresh` handles every later update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onStorageRoute) {
      setCurrentTab('storage');
      return;
    }
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if ((TABS as readonly string[]).includes(tabFromUrl)) {
      setCurrentTab(tabFromUrl);
    }
  }, [searchParams, onStorageRoute]);

  /**
   * Only the `tab` key is touched. The collection browser mirrors its filter
   * into the same query string, so replacing the whole search string here used
   * to wipe an active filter every time a tab was clicked.
   */
  const setActiveTab = (tab: string) => {
    setCurrentTab(tab);

    if (tab === 'storage') {
      navigate('/collection/storage');
      return;
    }

    if (onStorageRoute) {
      navigate(tab === 'collection' ? '/collection' : `/collection?tab=${tab}`);
      return;
    }

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (tab === 'collection') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  const cards = useMemo(() => snapshot?.items ?? [], [snapshot]);

  // NOTE: every hook must stay above the early `error` return below — the
  // previous version declared a useMemo after it, so React rendered fewer hooks
  // on the render where `error` flipped and the friendly retry screen crashed.
  const collectionStats = useMemo(() => {
    const stats: Omit<CollectionStats, 'topValueCards'> & { topValueCards: TopValueCard[] } = {
      totalCards: 0,
      uniqueCards: cards.length,
      totalValue: 0,
      avgCmc: 0,
      colorDistribution: {},
      typeDistribution: {},
      rarityDistribution: {},
      setDistribution: {},
      topValueCards: [],
      recentlyAdded: [],
    };

    let totalCmc = 0;
    let cardsWithCmc = 0;

    for (const item of cards) {
      const copies = (item.quantity || 0) + (item.foil || 0);
      stats.totalCards += copies;
      stats.totalValue += valueOfItem(item);

      if (item.card?.cmc) {
        totalCmc += item.card.cmc * copies;
        cardsWithCmc += copies;
      }

      const colors = item.card?.colors ?? [];
      if (colors.length > 0) {
        for (const color of colors) {
          stats.colorDistribution[color] = (stats.colorDistribution[color] || 0) + copies;
        }
      } else {
        stats.colorDistribution.C = (stats.colorDistribution.C || 0) + copies;
      }

      if (item.card?.type_line) {
        const mainType = item.card.type_line.split(' — ')[0].split(' ')[0].toLowerCase();
        stats.typeDistribution[mainType] = (stats.typeDistribution[mainType] || 0) + copies;
      }

      if (item.card?.rarity) {
        stats.rarityDistribution[item.card.rarity] =
          (stats.rarityDistribution[item.card.rarity] || 0) + copies;
      }

      stats.setDistribution[item.set_code] = (stats.setDistribution[item.set_code] || 0) + copies;
    }

    stats.avgCmc = cardsWithCmc > 0 ? totalCmc / cardsWithCmc : 0;

    /* A card we cannot price has no place in a ranking of the most valuable
       ones. Listing it at $0.00 at the bottom of the list is not a neutral
       omission, it is a statement that the card is worthless, and it pushed a
       genuinely valuable card out of the top ten to say it. */
    stats.topValueCards = cards
      .filter(hasPrice)
      .map(item => ({ ...item, calculatedValue: valueOfItem(item) }))
      .sort((a, b) => b.calculatedValue - a.calculatedValue)
      .slice(0, 10);

    stats.recentlyAdded = [...cards]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);

    return stats;
  }, [cards]);

  const recentlyAddedCount = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return cards.filter(item => new Date(item.created_at) > sevenDaysAgo).length;
  }, [cards]);

  /**
   * Owned rows the catalogue has no price for, so every total on this page can
   * say how much of the collection it is not counting. The figure is real:
   * re-measured 2026-08-19, four of the owner's 52 rows, and because they sort
   * first by name they are the first thing the grid shows, which is why the
   * page reads as though nothing has a price.
   */
  const unpricedCards = useMemo(
    () => cards.filter(item => (item.quantity || 0) + (item.foil || 0) > 0 && !hasPrice(item)).length,
    [cards]
  );

  const handleExportBackup = () => {
    if (!snapshot) {
      showError('No data', 'No collection data to back up');
      return;
    }

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collection: { items: snapshot.items, totals: snapshot.totals },
      metadata: {
        totalCards: collectionStats.totalCards,
        uniqueCards: collectionStats.uniqueCards,
        totalValue: collectionStats.totalValue,
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtg-collection-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess('Backup created', 'Collection backup downloaded');
  };

  const handleCardAddition = async (card: any) => {
    const actions: string[] = [];

    if (deckAdditionConfig.addToCollection) {
      try {
        const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
        if (result.error) throw new Error(result.error);
        actions.push('Collection');
      } catch (err) {
        console.error('Error adding to collection:', err);
        showError('Collection error', 'Failed to add card to collection');
        return;
      }
    }

    if (deckAdditionConfig.addToDeck && deckAdditionConfig.selectedDeckId) {
      try {
        addCardToDeck(deckAdditionConfig.selectedDeckId, {
          id: card.id,
          name: card.name,
          mana_cost: card.mana_cost,
          type_line: card.type_line,
          colors: card.colors || [],
          cmc: card.cmc || 0,
          quantity: 1,
          category: deckCategory(card.type_line || ''),
          image_uris: card.image_uris,
          prices: card.prices,
        });
        actions.push('Deck');
      } catch (err) {
        console.error('Error adding to deck:', err);
        showError('Deck error', 'Failed to add card to deck');
        return;
      }
    }

    if (deckAdditionConfig.addToBox && deckAdditionConfig.selectedBoxId) {
      try {
        await StorageAPI.assignCard({
          container_id: deckAdditionConfig.selectedBoxId,
          card_id: card.id,
          qty: 1,
          foil: false,
        });
        actions.push('Box');
      } catch (err) {
        console.error('Failed to add to box:', err);
        showError('Box error', 'Failed to add card to box');
        return;
      }
    }

    if (actions.length > 0) {
      await refresh();
      showSuccess('Card added', `Added ${card.name} to ${actions.join(' + ')}`);
    }
  };

  const selectedDeckName = decks.find(d => d.id === deckAdditionConfig.selectedDeckId)?.name;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <p className="text-destructive">Error loading collection: {error}</p>
          <Button onClick={() => refresh()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    /**
     * The window owns the scroll.
     *
     * This page used to be `h-screen` with `overflow-hidden` wrapped around an
     * `overflow-auto` tab panel, which made it the only route in the nav whose
     * scroll lived in an inner box: the document never grew past the viewport,
     * the scrollbar vanished, scroll restoration broke, and the sticky card
     * detail pane anchored to the wrong container. Nothing on this page needs a
     * fixed viewport, so nothing on it claims one.
     */
    <div className="min-h-screen bg-background">
      {/* Header — carries state, not marketing copy */}
      <div className="bg-card px-3 py-3 shadow-lg shadow-black/20 md:px-6 md:py-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground md:text-2xl">Collection</h1>
            {/* One line, five facts. The four stat cards that used to sit under
                the tab strip repeated three of them word for word. */}
            <CollectionQuickStats
              totalValue={collectionStats.totalValue}
              totalCards={collectionStats.totalCards}
              uniqueCards={collectionStats.uniqueCards}
              avgCardValue={
                collectionStats.totalCards > 0
                  ? collectionStats.totalValue / collectionStats.totalCards
                  : 0
              }
              recentlyAddedCount={recentlyAddedCount}
              unpricedCards={unpricedCards}
              loading={loading}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => refresh()} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/collection/import')}
              className="gap-2"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportBackup} className="gap-2">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Backup</span>
            </Button>
            <Button size="sm" onClick={() => setActiveTab('add-cards')} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Add cards</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="scrollbar-none overflow-x-auto bg-card px-3 sm:px-6">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="inline-flex h-12 w-max gap-1 bg-transparent p-0 sm:w-auto">
            {[
              { value: 'collection', label: 'Cards', icon: Layers, badge: collectionStats.uniqueCards },
              { value: 'analytics', label: 'Analytics', icon: BarChart3, badge: 0 },
              { value: 'add-cards', label: 'Add cards', icon: Search, badge: 0 },
              { value: 'storage', label: 'Storage', icon: Package, badge: 0 },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative whitespace-nowrap rounded-none px-3 py-2 font-medium data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-4 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-foreground"
              >
                <tab.icon className="mr-1.5 h-4 w-4 sm:mr-2" aria-hidden="true" />
                {tab.label}
                {tab.badge ? (
                  <Badge variant="secondary" className="ml-1.5 hidden text-xs sm:inline-flex">
                    {tab.badge}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Main content */}
      <div>
        <Tabs value={currentTab} onValueChange={setActiveTab}>
          {/* Collection */}
          <TabsContent
            value="collection"
            className="m-0 px-3 py-4 sm:px-4 sm:py-6 md:px-6"
          >
            {/* Cards bought and not here yet. Deliberately above the collection
                and outside every total on this page: a card in the post is a
                card you do not own, and folding it in would inflate the value,
                the count and the analytics. It renders nothing when nothing is
                on the way, and it sits before the empty state so somebody whose
                first ever purchase is still in transit sees it. */}
            <CollectionArriving className="mb-6" />

            {loading ? (
              <CollectionLoadingSkeleton />
            ) : cards.length === 0 ? (
              <CollectionEmptyState
                onAddCards={() => setActiveTab('add-cards')}
                onImport={() => navigate('/collection/import')}
                onScan={() => navigate('/scan')}
              />
            ) : (
              <div className="space-y-6">
                <FavoriteDecksPreview />

                {/* Picking a destination deck for a card already on screen is
                    not a place you travel to — it expands here instead. */}
                {deckTarget && (
                  <AddToDeckPanel
                    key={deckTarget.id}
                    item={deckTarget}
                    onClose={() => setDeckTarget(null)}
                  />
                )}

                {/* Full width. Clicking a card leaves for `/cards/:id`, so
                    nothing has to be reserved beside the grid. */}
                <CollectionCardDisplay
                  items={cards}
                  onCardClick={openCard}
                  onMarkForSale={item => navigate(`/marketplace/list/${item.id}`)}
                  onAddToDeck={item => setDeckTarget(item)}
                  onBulkUpdate={refresh}
                />
              </div>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent
            value="analytics"
            className="m-0 px-3 py-4 sm:px-4 sm:py-6 md:px-6"
          >
            <div className="space-y-6">
              <AnalyticsHeader
                totalCards={collectionStats.totalCards}
                totalValue={collectionStats.totalValue}
                uniqueCards={collectionStats.uniqueCards}
                topRarityCount={collectionStats.rarityDistribution?.mythic || 0}
              />

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <PriceHistoryChart collectionCards={cards} />
                <CollectionValueTrends collectionCards={cards} />
              </div>

              <CollectionDeckRecommendations collectionCards={cards} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <TCGPlayerPriceSync />
                {user && <CollectionExport userId={user.id} />}
                {user && <CollectionBackupRestore userId={user.id} />}
              </div>

              <EnhancedPriceAlerts />

              <InsuranceReport
                collectionValue={collectionStats.totalValue}
                cardCount={collectionStats.totalCards}
                topCards={collectionStats.topValueCards.map(item => ({
                  name: item.card_name,
                  setCode: item.set_code,
                  quantity: item.quantity,
                  foil: item.foil,
                  condition: item.condition,
                  // The computed value, not the stale `price_usd` column the
                  // report used to print beside a value-ordered list.
                  value: item.calculatedValue,
                }))}
                unpricedCards={unpricedCards}
              />

              <CollectionAnalytics stats={collectionStats} loading={loading} />
            </div>
          </TabsContent>

          {/* Add cards */}
          <TabsContent
            value="add-cards"
            className="m-0 px-3 py-4 sm:px-4 sm:py-6 md:px-6"
          >
            <div className="space-y-6">
              <AddCardsHeader
                addToCollection={deckAdditionConfig.addToCollection}
                addToDeck={deckAdditionConfig.addToDeck}
                addToBox={deckAdditionConfig.addToBox}
                selectedDeckName={selectedDeckName}
              />

              <DeckAdditionPanel
                selectedDeckId={deckAdditionConfig.selectedDeckId}
                selectedBoxId={deckAdditionConfig.selectedBoxId}
                addToCollection={deckAdditionConfig.addToCollection}
                addToDeck={deckAdditionConfig.addToDeck}
                addToBox={deckAdditionConfig.addToBox}
                onSelectionChange={setDeckAdditionConfig}
              />

              {/*
                PICKING, not browsing. This tab exists to put cards into a
                collection, a deck or a box, and the destination is already
                chosen in the panel above it. A click that walked off to the
                card page would throw that choice away mid-task, which is
                exactly the complaint the owner made about storage. So the card
                body adds the card and the page stays put; the eye on each card
                opens its page.

                Do not drop `mode="pick"` to make this match the card search
                page. That page is a browsing surface and this one is not.
              */}
              <EnhancedUniversalCardSearch
                mode="pick"
                onCardAdd={handleCardAddition}
                placeholder="Search cards to add to collection, deck, or box"
                showFilters={true}
                showAddButton={true}
                showWishlistButton={false}
                showViewModes={true}
              />
            </div>
          </TabsContent>

          {/* Storage */}
          <TabsContent value="storage" className="m-0">
            <StorageTab />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}
