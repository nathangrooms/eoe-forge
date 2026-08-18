import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionCardDisplay } from '@/components/collection/CollectionCardDisplay';
import { CollectionBulkImport } from '@/components/collection/CollectionBulkImport';
import { SellCardModal } from '@/components/collection/SellCardModal';
import { AddToDeckDialog } from '@/components/collection/AddToDeckDialog';
import { StorageAPI } from '@/lib/api/storageAPI';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { FavoriteDecksPreview } from '@/components/collection/FavoriteDecksPreview';

import { StorageTab } from '@/components/storage/StorageTab';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import type { CollectionStats, CollectionCard } from '@/types/collection';
import { CollectionAPI } from '@/server/routes/collection';
import { supabase } from '@/integrations/supabase/client';
import { ListingFormData } from '@/types/listing';
import { priceUSD } from '@/features/collection/value';
import { formatPrice } from '@/components/collection/browser/types';

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

  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(() => searchParams.get('tab') || 'collection');

  const [selectedCard, setSelectedCard] = useState<CollectionCard['card'] | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellCard, setSellCard] = useState<CollectionCard | null>(null);
  const [deckTarget, setDeckTarget] = useState<CollectionCard | null>(null);
  // Hoisted so the empty state's "Import list" card can open the real dialog —
  // it previously clicked a `[data-import-trigger]` element that never existed.
  const [showImport, setShowImport] = useState(false);

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
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if ((TABS as readonly string[]).includes(tabFromUrl)) {
      setCurrentTab(tabFromUrl);
    }
  }, [searchParams]);

  /**
   * Only the `tab` key is touched. The collection browser mirrors its filter
   * into the same query string, so replacing the whole search string here used
   * to wipe an active filter every time a tab was clicked.
   */
  const setActiveTab = (tab: string) => {
    setCurrentTab(tab);
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

    stats.topValueCards = cards
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

  const handleSellSubmit = async (data: ListingFormData) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showError('Authentication error', 'Please sign in to create a listing');
        return;
      }

      const { error: insertError } = await supabase
        .from('listings')
        .insert({ ...data, user_id: sessionData.session.user.id });

      if (insertError) throw insertError;

      showSuccess('Listing created', `${sellCard?.card_name} listed for sale`);
      setShowSellModal(false);
      setSellCard(null);
    } catch (err) {
      console.error('Error creating listing:', err);
      showError('Error', 'Failed to create listing');
    }
  };

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

  const addToCollection = async (card: { name: string; set?: string }) => {
    try {
      const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
      if (result.error) throw new Error(result.error);
      await refresh();
      showSuccess('Card added', `Added ${card.name} to collection`);
    } catch (err) {
      console.error('Error adding to collection:', err);
      showError('Collection error', 'Failed to add card to collection');
    }
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
    <div className="flex h-screen flex-col bg-background">
      {/* Header — carries state, not marketing copy */}
      <div className="bg-card px-3 py-3 shadow-lg shadow-black/20 md:px-6 md:py-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground md:text-2xl">Collection</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {collectionStats.totalCards.toLocaleString()} cards ·{' '}
              {collectionStats.uniqueCards.toLocaleString()} unique ·{' '}
              {formatPrice(collectionStats.totalValue)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => refresh()} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <CollectionBulkImport
              open={showImport}
              onOpenChange={setShowImport}
              onImportComplete={() => {
                refresh();
                showSuccess('Collection updated', 'Import completed');
              }}
            />
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
      <div className="flex-1 overflow-hidden">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="h-full">
          {/* Collection */}
          <TabsContent
            value="collection"
            className="m-0 h-full overflow-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6"
          >
            {loading ? (
              <CollectionLoadingSkeleton />
            ) : cards.length === 0 ? (
              <CollectionEmptyState
                onAddCards={() => setActiveTab('add-cards')}
                onImport={() => setShowImport(true)}
                onScan={() => navigate('/scan')}
              />
            ) : (
              <div className="space-y-6">
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
                  loading={loading}
                />

                <FavoriteDecksPreview />

                <CollectionCardDisplay
                  items={cards}
                  onCardClick={item => {
                    setSelectedCard(item.card ?? null);
                    setShowCardModal(true);
                  }}
                  onMarkForSale={item => {
                    setSellCard(item);
                    setShowSellModal(true);
                  }}
                  onAddToDeck={item => setDeckTarget(item)}
                  onBulkUpdate={refresh}
                />
              </div>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent
            value="analytics"
            className="m-0 h-full overflow-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6"
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
              />

              <CollectionAnalytics stats={collectionStats} loading={loading} />
            </div>
          </TabsContent>

          {/* Add cards */}
          <TabsContent
            value="add-cards"
            className="m-0 h-full overflow-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6"
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

              <EnhancedUniversalCardSearch
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
          <TabsContent value="storage" className="m-0 h-full">
            <StorageTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <UniversalCardModal
        card={selectedCard}
        isOpen={showCardModal}
        onClose={() => {
          setShowCardModal(false);
          setSelectedCard(null);
        }}
        onAddToCollection={() => {
          if (selectedCard) addToCollection({ name: selectedCard.name, set: selectedCard.set_code });
        }}
      />

      <SellCardModal
        isOpen={showSellModal}
        onClose={() => {
          setShowSellModal(false);
          setSellCard(null);
        }}
        card={sellCard}
        ownedQuantity={sellCard?.quantity || 0}
        ownedFoil={sellCard?.foil || 0}
        defaultPrice={sellCard?.card ? priceUSD(sellCard.card, false) : 0}
        onSubmit={handleSellSubmit}
      />

      <AddToDeckDialog
        item={deckTarget}
        open={deckTarget !== null}
        onOpenChange={open => {
          if (!open) setDeckTarget(null);
        }}
      />
    </div>
  );
}
