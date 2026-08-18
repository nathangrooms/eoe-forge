import { Card } from '@/components/ui/card';
import { Heart, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WishlistEmptyStateProps {
  hasFilter: boolean;
  onClearFilter: () => void;
  onAddCards: () => void;
}

export function WishlistEmptyState({
  hasFilter,
  onClearFilter,
  onAddCards,
}: WishlistEmptyStateProps) {
  if (hasFilter) {
    return (
      <Card className="border-dashed p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted">
          <Heart className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">No cards match your filters</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Try widening the search or clearing the priority filter.
        </p>
        <Button variant="outline" onClick={onClearFilter}>
          Clear filters
        </Button>
      </Card>
    );
  }

  return (
    <Card className="border-dashed p-12 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted">
        <Heart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-xl font-semibold text-foreground">Your wishlist is empty</h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
        Track the cards you want, set a target price, and see which of your decks are still
        missing them.
      </p>
      <Button onClick={onAddCards} size="lg">
        <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
        Add your first card
      </Button>
    </Card>
  );
}
