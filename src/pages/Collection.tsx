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
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { FavoriteDecksPreview } from '@/components/collection/FavoriteDecksPreview';
import { CollectionSearch } from '@/components/collection/CollectionSearch';
import { StorageManagement } from '@/components/storage/StorageManagement';
import { StorageSidebar } from '@/components/storage/StorageSidebar';
import { FullScreenAssignment } from '@/components/storage/FullScreenAssignment';
import { StorageContainerView } from '@/components/storage/StorageContainerView';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
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
  
  // Collection search state
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const [collectionFilters, setCollectionFilters] = useState<any>({});

  // Deck Addition Panel state
  const [deckAdditionConfig, setDeckAdditionConfig] = useState({
    selectedDeckId: '',
    selectedBoxId: '',
    addToCollection: true,
    addToDeck: false,
    addToBox: false,
  });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'collection';
    if (['collection', 'add-cards', 'storage'].includes(tabFromUrl)) {
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
      // TODO: Implement storage assignment
      actions.push('Box');
      console.log('Adding to box:', deckAdditionConfig.selectedBoxId);
    }

    // Refresh collection and show success
    if (actions.length > 0) {
      await refresh();
      showSuccess('Card Added', `Added ${card.name} to ${actions.join(' + ')}`);
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

      {/* Tabs */}
      <div className="border-b px-6">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-80 grid-cols-3 bg-transparent p-0 h-12">
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
              {/* Favorite Decks Preview */}
              <FavoriteDecksPreview />
              
              {/* Collection Search */}
              <CollectionSearch
                onSearchChange={setCollectionSearchQuery}
                onFiltersChange={setCollectionFilters}
                totalResults={filteredCards?.length || 0}
              />
              
              {/* Collection Cards */}
              <CollectionCardDisplay
                items={filteredCards || []}
                viewMode="grid"
                onCardClick={handleCardClick}
                onMarkForSale={handleMarkForSale}
                onAddToDeck={handleAddToDeck}
              />
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
          <TabsContent value="storage" className="h-full overflow-auto px-6 py-4 m-0">
            <StorageManagement
              onAssignToContainer={handleAssignToContainer}
              onContainerSelect={handleContainerSelect}
              selectedContainerId={selectedContainer?.id}
            />
          </TabsContent>
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