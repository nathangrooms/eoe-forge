import { useState, useEffect } from 'react';
import { ArrowLeft, Zap, Package, Layers, DollarSign, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
}

export function StorageContainerView({ container, onBack }: StorageContainerViewProps) {
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);

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
    { label: 'Total Cards', value: totalCards.toLocaleString(), icon: Layers, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    { label: 'Unique', value: uniqueCards.toString(), icon: Package, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
    { label: 'Value', value: `$${totalValue.toFixed(2)}`, icon: DollarSign, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Enhanced Header */}
      <div className="border-b bg-gradient-to-r from-card to-background px-4 md:px-6 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack} size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg"
                style={{ backgroundColor: container.color || '#6366F1' }}
              >
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">{container.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="capitalize text-xs">{container.type}</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowQuickActions(true)} 
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Quick Add
            </Button>
            <Button 
              onClick={() => setShowQuickActions(true)} 
              size="sm"
              className="gap-2 bg-gradient-cosmic hover:opacity-90"
            >
              <Zap className="h-4 w-4" />
              Add Cards
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                    <stat.icon className={cn("h-5 w-5", stat.color)} />
                  </div>
                  <div>
                    <div className={cn("text-xl font-bold", stat.label === 'Value' && 'text-green-500')}>
                      {stat.value}
                    </div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
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
              title: 'Container is empty',
              description: 'Use Quick Add to search and add cards to this container',
              action: () => setShowQuickActions(true)
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
    </div>
  );
}
