import { cn } from '@/lib/utils';
import { Changed } from '@/components/motion';
import { formatTotal } from '@/lib/pricing';
import { describePlatformGap, platformTotals, type CostLine } from '@/lib/shopping';

/**
 * What the list costs at each shop.
 *
 * People buy a whole list from one seller because postage is charged once, so
 * the number that helps is "this list at TCGplayer" beside "this list at
 * Cardmarket". A single blended figure would match no basket anywhere.
 *
 * The two totals are NOT compared and no cheapest is named. One is in dollars
 * and one is in euros, this project holds no exchange rate, and a converted
 * figure sitting next to two real ones is an invented price.
 *
 * Every tile that could not price everything says how many cards it dropped,
 * right there. That count arrives in the same object as the amount, so a caller
 * cannot render the total without it.
 */

export interface PlatformTotalsProps {
  lines: CostLine[];
  className?: string;
  /** `lg` for the top of the page, `sm` inside a panel. */
  size?: 'sm' | 'lg';
}

export function PlatformTotals({ lines, className, size = 'lg' }: PlatformTotalsProps) {
  const totals = platformTotals(lines);
  // Magic Online only earns a tile when we hold ticket prices; a paper shopper
  // does not need an empty box telling them about a digital shop.
  const shown = totals.filter(total => total.id !== 'mtgo' || total.pricedCopies > 0);

  return (
    <div
      className={cn(
        'grid gap-2',
        shown.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        className
      )}
    >
      {shown.map(total => {
        const amount = total.pricedCopies > 0 ? formatTotal(total.amount, total.currency) : null;
        const gap = describePlatformGap(total);
        return (
          <div key={total.id} className="min-w-0 rounded-xl bg-muted/30 px-4 py-3">
            <p className="truncate text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              {total.name}
            </p>
            <p
              className={cn(
                'mt-0.5 truncate font-semibold tabular-nums text-foreground',
                size === 'lg' ? 'text-2xl' : 'text-lg'
              )}
            >
              {/* What the list costs is the number that moves most on this
                  page: every card bought, removed or re-counted changes it.
                  Landing it rather than swapping it is the difference between
                  "the total is 41.20" and "the total just went down". */}
              {amount ? (
                <Changed value={total.amount}>{amount}</Changed>
              ) : (
                <span className="text-base font-normal text-muted-foreground">No prices yet</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {gap ?? `${total.pricedCopies} ${total.pricedCopies === 1 ? 'card' : 'cards'} priced`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
