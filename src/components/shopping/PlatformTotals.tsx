import { formatTotal } from '@/lib/pricing';
import { MetricRow, type Metric, type MetricGround } from '@/components/listing';
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
 *
 * ## Why it is a `MetricRow` now
 *
 * It was one of six hand-built metric rows the consistency audit counted, and
 * it was the same three lines as the rest: a small label, a 24px figure that
 * lands rather than swaps when it moves, and one line of qualification under
 * it. The `size` prop it used to carry is gone with them. Making a row of
 * figures smaller to fit is exactly what happened to the collection, and that
 * is the complaint which started this work: *"much smaller due to the multi
 * menu system"*. A row that does not fit needs fewer figures, not smaller ones.
 */

export interface PlatformTotalsProps {
  lines: CostLine[];
  className?: string;
  /** The surface this sits on, straight through to `MetricRow`. */
  on?: MetricGround;
}

export function PlatformTotals({ lines, className, on }: PlatformTotalsProps) {
  const totals = platformTotals(lines);
  // Magic Online only earns a tile when we hold ticket prices; a paper shopper
  // does not need an empty box telling them about a digital shop.
  const shown = totals.filter(total => total.id !== 'mtgo' || total.pricedCopies > 0);

  const metrics: Metric[] = shown.map(total => ({
    id: total.id,
    label: total.name,
    /* A dash, never a zero. The smallest real price in the database is 0.01, so
       a rendered zero here would always be invented. */
    value: total.pricedCopies > 0 ? formatTotal(total.amount, total.currency) : '—',
    /* `raw` is what lands the figure rather than swapping it when it moves,
       which is the difference between "the total is 41.20" and "the total just
       went down". Every card bought, removed or re-counted changes it. */
    raw: total.amount,
    subtext:
      describePlatformGap(total) ??
      (total.pricedCopies > 0
        ? `${total.pricedCopies} ${total.pricedCopies === 1 ? 'card' : 'cards'} priced`
        : 'No prices yet'),
  }));

  return <MetricRow metrics={metrics} columns={shown.length} on={on} className={className} />;
}
