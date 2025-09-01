import { useState, useEffect } from 'react';
import { Plus, Package, Book, Box, Palette, Crown, MoreVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';

interface EnrichedStorageContainer extends StorageContainer {
  itemCount: number;
  valueUSD: number;
  uniqueCards: number;
}
import { DEFAULT_STORAGE_TEMPLATES } from '@/lib/storageTemplates';
import { useToast } from '@/hooks/use-toast';

const STORAGE_ICONS = {
  box: Package,
  binder: Book,
  deckbox: Box,
  shelf: Package,
  other: Package,
  'deck-linked': Box
} as const;

interface StorageOverviewProps {
  onContainerSelect: (container: EnrichedStorageContainer) => void;
  onCreateContainer: (templateId?: string) => void;
}

export function StorageOverview({ onContainerSelect, onCreateContainer }: StorageOverviewProps) {
  const [overview, setOverview] = useState<StorageOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
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

  const handleDeleteContainer = async (containerId: string) => {
    try {
      await StorageAPI.deleteContainer(containerId);
      toast({
        title: "Success",
        description: "Container deleted successfully"
      });
      loadOverview();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete container",
        variant: "destructive"
      });
    }
  };

  const groupedContainers = overview?.containers.reduce((groups, container) => {
    const type = container.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(container);
    return groups;
  }, {} as Record<string, StorageContainer[]>) || {};

  const totalCards = overview?.containers.reduce((sum, c) => sum + c.itemCount, 0) || 0;
  const totalValue = overview?.containers.reduce((sum, c) => sum + c.valueUSD, 0) || 0;
  const assignedPercentage = totalCards + (overview?.unassigned.count || 0) > 0 
    ? (totalCards / (totalCards + (overview?.unassigned.count || 0))) * 100 
    : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Stored</p>
                <p className="text-2xl font-bold">{totalCards.toLocaleString()}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Stored Value</p>
                <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Containers</p>
                <p className="text-2xl font-bold">{overview?.containers.length || 0}</p>
              </div>
              <Box className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storage Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Storage Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {totalCards} assigned • {overview?.unassigned.count || 0} unassigned
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onCreateContainer()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Container
              </Button>
            </div>
            <Progress value={assignedPercentage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Quick Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Quick Create
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {DEFAULT_STORAGE_TEMPLATES.map((template) => {
              const Icon = template.icon === 'Package' ? Package : 
                          template.icon === 'Book' ? Book :
                          template.icon === 'Box' ? Box :
                          template.icon === 'Palette' ? Palette :
                          template.icon === 'Crown' ? Crown : Package;
              
              return (
                <Button
                  key={template.id}
                  variant="outline"
                  className="h-20 flex flex-col gap-2"
                  onClick={() => onCreateContainer(template.id)}
                >
                  <Icon className="h-6 w-6" style={{ color: template.color }} />
                  <span className="text-xs text-center">{template.name}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Container Groups */}
      {Object.entries(groupedContainers).map(([type, containers]) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle className="capitalize">{type}s</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {containers.map((container) => {
                const Icon = STORAGE_ICONS[container.type as keyof typeof STORAGE_ICONS];
                
                return (
                  <Card 
                    key={container.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => onContainerSelect(container)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Icon 
                            className="h-6 w-6" 
                            style={{ color: container.color || '#6B7280' }} 
                          />
                          <div>
                            <h4 className="font-semibold text-sm">{container.name}</h4>
                            <p className="text-xs text-muted-foreground capitalize">
                              {container.type}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteContainer(container.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cards</span>
                          <span className="font-medium">{container.itemCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Unique</span>
                          <span className="font-medium">{container.uniqueCards}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Value</span>
                          <span className="font-medium">${container.valueUSD.toFixed(2)}</span>
                        </div>
                      </div>

                      {container.deck_id && (
                        <Badge variant="secondary" className="mt-2">
                          Deck Linked
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Unassigned Section */}
      {overview?.unassigned && overview.unassigned.count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Unassigned Cards</span>
              <Badge variant="outline">
                {overview.unassigned.count} cards
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{overview.unassigned.count}</p>
                <p className="text-sm text-muted-foreground">Total Cards</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{overview.unassigned.uniqueCards}</p>
                <p className="text-sm text-muted-foreground">Unique Cards</p>
              </div>
              <div>
                <p className="text-2xl font-bold">${overview.unassigned.valueUSD.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}