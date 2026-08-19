import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCardLists } from '@/lib/shopping';

/**
 * The cart in the header.
 *
 * Owner: "Shopping list could be a cart icon on top of nav menu". It sits beside
 * back and forward because the owner has ruled that navigation lives in the nav,
 * and this is the standing way back to the list from anywhere in the product.
 *
 * TWO NUMBERS, ONE BADGE
 * ----------------------
 * The badge counts copies still to buy. Anything already bought and not yet in
 * hand is a different fact, so it does not inflate the buy count; it shows as a
 * small mark on the corner instead, and the tooltip says both out loud. A single
 * blended number would make the cart say 12 when there are 8 left to buy.
 *
 * The badge is deliberately absent rather than "0" on an empty list. A zero
 * badge is a notification that there is nothing to notify.
 */
export function CartNavButton({ className }: { className?: string }) {
  const load = useCardLists(state => state.load);
  const loaded = useCardLists(state => state.loaded);
  const toBuy = useCardLists(state => state.toBuyCount());
  const inTransit = useCardLists(state => state.inTransitCount());

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const label =
    toBuy === 0 && inTransit === 0
      ? 'Shopping list'
      : [
          toBuy > 0 ? `${toBuy} to buy` : null,
          inTransit > 0 ? `${inTransit} on the way` : null,
        ]
          .filter(Boolean)
          .join(', ');

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Link
          to="/shopping"
          aria-label={`Shopping list. ${label}.`}
          className={cn(
            'relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden />
          {toBuy > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 min-w-[1.05rem] rounded-full bg-foreground px-1 text-center text-[10px] font-semibold leading-[1.05rem] tabular-nums text-background"
            >
              {toBuy > 99 ? '99+' : toBuy}
            </span>
          )}
          {toBuy === 0 && inTransit > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-foreground/70"
            />
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">Shopping list</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
