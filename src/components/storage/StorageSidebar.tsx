import { useState, useEffect } from 'react';
import { Plus, Package, Book, Box, Palette, Crown, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';
import { DEFAULT_STORAGE_TEMPLATES } from '@/lib/storageTemplates';
import { CreateContainerDialog } from './CreateContainerDialog';
import { useToast } from '@/hooks/use-toast';

const STORAGE_ICONS = {
  box: Package,
  binder: Book,
  deckbox: Box,
  shelf: Package,
  other: Package,
  'deck-linked': Box
} as const;

interface StorageSidebarProps {
  onAssignToContainer: (containerId: string) => void;
  onContainerSelect: (container: StorageContainer) => void;
  selectedContainerId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  horizontal?: boolean;
}

export function StorageSidebar({ 
  onAssignToContainer, 
  onContainerSelect, 
  selectedContainerId,
  collapsed = false,
  onToggleCollapse,
  horizontal = false
}: StorageSidebarProps) {
  const [overview, setOverview] = useState<StorageOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState<string | undefined>();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    box: true,
    binder: true,
    deckbox: true
  });
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
        description: "Failed to load storage containers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContainer = (templateId?: string) => {
    setCreateTemplateId(templateId);
    setShowCreateDialog(true);
  };

  const handleContainerCreated = () => {
    setShowCreateDialog(false);
    setCreateTemplateId(undefined);
    loadOverview();
  };

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const groupedContainers = overview?.containers.reduce((groups, container) => {
    const type = container.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(container);
    return groups;
  }, {} as Record<string, StorageContainer[]>) || {};

  const totalAssigned = overview?.containers.reduce((sum, c) => sum + (c as any).itemCount, 0) || 0;
  const unassignedCount = overview?.unassigned.count || 0;

  if (loading) {
    return (
      <div className={cn(
        "animate-pulse",
        horizontal ? "flex gap-4" : "w-80 border-l bg-background"
      )}>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (horizontal) {
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Storage Containers</h3>
              <p className="text-sm text-muted-foreground">
                {totalAssigned} assigned • {unassignedCount} unassigned cards
              </p>
            </div>
            <Button onClick={() => handleCreateContainer()}>
              <Plus className="h-4 w-4 mr-2" />
              New Container
            </Button>
          </div>

          {/* Unassigned Cards - Prominent */}
          {unassignedCount > 0 && (
            <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{unassignedCount}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Unassigned Cards</h4>
                      <p className="text-sm text-muted-foreground">
                        ${overview?.unassigned.valueUSD.toFixed(2)} • {overview?.unassigned.uniqueCards} unique
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => onAssignToContainer('')}>
                    <Search className="h-4 w-4 mr-2" />
                    Assign to Storage
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Create Templates */}
          <div>
            <h4 className="font-medium mb-3">Quick Create</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    className="h-20 flex flex-col gap-2 hover:bg-muted"
                    onClick={() => handleCreateContainer(template.id)}
                  >
                    <Icon className="h-6 w-6" style={{ color: template.color }} />
                    <span className="text-xs text-center leading-tight">{template.name}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Container Groups - Horizontal */}
          <div className="space-y-4">
            {Object.entries(groupedContainers).map(([type, containers]) => (
              <div key={type}>
                <h4 className="font-medium mb-2 capitalize">{type}s ({containers.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {containers.map((container) => {
                    const Icon = STORAGE_ICONS[container.type as keyof typeof STORAGE_ICONS];
                    const isSelected = selectedContainerId === container.id;
                    
                    return (
                      <Card 
                        key={container.id}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md",
                          isSelected && "ring-2 ring-primary bg-primary/5"
                        )}
                        onClick={() => onContainerSelect(container)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <Icon 
                              className="h-5 w-5 flex-shrink-0" 
                              style={{ color: container.color || '#6B7280' }} 
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium truncate">{container.name}</h5>
                              <p className="text-xs text-muted-foreground">
                                {(container as any).itemCount || 0} cards • ${((container as any).valueUSD || 0).toFixed(2)}
                              </p>
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
                            Assign Cards
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <CreateContainerDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          templateId={createTemplateId}
          onSuccess={handleContainerCreated}
        />
      </>
    );
  }

  // Vertical sidebar (original)
  return (
    <>
      <div className="w-80 border-l bg-background flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Storage</h3>
              <p className="text-sm text-muted-foreground">
                {totalAssigned} assigned • {unassignedCount} unassigned
              </p>
            </div>
          </div>
        </div>

        {/* Unassigned Cards */}
        {unassignedCount > 0 && (
          <div className="p-4 border-b">
            <Card className="bg-muted border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">{unassignedCount}</span>
                    </div>
                    <span className="font-medium">Unassigned</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  ${overview?.unassigned.valueUSD.toFixed(2)} • {overview?.unassigned.uniqueCards} unique
                </p>
                <Button 
                  className="w-full"
                  onClick={() => onAssignToContainer('')}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Assign Cards
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Containers */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Quick Create */}
            <div>
              <h4 className="text-sm font-medium mb-3">Quick Create</h4>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_STORAGE_TEMPLATES.slice(0, 4).map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    size="sm"
                    className="h-16 flex flex-col gap-1 text-xs"
                    onClick={() => handleCreateContainer(template.id)}
                  >
                    <Package className="h-4 w-4" style={{ color: template.color }} />
                    <span className="text-center leading-tight">{template.name}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Container Groups */}
            {Object.entries(groupedContainers).map(([type, containers]) => (
              <Collapsible
                key={type}
                open={expandedGroups[type]}
                onOpenChange={() => toggleGroup(type)}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                    <span className="text-sm font-medium capitalize">
                      {type}s ({containers.length})
                    </span>
                    <ChevronRight className={cn(
                      "h-4 w-4 transition-transform",
                      expandedGroups[type] && "rotate-90"
                    )} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
                  {containers.map((container) => {
                    const Icon = STORAGE_ICONS[container.type as keyof typeof STORAGE_ICONS];
                    const isSelected = selectedContainerId === container.id;
                    
                    return (
                      <div
                        key={container.id}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                          isSelected && "bg-muted border-primary"
                        )}
                        onClick={() => onContainerSelect(container)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon 
                            className="h-4 w-4 flex-shrink-0" 
                            style={{ color: container.color || '#6B7280' }} 
                          />
                          <span className="text-sm font-medium truncate">{container.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {(container as any).itemCount || 0} cards • ${((container as any).valueUSD || 0).toFixed(2)}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAssignToContainer(container.id);
                          }}
                        >
                          Assign
                        </Button>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </div>

      <CreateContainerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        templateId={createTemplateId}
        onSuccess={handleContainerCreated}
      />
    </>
  );
}