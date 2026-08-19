import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCardLists } from '@/lib/shopping';
import { ArrivingCards } from './ArrivingCards';

/**
 * The arriving strip on the collection page.
 *
 * Owner: "if you mark shopping list items as bought, on collection page maybe
 * they should appear as arriving and you mark them when arrived and can assign
 * to collection, box and deck."
 *
 * KEPT CLEARLY APART FROM WHAT IS IN HAND
 * ---------------------------------------
 * These cards are NOT in the collection and none of them counts towards its
 * value, its size or any total on this page. A card in the post is a card you
 * do not have, and quietly folding it in would inflate every number here. So it
 * sits in its own band above the collection with its own heading, and it
 * disappears the moment there is nothing on the way.
 */
export function CollectionArriving({ className }: { className?: string }) {
  const load = useCardLists(state => state.load);
  const loaded = useCardLists(state => state.loaded);
  const shopping = useCardLists(state => state.shopping);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const { arriving, arrived } = useMemo(() => {
    const list = useCardLists.getState().assembled();
    return { arriving: list.arriving, arrived: list.arrived };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopping]);

  if (arriving.length === 0 && arrived.length === 0) return null;

  const copies = [...arriving, ...arrived].reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
            {copies} {copies === 1 ? 'card' : 'cards'} on the way
          </h2>
          <p className="text-sm text-muted-foreground">
            Bought and not here yet, so none of these count towards your collection.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="gap-2" asChild>
          <Link to="/shopping">
            Shopping list
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <ArrivingCards arriving={arriving} arrived={arrived} variant="strip" />
    </section>
  );
}
