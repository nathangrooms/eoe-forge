import { useState, useEffect } from 'react';
import { UniversalLocalSearch } from '@/components/universal/UniversalLocalSearch';
import { BulkActionsToolbar } from '@/components/collection/BulkActionsToolbar';
import { StorageAPI } from '@/lib/api/storageAPI';
import { CollectionAPI } from '@/server/routes/collection';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StorageContainer } from '@/types/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp } from 'lucide-react';

interface CollectionItem {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  set_code: string;
  quantity: number;
  foil: number;
  condition: string;
  created_at: string;
  updated_at: string;
  price_usd?: number;
  card?: any;
}

interface CollectionCardDisplayProps {
  items: CollectionItem[];
  onCardClick: (item: CollectionItem) => void;
  onMarkForSale: (item: CollectionItem) => void;
  onAddToDeck: (item: CollectionItem) => void;
  onBulkUpdate?: () => void;
  viewMode?: 'grid' | 'list' | 'compact';
}

export function CollectionCardDisplay({
  items,
  onCardClick,
  onMarkForSale,
  onAddToDeck,
  onBulkUpdate,
  viewMode = 'grid'
}: CollectionCardDisplayProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [storageContainers, setStorageContainers] = useState<StorageContainer[]>([]);

  // Load storage containers for bulk assignment
  useEffect(() => {
    const loadContainers = async () => {
      try {
        const overview = await StorageAPI.getOverview();
        setStorageContainers(overview.containers || []);
      } catch (error) {
        console.error('Failed to load storage containers:', error);
      }
    };
    loadContainers();
  }, []);

  const handleToggleSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      // Auto-disable selection mode if no items selected
      if (next.size === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
      setSelectionMode(false);
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
      setSelectionMode(true);
    }
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  const handleBulkUpdateQuantity = async (delta: number) => {
    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    
    try {
      const itemIds = selectedItemsList.map(item => item.id);
      const result = await CollectionAPI.bulkUpdateQuantity(itemIds, delta);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      showSuccess('Updated', `Updated ${selectedItemsList.length} card(s)`);
      clearSelection();
      onBulkUpdate?.();
    } catch (error) {
      showError('Error', 'Failed to update quantities');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedItems.size} card(s) from collection?`)) {
      return;
    }

    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    
    try {
      const itemIds = selectedItemsList.map(item => item.id);
      const result = await CollectionAPI.bulkDelete(itemIds);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      showSuccess('Deleted', `Deleted ${selectedItemsList.length} card(s)`);
      clearSelection();
      onBulkUpdate?.();
    } catch (error) {
      showError('Error', 'Failed to delete cards');
    }
  };

  const handleBulkAssignStorage = async (containerId: string) => {
    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    
    try {
      for (const item of selectedItemsList) {
        await StorageAPI.assignCard({
          container_id: containerId,
          card_id: item.card_id,
          qty: item.quantity,
          foil: item.foil > 0
        });
      }
      showSuccess('Assigned', `Assigned ${selectedItemsList.length} card(s) to storage`);
      clearSelection();
    } catch (error) {
      showError('Error', 'Failed to assign cards to storage');
    }
  };

  const handleBulkMarkForSale = async () => {
    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    showSuccess('Marked', `Marked ${selectedItemsList.length} card(s) for sale`);
    clearSelection();
    // Open bulk sale dialog or process individually
  };

  // Transform collection items to universal card format
  const transformedCards = items.map(item => {
    // Calculate proper pricing based on foil status
    const prices = item.card?.prices || {};
    const displayPrice = item.foil > 0 
      ? (prices.usd_foil || item.price_usd)
      : (prices.usd || item.price_usd);

    return {
      id: item.card_id,
      name: item.card_name,
      set_code: item.set_code,
      quantity: item.quantity,
      foil: item.foil,
      condition: item.condition,
      collectionItemId: item.id,
      prices: { 
        usd: displayPrice?.toString(),
        usd_foil: prices.usd_foil?.toString()
      },
      image_uris: item.card?.image_uris,
      type_line: item.card?.type_line,
      rarity: item.card?.rarity,
      colors: item.card?.colors,
      cmc: item.card?.cmc,
    };
  });

  return (
    <div className="relative">
      {selectionMode && (
        <BulkActionsToolbar
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onBulkUpdateQuantity={handleBulkUpdateQuantity}
          onBulkAssignStorage={handleBulkAssignStorage}
          onBulkMarkForSale={handleBulkMarkForSale}
          onBulkDelete={handleBulkDelete}
          storageContainers={storageContainers}
        />
      )}
      <UniversalLocalSearch
        cards={transformedCards}
        initialViewMode={viewMode}
        onCardClick={(card) => {
          if (selectionMode) {
            handleToggleSelection(card.collectionItemId);
          } else {
            const item = items.find(i => i.id === card.collectionItemId);
            if (item) onCardClick(item);
          }
        }}
        onCardAdd={(card) => {
          const item = items.find(i => i.id === card.collectionItemId);
          if (item) onAddToDeck(item);
        }}
        showWishlistButton={false}
        selectionMode={selectionMode}
        selectedCards={selectedItems}
        onToggleSelectionMode={() => setSelectionMode(!selectionMode)}
        onSelectAll={handleSelectAll}
        emptyState={{
          title: 'No cards in collection',
          description: 'Start adding cards to your collection',
        }}
      />
    </div>
  );
}