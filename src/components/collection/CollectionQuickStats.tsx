import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';

interface CollectionQuickStatsProps {
  totalValue: number;
  totalCards: number;
  uniqueCards: number;
  avgCardValue: number;
  recentlyAddedCount?: number;
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
  loading = false,
}: CollectionQuickStatsProps) {
  if (loading) {
    return (
      <div className="mt-1.5 h-5 w-72 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
    );
  }

  const stats: { value: string; label: string }[] = [
    { value: totalCards.toLocaleString(), label: 'cards' },
    { value: uniqueCards.toLocaleString(), label: 'unique' },
    { value: formatPriceCompact(totalValue), label: 'market value' },
    { value: formatPrice(avgCardValue), label: 'average' },
    { value: recentlyAddedCount.toLocaleString(), label: 'added this week' },
  ];

  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
      {stats.map(stat => (
        <span key={stat.label} className="inline-flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-foreground">{stat.value}</span>
          <span className="text-muted-foreground">{stat.label}</span>
        </span>
      ))}
    </div>
  );
}
