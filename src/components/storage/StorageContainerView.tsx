import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Package,
  Layers,
  DollarSign,
  Trash2,
  Edit,
  Settings2,
  ExternalLink,
  RefreshCw,
  Download,
  AlertCircle,
  Camera,
  Plus,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  StorageContainer,
  StorageItemWithCard,
  StoragePreviewCard,
  StorageSlot,
} from '@/types/storage';
import { StorageAPI } from '@/lib/api/storageAPI';
import { ownedValueUSD } from '@/features/collection/value';
import { describeGapsShort, totalPrices } from '@/lib/pricing';
import { describeCount, orderSlots, slotLabel, subdivisionFor } from '@/lib/storage/subdivision';
import { ContainerObject, containerCapacity } from './ContainerObject';
import { StorageQuickAddPanel } from './StorageQuickAddPanel';
import { StorageMovePanel } from './StorageMovePanel';
import { StorageSlotStrip, type SlotSelection } from './StorageSlotStrip';
import { BinderPageView } from './BinderPageView';
import { CollectionBrowser } from '@/components/collection/browser/CollectionBrowser';
import type { BrowserAction } from '@/components/collection/browser/actions';
import {
  formatPrice,
  toColors,
  toNumber,
  type BrowserCard,
} from '@/components/collection/browser/types';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface StorageContainerViewProps {
  container: StorageContainer;
  onBack: () => void;
  onContainerDeleted?: () => void;
  onContainerUpdated?: (container: StorageContainer) => void;
}

/** Container type as it should read under a name. */
const TYPE_LABEL: Record<string, string> = {
  binder: 'Binder',
  deckbox: 'Deck box',
  box: 'Bulk box',
  shelf: 'Shelf',
  other: 'Container',
  'deck-linked': 'Deck box',
};

/**
 * The cards to put in the drawing of the container, most valuable first.
 *
 * Same ranking the overview uses, computed here from the rows this view has
 * already loaded rather than refetched — so the binder on the detail page holds
 * exactly the cards the binder on the shelf held.
 */
function previewFrom(items: StorageItemWithCard[], limit: number): StoragePreviewCard[] {
  return items
    .filter(item => item.card?.id)
    .map(item => ({
      id: item.card!.id,
      name: item.card!.name,
      image_uris: item.card!.image_uris as StoragePreviewCard['image_uris'],
      qty: item.qty,
      foil: item.foil,
      // Through `ownedValueUSD` so a foil is priced at `usd_foil`, exactly as
      // the overview ranks it — otherwise the binder on this page could order
      // its pockets differently from the binder on the shelf.
      usd: ownedValueUSD(item.card?.prices, item.foil ? 0 : 1, item.foil ? 1 : 0),
    }))
    .sort((a, b) => b.usd - a.usd || b.qty - a.qty || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Storage rows carry no condition or legality data — those facets stay hidden. */
function toBrowserCard(item: StorageItemWithCard): BrowserCard {
  const card = item.card;
  const usd = toNumber(card?.prices?.usd);
  return {
    rowId: item.id,
    cardId: item.card_id,
    name: card?.name ?? 'Unknown card',
    setCode: (card?.set_code ?? '').toLowerCase(),
    cmc: toNumber(card?.cmc),
    typeLine: card?.type_line ?? '',
    rarity: card?.rarity ?? 'common',
    colors: toColors(card?.colors),
    colorIdentity: toColors(card?.colors),
    legalities: {},
    imageUrl: card?.image_uris?.normal ?? card?.image_uris?.small,
    quantity: item.foil ? 0 : item.qty,
    foil: item.foil ? item.qty : 0,
    condition: 'NM',
    unitPrice: usd,
    foilPrice: usd,
    addedAt: item.created_at,
    source: item,
  };
}

export function StorageContainerView({
  container: initialContainer,
  onBack,
  onContainerDeleted,
  onContainerUpdated,
}: StorageContainerViewProps) {
  const navigate = useNavigate();
  const [container, setContainer] = useState(initialContainer);
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [loading, setLoading] = useState(true);
  /** In-place rename — the header title becomes the field, no overlay. */
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(initialContainer.name);
  const [savingName, setSavingName] = useState(false);
  /** In-place delete confirmation — the action row swaps, nothing dims. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /**
   * The add section, open right here on the page.
   *
   * Owner: *"I am on storage binder page, when I click add cards it takes me
   * else where … maybe when add cards is clicked, the extra search section
   * appears?"* It used to navigate to `/collection/storage/:id/add`, so the
   * binder you were filling left the screen the moment you started filling it.
   * The panel body was already its own component, so this is that component
   * mounted in place, above the list. The list underneath reloads on every add,
   * which is the point: you watch the binder fill.
   */
  const [adding, setAdding] = useState(false);
  /** Which page, divider or shelf the contents list is showing. */
  const [slotView, setSlotView] = useState<SlotSelection>('all');
  /** Bulk selection, because filing is bulk work. */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Rows the move panel is working on, and where it should start pointing. */
  const [movingItems, setMovingItems] = useState<StorageItemWithCard[]>([]);
  const [moveTarget, setMoveTarget] = useState<{ slotId: string | null; pocket: number | null }>({
    slotId: null,
    pocket: null,
  });

  const sub = subdivisionFor(container.type);

  useEffect(() => {
    setContainer(initialContainer);
  }, [initialContainer]);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const [data, slotRows] = await Promise.all([
        StorageAPI.getContainerItems(container.id),
        StorageAPI.getContainerSlots(container.id),
      ]);
      setItems(data);
      setSlots(slotRows);
    } catch (error) {
      console.error('Failed to load container items:', error);
      showError('Error', 'Failed to load container items');
    } finally {
      setLoading(false);
    }
  }, [container.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const orderedSlots = useMemo(() => orderSlots(slots), [slots]);

  /** The rows the list below shows, after the page or divider filter. */
  const shownItems = useMemo(() => {
    if (slotView === 'all') return items;
    if (slotView === 'loose') return items.filter(item => !item.slot_id);
    return items.filter(item => item.slot_id === slotView);
  }, [items, slotView]);

  const browserCards = useMemo(() => shownItems.map(toBrowserCard), [shownItems]);
  const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  /** Cards for the drawing of the container in the header. */
  const heroCards = useMemo(
    () => previewFrom(items, containerCapacity(container.type)),
    [items, container.type]
  );

  /** Wired at last — `handleUnassign` existed but was referenced nowhere in the JSX. */
  const handleUnassign = async (item: StorageItemWithCard, qty = 1) => {
    try {
      await StorageAPI.unassignCard({ item_id: item.id, qty });
      showSuccess('Removed', `Removed ${qty} card${qty > 1 ? 's' : ''} from ${container.name}`);
      await loadItems();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to remove card');
    }
  };

  const handleAssign = async (item: StorageItemWithCard, qty = 1) => {
    try {
      await StorageAPI.assignCard({
        container_id: container.id,
        // Adding a copy to a row that is already on a page keeps it on that
        // page. Dropping it back to the loose pile would silently unfile it.
        slot_id: item.pocket ? null : item.slot_id ?? null,
        card_id: item.card_id,
        qty,
        foil: item.foil,
      });
      await loadItems();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to add card');
    }
  };

  const handleQuantityChange = async (card: BrowserCard, delta: number) => {
    const item = itemsById.get(card.rowId);
    if (!item) return;
    if (delta > 0) await handleAssign(item, delta);
    else await handleUnassign(item, Math.abs(delta));
  };

  /* -------------------------------------------------------------- moving */

  const openMove = (
    rows: StorageItemWithCard[],
    slotId: string | null = null,
    pocket: number | null = null
  ) => {
    if (rows.length === 0) return;
    setMoveTarget({ slotId, pocket });
    setMovingItems(rows);
  };

  const handleMoved = async () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    await loadItems();
  };

  /** Put one copy of a card into a specific binder pocket. One move, atomic. */
  const fileInPocket = async (item: StorageItemWithCard, pocket: number) => {
    if (slotView === 'all' || slotView === 'loose') return;
    try {
      await StorageAPI.moveCards({
        item_id: item.id,
        qty: 1,
        to_container_id: container.id,
        to_slot_id: slotView,
        to_pocket: pocket,
      });
      showSuccess('Filed', `${item.card?.name ?? 'Card'} is in pocket ${pocket}`);
      await loadItems();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Could not file that card');
    }
  };

  /* --------------------------------------------------------------- slots */

  const handleAddSlot = async (name: string) => {
    try {
      const slot = await StorageAPI.addSlot(container.id, name);
      await loadItems();
      setSlotView(slot.id);
      showSuccess('Added', `${name} is ready`);
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : `Could not add that ${sub.noun}`);
    }
  };

  const handleRenameSlot = async (slotId: string, name: string) => {
    try {
      await StorageAPI.renameSlot(slotId, name);
      await loadItems();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Could not rename that');
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    try {
      await StorageAPI.deleteSlot(slotId);
      await loadItems();
      showSuccess('Removed', `The cards behind it are still in ${container.name}`);
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Could not remove that');
    }
  };

  const handleRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === container.name) {
      setRenaming(false);
      setDraftName(container.name);
      return;
    }

    setSavingName(true);
    try {
      const updated = await StorageAPI.updateContainer(container.id, { name: trimmed });
      setContainer(updated);
      onContainerUpdated?.(updated);
      setRenaming(false);
      showSuccess('Saved', `Container renamed to ${updated.name}`);
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to update container');
    } finally {
      setSavingName(false);
    }
  };

  /**
   * The add page still exists and still works.
   *
   * Adding in place is the primary path now, but the route is a real URL that
   * gets bookmarked and that Back has to keep working, so it stays, offered as
   * the secondary way in rather than the only one.
   */
  const quickAddPath = `/collection/storage/${container.id}/add`;

  const handleDeleteContainer = async () => {
    try {
      setDeleting(true);
      await StorageAPI.deleteContainer(container.id);
      showSuccess('Deleted', `${container.name} has been deleted`);
      setConfirmingDelete(false);
      onContainerDeleted?.();
      onBack();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to delete container');
    } finally {
      setDeleting(false);
    }
  };

  /** Was an inert menu item; now exports the real contents as a text decklist. */
  const handleExportList = () => {
    if (items.length === 0) {
      showError('Nothing to export', 'This container is empty');
      return;
    }
    const lines = items.map(item => {
      const card = item.card;
      const set = card?.set_code ? ` (${card.set_code.toUpperCase()})` : '';
      return `${item.qty} ${card?.name ?? 'Unknown'}${set}${item.foil ? ' *F*' : ''}`;
    });
    const blob = new Blob(
      [`# ${container.name}\n# Exported ${new Date().toLocaleDateString()}\n\n${lines.join('\n')}\n`],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Exported', `${items.length} entries written to a text file`);
  };

  const totalCards = items.reduce((sum, item) => sum + item.qty, 0);
  /* Adds up only the copies it could price and counts the rest. The old sum
     treated a missing price as $0 and added it, so a box holding unpriced cards
     reported a confident total that was quietly too low, with nothing on screen
     saying so. */
  const value = totalPrices(
    items.map(item => ({
      prices: item.card?.prices,
      quantity: item.foil ? 0 : item.qty,
      foil: item.foil ? item.qty : 0,
    })),
    'USD'
  );
  const uniqueCards = new Set(items.map(item => item.card_id)).size;

  /* Counts, never fill percentages. Nobody ever set a capacity for a binder, a
     bulk box or a shelf, so there is no denominator here and nothing invents
     one. A binder PAGE is the single exception in the whole feature, and that
     fraction is drawn by `BinderPageView` off the nine pockets a page has. */
  const stats: { label: string; value: string; note?: string; icon: typeof Layers }[] = [
    { label: 'Total cards', value: totalCards.toLocaleString(), icon: Layers },
    { label: 'Unique cards', value: uniqueCards.toLocaleString(), icon: Package },
    {
      label: 'Total value',
      value: value.pricedCopies > 0 ? formatPrice(value.amount) : 'No prices yet',
      note: describeGapsShort(value) ?? undefined,
      icon: DollarSign,
    },
  ];

  const selectedItems = useMemo(
    () => [...selectedIds].map(id => itemsById.get(id)).filter(Boolean) as StorageItemWithCard[],
    [selectedIds, itemsById]
  );

  const actions: BrowserAction[] = [
    {
      id: 'move',
      label: 'Move somewhere else',
      icon: ArrowRightLeft,
      onSelect: card => {
        const item = itemsById.get(card.rowId);
        if (item) openMove([item]);
      },
    },
    {
      id: 'open-card',
      label: 'Open the card page',
      icon: ExternalLink,
      onSelect: card => navigate(`/cards/${encodeURIComponent(card.cardId)}`),
    },
    {
      id: 'remove-one',
      label: 'Remove one copy',
      icon: X,
      onSelect: card => {
        const item = itemsById.get(card.rowId);
        if (item) handleUnassign(item, 1);
      },
    },
    {
      id: 'remove-all',
      label: 'Remove from container',
      icon: Trash2,
      destructive: true,
      onSelect: card => {
        const item = itemsById.get(card.rowId);
        if (item) handleUnassign(item, item.qty);
      },
    },
  ];

  const viewingSlot =
    slotView !== 'all' && slotView !== 'loose'
      ? orderedSlots.find(slot => slot.id === slotView) ?? null
      : null;
  const viewingSlotIndex = viewingSlot
    ? orderedSlots.findIndex(slot => slot.id === viewingSlot.id)
    : -1;
  const viewingLabel = slotLabel(sub, viewingSlot, viewingSlotIndex);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      {/* Header */}
      <div className="bg-card px-3 py-4 shadow-lg shadow-black/20 md:px-6 md:py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 md:gap-4">
          <div className="flex min-w-0 flex-1 items-end gap-4 md:gap-6">
            {/* The container itself, drawn. Same object as on the shelf, at
                the size a page about a single container earns — a 48px parcel
                glyph told you nothing about what you were looking into. */}
            <div className="hidden w-28 shrink-0 sm:block md:w-36 lg:w-44">
              <ContainerObject type={container.type} cards={heroCards} eager />
            </div>
            <div className="flex min-w-0 flex-1 flex-col pb-1">
              <Button
                variant="secondary"
                onClick={onBack}
                size="sm"
                className="mb-2 w-fit shrink-0 gap-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Back to storage</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {renaming ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRename();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setDraftName(container.name);
                            setRenaming(false);
                          }
                        }}
                        aria-label="Container name"
                        autoFocus
                        disabled={savingName}
                        className="h-9 w-48 border-0 bg-muted/50 text-lg font-bold md:w-64 md:text-2xl"
                      />
                      <Button size="sm" onClick={handleRename} disabled={savingName}>
                        {savingName ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={savingName}
                        onClick={() => {
                          setDraftName(container.name);
                          setRenaming(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <h1 className="truncate text-lg font-bold text-foreground md:text-2xl">
                      {container.name}
                    </h1>
                  )}
                  {items.length === 0 && !loading && !renaming && (
                    <Badge variant="secondary" className="shrink-0">
                      Empty
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {TYPE_LABEL[container.type] ?? container.type}
                  </Badge>
                  {container.deck_id && (
                    <Badge variant="secondary" className="text-xs">
                      Deck-linked
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {confirmingDelete ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                {items.length > 0
                  ? `Remove its ${totalCards} card${totalCards === 1 ? '' : 's'} first`
                  : `Delete ${container.name}?`}
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteContainer}
                disabled={items.length > 0 || deleting}
              >
                {deleting ? 'Deleting...' : 'Confirm'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadItems} className="gap-1">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-1">
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Manage</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => {
                    setDraftName(container.name);
                    setRenaming(true);
                  }}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Rename container
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={handleExportList}
                  disabled={items.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export list
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/scan" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Scan with camera
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={quickAddPath} className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Add on its own page
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete container
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* One button, and it opens the search right here. No menu to get
                through, and nothing to decide before you can start typing. */}
            <Button
              size="sm"
              className="gap-1"
              aria-expanded={adding}
              onClick={() => setAdding(open => !open)}
            >
              {adding ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{adding ? 'Done adding' : 'Add cards'}</span>
            </Button>
          </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {stats.map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-2.5 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="rounded-lg bg-muted p-1.5 md:p-2.5">
                    <stat.icon
                      className="h-4 w-4 text-muted-foreground md:h-5 md:w-5"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold tabular-nums text-card-foreground md:text-xl">
                      {stat.value}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground md:text-xs">
                      {stat.label}
                      {stat.note ? `, ${stat.note}` : ''}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Contents */}
      <div className="flex-1 space-y-4 px-3 py-4 md:px-6">
        {/* Adding, in place, above what is already filed. */}
        {adding && (
          <section
            aria-label={`Add cards to ${container.name}`}
            className="rounded-xl bg-card p-3 shadow-lg shadow-black/20 md:p-4"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-card-foreground">
                  Add cards to {container.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Search below. Everything you add appears in the list underneath straight away.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)} className="gap-1.5">
                <X className="h-4 w-4" aria-hidden="true" />
                Done
              </Button>
            </div>

            <StorageQuickAddPanel
              containerId={container.id}
              containerType={container.type}
              slots={orderedSlots}
              /* Adding while looking at a page or divider files it there,
                 because that is what a person means when they open a page and
                 press add. */
              defaultSlotId={viewingSlot?.id ?? null}
              onAdded={loadItems}
            />
          </section>
        )}

        {/* The pages, dividers or shelves. Six of these have sat in the
            database since the beginning and no screen ever mentioned them. */}
        {!loading && (
          <StorageSlotStrip
            containerType={container.type}
            slots={slots}
            items={items}
            selected={slotView}
            onSelect={setSlotView}
            onAddSlot={handleAddSlot}
            onRenameSlot={handleRenameSlot}
            onDeleteSlot={handleDeleteSlot}
          />
        )}

        {/* A binder page, drawn as a page, with the pockets meaning what they
            look like they mean. */}
        {!loading && container.type === 'binder' && viewingSlot && (
          <BinderPageView
            pageLabel={viewingLabel}
            items={items.filter(item => item.slot_id === viewingSlot.id)}
            candidates={items.filter(item => item.slot_id !== viewingSlot.id && !item.pocket)}
            onFileInPocket={fileInPocket}
            onMoveItem={item => openMove([item])}
          />
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[5/7] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <CollectionBrowser
            cards={browserCards}
            storageKey="deckmatrix.storage.view"
            showOwnershipFilters={false}
            // BROWSING, not picking. This list is what is already filed, so a
            // click on a card goes to the card, which is the standing rule. The
            // picking exception lives in the add section above, where a click
            // has to mean "put this one in" and must not navigate away. See the
            // `mode` prop on EnhancedUniversalCardSearch.
            onCardClick={card => navigate(`/cards/${encodeURIComponent(card.cardId)}`)}
            actions={actions}
            onQuantityChange={handleQuantityChange}
            selectionMode={selectionMode}
            onToggleSelectionMode={() => {
              setSelectionMode(on => !on);
              setSelectedIds(new Set());
            }}
            selectedIds={selectedIds}
            onToggleSelect={rowId =>
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(rowId)) next.delete(rowId);
                else next.add(rowId);
                return next;
              })
            }
            onSelectVisible={rowIds => setSelectedIds(new Set(rowIds))}
            onClearSelection={() => setSelectedIds(new Set())}
            toolbarSlot={
              selectionMode && selectedItems.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 shadow-lg shadow-black/20">
                  <span className="text-sm font-medium text-foreground">
                    {describeCount(selectedItems.reduce((sum, item) => sum + item.qty, 0))} picked
                  </span>
                  <Button size="sm" className="gap-1.5" onClick={() => openMove(selectedItems)}>
                    <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                    Move them together
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              ) : null
            }
            emptyTitle={
              slotView === 'all' ? 'Nothing filed here yet' : `Nothing in ${viewingLabel} yet`
            }
            emptyDescription={
              slotView === 'all'
                ? 'Press Add cards and the search opens right here.'
                : `Move cards here from the rest of ${container.name}, or add new ones.`
            }
            emptyAction={{ label: 'Add cards', onClick: () => setAdding(true) }}
          />
        )}
      </div>

      {/* Moving, as a right-hand panel: the container stays on screen behind it
          at the same scroll position. Design law item 3. */}
      <StorageMovePanel
        key={movingItems.map(item => item.id).join(',') || 'closed'}
        open={movingItems.length > 0}
        onOpenChange={open => {
          if (!open) setMovingItems([]);
        }}
        items={movingItems}
        fromContainerId={container.id}
        initialSlotId={moveTarget.slotId}
        initialPocket={moveTarget.pocket}
        onMoved={handleMoved}
      />
    </div>
  );
}
