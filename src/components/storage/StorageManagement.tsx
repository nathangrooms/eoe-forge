import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Package, Search, TrendingUp, Archive, AlertCircle, DollarSign, Activity, Box, Layers } from 'lucide-react';
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
        <div className="h-8 bg-muted rounded-lg animate-pulse w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="h-32 bg-muted rounded-lg animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const totalCards = overview?.containers.reduce((sum, c) => sum + (c as any).itemCount, 0) || 0;
  const totalValue = overview?.containers.reduce((sum, c) => sum + (c as any).valueUSD, 0) || 0;
  const totalUniqueCards = overview?.containers.reduce((sum, c) => sum + (c as any).uniqueCards, 0) || 0;
  const unassignedCount = overview?.unassigned.count || 0;
  const unassignedValue = overview?.unassigned.valueUSD || 0;
  const storageUtilization = totalCards > 0 ? ((totalCards / (totalCards + unassignedCount)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Storage Management
          </h2>
          <p className="text-muted-foreground">Organize your Magic: The Gathering collection</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          New Container
        </Button>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 dark:from-blue-950 dark:to-blue-900 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Containers</p>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {overview?.containers.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 dark:from-green-950 dark:to-green-900 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Archive className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Stored Cards</p>
                <p className="text-3xl font-bold text-green-900 dark:text-green-100">{totalCards}</p>
                <p className="text-xs text-green-600 dark:text-green-400">{totalUniqueCards} unique</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 dark:from-purple-950 dark:to-purple-900 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Stored Value</p>
                <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                  ${totalValue.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={unassignedCount > 0 
          ? "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 dark:from-orange-950 dark:to-orange-900 dark:border-orange-800" 
          : "bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 dark:from-gray-950 dark:to-gray-900 dark:border-gray-800"
        }>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${unassignedCount > 0 ? 'bg-orange-500' : 'bg-gray-500'}`}>
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className={`text-sm font-medium ${unassignedCount > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  Unassigned
                </p>
                <p className={`text-3xl font-bold ${unassignedCount > 0 ? 'text-orange-900 dark:text-orange-100' : 'text-gray-900 dark:text-gray-100'}`}>
                  {unassignedCount}
                </p>
                {unassignedValue > 0 && (
                  <p className={`text-xs ${unassignedCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    ${unassignedValue.toFixed(2)} value
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Unassigned Cards Alert */}
      {unassignedCount > 0 && (
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 via-orange-50 to-amber-50 dark:from-orange-950 dark:via-orange-900 dark:to-amber-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500 rounded-full">
                  <AlertCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-orange-900 dark:text-orange-100">
                    Unassigned Cards Need Organization
                  </h3>
                  <p className="text-orange-700 dark:text-orange-300 mt-1">
                    You have <span className="font-semibold">{unassignedCount} cards</span> worth{' '}
                    <span className="font-semibold">${unassignedValue.toFixed(2)}</span> that aren't stored in containers yet.
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    {overview?.unassigned.uniqueCards} unique cards waiting to be organized
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => onAssignToContainer('')} 
                className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg"
              >
                <Search className="h-4 w-4 mr-2" />
                Assign Cards
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Storage Utilization */}
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Storage Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Cards Organized</span>
              <span className="text-2xl font-bold text-primary">{storageUtilization.toFixed(1)}%</span>
            </div>
            <Progress value={storageUtilization} className="h-3" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Organized</p>
                <p className="text-lg font-bold text-green-600">{totalCards}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unassigned</p>
                <p className="text-lg font-bold text-orange-600">{unassignedCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cards</p>
                <p className="text-lg font-bold">{totalCards + unassignedCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-lg font-bold text-green-600">${(totalValue + unassignedValue).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Containers Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Box className="h-6 w-6 text-primary" />
            Your Containers
          </h3>
          {overview?.containers && overview.containers.length > 0 && (
            <Badge variant="secondary" className="text-sm">
              {overview.containers.length} containers • {totalCards} cards stored
            </Badge>
          )}
        </div>
        
        {overview?.containers.length === 0 ? (
          <Card className="border-dashed border-2 bg-gradient-to-br from-muted/50 to-muted/30">
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No Storage Containers</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first storage container to organize your collection. Choose from boxes, binders, deckboxes, and more.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Container
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {overview?.containers.map((container) => {
              const isSelected = selectedContainerId === container.id;
              const itemCount = (container as any).itemCount || 0;
              const valueUSD = (container as any).valueUSD || 0;
              const uniqueCards = (container as any).uniqueCards || 0;
              
              return (
                <Card 
                  key={container.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
                    isSelected ? 'ring-2 ring-primary bg-primary/5 shadow-lg' : 'hover:border-primary/50'
                  }`}
                  onClick={() => onContainerSelect(container)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                          style={{ backgroundColor: container.color || '#6366F1' }}
                        >
                          <Package className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-lg">{container.name}</h4>
                          <Badge variant="outline" className="text-xs capitalize mt-1">
                            <Layers className="h-3 w-3 mr-1" />
                            {container.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-2 bg-muted/50 rounded-lg">
                          <p className="text-sm text-muted-foreground">Cards</p>
                          <p className="font-bold text-lg">{itemCount}</p>
                        </div>
                        <div className="text-center p-2 bg-muted/50 rounded-lg">
                          <p className="text-sm text-muted-foreground">Unique</p>
                          <p className="font-bold text-lg">{uniqueCards}</p>
                        </div>
                      </div>
                      <div className="text-center p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                        <p className="text-sm text-green-700 dark:text-green-300">Total Value</p>
                        <p className="font-bold text-lg text-green-800 dark:text-green-200">${valueUSD.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToContainer(container.id);
                      }}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Manage Cards
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