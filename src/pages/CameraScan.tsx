import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CameraScanView } from '@/features/scan/CameraScanView';
import { useScanStore } from '@/features/scan/store';
import { Badge } from '@/components/ui/badge';
import { CardGrid, CardImage } from '@/components/cards';

/** Wraps a scan's single image URL in the shape `CardImage` reads. */
function cardShapeOf(scan: { name: string; imageUrl?: string }) {
  const url = scan.imageUrl || '';
  return {
    name: scan.name,
    image_uris: url ? { small: url, normal: url, large: url } : {},
  };
}

/**
 * /scan/camera — the live scanner as a real destination.
 *
 * It used to be a full-screen Dialog that hid its own close button. As a route
 * it gets a URL, a visible back control, and browser Back that actually leaves.
 *
 * The page was also `max-w-3xl`, stranding a third of the content band beside a
 * 768px column. The viewfinder still wants a bounded width — a 1,136px video
 * feed helps nobody — so the rest of the band goes to the pile you are
 * building, which is exactly what you want in view while scanning. The session
 * thumbnails were a hand-rolled `<img object-cover>` at 40×56; they are real
 * cards now, through the one card component.
 */
export default function CameraScan() {
  const navigate = useNavigate();
  const { recentScans } = useScanStore();

  const copies = recentScans.reduce((sum, scan) => sum + scan.quantity, 0);

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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)] xl:items-start">
        <CameraScanView />

        <div className="rounded-lg bg-card p-4 shadow-lg shadow-black/20">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">This session</h2>
            {recentScans.length > 0 && (
              <>
                <Badge variant="secondary">{recentScans.length}</Badge>
                <span className="text-xs text-muted-foreground">
                  {copies} {copies === 1 ? 'copy' : 'copies'}
                </span>
              </>
            )}
          </div>

          {recentScans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scanned yet. Recognised cards appear here as they are added.
            </p>
          ) : (
            <CardGrid width={110}>
              {recentScans.slice(0, 12).map(scan => (
                <div key={scan.id} className="flex flex-col gap-1">
                  <CardImage
                    card={cardShapeOf(scan)}
                    width={110}
                    fill
                    hideFlip
                    interactive={false}
                    title={scan.name}
                  >
                    {scan.quantity > 1 && (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                        ×{scan.quantity}
                      </span>
                    )}
                  </CardImage>
                  <p className="truncate text-[11px] font-medium" title={scan.name}>
                    {scan.name}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase text-muted-foreground">
                    {scan.setCode}
                  </p>
                </div>
              ))}
            </CardGrid>
          )}
        </div>
      </div>
    </StandardPageLayout>
  );
}
