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
 * The collection facts, on one line, in the page header.
 *
 * This used to be four full-height stat cards stacked under the header, and
 * three of those four figures were already printed in the header's own subtitle
 * directly above them. Between that row and the favourites block, 640px of the
 * first screen went to chrome and roughly 180px was left for the card grid, so
 * the collection was the last thing visible on the collection page. The figures
 * are worth keeping; the boxes were not.
 *
 * ## Why this is six fixed slots and not a wrapping row
 *
 * It was `flex flex-wrap`, and the loading placeholder was a single `h-5` bar.
 * Those two agree only when the figures happen to fit on one line, which they
 * do at 1680 and 1440 and do not below that. Measured on the built page, the
 * block resolved from 20px to 42px at 1280, 768 and 390 and to 64px at 1024,
 * and each of those pushed the tab strip and the entire tab panel down with it.
 * Cumulative Layout Shift on the analytics tab read 0 at 1680 and 1440 and
 * 0.011, 0.027 and 0.038 at 1280, 1024 and 390.
 *
 * A wrapping row cannot be reserved for, because where it wraps depends on how
 * wide the numbers turn out to be, and that is the thing not known yet. So the
 * row does not wrap on content any more. `auto-fit` over a fixed `7rem` floor
 * makes the column count a function of the container width alone, the slot
 * count is always six, and the number of rows therefore follows from the width
 * and nothing else. The placeholder renders the same six slots in the same
 * grid, so it occupies the same box as the figures that replace it, at every
 * width, whatever the figures turn out to be.
 *
 * The sixth slot is the unpriced-cards warning, which only has something to say
 * on some accounts. It holds its slot either way rather than being spliced in,
 * because a slot that arrives later is the same shift by another route.
 *
 * Labels are short enough to sit inside a 7rem track at `text-sm`, so no chip
 * truncates at any width. Lengthening one is a layout change, not a copy
 * change.
 */

/** Column count is width-driven, never content-driven. That is the whole trick. */
const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] items-start gap-x-4 gap-y-0.5';

/** Every slot is exactly one `text-sm` line box, loading or loaded. */
const SLOT = 'flex h-5 items-baseline gap-1.5';

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
      <div className={`mt-1 text-sm ${GRID}`} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={SLOT}>
            <span className="h-3 w-full max-w-24 self-center animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </span>
        ))}
      </div>
    );
  }

  /**
   * `raw` is what decides whether the figure changed; `value` is what is
   * printed. Comparing the formatted string would miss a £4.10 → £4.14 move on
   * a compacted total and would fire on a re-render that formatted the same
   * number differently.
   */
  const stats: ({ raw: number; value: string; label: string } | null)[] = [
    { raw: totalCards, value: totalCards.toLocaleString(), label: 'cards' },
    { raw: uniqueCards, value: uniqueCards.toLocaleString(), label: 'unique' },
    { raw: totalValue, value: formatPriceCompact(totalValue), label: 'value' },
    // Sits with the money rather than at the end, because it qualifies the
    // money. `null` holds the slot open on an account where every card has a
    // price, so the box is the same height on both.
    unpricedCards > 0
      ? { raw: unpricedCards, value: unpricedCards.toLocaleString(), label: 'unpriced' }
      : null,
    { raw: avgCardValue, value: formatPrice(avgCardValue), label: 'average' },
    { raw: recentlyAddedCount, value: recentlyAddedCount.toLocaleString(), label: 'new this week' },
  ];

  return (
    /* `motion-reveal` because this replaces the loading bars above rather than
       appearing beside them: the figures fade up into the space the placeholder
       already reserved, so nothing on the header moves. */
    <div className={`motion-reveal mt-1 text-sm ${GRID}`}>
      {stats.map((stat, i) =>
        stat ? (
          <span key={stat.label} className={SLOT}>
            {/* Adding cards, filing a box or a price sync landing all change
                these silently otherwise, and a total that quietly becomes a
                different total is the reader's problem to notice. */}
            <Changed value={stat.raw} className="font-semibold tabular-nums text-foreground">
              {stat.value}
            </Changed>
            <span className="text-muted-foreground">{stat.label}</span>
          </span>
        ) : (
          <span key={`slot-${i}`} className={SLOT} aria-hidden="true" />
        )
      )}
    </div>
  );
}
