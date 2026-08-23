import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { EmptyState, MetricRow, type Metric } from '@/components/listing';

/**
 * Where "back to deck" actually goes.
 *
 * The deck page keeps its open tab in the query string, so `/deck/x` and
 * `/deck/x?tab=optimiser` are two different places to be sent back to. A back
 * link built from the id alone drops that: press Export from the middle of an
 * optimiser pass and you return to the decklist, having lost the five steps you
 * had worked through.
 *
 * So the deck page hands its own address over in `location.state.from` and this
 * reads it. A link typed by hand, or a bookmark, carries no state, and then the
 * deck's own front page is the right answer and is what you get.
 */
export function useDeckReturn(deckId: string | undefined): string {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  if (typeof from === 'string' && from.startsWith('/')) return from;
  return deckId ? `/deck/${deckId}` : '/decks';
}

interface DeckSubpageLayoutProps {
  title: ReactNode;
  description?: string;
  /** Where the visible back control goes. */
  backTo: string;
  backLabel: string;
  action?: ReactNode;
  /**
   * The deck's own figures, drawn under the header on every sub-destination.
   *
   * A sub page is still the deck. Export, share, proxies and the test hand had
   * no figure on them at all — measured, zero elements at or above 20px — while
   * the page they are reached from carries a row of tiles, so crossing into one
   * felt like leaving the deck rather than opening part of it.
   *
   * `MetricRow`, so a figure here is the same 24px on the same tile as the one
   * on the deck page and on My Decks, and never a page's own idea of a number.
   * Pass only figures the page already holds the data for. A sub page must not
   * fetch a row to have something to put in a tile.
   */
  metrics?: (Metric | null | undefined | false)[];
  /** The deck is still being read. Draws the figures as bars, never as zeros. */
  loading?: boolean;
  /** Why there is nothing to show. Replaces the body with the shared panel. */
  error?: string | null;
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
 *
 * ## What moved into here
 *
 * Every one of these pages wrote out its own "loading…" line and its own
 * not-found panel, and the five copies had already drifted: four drew
 * `rounded-xl bg-card p-10 text-center shadow-sm` with a Back to decks button
 * and the commander picker drew nothing at all, so a deleted deck left it
 * sitting on an empty picker with no way to find out why. That is the same
 * seven-empty-states drift `EmptyState` exists to stop, reappearing one folder
 * down, so the shell owns both states now and the pages pass facts.
 *
 * The figures moved in for the same reason: a strip built per page is a strip
 * that will disagree per page.
 */
export function DeckSubpageLayout({
  title,
  description,
  backTo,
  backLabel,
  action,
  metrics,
  loading = false,
  error,
  children,
}: DeckSubpageLayoutProps) {
  const navigate = useNavigate();
  const shown = (metrics ?? []).filter(Boolean);

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

      {/* Drawn while loading too, so the row holds its height from the first
          paint and the panel below it does not get shoved down when the deck
          arrives. Same reason `DecksSummaryStats` takes a `loading`. */}
      {shown.length > 0 && (
        <MetricRow metrics={shown} columns={shown.length} loading={loading} className="mb-4" />
      )}

      <div className="overflow-x-hidden">
        {loading ? (
          /* One panel, the height of the one that replaces it, so the page does
             not jump when the deck lands. The five pages each drew their own
             centred spinner at a different height. */
          <div
            className="h-64 animate-pulse rounded-lg bg-muted/30 motion-reduce:animate-none"
            role="status"
            aria-label="Loading deck"
          />
        ) : error ? (
          <EmptyState
            title="This deck could not be opened"
            description={error}
            action={{ label: 'Back to my decks', onClick: () => navigate('/decks') }}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export default DeckSubpageLayout;
