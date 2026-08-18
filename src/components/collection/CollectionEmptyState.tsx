import { Card, CardContent } from '@/components/ui/card';
import { Package, Upload, Search, Camera } from 'lucide-react';

interface CollectionEmptyStateProps {
  onAddCards?: () => void;
  onImport?: () => void;
  onScan?: () => void;
}

const OPTIONS = [
  {
    id: 'search',
    icon: Search,
    title: 'Search & add',
    description: 'Find cards by name and add them one at a time',
  },
  {
    id: 'import',
    icon: Upload,
    title: 'Import a list',
    description: 'Paste an Arena, MTGO, Moxfield or CSV export',
  },
  {
    id: 'scan',
    icon: Camera,
    title: 'Scan cards',
    description: 'Use your camera to add physical cards',
  },
] as const;

export function CollectionEmptyState({
  onAddCards,
  onImport,
  onScan,
}: CollectionEmptyStateProps) {
  const handlers: Record<string, (() => void) | undefined> = {
    search: onAddCards,
    import: onImport,
    scan: onScan,
  };

  return (
    <Card className="border border-dashed border-border">
      <CardContent className="px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted">
            <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-foreground">Your collection is empty</h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Add the cards you own to track quantity, condition, foils and market value.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
            {OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={handlers[option.id]}
                className="group rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/40 hover:bg-accent"
              >
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2 text-muted-foreground group-hover:text-foreground">
                    <option.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="font-semibold text-card-foreground">{option.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
