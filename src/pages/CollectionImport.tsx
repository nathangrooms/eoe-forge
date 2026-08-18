import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload } from 'lucide-react';
import { CollectionImportPanel } from '@/components/collection/CollectionBulkImport';
import { useCollectionStore } from '@/features/collection/store';

/**
 * `/collection/import`.
 *
 * A paste-parse-review-commit flow with a failure table under it: too long for
 * a dialog, and worth a URL you can come back to. Back returns to the
 * collection; a clean import replaces this entry so Back from the collection
 * does not land on a used-up import form.
 */
export default function CollectionImport() {
  const navigate = useNavigate();
  const refresh = useCollectionStore(state => state.refresh);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <Link
            to="/collection"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Collection
          </Link>
        </div>

        <header className="mb-4 flex items-center gap-3 md:mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import cards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste a list from Arena, MTGO, Moxfield or a CSV. Set codes, collector numbers and{' '}
              <code className="font-mono">*F*</code> foil markers are understood.
            </p>
          </div>
        </header>

        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
          <CollectionImportPanel
            onCancel={() => navigate('/collection')}
            onImported={outcome => {
              refresh();
              if (outcome.failures.length === 0) {
                navigate('/collection', { replace: true });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
