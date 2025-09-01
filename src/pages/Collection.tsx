import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Crown, Package, Menu } from 'lucide-react';
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
import { StorageSidebar } from '@/components/storage/StorageSidebar';
import { StorageContainerView } from '@/components/storage/StorageContainerView';
import { FullScreenAssignment } from '@/components/storage/FullScreenAssignment';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { CollectionAPI } from '@/server/routes/collection';
import { supabase } from '@/integrations/supabase/client';
import { ListingFormData } from '@/types/listing';
import { StorageContainer } from '@/types/storage';
import { useIsMobile } from '@/hooks/use-mobile';

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

  const isMobile = useIsMobile();

  // Get active tab from URL params - simplified to 3 main tabs
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

  // Storage state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const [selectedContainer, setSelectedContainer] = useState<StorageContainer | null>(null);
  const [showAssignment, setShowAssignment] = useState(false);
  const [assignmentContainerId, setAssignmentContainerId] = useState<string>('');

  // Sync currentTab with URL changes - simplified tabs
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if (tabFromUrl !== currentTab && ['collection', 'add-cards', 'analysis'].includes(tabFromUrl)) {
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

  // Storage handlers
  const handleAssignToContainer = (containerId: string) => {
    setAssignmentContainerId(containerId);
    setShowAssignment(true);
  };

  const handleContainerSelect = (container: StorageContainer) => {
    setSelectedContainer(container);
  };

  const handleBackToStorage = () => {
    setSelectedContainer(null);
  };

  // Handle mobile sidebar
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);


  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-semibold">Collection Manager</h1>
              <p className="text-sm text-muted-foreground">
                Organize your Magic: The Gathering collection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-6">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-lg font-bold text-green-600">${stats.totalValue.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Cards</div>
                <div className="text-lg font-bold">{stats.totalCards.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedContainer ? (
            <StorageContainerView 
              container={selectedContainer}
              onBack={handleBackToStorage}
            />
          ) : (
            <Tabs value={currentTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <div className="border-b px-4">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                  <TabsTrigger value="collection">Collection</TabsTrigger>
                  <TabsTrigger value="add-cards">Add Cards</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="collection" className="h-full overflow-auto p-4 space-y-6">
                  <CollectionCardDisplay
                    items={filteredCards || []}
                    viewMode={viewMode as any}
                    onCardClick={handleCardClick}
                    onMarkForSale={handleMarkForSale}
                    onAddToDeck={handleAddToDeck}
                  />
                </TabsContent>

                <TabsContent value="add-cards" className="h-full overflow-auto p-4 space-y-6">
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

                <TabsContent value="analysis" className="h-full overflow-auto p-4">
                  <EnhancedCollectionAnalytics 
                    stats={stats}
                    loading={loading}
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        {/* Storage Sidebar */}
        <StorageSidebar
          onAssignToContainer={handleAssignToContainer}
          onContainerSelect={handleContainerSelect}
          selectedContainerId={selectedContainer?.id}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Full Screen Assignment */}
      {showAssignment && (
        <FullScreenAssignment
          containerId={assignmentContainerId}
          containerName={
            assignmentContainerId 
              ? selectedContainer?.name || 'Unknown Container'
              : undefined
          }
          onClose={() => setShowAssignment(false)}
          onSuccess={() => {
            setShowAssignment(false);
            // Refresh storage sidebar data
          }}
        />
      )}
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
            const cardData = {
              name: selectedCard.name,
              set: selectedCard.set,
              id: selectedCard.id
            };
            addToCollectionAndDeck(cardData);
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

      <CollectionImport
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          setShowImportDialog(false);
          refresh();
        }}
      />
    </div>
  );
}