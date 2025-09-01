import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Plus, Search, ShoppingCart, Users } from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { CollectionCardDisplay } from '@/components/collection/CollectionCardDisplay';
import { SellCardModal } from '@/components/collection/SellCardModal';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { EnhancedCollectionAnalytics } from '@/components/enhanced/EnhancedCollectionAnalytics';
import { StorageSidebar } from '@/components/storage/StorageSidebar';
import { FullScreenAssignment } from '@/components/storage/FullScreenAssignment';
import { StorageContainerView } from '@/components/storage/StorageContainerView';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { CollectionAPI } from '@/server/routes/collection';
import { supabase } from '@/integrations/supabase/client';
import { ListingFormData } from '@/types/listing';
import { StorageContainer } from '@/types/storage';

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

  // Tab management
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(() => searchParams.get('tab') || 'collection');

  // Modals and dialogs
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellCard, setSellCard] = useState<any>(null);

  // Storage state
  const [selectedContainer, setSelectedContainer] = useState<StorageContainer | null>(null);
  const [showAssignment, setShowAssignment] = useState(false);
  const [assignmentContainerId, setAssignmentContainerId] = useState<string>('');

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if (['collection', 'add-cards', 'analysis'].includes(tabFromUrl)) {
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
  const filteredCards = getFilteredCards();

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

  if (selectedContainer) {
    return (
      <div className="h-screen flex">
        <div className="flex-1">
          <StorageContainerView 
            container={selectedContainer}
            onBack={handleBackToStorage}
          />
        </div>
        <StorageSidebar
          onAssignToContainer={handleAssignToContainer}
          onContainerSelect={handleContainerSelect}
          selectedContainerId={selectedContainer?.id}
          collapsed={false}
          onToggleCollapse={() => {}}
        />
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
          <div className="flex items-center gap-8">
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

      {/* Storage Containers - Prominent at top */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <StorageSidebar
          onAssignToContainer={handleAssignToContainer}
          onContainerSelect={handleContainerSelect}
          selectedContainerId={selectedContainer?.id}
          collapsed={false}
          onToggleCollapse={() => {}}
          horizontal={true}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b px-6">
            <TabsList className="grid w-96 grid-cols-2 bg-transparent p-0 h-12">
              <TabsTrigger 
                value="collection" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                Collection
              </TabsTrigger>
              <TabsTrigger 
                value="add-cards"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                Add & Organize
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="collection" className="h-full overflow-auto px-6 py-4 m-0">
              <CollectionCardDisplay
                items={filteredCards || []}
                viewMode="grid"
                onCardClick={handleCardClick}
                onMarkForSale={handleMarkForSale}
                onAddToDeck={handleAddToDeck}
              />
            </TabsContent>

            <TabsContent value="add-cards" className="h-full overflow-auto px-6 py-4 m-0">
              <div className="space-y-6">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Add Cards & Organize</h3>
                  <p className="text-sm text-muted-foreground">
                    Search for cards to add to your collection, then immediately assign them to storage containers.
                  </p>
                </div>
                <EnhancedUniversalCardSearch
                  onCardAdd={addToCollection}
                  onCardSelect={(card) => console.log('Selected:', card)}
                  placeholder="Search cards to add (then assign to storage)"
                  showFilters={true}
                  showAddButton={true}
                  showWishlistButton={false}
                  showViewModes={false}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Full Screen Assignment */}
      {showAssignment && (
        <FullScreenAssignment
          containerId={assignmentContainerId}
          containerName={
            assignmentContainerId 
              ? selectedContainer?.name || 'Container'
              : undefined
          }
          onClose={() => setShowAssignment(false)}
          onSuccess={() => {
            setShowAssignment(false);
            refresh();
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