import { useEffect, useMemo, useState } from 'react';
import { Layers, ShoppingCart } from 'lucide-react';
import { BulkActionsToolbar } from '@/components/collection/BulkActionsToolbar';
import { CollectionBrowser } from '@/components/collection/browser/CollectionBrowser';
import type { BrowserAction } from '@/components/collection/browser/actions';
import {
  normalizeCondition,
  toColors,
  toNumber,
  valueOf,
  type BrowserCard,
} from '@/components/collection/browser/types';
import { StorageAPI } from '@/lib/api/storageAPI';
import { CollectionAPI } from '@/server/routes/collection';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { StorageContainer } from '@/types/storage';
import type { CollectionCard } from '@/types/collection';

interface CollectionCardDisplayProps {
  items: CollectionCard[];
  onCardClick: (item: CollectionCard) => void;
  onMarkForSale: (item: CollectionCard) => void;
  onAddToDeck: (item: CollectionCard) => void;
  onBulkUpdate?: () => void;
}

/**
 * Maps a collection row onto the browser's canonical shape.
 *
 * `legalities`, `color_identity` and `mana_cost` are carried through here —
 * they were previously dropped by the transform, which is why the format filter
 * could never match and no card tile ever showed a mana cost. The full card
 * record rides along as `raw` so the shared `CardImage` can pick its own
 * resolution instead of being handed one pre-chosen URL.
 */
export function toBrowserCard(item: CollectionCard): BrowserCard {
  const card = item.card;
  const prices = (card?.prices ?? {}) as Record<string, string | null | undefined>;
  const usd = toNumber(prices.usd);
  const usdFoil = toNumber(prices.usd_foil) || usd;

  return {
    rowId: item.id,
    cardId: item.card_id,
    name: item.card_name || card?.name || 'Unknown card',
    setCode: (item.set_code || card?.set_code || '').toLowerCase(),
    collectorNumber: card?.collector_number,
    manaCost: card?.mana_cost,
    cmc: toNumber(card?.cmc),
    typeLine: card?.type_line ?? '',
    rarity: card?.rarity ?? 'common',
    colors: toColors(card?.colors),
    colorIdentity: toColors(card?.color_identity ?? card?.colors),
    legalities: (card?.legalities ?? {}) as Record<string, string>,
    imageUrl: card?.image_uris?.large ?? card?.image_uris?.normal ?? card?.image_uris?.small,
    // The whole card record, so the tile can draw from `image_uris.large`,
    // flip a double-faced printing, and answer the advanced filter's oracle,
    // artist and printing-flag facets.
    raw: card,
    quantity: item.quantity ?? 0,
    foil: item.foil ?? 0,
    condition: normalizeCondition(item.condition),
    unitPrice: usd,
    foilPrice: usdFoil,
    addedAt: item.created_at,
    source: item,
  };
}

export function CollectionCardDisplay({
  items,
  onCardClick,
  onMarkForSale,
  onAddToDeck,
  onBulkUpdate,
}: CollectionCardDisplayProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [storageContainers, setStorageContainers] = useState<StorageContainer[]>([]);

  useEffect(() => {
    let cancelled = false;
    StorageAPI.getOverview()
      .then(overview => {
        if (!cancelled) setStorageContainers(overview.containers || []);
      })
      .catch(error => console.error('Failed to load storage containers:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const browserCards = useMemo(() => items.map(toBrowserCard), [items]);
  const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const selectedList = useMemo(
    () => items.filter(item => selectedItems.has(item.id)),
    [items, selectedItems]
  );

  const selectedValue = useMemo(
    () =>
      browserCards
        .filter(card => selectedItems.has(card.rowId))
        .reduce((sum, card) => sum + valueOf(card), 0),
    [browserCards, selectedItems]
  );

  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  const toggleSelect = (rowId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleBulkUpdateQuantity = async (delta: number) => {
    try {
      const result = await CollectionAPI.bulkUpdateQuantity(
        selectedList.map(item => item.id),
        delta
      );
      if (result.error) throw new Error(result.error);
      showSuccess('Updated', `Updated ${selectedList.length} card(s)`);
      clearSelection();
      onBulkUpdate?.();
    } catch {
      showError('Error', 'Failed to update quantities');
    }
  };

  const handleBulkDelete = async () => {
    try {
      const result = await CollectionAPI.bulkDelete(selectedList.map(item => item.id));
      if (result.error) throw new Error(result.error);
      showSuccess('Deleted', `Deleted ${selectedList.length} entr${selectedList.length === 1 ? 'y' : 'ies'}`);
      clearSelection();
      onBulkUpdate?.();
    } catch {
      showError('Error', 'Failed to delete cards');
    }
  };

  const handleBulkAssignStorage = async (containerId: string) => {
    try {
      for (const item of selectedList) {
        await StorageAPI.assignCard({
          container_id: containerId,
          card_id: item.card_id,
          qty: item.quantity,
          foil: item.foil > 0,
        });
      }
      showSuccess('Assigned', `Assigned ${selectedList.length} card(s) to storage`);
      clearSelection();
    } catch {
      showError('Error', 'Failed to assign cards to storage');
    }
  };

  const adjustQuantity = async (card: BrowserCard, delta: number) => {
    try {
      const result = await CollectionAPI.bulkUpdateQuantity([card.rowId], delta);
      if (result.error) throw new Error(result.error);
      onBulkUpdate?.();
    } catch {
      showError('Error', `Failed to update ${card.name}`);
    }
  };

  const actions: BrowserAction[] = [
    {
      id: 'sell',
      label: 'List for sale',
      icon: ShoppingCart,
      onSelect: card => {
        const item = itemsById.get(card.rowId);
        if (item) onMarkForSale(item);
      },
    },
    {
      id: 'deck',
      label: 'Add to a deck',
      icon: Layers,
      onSelect: card => {
        const item = itemsById.get(card.rowId);
        if (item) onAddToDeck(item);
      },
    },
  ];

  const selectedCopies = selectedList.reduce((n, i) => n + i.quantity + i.foil, 0);

  return (
    <CollectionBrowser
      cards={browserCards}
      storageKey="deckmatrix.collection.view"
      onCardClick={card => {
        const item = itemsById.get(card.rowId);
        if (item) onCardClick(item);
      }}
      actions={actions}
      onQuantityChange={adjustQuantity}
      selectionMode={selectionMode}
      onToggleSelectionMode={() => {
        if (selectionMode) setSelectedItems(new Set());
        setSelectionMode(mode => !mode);
      }}
      selectedIds={selectedItems}
      onToggleSelect={toggleSelect}
      onSelectVisible={rowIds => setSelectedItems(new Set(rowIds))}
      onClearSelection={() => setSelectedItems(new Set())}
      emptyTitle="No cards match these filters"
      emptyDescription="Adjust the filters, or add more cards to your collection."
      toolbarSlot={
        selectionMode && selectedItems.size > 0 ? (
          <BulkActionsToolbar
            selectedCount={selectedItems.size}
            selectedValue={selectedValue}
            selectedCopies={selectedCopies}
            onClearSelection={clearSelection}
            onBulkUpdateQuantity={handleBulkUpdateQuantity}
            onBulkAssignStorage={handleBulkAssignStorage}
            onBulkDelete={handleBulkDelete}
            storageContainers={storageContainers}
          />
        ) : null
      }
    />
  );
}
