import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StandardSectionHeader } from '@/components/ui/standardized-components';

interface DeckSubpageLayoutProps {
  title: ReactNode;
  description?: string;
  /** Where the visible back control goes. */
  backTo: string;
  backLabel: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The shell every deck sub-destination shares.
 *
 * Analysis, export, share and the missing-cards list used to be dialogs and
 * drawers over `/decks`. They are routes now, so each one needs the thing a
 * modal's close button used to provide: an explicit, labelled way back. That is
 * the `backTo` link, sitting next to the app's own back/forward pair so the
 * page never depends on browser chrome that a standalone/PWA window does not
 * draw.
 */
export function DeckSubpageLayout({
  title,
  description,
  backTo,
  backLabel,
  action,
  children,
}: DeckSubpageLayoutProps) {
  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-10 pt-2 md:px-6 md:pt-4">
      {/* Back and forward live in the top nav and nowhere else. What stays
          here is a named destination, not a direction. */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      <StandardSectionHeader title={title} description={description} action={action} />

      <div className="overflow-x-hidden">{children}</div>
    </div>
  );
}

export default DeckSubpageLayout;
