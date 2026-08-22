import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The panel a surface draws when it has nothing to show.
 *
 * There were seven of these, and the differences between them were not
 * decisions: `rounded-lg bg-muted/30 p-12` on the collection and card search,
 * `rounded-xl bg-card px-6 py-16` on the shopping list, a bare centred stack on
 * the proxy list, a 16px icon circle on one page and a 20px one on the next.
 * The words differ per page and should; the panel does not.
 *
 * `ListingFrame` draws this itself when a listing comes back empty. It is
 * exported as well, because a page has empty states that are not listings — a
 * shopping list with nothing in the post, a storage shelf with no containers —
 * and those looking different from the listing beside them is the drift this
 * folder exists to stop.
 *
 * ## What goes in it
 *
 * Two different situations wear this panel and they need different words:
 *
 * - **A filter emptied it.** Say what was filtered and offer `onClearFilters`.
 *   No icon: there is nothing to introduce, the reader knows what the page is.
 * - **Nothing has been added yet.** Introduce the feature, give it the page's
 *   `icon`, and offer the one action that starts it.
 */

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Offered when a filter is what emptied the list. */
  onClearFilters?: () => void;
  /** The one thing to do next. */
  action?: { label: string; onClick: () => void };
  /**
   * Slot: further ways out, for a page that genuinely has more than one.
   *
   * The collection offers three (add, import, scan) and the shopping list two
   * (find cards, check your decks), and both were reasons a page built its own
   * panel rather than use the shared one. Pass `<Button>`s; they land in the
   * same centred row as `action`.
   */
  actions?: ReactNode;
  /** The subject of the list, drawn once above the message. */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

export function EmptyState({
  title,
  description,
  onClearFilters,
  action,
  actions,
  icon: Icon,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('rounded-lg bg-muted/30 p-12 text-center', className)}>
      {Icon && (
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {(onClearFilters || action || actions) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onClearFilters && (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
          {action && (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
