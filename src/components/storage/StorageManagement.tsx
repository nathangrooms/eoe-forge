import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Package, Archive, DollarSign, AlertCircle, Box, Eye, Layers } from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageOverview as StorageOverviewType, StorageContainer } from '@/types/storage';
import { CreateContainerPanel } from './CreateContainerPanel';
import { showError } from '@/components/ui/toast-helpers';
import { formatPrice } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';

interface StorageManagementProps {
  onContainerSelect: (container: StorageContainer) => void;
  selectedContainerId?: string;
}

/** Quick-create tiles now carry the type they advertise. */
const QUICK_TYPES = [
  { id: 'deckbox', label: 'Deck box', icon: Box },
  { id: 'binder', label: 'Binder', icon: Layers },
  { id: 'box', label: 'Storage box', icon: Archive },
] as const;

export function StorageManagement({
  onContainerSelect,
  selectedContainerId,
}: StorageManagementProps) {
  const [overview, setOverview] = useState<StorageOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [initialType, setInitialType] = useState<string | undefined>();

  const loadOverview = async () => {
    try {
      const data = await StorageAPI.getOverview();
      setOverview(data);
    } catch (error) {
      console.error('Failed to load storage overview:', error);
      showError('Error', 'Failed to load storage overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const openCreate = (type?: string) => {
    setInitialType(type);
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    setInitialType(undefined);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col space-y-6 bg-background p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const containers = overview?.containers ?? [];
  const totalCards = containers.reduce((sum, c) => sum + (c.itemCount ?? 0), 0);
  const totalValue = containers.reduce((sum, c) => sum + (c.valueUSD ?? 0), 0);
  const unassignedCount = overview?.unassigned.count ?? 0;
  const unassignedValue = overview?.unassigned.valueUSD ?? 0;

  const stats = [
    { label: 'Containers', value: containers.length.toLocaleString(), icon: Layers },
    { label: 'Stored cards', value: totalCards.toLocaleString(), icon: Archive },
    { label: 'Stored value', value: formatPrice(totalValue), icon: DollarSign },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      {/* Header */}
      <div className="bg-card px-4 py-5 shadow-lg shadow-black/20 md:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Storage</h2>
            <p className="text-sm text-muted-foreground">
              Where each physical card actually lives
            </p>
          </div>
          <Button
            onClick={() => (creating ? closeCreate() : openCreate())}
            aria-expanded={creating}
            className="gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New container
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <stat.icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold tabular-nums text-card-foreground">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {unassignedCount > 0 && (
          <Card className="mt-4 border-0 bg-muted/40 shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-card-foreground">
                    {unassignedCount.toLocaleString()} cards are not assigned to any container
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unassigned value: {formatPrice(unassignedValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Containers */}
      <div className="flex-1 px-3 py-4 md:px-6 md:py-6">
        <div className="mb-6 flex items-center gap-2">
          <Box className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground">Your containers</h3>
          {containers.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {containers.length}
            </Badge>
          )}
        </div>

        {creating && (
          <CreateContainerPanel
            key={initialType ?? 'default'}
            initialType={initialType}
            onCancel={closeCreate}
            onSuccess={() => {
              closeCreate();
              loadOverview();
            }}
          />
        )}

        {containers.length === 0 ? (
          <Card className="border-0 bg-card">
            <CardContent className="px-6 py-16">
              <div className="mx-auto max-w-md space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">
                    Create your first container
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Deck boxes, binders and storage boxes let you record where each card is.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {QUICK_TYPES.map(type => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => openCreate(type.id)}
                      className="group rounded-lg bg-muted/40 p-3 text-center transition-colors hover:bg-accent"
                    >
                      <type.icon
                        className="mx-auto mb-1 h-6 w-6 text-muted-foreground group-hover:text-foreground"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {containers.map(container => {
              const isSelected = selectedContainerId === container.id;
              return (
                <Card
                  key={container.id}
                  className={cn(
                    'cursor-pointer border-0 shadow-md shadow-black/20 transition-colors hover:bg-accent/40',
                    isSelected && 'bg-accent'
                  )}
                  onClick={() => onContainerSelect(container)}
                >
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-semibold text-card-foreground">
                          {container.name}
                        </h4>
                        <Badge variant="secondary" className="mt-1 text-xs capitalize">
                          {container.type}
                        </Badge>
                      </div>
                    </div>

                    <dl className="mb-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Cards</dt>
                        <dd className="font-medium tabular-nums">
                          {(container.itemCount ?? 0).toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Unique</dt>
                        <dd className="font-medium tabular-nums">
                          {(container.uniqueCards ?? 0).toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Value</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatPrice(container.valueUSD ?? 0)}
                        </dd>
                      </div>
                    </dl>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={e => {
                        e.stopPropagation();
                        onContainerSelect(container);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                      View contents
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
