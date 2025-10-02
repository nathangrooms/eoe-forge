import { useState, useEffect } from 'react';
import { ArrowLeft, Zap, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StorageContainer, StorageItemWithCard } from '@/types/storage';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageQuickActions } from './StorageQuickActions';
import { UniversalCardDisplay } from '@/components/universal/UniversalCardDisplay';
import { CollectionSearch } from '@/components/collection/CollectionSearch';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface StorageContainerViewProps {
  container: StorageContainer;
  onBack: () => void;
}

export function StorageContainerView({ container, onBack }: StorageContainerViewProps) {
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<any>({});

  useEffect(() => {
    loadItems();
  }, [container.id]);

  const loadItems = async () => {
    try {
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

  // Apply filters
  const filteredCards = transformedCards.filter(card => {
    if (searchQuery && !card.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filters.rarity && filters.rarity !== card.rarity) {
      return false;
    }
    if (filters.colors && filters.colors.length > 0) {
      if (!filters.colors.some((c: string) => card.colors?.includes(c))) {
        return false;
      }
    }
    return true;
  });

  const totalCards = items.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = items.reduce((sum, item) => {
    const price = parseFloat(item.card?.prices?.usd || '0');
    return sum + (price * item.qty);
  }, 0);
  const uniqueCards = new Set(items.map(item => item.card_id)).size;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white shadow-sm"
                style={{ backgroundColor: container.color || '#6366F1' }}
              >
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{container.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize">{container.type}</Badge>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">{totalCards} cards</span>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => setShowQuickActions(true)} className="gap-2">
            <Zap className="h-4 w-4" />
            Quick Add
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{totalCards}</div>
              <div className="text-sm text-muted-foreground">Total Cards</div>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{uniqueCards}</div>
              <div className="text-sm text-muted-foreground">Unique Cards</div>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-500">${totalValue.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Total Value</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search/Filters */}
      <div className="border-b px-6 py-3">
        <CollectionSearch
          onSearchChange={setSearchQuery}
          onFiltersChange={setFilters}
          totalResults={filteredCards.length}
        />
      </div>

      {/* Card Display */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-[63/88] bg-muted rounded mb-3"></div>
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || Object.keys(filters).length > 0 ? 'No matching cards' : 'Container is empty'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery || Object.keys(filters).length > 0
                  ? 'Try adjusting your search or filters'
                  : 'Start adding cards to this container'
                }
              </p>
              {!(searchQuery || Object.keys(filters).length > 0) && (
                <Button onClick={() => setShowQuickActions(true)} size="lg">
                  <Zap className="h-4 w-4 mr-2" />
                  Quick Add Cards
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <UniversalCardDisplay
            cards={filteredCards}
            viewMode={viewMode}
            onCardClick={(card) => {
              // Handle card click
              console.log('Card clicked:', card);
            }}
            onCardAdd={(card) => {
              const item = items.find(i => i.card_id === card.id);
              if (item) handleUnassign(item, 1);
            }}
            showWishlistButton={false}
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
    </div>
  );
}
