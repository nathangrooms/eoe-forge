import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { CollectionArriving } from '@/components/shopping';

import { StorageTab } from '@/components/storage/StorageTab';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import type { CollectionCard } from '@/types/collection';
import { CollectionAPI } from '@/server/routes/collection';
import { collectionSummary } from '@/components/collection/analytics/spread';

/**
 * The whole Analytics tab is one component now.
 *
 * It used to be ten imports assembled inline here, four of which derived their
 * own total value from the same rows and disagreed with each other. The
 * composition, the arithmetic and the charts live together in
 * `components/collection/analytics/`, and this page hands it the rows it already
 * loaded.
 */
import { CollectionAnalyticsView } from '@/components/collection/analytics/CollectionAnalyticsView';
import { CollectionQuickStats } from '@/components/collection/CollectionQuickStats';
import { CollectionEmptyState } from '@/components/collection/CollectionEmptyState';
import { CollectionLoadingSkeleton } from '@/components/collection/CollectionLoadingSkeleton';
import { AddCardsHeader } from '@/components/collection/AddCardsHeader';
import { useAuth } from '@/components/AuthProvider';
import { PageTabs } from '@/components/listing';

const TABS = ['collection', 'analytics', 'add-cards', 'storage'] as const;

/**
 * The page's figures come from `collectionSummary` now.
 *
 * A local `valueOfItem` and a local `hasPrice` used to live here, restating
 * `ownedValueUSD` and `canPriceOwnedCopies` in this file's own words. They were
 * the same arithmetic, which is exactly why it is worth deleting them: two
 * copies of a rule stay identical right up until one of them is edited. The
 * page header, the tab badge and the whole Analytics tab now read one summary
 * built by one pass over the rows.
 */

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

  /**
   * The page header's figures, from the same one pass the Analytics tab uses.
   *
   * This used to be a fifty line loop that also built colour, type, rarity and
   * set distributions plus a top ten, all of which existed to feed components
   * that have been replaced. Nothing read them any more, and a distribution
   * nobody draws is still recomputed on every collection change.
   *
   * `uniqueCards` stays `cards.length` deliberately: the tab badge counts rows
   * in the collection, and a row with no copies left is a row somebody can still
   * see and edit in the grid.
   *
   * NOTE: every hook must stay above the early `error` return below. A previous
   * version declared a useMemo after it, so React rendered fewer hooks on the
   * render where `error` flipped and the friendly retry screen crashed.
   */
  const summary = useMemo(() => collectionSummary(cards), [cards]);

  const collectionStats = useMemo(
    () => ({
      totalCards: summary.copies,
      uniqueCards: cards.length,
      totalValue: summary.value,
    }),
    [summary, cards.length]
  );

  const recentlyAddedCount = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return cards.filter(item => new Date(item.created_at) > sevenDaysAgo).length;
  }, [cards]);

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
      {/*
        Header — carries state, not marketing copy.

        The four actions sit on the title line, which is My Decks' arrangement
        and the reason its metric row gets the whole content band. Here they
        used to share a flex row with the figures, so the figures had 840 of
        1,288px to work with and were shrunk to a 20px run of text to fit. The
        figures have their own line under the tab strip now.
      */}
      <div className="bg-card px-3 py-3 shadow-lg shadow-black/20 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">Collection</h1>
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

      {/*
        The page's four sections.

        This was an underline strip built out of eight
        `data-[state=active]:after:` rules, one of six different tab treatments
        across the pages in this pass. It is `PageTabs` now, the same control
        the wishlist, the shopping list, the marketplace and the scanner use, so
        moving between them does not mean meeting a new control for the same
        action.

        The reason the badge holds its place from the first paint moved into
        that component with it: it used to be absent until the count arrived, so
        the moment the collection loaded the Cards tab grew and shoved the other
        three sideways.
      */}
      <div className="bg-card px-3 pb-3 sm:px-6">
        <PageTabs
          value={currentTab}
          onChange={setActiveTab}
          label="Collection sections"
          tabs={[
            {
              id: 'collection',
              label: 'Cards',
              icon: Layers,
              count: loading ? null : collectionStats.uniqueCards,
            },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'add-cards', label: 'Add cards', shortLabel: 'Add', icon: Search },
            { id: 'storage', label: 'Storage', icon: Package },
          ]}
        />
      </div>

      {/*
        The figures, on their own line and with the full content band.

        Below the tab strip rather than inside the header, because a metric tile
        is `bg-card` and the header is too: a card drawn on a card is not a
        tile, it is a rectangle nobody can see. Here they sit on the page ground
        and read as raised, which is the whole point of the treatment.

        Outside `Tabs` so it survives the tab change without remounting, but
        NOT on Storage. Storage answers a different question and draws its own
        four figures for it, and two 95px rows stacked is 190px of numbers
        before the shelf starts. One row per screen; which figures are in it
        follows the tab.
      */}
      {currentTab !== 'storage' && (
        <div className="px-3 pt-4 sm:px-4 md:px-6">
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
            unpricedCards={summary.unpriced}
            loading={loading}
          />
        </div>
      )}

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
            {/* One component, one valuation, one set of charts. Everything it
                shows comes from the rows already loaded above, so opening this
                tab issues no query against the collection at all. */}
            <CollectionAnalyticsView cards={cards} loading={loading} />
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
