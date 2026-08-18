import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera, Package, Crown, Box, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AddCardsHeaderProps {
  addToCollection: boolean;
  addToDeck: boolean;
  addToBox: boolean;
  selectedDeckName?: string;
  selectedBoxName?: string;
}

/**
 * In-app headers carry state, not a pitch. The previous version rendered three
 * non-interactive "feature pills" ("Instant Add", "Smart Search",
 * "Multi-Destination") describing the page to a user already standing on it.
 */
export function AddCardsHeader({
  addToCollection,
  addToDeck,
  addToBox,
  selectedDeckName,
  selectedBoxName,
}: AddCardsHeaderProps) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 md:flex-row md:items-center">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-foreground">Add cards</h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>Adding to</span>
          {addToCollection && (
            <Badge variant="secondary" className="gap-1.5">
              <Package className="h-3 w-3" aria-hidden="true" />
              Collection
            </Badge>
          )}
          {addToDeck && selectedDeckName && (
            <Badge variant="secondary" className="gap-1.5">
              <Crown className="h-3 w-3" aria-hidden="true" />
              {selectedDeckName}
            </Badge>
          )}
          {addToBox && selectedBoxName && (
            <Badge variant="secondary" className="gap-1.5">
              <Box className="h-3 w-3" aria-hidden="true" />
              {selectedBoxName}
            </Badge>
          )}
          {!addToCollection && !addToDeck && !addToBox && (
            <span className="text-destructive">no destination selected</span>
          )}
        </div>
      </div>

      <Button asChild variant="outline" size="sm" className="shrink-0 gap-2">
        <Link to="/scan">
          <Camera className="h-4 w-4" aria-hidden="true" />
          Scan cards
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
