import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Crown, Package } from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionInventory } from '@/features/collection/CollectionInventory';
import { CollectionAnalytics } from '@/features/collection/CollectionAnalytics';
import { EnhancedCollectionAnalytics } from '@/components/enhanced/EnhancedCollectionAnalytics';
import { CollectionImport } from '@/components/collection/CollectionImport';
import { BulkOperations } from '@/components/collection/BulkOperations';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { CollectionCardDisplay } from '@/components/collection/CollectionCardDisplay';
import { SellCardModal } from '@/components/collection/SellCardModal';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { StorageTab } from '@/components/storage/StorageTab';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { CollectionAPI } from '@/server/routes/collection';
import { supabase } from '@/integrations/supabase/client';
import { ListingFormData } from '@/types/listing';

export default function Collection() {
  const {
    snapshot,
    loading,
    error,
    searchQuery,
    viewMode,
    selectedCards,
    load,
    refresh,
    setSearchQuery,
    setFilters,
    setViewMode,
    toggleCardSelection,
    addCard,
    getStats,
    getFilteredCards
  } = useCollectionStore();

  const { addCardToDeck } = useDeckManagementStore();

  // Get active tab from URL params with stable state management
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(() => searchParams.get('tab') || 'collection');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [addToCollectionState, setAddToCollectionState] = useState(true);
  const [addToDeckState, setAddToDeckState] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellCard, setSellCard] = useState<any>(null);

  // Sync currentTab with URL changes, but preserve tab during searches
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'collection';
    // Only update if it's actually a different tab (not just search params changing)
    if (tabFromUrl !== currentTab && ['collection', 'add-cards', 'analysis', 'storage', 'import'].includes(tabFromUrl)) {
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (currentTab === 'add-cards') {
      // Focus search when on add-cards tab
      setTimeout(() => {
        const searchInput = document.querySelector('input[placeholder*="Search cards"]') as HTMLInputElement;
        searchInput?.focus();
      }, 100);
    }
  }, [currentTab]);

  // Get current stats
  const stats = getStats();
  const filteredCards = getFilteredCards();

  const addToCollectionAndDeck = async (card: any) => {
    let addedToCollection = false;
    let addedToDeck = false;

    // Add to collection if enabled
    if (addToCollectionState) {
      try {
        // Use the collection store's addCardByName method for Scryfall cards
        const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
        if (result.error) {
          throw new Error(result.error);
        }
        await refresh(); // Refresh the collection
        addedToCollection = true;
      } catch (error) {
        console.error('Error adding to collection:', error);
        showError('Collection Error', 'Failed to add card to collection');
      }
    }

    // Add to deck if enabled and deck selected
    if (addToDeckState && selectedDeckId) {
      try {
        const deckCard = {
          id: card.id,
          name: card.name,
          cmc: card.cmc || 0,
          type_line: card.type_line || '',
          colors: card.colors || [],
          mana_cost: card.mana_cost,
          quantity: 1,
          category: card.type_line?.toLowerCase().includes('creature') ? 'creatures' : 
                   card.type_line?.toLowerCase().includes('land') ? 'lands' :
                   card.type_line?.toLowerCase().includes('instant') ? 'instants' :
                   card.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' : 'other',
          mechanics: card.keywords || [],
          image_uris: card.image_uris,
          prices: card.prices
        } as const;

        addCardToDeck(selectedDeckId, deckCard);
        addedToDeck = true;
      } catch (error) {
        console.error('Error adding to deck:', error);
        showError('Deck Error', 'Failed to add card to deck');
      }
    }

    // Show success message
    const locations = [];
    if (addedToCollection) locations.push('collection');
    if (addedToDeck) locations.push('deck');
    
    if (locations.length > 0) {
      showSuccess(
        'Card Added', 
        `Added ${card.name} to ${locations.join(' and ')}`
      );
    }
  };

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

      console.log('Creating listing:', data);
      
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
    if (!selectedDeckId) {
      showError('No Deck Selected', 'Please select a deck first');
      return;
    }

    try {
      const deckCard = {
        id: item.card_id,
        name: item.card_name,
        cmc: item.card?.cmc || 0,
        type_line: item.card?.type_line || '',
        colors: item.card?.colors || [],
        mana_cost: item.card?.mana_cost,
        quantity: item.tempQuantity || 1,
        category: item.card?.type_line?.toLowerCase().includes('creature') ? 'creatures' : 
                 item.card?.type_line?.toLowerCase().includes('land') ? 'lands' :
                 item.card?.type_line?.toLowerCase().includes('instant') ? 'instants' :
                 item.card?.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' : 'other',
        mechanics: item.card?.keywords || [],
        image_uris: item.card?.image_uris,
        prices: item.card?.prices
      } as const;

      addCardToDeck(selectedDeckId, deckCard);
      showSuccess('Added to Deck', `Added ${item.tempQuantity || 1}x ${item.card_name} to deck`);
    } catch (error) {
      console.error('Error adding to deck:', error);
      showError('Deck Error', 'Failed to add card to deck');
    }
  };


  if (error) {
    return (
      <div className="p-6 h-screen overflow-y-auto">
        <div className="text-center space-y-4">
          <p className="text-destructive">Error loading collection: {error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <StandardPageLayout
      title="Collection Manager"
      description="Manage your Magic: The Gathering collection with universal MTG card support"
      action={
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-6">
          <div className="grid grid-cols-3 gap-3 sm:flex sm:space-x-6 w-full sm:w-auto">
            <div className="text-center sm:text-right">
              <div className="text-xs sm:text-sm text-muted-foreground">Total Value</div>
              <div className="text-sm sm:text-lg font-bold text-green-600">
                ${stats.totalValue.toLocaleString()}
              </div>
            </div>
            <div className="text-center sm:text-right">
              <div className="text-xs sm:text-sm text-muted-foreground">Total Cards</div>
              <div className="text-sm sm:text-lg font-bold">{stats.totalCards.toLocaleString()}</div>
            </div>
            <div className="text-center sm:text-right">
              <div className="text-xs sm:text-sm text-muted-foreground">Unique Cards</div>
              <div className="text-sm sm:text-lg font-bold">{stats.uniqueCards.toLocaleString()}</div>
            </div>
          </div>
        </div>
      }
    >
        <Tabs value={currentTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
            <TabsTrigger 
              value="collection" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Collection
            </TabsTrigger>
            <TabsTrigger 
              value="add-cards" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Add Cards
            </TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Analysis
            </TabsTrigger>
            <TabsTrigger value="storage" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Storage
            </TabsTrigger>
            <TabsTrigger value="import" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Import
            </TabsTrigger>
          </TabsList>

          {/* Collection Tab - Now First */}
          <TabsContent value="collection" className="space-y-6">
            {/* Storage Quick Access - Make it prominent */}
            <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Storage Organization
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Organize your physical collection into boxes, binders, and containers
                </p>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setActiveTab('storage')} 
                  className="w-full sm:w-auto"
                  size="lg"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Manage Storage
                </Button>
              </CardContent>
            </Card>

            {/* Collection Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold">{stats.totalCards}</h3>
                    <p className="text-sm text-muted-foreground">Total Cards</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold">{stats.uniqueCards}</h3>
                    <p className="text-sm text-muted-foreground">Unique Cards</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold">${stats.totalValue?.toFixed(2) || '0.00'}</h3>
                    <p className="text-sm text-muted-foreground">Total Value</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold">{stats.uniqueCards > 0 ? ((stats.totalCards / stats.uniqueCards) * 100).toFixed(0) : '0'}%</h3>
                    <p className="text-sm text-muted-foreground">Avg Copies</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Collection Display with Enhanced Features */}
            <div className="space-y-4">
              <DeckAdditionPanel
                selectedDeckId={selectedDeckId}
                addToCollection={false}
                addToDeck={true}
                onSelectionChange={(config) => {
                  setSelectedDeckId(config.selectedDeckId);
                }}
              />
              
              <CollectionCardDisplay
                items={filteredCards || []}
                viewMode={viewMode as any}
                onCardClick={handleCardClick}
                onMarkForSale={handleMarkForSale}
                onAddToDeck={handleAddToDeck}
              />
            </div>
          </TabsContent>

          {/* Add Cards Tab */}
          <TabsContent value="add-cards" className="space-y-6">
            <DeckAdditionPanel
              selectedDeckId={selectedDeckId}
              addToCollection={addToCollectionState}
              addToDeck={addToDeckState}
              onSelectionChange={(config) => {
                setSelectedDeckId(config.selectedDeckId);
                setAddToCollectionState(config.addToCollection);
                setAddToDeckState(config.addToDeck);
              }}
            />
            
            <EnhancedUniversalCardSearch
              onCardAdd={addToCollectionAndDeck}
              onCardSelect={(card) => console.log('Selected:', card)}
              placeholder="Search cards to add to your collection..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={false}
              showViewModes={true}
            />
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            <EnhancedCollectionAnalytics 
              stats={stats}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="storage" className="space-y-6">
            <StorageTab />
          </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Bulk Import</h3>
                  <p className="text-sm text-muted-foreground">
                    Import your collection from text lists, CSV files, or other tools
                  </p>
                </div>
                <Button onClick={() => setShowImportDialog(true)}>
                  Import Collection
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <BulkOperations 
            onCollectionUpdate={refresh}
          />
        </TabsContent>

        </Tabs>
        
        {/* Universal Card Modal */}
        <UniversalCardModal
          card={selectedCard}
          isOpen={showCardModal}
          onClose={() => {
            setShowCardModal(false);
            setSelectedCard(null);
          }}
          onAddToCollection={() => {
            if (selectedCard) {
              const cardData = {
                name: selectedCard.name,
                set: selectedCard.set,
                id: selectedCard.id
              };
              addToCollectionAndDeck(cardData);
            }
          }}
        />
        
        {/* Sell Card Modal */}
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

        {/* Import Dialog */}
        <CollectionImport
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            setShowImportDialog(false);
            refresh();
          }}
        />
    </StandardPageLayout>
  );
}