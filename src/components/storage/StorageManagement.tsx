import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Package, 
  Archive, 
  DollarSign, 
  AlertCircle, 
  Box, 
  Eye,
  Sparkles,
  Layers
} from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';
import { CreateContainerDialog } from './CreateContainerDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
      <div className="h-full flex flex-col bg-background p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        
        {/* Stats Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Containers Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-9 w-full mt-4" />
              </CardContent>
            </Card>
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
      {/* Enhanced Header Section */}
      <div className="px-4 md:px-6 py-5 border-b bg-gradient-to-r from-card to-background">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
              <Package className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Storage Manager</h2>
              <p className="text-muted-foreground">Organize your physical card locations</p>
            </div>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            size="lg"
            className="gap-2 bg-gradient-cosmic hover:opacity-90"
          >
            <Plus className="h-5 w-5" />
            New Container
          </Button>
        </div>

        {/* Enhanced Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="relative overflow-hidden border-primary/20 group hover:shadow-lg transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-12 translate-x-12 group-hover:scale-110 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center gap-4 relative">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Containers</p>
                  <p className="text-2xl font-bold">{overview?.containers.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-blue-500/20 group hover:shadow-lg transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -translate-y-12 translate-x-12 group-hover:scale-110 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center gap-4 relative">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Archive className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stored Cards</p>
                  <p className="text-2xl font-bold">{totalCards.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-green-500/20 group hover:shadow-lg transition-all duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full -translate-y-12 translate-x-12 group-hover:scale-110 transition-transform" />
            <CardContent className="p-5">
              <div className="flex items-center gap-4 relative">
                <div className="p-3 bg-green-500/10 rounded-xl">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Stored Value</p>
                  <p className="text-2xl font-bold text-green-500">${totalValue.toFixed(2)}</p>
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
          <Card className="border-dashed border-2 border-muted-foreground/20">
            <CardContent className="py-16 px-6">
              <div className="max-w-md mx-auto text-center space-y-6">
                {/* Icon */}
                <div className="relative mx-auto w-20 h-20">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full opacity-20 blur-xl" />
                  <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                    <Package className="h-10 w-10 text-white" />
                  </div>
                </div>

                {/* Text */}
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Create Your First Container</h3>
                  <p className="text-muted-foreground">
                    Organize your Magic cards by location. Create deck boxes, binders, 
                    storage boxes, or custom containers to track where each card is stored.
                  </p>
                </div>

                {/* Quick Create Options */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all text-center group"
                  >
                    <Box className="h-6 w-6 mx-auto mb-1 text-muted-foreground group-hover:text-primary" />
                    <span className="text-xs font-medium">Deck Box</span>
                  </button>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all text-center group"
                  >
                    <Layers className="h-6 w-6 mx-auto mb-1 text-muted-foreground group-hover:text-primary" />
                    <span className="text-xs font-medium">Binder</span>
                  </button>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all text-center group"
                  >
                    <Archive className="h-6 w-6 mx-auto mb-1 text-muted-foreground group-hover:text-primary" />
                    <span className="text-xs font-medium">Storage Box</span>
                  </button>
                </div>

                <Button 
                  onClick={() => setShowCreateDialog(true)} 
                  size="lg"
                  className="gap-2 bg-gradient-cosmic hover:opacity-90"
                >
                  <Plus className="h-5 w-5" />
                  Create Container
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {overview?.containers.map((container) => {
              const isSelected = selectedContainerId === container.id;
              const itemCount = (container as any).itemCount || 0;
              const valueUSD = (container as any).valueUSD || 0;
              const uniqueCards = (container as any).uniqueCards || 0;
              
              return (
                <Card 
                  key={container.id}
                  className={cn(
                    "group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/50",
                    isSelected && "ring-2 ring-primary shadow-lg border-primary/50"
                  )}
                  onClick={() => onContainerSelect(container)}
                >
                  <CardContent className="p-5">
                    {/* Container Header */}
                    <div className="flex items-start gap-3 mb-4">
                      <div 
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0"
                        style={{ backgroundColor: container.color || '#6366F1' }}
                      >
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold truncate">{container.name}</h4>
                        <Badge variant="outline" className="text-xs capitalize mt-1">
                          {container.type}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Container Stats */}
                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cards</span>
                        <span className="font-medium">{itemCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Unique</span>
                        <span className="font-medium">{uniqueCards}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Value</span>
                        <span className="font-semibold text-green-500">${valueUSD.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    {/* View Button */}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
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