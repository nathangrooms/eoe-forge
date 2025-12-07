import { Card, CardContent } from '@/components/ui/card';
import { Heart, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WishlistEmptyStateProps {
  hasFilter: boolean;
  onClearFilter: () => void;
  onAddCards: () => void;
}

export function WishlistEmptyState({ hasFilter, onClearFilter, onAddCards }: WishlistEmptyStateProps) {
  if (hasFilter) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <Heart className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-medium mb-2">No cards match your filter</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Try adjusting your filters to see more cards
        </p>
        <Button variant="outline" onClick={onClearFilter}>
          Clear Filters
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-12 text-center border-dashed">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-rose-500/20 to-purple-500/20 flex items-center justify-center">
        <Heart className="h-10 w-10 text-rose-500" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Start Your Wishlist</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        Track the cards you want, set target prices, and get notified when deals drop. 
        Find the best prices across TCGPlayer and more.
      </p>
      <Button onClick={onAddCards} size="lg">
        <Plus className="h-5 w-5 mr-2" />
        Add Your First Card
      </Button>
    </Card>
  );
}
