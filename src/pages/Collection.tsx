import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Plus, Search, ShoppingCart, Users, BarChart3, Download } from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionCardDisplay } from '@/components/collection/CollectionCardDisplay';
import { CollectionBulkImport } from '@/components/collection/CollectionBulkImport';
import { SellCardModal } from '@/components/collection/SellCardModal';
import { StorageAPI } from '@/lib/api/storageAPI';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { FavoriteDecksPreview } from '@/components/collection/FavoriteDecksPreview';

import { StorageTab } from '@/components/storage/StorageTab';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import { CollectionStats } from '@/types/collection';
import { CollectionAPI } from '@/server/routes/collection';
import { supabase } from '@/integrations/supabase/client';
import { ListingFormData } from '@/types/listing';
import { StorageContainer } from '@/types/storage';
import { AICollectionInsights } from '@/components/collection/AICollectionInsights';
import { CategoryManager } from '@/components/collection/CategoryManager';
import { TCGPlayerPriceSync } from '@/components/collection/TCGPlayerPriceSync';
import { CollectionExport } from '@/components/collection/CollectionExport';
import { CollectionBackupRestore } from '@/components/collection/CollectionBackupRestore';
import { InsuranceReport } from '@/components/collection/InsuranceReport';
import { PriceHistoryChart } from '@/components/collection/PriceHistoryChart';
import { SavedFilterPresets } from '@/components/collection/SavedFilterPresets';
import { CollectionDeckRecommendations } from '@/components/collection/CollectionDeckRecommendations';
import { CollectionValueTrends } from '@/components/collection/CollectionValueTrends';
import { useAuth } from '@/components/AuthProvider';

export default function Collection() {
  const {
    snapshot,
    loading,
    error,
    viewMode,
    load,
    refresh,
    addCard,
    getStats,
    getFilteredCards
  } = useCollectionStore();

  const { addCardToDeck } = useDeckManagementStore();
  const { user } = useAuth();

  // Tab management
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(() => searchParams.get('tab') || 'collection');

  // Modals and dialogs
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellCard, setSellCard] = useState<any>(null);
  
  // Collection search state
  // Collection filters (removed - now in UniversalLocalSearch)

  // Deck Addition Panel state
  const [deckAdditionConfig, setDeckAdditionConfig] = useState({
    selectedDeckId: '',
    selectedBoxId: '',
    addToCollection: true,
    addToDeck: false,
    addToBox: false,
  });

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    // Only load collection on initial mount
    if (isInitialLoad) {
      load();
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if (['collection', 'analytics', 'add-cards', 'storage'].includes(tabFromUrl)) {
      setCurrentTab(tabFromUrl);
    }
  }, [searchParams]);

  const setActiveTab = (tab: string) => {
    setCurrentTab(tab);
    if (tab === 'collection') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  const stats = getStats();
  const cards = snapshot?.items || [];

  // Removed - filtering now done in UniversalLocalSearch

  // Calculate collection stats
  const collectionStats = useMemo(() => {
    if (!cards || cards.length === 0) {
      return {
        totalCards: 0,
        uniqueCards: 0,
        totalValue: 0,
        avgCmc: 0,
        colorDistribution: {},
        typeDistribution: {},
        rarityDistribution: {},
        setDistribution: {},
        topValueCards: [],
        recentlyAdded: []
      };
    }

    const stats: CollectionStats = {
      totalCards: 0,
      uniqueCards: cards.length,
      totalValue: 0,
      avgCmc: 0,
      colorDistribution: {},
      typeDistribution: {},
      rarityDistribution: {},
      setDistribution: {},
      topValueCards: [],
      recentlyAdded: []
    };

    let totalCmc = 0;
    let cardsWithCmc = 0;

    cards.forEach(card => {
      const totalQuantity = card.quantity + card.foil;
      stats.totalCards += totalQuantity;
      
      // Value calculation
      const normalValue = card.quantity * (parseFloat(card.card?.prices?.usd || '0') || 0);
      const foilValue = card.foil * (parseFloat(card.card?.prices?.usd_foil || card.card?.prices?.usd || '0') || 0);
      stats.totalValue += normalValue + foilValue;

      // CMC calculation
      if (card.card?.cmc) {
        totalCmc += card.card.cmc * totalQuantity;
        cardsWithCmc += totalQuantity;
      }

      // Color distribution
      if (card.card?.colors && card.card.colors.length > 0) {
        card.card.colors.forEach(color => {
          stats.colorDistribution[color] = (stats.colorDistribution[color] || 0) + totalQuantity;
        });
      } else {
        stats.colorDistribution['C'] = (stats.colorDistribution['C'] || 0) + totalQuantity;
      }

      // Type distribution (extract main type from type_line)
      if (card.card?.type_line) {
        const mainType = card.card.type_line.split(' — ')[0].split(' ')[0].toLowerCase();
        stats.typeDistribution[mainType] = (stats.typeDistribution[mainType] || 0) + totalQuantity;
      }

      // Rarity distribution
      if (card.card?.rarity) {
        stats.rarityDistribution[card.card.rarity] = (stats.rarityDistribution[card.card.rarity] || 0) + totalQuantity;
      }

      // Set distribution
      stats.setDistribution[card.set_code] = (stats.setDistribution[card.set_code] || 0) + totalQuantity;
    });

    stats.avgCmc = cardsWithCmc > 0 ? totalCmc / cardsWithCmc : 0;

    // Top value cards (sorted by total value)
    stats.topValueCards = [...cards]
      .map(card => ({
        ...card,
        calculatedValue: (card.quantity * (parseFloat(card.card?.prices?.usd || '0') || 0)) +
                        (card.foil * (parseFloat(card.card?.prices?.usd_foil || card.card?.prices?.usd || '0') || 0))
      }))
      .sort((a, b) => (b as any).calculatedValue - (a as any).calculatedValue)
      .slice(0, 10);

    // Recently added (last 6 by created_at)
    stats.recentlyAdded = [...cards]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);

    return stats;
  }, [cards]);

  const handleCardClick = (item: any) => {
    setSelectedCard(item.card);
    setShowCardModal(true);
  };

  const handleMarkForSale = (item: any) => {
    setSellCard(item);
    setShowSellModal(true);
  };

  const handleSellSubmit = async (data: ListingFormData) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError('Authentication Error', 'Please log in to create a listing');
        return;
      }

      const { error } = await supabase
        .from('listings')
        .insert({
          ...data,
          user_id: session.user.id
        });

      if (error) throw error;
      
      showSuccess('Listing Created', `${sellCard?.card_name} listed for sale`);
      setShowSellModal(false);
      setSellCard(null);
    } catch (error) {
      console.error('Error creating listing:', error);
      showError('Error', 'Failed to create listing');
    }
  };

  const handleAddToDeck = (item: any) => {
    // Simplified add to deck - user can select deck later
    showSuccess('Added to Queue', 'Card added to deck builder queue');
  };

  const handleExportBackup = async () => {
    try {
      if (!snapshot) {
        showError('No Data', 'No collection data to backup');
        return;
      }

      const backup = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        collection: {
          items: snapshot.items,
          totals: snapshot.totals
        },
        metadata: {
          totalCards: snapshot.totals.count,
          uniqueCards: snapshot.totals.unique,
          totalValue: snapshot.totals.valueUSD
        }
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
      
      showSuccess('Backup Created', 'Collection backup downloaded successfully');
    } catch (error) {
      console.error('Error creating backup:', error);
      showError('Backup Failed', 'Failed to create collection backup');
    }
  };

  const addToCollection = async (card: any) => {
    try {
      const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
      if (result.error) {
        throw new Error(result.error);
      }
      await refresh();
      showSuccess('Card Added', `Added ${card.name} to collection`);
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Collection Error', 'Failed to add card to collection');
    }
  };

  // Enhanced add card function that handles multiple destinations
  const handleCardAddition = async (card: any) => {
    const actions = [];
    
    // Add to collection if selected
    if (deckAdditionConfig.addToCollection) {
      try {
        const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
        if (result.error) throw new Error(result.error);
        actions.push('Collection');
      } catch (error) {
        console.error('Error adding to collection:', error);
        showError('Collection Error', 'Failed to add card to collection');
        return;
      }
    }

    // Add to deck if selected
    if (deckAdditionConfig.addToDeck && deckAdditionConfig.selectedDeckId) {
      try {
        // Determine card category
        const getCardCategory = (typeLine: string): DeckCard['category'] => {
          if (typeLine.includes('Creature')) return 'creatures';
          if (typeLine.includes('Land')) return 'lands';
          if (typeLine.includes('Instant')) return 'instants';
          if (typeLine.includes('Sorcery')) return 'sorceries';
          if (typeLine.includes('Artifact')) return 'artifacts';
          if (typeLine.includes('Enchantment')) return 'enchantments';
          if (typeLine.includes('Planeswalker')) return 'planeswalkers';
          return 'other';
        };

        await addCardToDeck(deckAdditionConfig.selectedDeckId, {
          id: card.id,
          name: card.name,
          mana_cost: card.mana_cost,
          type_line: card.type_line,
          colors: card.colors || [],
          cmc: card.cmc || 0,
          quantity: 1,
          category: getCardCategory(card.type_line || ''),
          image_uris: card.image_uris,
          prices: card.prices
        });
        actions.push('Deck');
      } catch (error) {
        console.error('Error adding to deck:', error);
        showError('Deck Error', 'Failed to add card to deck');
        return;
      }
    }

    // Add to box if selected
    if (deckAdditionConfig.addToBox && deckAdditionConfig.selectedBoxId) {
      try {
        console.log('Attempting to add to box:', {
          container_id: deckAdditionConfig.selectedBoxId,
          card_id: card.id,
          card_name: card.name,
          qty: 1,
          foil: false
        });
        
        await StorageAPI.assignCard({
          container_id: deckAdditionConfig.selectedBoxId,
          card_id: card.id,
          qty: 1,
          foil: false
        });
        actions.push('Box');
        console.log('Successfully added to box:', deckAdditionConfig.selectedBoxId);
      } catch (error) {
        console.error('Failed to add to box:', error);
        showError('Box Error', 'Failed to add card to box');
        return;
      }
    }

    // Refresh collection and show success
    if (actions.length > 0) {
      await refresh();
      showSuccess('Card Added', `Added ${card.name} to ${actions.join(' + ')}`);
    }
  };

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">Error loading collection: {error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Collection Manager</h1>
            <p className="text-muted-foreground">Organize your Magic: The Gathering collection</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <CollectionBulkImport onImportComplete={() => {
                refresh();
                showSuccess('Collection Updated', 'Import completed successfully');
              }} />
              <Button variant="outline" onClick={handleExportBackup}>
                <Download className="h-4 w-4 mr-2" />
                Backup
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('analytics')}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </Button>
            </div>
            <div className="flex items-center gap-8 pl-4 border-l">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-xl font-bold text-green-500">${stats.totalValue.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Cards</div>
                <div className="text-xl font-bold">{stats.totalCards}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-96 grid-cols-4 bg-transparent p-0 h-12">
            <TabsTrigger 
              value="collection" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Collection
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="add-cards"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Add Cards
            </TabsTrigger>
            <TabsTrigger 
              value="storage"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Storage
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="h-full">
          {/* Collection Tab */}
          <TabsContent value="collection" className="h-full overflow-auto px-6 py-4 m-0">
            <div className="space-y-6">
              {/* Category Manager */}
              <CategoryManager />
              
              {/* Favorite Decks Preview */}
              <FavoriteDecksPreview />
              
              {/* Collection Cards with integrated search */}
              <CollectionCardDisplay
                items={cards || []}
                viewMode="grid"
                onCardClick={handleCardClick}
                onMarkForSale={handleMarkForSale}
                onAddToDeck={handleAddToDeck}
                onBulkUpdate={refresh}
              />
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="h-full overflow-auto px-6 py-4 m-0">
            <div className="space-y-6">
              {collectionStats && (
                <>
                  <AICollectionInsights
                    stats={{
                      totalCards: collectionStats.totalCards,
                      uniqueCards: collectionStats.uniqueCards,
                      totalValue: collectionStats.totalValue,
                      byColor: collectionStats.colorDistribution,
                      byRarity: collectionStats.rarityDistribution
                    }}
                    topCards={collectionStats.topValueCards?.slice(0, 10).map(c => ({
                      name: c.card_name,
                      quantity: c.quantity,
                      value: c.price_usd
                    }))}
                  />
                  <PriceHistoryChart 
                    collectionCards={(snapshot?.items || []).map(card => ({
                      ...card,
                      quantity: card.quantity || 1,
                      price_usd: card.price_usd || '0'
                    }))}
                  />
                  <CollectionValueTrends 
                    collectionCards={snapshot?.items || []}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SavedFilterPresets 
                      onApplyPreset={(filters) => {
                        // Filter logic would be handled by parent component
                        console.log('Apply filters:', filters);
                      }}
                      currentFilters={{}}
                    />
                    <CollectionDeckRecommendations 
                      collectionCards={snapshot?.items || []}
                    />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <TCGPlayerPriceSync />
                    {user && <CollectionExport userId={user.id} />}
                    {user && <CollectionBackupRestore userId={user.id} />}
                  </div>
                  {collectionStats && (
                    <InsuranceReport 
                      collectionValue={collectionStats.totalValue}
                      cardCount={collectionStats.totalCards}
                      topCards={collectionStats.topValueCards?.map(c => ({
                        name: c.card_name,
                        value: c.price_usd
                      }))}
                    />
                  )}
                  <CollectionAnalytics 
                    stats={collectionStats} 
                    loading={loading}
                  />
                </>
              )}
            </div>
          </TabsContent>

          {/* Add Cards Tab */}
          <TabsContent value="add-cards" className="h-full overflow-auto px-6 py-4 m-0">
            <div className="space-y-6">
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
                onCardSelect={(card) => console.log('Selected:', card)}
                placeholder="Search cards to add to collection, deck, or box"
                showFilters={true}
                showAddButton={true}
                showWishlistButton={false}
                showViewModes={false}
              />
            </div>
          </TabsContent>

          {/* Storage Tab */}
          <TabsContent value="storage" className="h-full m-0">
            <StorageTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Full Screen Assignment - Remove this section */}

      {/* Modals */}
      <UniversalCardModal
        card={selectedCard}
        isOpen={showCardModal}
        onClose={() => {
          setShowCardModal(false);
          setSelectedCard(null);
        }}
        onAddToCollection={() => {
          if (selectedCard) {
            addToCollection(selectedCard);
          }
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
        defaultPrice={sellCard?.card?.prices?.usd ? parseFloat(sellCard.card.prices.usd) : 0}
        onSubmit={handleSellSubmit}
      />
    </div>
  );
}