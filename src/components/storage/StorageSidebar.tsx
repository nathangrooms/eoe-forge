import { useState, useEffect } from 'react';
import { Package, Plus, Search, Scan, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  binder: Package,
  deckbox: Package,
  shelf: Package,
  other: Package,
  'deck-linked': Package
} as const;

interface StorageSidebarProps {
  onAssignToContainer: (containerId: string) => void;
  onContainerSelect: (container: StorageContainer) => void;
  selectedContainerId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function StorageSidebar({ 
  onAssignToContainer, 
  onContainerSelect, 
  selectedContainerId,
  collapsed = false,
  onToggleCollapse 
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
        "border-l bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-80"
      )}>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded"></div>
          ))}
        </div>
      </div>
    );
  }

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