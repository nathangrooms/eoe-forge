import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StorageQuickAddPanel } from '@/components/storage/StorageQuickAddPanel';
import { StorageAPI } from '@/lib/api/storageAPI';
import type { StorageContainer, StorageSlot } from '@/types/storage';

/**
 * `/collection/storage/:containerId/add`.
 *
 * This was a card-search surface nested inside a dialog inside the container
 * view. A search you work through for several minutes is a place, so it has a
 * URL and a back control instead of a backdrop.
 *
 * It is no longer the PRIMARY way to add cards. Pressing "Add cards" on a
 * container now opens the same panel in place, above the list of what is
 * already filed, because the owner's complaint was precisely that pressing it
 * "takes me else where". This route stays because it is a real URL that gets
 * bookmarked and that Back has to keep working, and because a long filing
 * session is legitimately a place of its own.
 */
export default function StorageQuickAdd() {
  const { containerId } = useParams<{ containerId: string }>();
  const navigate = useNavigate();

  const [container, setContainer] = useState<StorageContainer | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedCount, setAddedCount] = useState(0);

  useEffect(() => {
    if (!containerId) return;
    let cancelled = false;

    Promise.all([StorageAPI.getOverview(), StorageAPI.getContainerSlots(containerId)])
      .then(([overview, slotRows]) => {
        if (cancelled) return;
        setContainer(overview.containers.find(c => c.id === containerId) ?? null);
        setSlots(slotRows);
      })
      .catch(error => console.error('Failed to load container:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [containerId]);

  const backPath = containerId ? `/collection/storage/${containerId}` : '/collection/storage';

  if (!containerId) {
    return (
      <div className="px-3 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">No container selected.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-3 flex items-center gap-2">
          <Link
            to={backPath}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {container?.name ?? 'Container'}
          </Link>
        </div>

        <header className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add cards</h1>
              {loading ? (
                <Skeleton className="mt-1 h-4 w-40" />
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Into {container?.name ?? 'this container'}
                  {addedCount > 0 && ` · ${addedCount} added this session`}
                </p>
              )}
            </div>
          </div>

          <Button variant="secondary" onClick={() => navigate(backPath)} className="gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Done
          </Button>
        </header>

        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
          <StorageQuickAddPanel
            containerId={containerId}
            containerType={container?.type}
            slots={slots}
            onAdded={() => setAddedCount(n => n + 1)}
          />
        </div>
      </div>
    </div>
  );
}
