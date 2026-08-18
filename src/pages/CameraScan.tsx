import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CameraScanView } from '@/features/scan/CameraScanView';
import { useScanStore } from '@/features/scan/store';
import { Badge } from '@/components/ui/badge';

/**
 * /scan/camera — the live scanner as a real destination.
 *
 * It used to be a full-screen Dialog that hid its own close button. As a route
 * it gets a URL, a visible back control, and browser Back that actually leaves.
 */
export default function CameraScan() {
  const navigate = useNavigate();
  const { recentScans } = useScanStore();

  return (
    <StandardPageLayout
      title="Camera scan"
      description="Point the camera at a card — matches are added as they are recognised"
      action={
        <Button variant="ghost" onClick={() => navigate('/scan')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Scanner
        </Button>
      }
    >
      <div className="max-w-3xl space-y-4">
        <CameraScanView />

        {recentScans.length > 0 && (
          <div className="rounded-lg bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">This session</h2>
              <Badge variant="secondary">{recentScans.length}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {recentScans.slice(0, 8).map((scan) => (
                <div key={scan.id} className="flex items-center gap-2 rounded-md bg-muted/30 p-2">
                  <img
                    src={scan.imageUrl}
                    alt={scan.name}
                    className="h-14 w-10 rounded object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{scan.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {scan.setCode.toUpperCase()} · x{scan.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StandardPageLayout>
  );
}
