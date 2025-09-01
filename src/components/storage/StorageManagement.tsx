import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Package, Search, TrendingUp, Archive, AlertCircle } from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';
import { CreateContainerDialog } from './CreateContainerDialog';
import { useToast } from '@/hooks/use-toast';

interface StorageManagementProps {
  onAssignToContainer: (containerId: string) => void;
  onContainerSelect: (container: StorageContainer) => void;
  selectedContainerId?: string;
}

export function StorageManagement({ 
  onAssignToContainer, 
  onContainerSelect, 
  selectedContainerId 
}: StorageManagementProps) {
  const [overview, setOverview] = useState<StorageOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    try {
      const data = await StorageAPI.getOverview();
      setOverview(data);
    } catch (error) {
      console.error('Failed to load storage overview:', error);
      toast({
        title: "Error",
        description: "Failed to load storage overview",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContainerCreated = () => {
    setShowCreateDialog(false);
    loadOverview();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-muted rounded-lg animate-pulse"></div>
        ))}
      </div>
    );
  }

  const totalCards = overview?.containers.reduce((sum, c) => sum + (c as any).itemCount, 0) || 0;
  const totalValue = overview?.containers.reduce((sum, c) => sum + (c as any).valueUSD, 0) || 0;
  const unassignedCount = overview?.unassigned.count || 0;
  const storageUtilization = totalCards > 0 ? ((totalCards / (totalCards + unassignedCount)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Storage Management</h2>
          <p className="text-muted-foreground">Organize your collection into containers</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Container
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Containers</p>
                <p className="text-2xl font-bold">{overview?.containers.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Archive className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Stored Cards</p>
                <p className="text-2xl font-bold">{totalCards}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Stored Value</p>
                <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={unassignedCount > 0 ? "border-orange-200 bg-orange-50" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className={`h-8 w-8 ${unassignedCount > 0 ? 'text-orange-500' : 'text-gray-500'}`} />
              <div>
                <p className="text-sm text-muted-foreground">Unassigned</p>
                <p className="text-2xl font-bold">{unassignedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unassigned Cards Alert */}
      {unassignedCount > 0 && (
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-orange-900">Unassigned Cards Need Organization</h3>
                <p className="text-sm text-orange-700 mt-1">
                  You have {unassignedCount} cards worth ${overview?.unassigned.valueUSD.toFixed(2)} that aren't stored in containers yet.
                </p>
              </div>
              <Button onClick={() => onAssignToContainer('')} className="bg-orange-600 hover:bg-orange-700">
                <Search className="h-4 w-4 mr-2" />
                Assign Cards
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Utilization */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Cards Organized</span>
              <span>{storageUtilization.toFixed(1)}%</span>
            </div>
            <Progress value={storageUtilization} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {totalCards} of {totalCards + unassignedCount} cards are organized in storage containers
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Containers Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Your Containers</h3>
        {overview?.containers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Storage Containers</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first storage container to organize your collection
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Container
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview?.containers.map((container) => {
              const isSelected = selectedContainerId === container.id;
              const itemCount = (container as any).itemCount || 0;
              const valueUSD = (container as any).valueUSD || 0;
              
              return (
                <Card 
                  key={container.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
                  }`}
                  onClick={() => onContainerSelect(container)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: container.color || '#6B7280' }}
                        >
                          <Package className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium">{container.name}</h4>
                          <Badge variant="outline" className="text-xs capitalize">
                            {container.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cards</span>
                        <span className="font-medium">{itemCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Value</span>
                        <span className="font-medium text-green-600">${valueUSD.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToContainer(container.id);
                      }}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Assign Cards
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateContainerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleContainerCreated}
      />
    </div>
  );
}