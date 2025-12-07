import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Zap, 
  Package, 
  Layers, 
  DollarSign, 
  Trash2, 
  Edit, 
  Settings2,
  Search,
  Grid3X3,
  List,
  LayoutGrid,
  RefreshCw,
  Download,
  Sparkles,
  AlertCircle,
  Camera,
  Plus
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
  DropdownMenuTrigger 
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
} from "@/components/ui/alert-dialog";
import { StorageContainer, StorageItemWithCard } from '@/types/storage';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageQuickActions } from './StorageQuickActions';
import { UniversalCardModal } from '@/components/universal/UniversalCardModal';
import { UniversalLocalSearch } from '@/components/universal/UniversalLocalSearch';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';

interface StorageContainerViewProps {
  container: StorageContainer;
  onBack: () => void;
  onContainerDeleted?: () => void;
}

export function StorageContainerView({ container, onBack, onContainerDeleted }: StorageContainerViewProps) {
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadItems();
  }, [container.id]);

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

  const handleUnassign = async (item: StorageItemWithCard, qty: number = 1) => {
    try {
      await StorageAPI.unassignCard({ item_id: item.id, qty });
      showSuccess('Success', `Removed ${qty} card${qty > 1 ? 's' : ''} from ${container.name}`);
      loadItems();
    } catch (error: any) {
      showError('Error', error.message || 'Failed to remove card');
    }
  };

  const handleDeleteContainer = async () => {
    if (items.length > 0) {
      showError('Cannot Delete', 'Please remove all cards from the container first');
      return;
    }
    
    try {
      setDeleting(true);
      await StorageAPI.deleteContainer(container.id);
      showSuccess('Deleted', `${container.name} has been deleted`);
      setShowDeleteDialog(false);
      onContainerDeleted?.();
      onBack();
    } catch (error: any) {
      showError('Error', error.message || 'Failed to delete container');
    } finally {
      setDeleting(false);
    }
  };

  // Transform storage items to card format for UniversalCardDisplay
  const transformedCards = items.map(item => ({
    ...item.card,
    id: item.card_id,
    storageQty: item.qty,
    storageFoil: item.foil,
    storageItemId: item.id
  }));

  const totalCards = items.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = items.reduce((sum, item) => {
    const price = parseFloat(item.card?.prices?.usd || '0');
    return sum + (price * item.qty);
  }, 0);
  const uniqueCards = new Set(items.map(item => item.card_id)).size;

  const stats = [
    { label: 'Total Cards', value: totalCards.toLocaleString(), icon: Layers, color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { label: 'Unique Cards', value: uniqueCards.toString(), icon: Package, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    { label: 'Total Value', value: `$${totalValue.toFixed(2)}`, icon: DollarSign, color: 'text-green-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20' },
  ];

  return (
    <div className="h-full flex flex-col bg-background overflow-y-auto">
      {/* Enhanced Header - not sticky on mobile */}
      <div className="border-b bg-gradient-to-r from-card via-card to-background px-3 md:px-6 py-4 md:py-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-5">
          <div className="flex items-center gap-3 md:gap-4">
            <Button variant="outline" onClick={onBack} size="sm" className="gap-2 hover:bg-accent shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <div 
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white shadow-lg ring-2 ring-white/10 shrink-0"
                style={{ backgroundColor: container.color || '#6366F1' }}
              >
                <Package className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg md:text-2xl font-bold truncate">{container.name}</h1>
                  {items.length === 0 && !loading && (
                    <Badge variant="outline" className="text-orange-500 border-orange-500/30 shrink-0">Empty</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="capitalize text-xs">{container.type}</Badge>
                  {container.deck_id && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Sparkles className="h-3 w-3" />
                      Deck
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button 
              variant="outline" 
              size="sm"
              onClick={loadItems}
              className="gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Manage</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2">
                  <Edit className="h-4 w-4" />
                  Edit Container
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Download className="h-4 w-4" />
                  Export List
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Container
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Add Cards Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="sm"
                  className="gap-1 bg-gradient-cosmic hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Cards</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  className="gap-2"
                  onClick={() => setShowQuickActions(true)}
                >
                  <Search className="h-4 w-4" />
                  Search Manually
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/scan" className="gap-2 flex items-center">
                    <Camera className="h-4 w-4" />
                    Scan with Camera
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Enhanced Stats Overview */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className={cn("relative overflow-hidden", stat.borderColor, "group hover:shadow-md transition-all duration-300")}>
              <div className="absolute top-0 right-0 w-16 h-16 bg-current opacity-[0.03] rounded-full -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform" />
              <CardContent className="p-2.5 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className={cn("p-1.5 md:p-2.5 rounded-lg md:rounded-xl", stat.bgColor)}>
                    <stat.icon className={cn("h-4 w-4 md:h-5 md:w-5", stat.color)} />
                  </div>
                  <div className="min-w-0">
                    <div className={cn("text-sm md:text-xl font-bold truncate", stat.label === 'Total Value' && 'text-green-500')}>
                      {stat.value}
                    </div>
                    <div className="text-[10px] md:text-xs text-muted-foreground truncate">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 px-3 md:px-6 py-4">
        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[2.5/3.5] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <UniversalLocalSearch
            cards={transformedCards}
            loading={false}
            initialViewMode={viewMode}
            onViewModeChange={setViewMode}
            onCardClick={(card) => {
              setSelectedCard(card);
              setShowCardModal(true);
            }}
            onCardAdd={async (card) => {
              try {
                await StorageAPI.assignCard({
                  container_id: container.id,
                  card_id: card.id,
                  qty: 1,
                  foil: !!card.storageFoil,
                });
                showSuccess('Added', `Added 1 ${card.name} to ${container.name}`);
                loadItems();
              } catch (error: any) {
                showError('Error', error.message || 'Failed to add card');
              }
            }}
            showWishlistButton={false}
            emptyState={{
              title: 'This container is empty',
              description: 'Add cards from your collection or search for new cards to store here',
              action: () => setShowQuickActions(true),
              actionLabel: 'Add Cards'
            }}
          />
        )}
      </div>

      {/* Quick Actions Modal */}
      <StorageQuickActions
        isOpen={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        containerId={container.id}
        onSuccess={() => {
          setShowQuickActions(false);
          loadItems();
        }}
      />

      <UniversalCardModal
        card={selectedCard}
        open={showCardModal}
        onOpenChange={setShowCardModal}
        onCardAdd={async (card) => {
          try {
            await StorageAPI.assignCard({ container_id: container.id, card_id: card.id, qty: 1, foil: !!card.storageFoil });
            showSuccess('Added', `Added 1 ${card.name} to ${container.name}`);
            loadItems();
          } catch (error: any) {
            showError('Error', error.message || 'Failed to add card');
          }
        }}
        showWishlistButton={false}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Container
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{container.name}"? This action cannot be undone.
              {items.length > 0 && (
                <span className="block mt-2 text-orange-500 font-medium">
                  This container has {totalCards} cards. You must remove all cards before deleting.
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
              {deleting ? 'Deleting...' : 'Delete Container'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
