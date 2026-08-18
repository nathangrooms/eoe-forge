import { ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CardDetail, CardDetailHeading } from '@/components/cards/CardDetail';
import { Maximize2, X } from 'lucide-react';

/**
 * Card detail docked beside the list you came from.
 *
 * The replacement for the card modal on any surface where a grid or table is
 * already on screen. It is an ordinary block in the layout: the list stays
 * visible and interactive next to it, nothing dims, nothing traps focus, and
 * Escape simply clears the selection. Where the caller wants a URL instead,
 * the header carries a link to the routed `/cards/:id` view.
 */

/** Deep link for a card object, tolerating rows that only carry a name. */
export function cardDetailPath(card: any): string | null {
  if (!card) return null;
  if (typeof card.id === 'string' && card.id) return `/cards/${encodeURIComponent(card.id)}`;
  if (typeof card.name === 'string' && card.name) return `/cards/${encodeURIComponent(card.name)}`;
  return null;
}

export interface CardDetailPaneProps {
  card: any;
  onClose?: () => void;
  onAddToCollection?: (card: any) => void;
  onAddToWishlist?: (card: any) => void;
  onAddToDeck?: (card: any) => void;
  /** Extra controls rendered under the heading — "Add to deck" pickers, etc. */
  children?: ReactNode;
  /** Hide the routed-view link (signed-out surfaces where /cards is gated). */
  showFullPageLink?: boolean;
  /** Scroll the pane into view when it appears. On by default. */
  autoScroll?: boolean;
  className?: string;
}

export function CardDetailPane({
  card,
  onClose,
  onAddToCollection,
  onAddToWishlist,
  onAddToDeck,
  children,
  showFullPageLink = true,
  autoScroll = true,
  className,
}: CardDetailPaneProps) {
  const ref = useRef<HTMLElement>(null);
  const cardId = card?.id ?? card?.name ?? null;

  // Escape closes the pane. This is the one modal habit worth keeping — it
  // costs nothing and it does not block anything while the pane is open.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Below the split breakpoint the pane stacks under the list, so bring it
  // into view — otherwise a click near the bottom of a long grid looks inert.
  useEffect(() => {
    if (!autoScroll || !cardId) return;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [autoScroll, cardId]);

  if (!card) return null;

  const fullPath = showFullPageLink ? cardDetailPath(card) : null;

  return (
    <section
      ref={ref}
      aria-label={`${card.name ?? 'Card'} details`}
      className={cn('scroll-mt-20 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}
    >
      <div className="mb-4 flex items-start gap-2">
        <CardDetailHeading card={card} className="flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          {fullPath && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Link to={fullPath}>
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Open full page</span>
              </Link>
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close card details"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {children && <div className="mb-4">{children}</div>}

      <CardDetail
        card={card}
        layout="stacked"
        onAddToCollection={onAddToCollection}
        onAddToWishlist={onAddToWishlist}
        onAddToDeck={onAddToDeck}
      />
    </section>
  );
}

export interface CardDetailSplitProps {
  /** The list, grid or table the user is working through. */
  children: ReactNode;
  /** The detail pane, or null/undefined when nothing is selected. */
  pane?: ReactNode;
  className?: string;
}

/**
 * List-with-detail layout.
 *
 * One column while nothing is selected, so the grid keeps its full width; a
 * sticky detail column once something is. Below `xl` the pane stacks under the
 * list rather than covering it — the pane scrolls itself into view there.
 */
export function CardDetailSplit({ children, pane, className }: CardDetailSplitProps) {
  if (!pane) return <div className={cn('min-w-0', className)}>{children}</div>;

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]',
        className
      )}
    >
      <div className="min-w-0">{children}</div>
      <div className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        {pane}
      </div>
    </div>
  );
}

export default CardDetailPane;
