import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Package, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StorageContainer, StorageItemWithCard } from '@/types/storage';
import { StorageAPI } from '@/lib/api/storageAPI';
import { AssignDrawer } from './AssignDrawer';
import { useToast } from '@/hooks/use-toast';

interface StorageContainerViewProps {
  container: StorageContainer;
  onBack: () => void;
}

export function StorageContainerView({ container, onBack }: StorageContainerViewProps) {
  const [items, setItems] = useState<StorageItemWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
  }, [container.id]);

  const loadItems = async () => {
    try {
      const data = await StorageAPI.getContainerItems(container.id);
      setItems(data);
    } catch (error) {
      console.error('Failed to load container items:', error);
      toast({
        title: "Error",
        description: "Failed to load container items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (itemId: string, qty: number) => {
    try {
      await StorageAPI.unassignCard({ item_id: itemId, qty });
      toast({
        title: "Success",
        description: "Card unassigned successfully"
      });
      loadItems();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unassign card",
        variant: "destructive"
      });
    }
  };

  const filteredItems = items.filter(item => 
    item.card?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalCards = items.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = items.reduce((sum, item) => {
    const price = parseFloat(item.card?.prices?.usd || '0');
    return sum + (price * item.qty);
  }, 0);
  const uniqueCards = new Set(items.map(item => item.card_id)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Storage
        </Button>
        <div className="flex items-center gap-3">
          <div 
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: container.color || '#6366F1' }}
          >
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{container.name}</h1>
            <p className="text-muted-foreground capitalize flex items-center gap-2">
              <Badge variant="outline">{container.type}</Badge>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{totalCards}</div>
            <div className="text-sm text-muted-foreground">Total Cards</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{uniqueCards}</div>
            <div className="text-sm text-muted-foreground">Unique Cards</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${totalValue.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Total Value</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cards in this container..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setShowAssignDrawer(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Assign Cards
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards Display */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse border-border/50">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-muted/50 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted/50 rounded w-3/4"></div>
                    <div className="h-3 bg-muted/50 rounded w-1/2"></div>
                    <div className="h-3 bg-muted/50 rounded w-1/4"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="border-dashed border-2 border-muted">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No cards assigned</h3>
            <p className="text-muted-foreground mb-6">
              This container is empty. Start by assigning some cards from your collection.
            </p>
            <Button onClick={() => setShowAssignDrawer(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Assign Cards
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="group hover:shadow-md transition-all duration-200 border-border/50">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  {/* Card Image */}
                  <div className="w-16 h-16 bg-muted/50 rounded overflow-hidden flex-shrink-0 border border-border/30">
                    {item.card?.image_uris?.small ? (
                      <img
                        src={item.card.image_uris.small}
                        alt={item.card.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  {/* Card Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate mb-1">
                      {item.card?.name || 'Unknown Card'}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      {item.card?.set_code?.toUpperCase()} • {item.card?.rarity}
                    </p>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant={item.foil ? "default" : "secondary"} className="text-xs">
                        {item.qty}x {item.foil ? 'Foil' : 'Normal'}
                      </Badge>
                      {item.card?.prices?.usd && (
                        <span className="text-xs text-green-600 font-medium">
                          ${(parseFloat(item.card.prices.usd) * item.qty).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => handleUnassign(item.id, 1)}
                        disabled={item.qty <= 0}
                      >
                        Remove 1
                      </Button>
                      {item.qty > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-2"
                          onClick={() => handleUnassign(item.id, item.qty)}
                        >
                          Remove All
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AssignDrawer
        open={showAssignDrawer}
        onOpenChange={setShowAssignDrawer}
        containerId={container.id}
        onSuccess={() => {
          setShowAssignDrawer(false);
          loadItems();
        }}
      />
    </div>
  );
}