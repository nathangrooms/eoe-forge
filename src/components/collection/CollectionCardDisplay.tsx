import { useEffect, useMemo, useState } from 'react';
import { Layers, Printer, ShoppingCart } from 'lucide-react';
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
import { useCardLists } from '@/lib/shopping';
import { StorageAPI, fileCardsIntoContainer } from '@/lib/api/storageAPI';
import { bulkUpdateQuantity } from '@/lib/api/collectionBatch';
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
/**
 * The stored set code, unless it is the placeholder that means "we did not
 * know". 'UNK' is not a set: there is no set with that code in `cards`.
 */
function usableSetCode(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const v = String(stored).trim();
  if (!v || v.toLowerCase() === 'unk' || v.toLowerCase() === 'unknown') return null;
  return v;
}

export function toBrowserCard(item: CollectionCard): BrowserCard {
  const card = item.card;
  const prices = (card?.prices ?? {}) as Record<string, string | null | undefined>;
  const usd = toNumber(prices.usd);
  const usdFoil = toNumber(prices.usd_foil) || usd;

  return {
    rowId: item.id,
    cardId: item.card_id,
    name: item.card_name || card?.name || 'Unknown card',
    /*
     * THE JOINED CARD ROW WINS, and the order matters.
     *
     * This read `item.set_code || card?.set_code`, and `user_collections`
     * stores the literal string 'UNK' for a row whose set was not known when it
     * was written. `'UNK'` is truthy, so the fallback never ran and 10 of this
     * account's 53 rows printed UNK for cards the joined row identifies
     * exactly: Esper Sentinel is `mh2`, Delney is `mkm`, Grand Abolisher is
     * `big`. `cards` is the authority on which set a printing is from, so it
     * goes first, and the stored copy is only a fallback for a row with no
     * join. `analytics/spread.ts` already had this precedence; this is the same
     * rule, written the same way round.
     */
    setCode: (card?.set_code || usableSetCode(item.set_code) || '').toLowerCase(),
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
  const addToProxies = useCardLists(state => state.add);

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
      /* One read and one write per chunk, not per row. `CollectionAPI
         .bulkUpdateQuantity` reads and writes once for every selected id, and
         the control above this one is a button that says "Select all N
         matching": measured at 206 requests for one press over 100 rows. The
         single-card stepper below still uses it, where one row is one row. */
      const result = await bulkUpdateQuantity(
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
      /* One batch for the whole selection. This was `StorageAPI.assignCard` per
         selected row, which is five requests each: selecting 100 cards was
         around 500 requests, and it grows with the collection, which is the
         thing the product most wants people to have more of. */
      const filed = await fileCardsIntoContainer(
        containerId,
        selectedList.map(item => ({
          card_id: item.card_id,
          qty: item.quantity,
          foil: item.foil > 0,
        }))
      );

      if (filed.failed.length > 0) throw new Error(filed.failed[0].reason);

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
    {
      /*
       * A card you own is still worth proxying: people keep the expensive copy
       * in a binder and play the paper one. The printing is the one in the
       * collection row, so the sheet prints the art actually owned.
       */
      id: 'proxy',
      label: 'Add to proxy list',
      icon: Printer,
      onSelect: card => {
        void addToProxies({ kind: 'proxy', cardId: card.cardId, cardName: card.name })
          .then(() => showSuccess('On your proxy list', card.name))
          .catch((error: any) =>
            showError('Could not add that', error?.message ?? 'Please try again.')
          );
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
