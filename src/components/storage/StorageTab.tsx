import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StorageManagement } from './StorageManagement';
import { StorageContainerView } from './StorageContainerView';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageContainer } from '@/types/storage';

/**
 * Container detail used to live in `useState` here, which is why opening a
 * container had no URL and browser Back left the whole Collection page instead
 * of closing the container. The selection is now the route
 * `/collection/storage/:containerId`, so a container is linkable and Back does
 * what it looks like it does.
 */
export function StorageTab() {
  const { containerId } = useParams<{ containerId: string }>();
  const navigate = useNavigate();

  const [container, setContainer] = useState<StorageContainer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerId) {
      setContainer(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    StorageAPI.getOverview()
      .then(overview => {
        if (cancelled) return;
        setContainer(overview.containers.find(c => c.id === containerId) ?? null);
      })
      .catch(error => {
        console.error('Failed to load container:', error);
        if (!cancelled) setContainer(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [containerId]);

  const backToList = () => navigate('/collection/storage');

  if (containerId) {
    if (loading) {
      return (
        <div className="h-full space-y-4 p-4 md:p-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    if (!container) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Container not found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been deleted, or the link is out of date.
            </p>
          </div>
          <Button variant="secondary" onClick={backToList} className="gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to storage
          </Button>
        </div>
      );
    }

    return (
      <div className="h-full">
        <StorageContainerView
          container={container}
          onBack={backToList}
          onContainerDeleted={backToList}
          onContainerUpdated={updated => setContainer(updated)}
        />
      </div>
    );
  }

  return (
    <div className="h-full">
      <StorageManagement
        onContainerSelect={selected => navigate(`/collection/storage/${selected.id}`)}
        selectedContainerId={undefined}
      />
    </div>
  );
}
