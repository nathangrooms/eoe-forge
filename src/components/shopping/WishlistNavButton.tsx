import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/**
 * The wishlist in the header, beside the cart.
 *
 * Owner: "Wishlist can come out of the left nav and be made a heart icon with
 * number just like shopping basket perhaps?" It is the same kind of thing as
 * the cart, a standing list you add to from anywhere, so it gets the same
 * treatment rather than a place in a list of destinations.
 *
 * ONE QUERY, AND IT COUNTS ROWS RATHER THAN FETCHING THEM. A header badge that
 * pulls every wishlist row on every page load is the shape that has taken this
 * project's database down twice. `head: true` with an exact count sends no rows
 * at all.
 *
 * The badge is absent rather than "0" on an empty list, matching the cart: a
 * zero badge is a notification that there is nothing to notify.
 */
export function WishlistNavButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { count: rows, error } = await supabase
        .from('wishlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      // A failed count stays null, so the badge is absent rather than claiming
      // zero. Reporting "0 wanted" because a query failed is worse than saying
      // nothing at all.
      if (!cancelled) setCount(error ? null : (rows ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const label = count && count > 0 ? `${count} card${count === 1 ? '' : 's'} wanted` : 'Nothing on it yet';

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Link
          to="/wishlist"
          aria-label={`Wishlist. ${label}.`}
          className={cn(
            'relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <Heart className="h-4 w-4" aria-hidden />
          {count !== null && count > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 min-w-[1.05rem] rounded-full bg-foreground px-1 text-center text-[10px] font-semibold leading-[1.05rem] tabular-nums text-background"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">Wishlist</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
