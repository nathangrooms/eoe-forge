import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Package,
  Layers,
  DollarSign,
  Trash2,
  Edit,
  Settings2,
  Search,
  RefreshCw,
  Download,
  AlertCircle,
  Camera,
  Plus,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StorageContainer, StorageItemWithCard } from '@/types/storage';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageQuickActions } from './StorageQuickActions';
import { EditContainerDialog } from './EditContainerDialog';
import { UniversalCardModal } from '@/components/universal/UniversalCardModal';
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
  const [container, setContainer] = useState(initialContainer);
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BrowserCard | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setContainer(initialContainer);
  }, [initialContainer]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await StorageAPI.getContainerItems(container.id);
      setItems(data);
    } catch (error) {
      console.error('Failed to load container items:', error);
      showError('Error', 'Failed to load container items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.id]);

  const browserCards = useMemo(() => items.map(toBrowserCard), [items]);
  const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

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

  const handleDeleteContainer = async () => {
    try {
      setDeleting(true);
      await StorageAPI.deleteContainer(container.id);
      showSuccess('Deleted', `${container.name} has been deleted`);
      setShowDeleteDialog(false);
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
  const totalValue = items.reduce(
    (sum, item) => sum + toNumber(item.card?.prices?.usd) * item.qty,
    0
  );
  const uniqueCards = new Set(items.map(item => item.card_id)).size;

  const stats = [
    { label: 'Total cards', value: totalCards.toLocaleString(), icon: Layers },
    { label: 'Unique cards', value: uniqueCards.toLocaleString(), icon: Package },
    { label: 'Total value', value: formatPrice(totalValue), icon: DollarSign },
  ];

  const actions: BrowserAction[] = [
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

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-3 py-4 md:px-6 md:py-5">
        <div className="mb-4 flex flex-col justify-between gap-3 md:gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 md:gap-4">
            <Button variant="outline" onClick={onBack} size="sm" className="shrink-0 gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted md:h-12 md:w-12">
                <Package className="h-5 w-5 text-muted-foreground md:h-6 md:w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-bold text-foreground md:text-2xl">
                    {container.name}
                  </h1>
                  {items.length === 0 && !loading && (
                    <Badge variant="outline" className="shrink-0">
                      Empty
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs capitalize">
                    {container.type}
                  </Badge>
                  {container.deck_id && (
                    <Badge variant="outline" className="text-xs">
                      Deck-linked
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadItems} className="gap-1">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Manage</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2" onClick={() => setShowEditDialog(true)}>
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit container
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={handleExportList}
                  disabled={items.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export list
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete container
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Add cards</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2" onClick={() => setShowQuickActions(true)}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search manually
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/scan" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Scan with camera
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Contents */}
      <div className="flex-1 px-3 py-4 md:px-6">
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
            onCardClick={card => {
              setSelectedCard(card);
              setShowCardModal(true);
            }}
            actions={actions}
            onQuantityChange={handleQuantityChange}
            emptyTitle="This container is empty"
            emptyDescription="Add cards from your collection, or scan them in."
            emptyAction={{ label: 'Add cards', onClick: () => setShowQuickActions(true) }}
          />
        )}
      </div>

      <StorageQuickActions
        isOpen={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        containerId={container.id}
        onSuccess={() => {
          setShowQuickActions(false);
          loadItems();
        }}
      />

      <EditContainerDialog
        container={container}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSaved={updated => {
          setContainer(updated);
          onContainerUpdated?.(updated);
        }}
      />

      <UniversalCardModal
        card={selectedCard ? { ...selectedCard, id: selectedCard.cardId, set_code: selectedCard.setCode } : null}
        open={showCardModal}
        onOpenChange={setShowCardModal}
        showWishlistButton={false}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              Delete container
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{container.name}&rdquo;? This cannot be undone.
              {items.length > 0 && (
                <span className="mt-2 block font-medium text-destructive">
                  This container still holds {totalCards} card{totalCards === 1 ? '' : 's'}.
                  Remove them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContainer}
              disabled={items.length > 0 || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete container'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
