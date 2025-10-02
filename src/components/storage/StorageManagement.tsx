import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Package, Archive, DollarSign, AlertCircle, Box, Eye } from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';
import { CreateContainerDialog } from './CreateContainerDialog';
import { useToast } from '@/hooks/use-toast';

interface StorageManagementProps {
  onContainerSelect: (container: StorageContainer) => void;
  selectedContainerId?: string;
}

export function StorageManagement({ 
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
        <div className="h-8 bg-muted/50 rounded animate-pulse w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted/50 rounded animate-pulse"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-muted/50 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const totalCards = overview?.containers.reduce((sum, c) => sum + (c as any).itemCount, 0) || 0;
  const totalValue = overview?.containers.reduce((sum, c) => sum + (c as any).valueUSD, 0) || 0;
  const unassignedCount = overview?.unassigned.count || 0;
  const unassignedValue = overview?.unassigned.valueUSD || 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Section */}
      <div className="px-6 py-6 border-b">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold">Storage Containers</h2>
            <p className="text-muted-foreground mt-1">Organize your cards by boxes, binders, and more</p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            size="lg"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Container
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Containers</p>
                  <p className="text-2xl font-bold">{overview?.containers.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Archive className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stored Cards</p>
                  <p className="text-2xl font-bold">{totalCards}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stored Value</p>
                  <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Unassigned Cards Alert */}
        {unassignedCount > 0 && (
          <Card className="border-orange-500/20 bg-orange-500/5 mt-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {unassignedCount} cards in your collection are not assigned to any container
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total value: ${unassignedValue.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Containers Section */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Box className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Your Containers</h3>
          {overview?.containers && overview.containers.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {overview.containers.length} containers
            </Badge>
          )}
        </div>
        
        {overview?.containers.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No containers yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create storage containers to organize your Magic cards. Choose from different types like deck boxes, binders, or storage boxes.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Create First Container
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview?.containers.map((container) => {
              const isSelected = selectedContainerId === container.id;
              const itemCount = (container as any).itemCount || 0;
              const valueUSD = (container as any).valueUSD || 0;
              const uniqueCards = (container as any).uniqueCards || 0;
              
              return (
                <Card 
                  key={container.id}
                  className={`group cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                    isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                  onClick={() => onContainerSelect(container)}
                >
                  <CardContent className="p-6">
                    {/* Container Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm"
                          style={{ backgroundColor: container.color || '#6366F1' }}
                        >
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{container.name}</h4>
                          <Badge variant="outline" className="text-xs capitalize mt-1">
                            {container.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    {/* Container Stats */}
                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cards:</span>
                        <span className="font-medium">{itemCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Unique:</span>
                        <span className="font-medium">{uniqueCards}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Value:</span>
                        <span className="font-medium text-green-500">${valueUSD.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    {/* View Button */}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onContainerSelect(container);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Contents
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