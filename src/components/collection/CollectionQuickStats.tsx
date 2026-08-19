import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';
import { Changed } from '@/components/motion';

interface CollectionQuickStatsProps {
  totalValue: number;
  totalCards: number;
  uniqueCards: number;
  avgCardValue: number;
  recentlyAddedCount?: number;
  /**
   * Owned rows the catalogue has no price for. `totalValue` leaves them out
   * silently, so the header has to say so: an under-count that looks like a
   * complete answer is the one thing a collection valuation must not be.
   */
  unpricedCards?: number;
  loading?: boolean;
}

/**
 * The five collection facts, on one line, in the page header.
 *
 * This used to be four full-height stat cards stacked under the header — and
 * three of those four figures were already printed in the header's own subtitle
 * directly above them. Between that row and the favourites block, 640px of the
 * first screen went to chrome and roughly 180px was left for the card grid, so
 * the collection was the last thing visible on the collection page. The figures
 * are worth keeping; the boxes were not.
 */
export function CollectionQuickStats({
  totalValue,
  totalCards,
  uniqueCards,
  avgCardValue,
  recentlyAddedCount = 0,
  unpricedCards = 0,
  loading = false,
}: CollectionQuickStatsProps) {
  if (loading) {
    return (
      // `mt-1 h-5` matches the figures exactly: same top margin, and `h-5` is
      // the line box of the `text-sm` row that replaces it, so the header does
      // not shift by two pixels the moment the collection resolves.
      <div className="mt-1 h-5 w-72 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
    );
  }

  /**
   * `raw` is what decides whether the figure changed; `value` is what is
   * printed. Comparing the formatted string would miss a £4.10 → £4.14 move on
   * a compacted total and would fire on a re-render that formatted the same
   * number differently.
   */
  const stats: { raw: number; value: string; label: string }[] = [
    { raw: totalCards, value: totalCards.toLocaleString(), label: 'cards' },
    { raw: uniqueCards, value: uniqueCards.toLocaleString(), label: 'unique' },
    { raw: totalValue, value: formatPriceCompact(totalValue), label: 'market value' },
    { raw: avgCardValue, value: formatPrice(avgCardValue), label: 'average' },
    {
      raw: recentlyAddedCount,
      value: recentlyAddedCount.toLocaleString(),
      label: 'added this week',
    },
  ];

  // Sits with the money rather than at the end, because it qualifies the money.
  if (unpricedCards > 0) {
    stats.splice(3, 0, {
      raw: unpricedCards,
      value: unpricedCards.toLocaleString(),
      label: unpricedCards === 1 ? 'card with no price yet' : 'cards with no price yet',
    });
  }

  return (
    /* `motion-reveal` because this replaces the loading bar above rather than
       appearing beside it: the figures fade up into the space the placeholder
       already reserved, so nothing on the header moves. */
    <div className="motion-reveal mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
      {stats.map(stat => (
        <span key={stat.label} className="inline-flex items-baseline gap-1.5">
          {/* Adding cards, filing a box or a price sync landing all change these
              silently otherwise, and a total that quietly becomes a different
              total is the reader's problem to notice. */}
          <Changed value={stat.raw} className="font-semibold tabular-nums text-foreground">
            {stat.value}
          </Changed>
          <span className="text-muted-foreground">{stat.label}</span>
        </span>
      ))}
    </div>
  );
}
