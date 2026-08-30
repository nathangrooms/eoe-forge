import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';
import { MetricRow, type Metric } from '@/components/listing';

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
 * The collection's figures, in the tiles My Decks uses.
 *
 * ## What changed and why
 *
 * This was six figures on one 20px line inside the page title, and the owner
 * named it directly: *"my decks has proper metric tiles, when on my collection
 * page we dont have these and they are much smaller due to the multi menu
 * system"*. Measured, a collection figure had 2,534 px² against a deck figure's
 * 19,447, with its number drawn at 14px against 24px. Thirteen per cent of the
 * area for the same kind of fact.
 *
 * The previous version of this file argued, correctly, that the four tall stat
 * cards it replaced were not worth their height: between them and the
 * favourites block, 640px of the first screen was chrome and roughly 180px was
 * left for the actual cards. That reasoning was right about the symptom and
 * wrong about the cause. The height was going to three separate bands of menus,
 * not to the figures, and shrinking the figures was fixing the wrong thing.
 * Those bands are one band now, so the figures can have the treatment the owner
 * asked for.
 *
 * ## What is kept from the version this replaces
 *
 * Its two hard-won properties survive, because `MetricRow` has both:
 *
 * - **The column count is a function of the container, never of the content.**
 *   A row that wrapped on its own figures moved everything under it when the
 *   data landed; measured CLS was 0.038 at 390px.
 * - **A slot with nothing to say still holds its place.** The unpriced figure
 *   only applies to some accounts. It is drawn either way, as a dash when there
 *   is nothing to report, so the row is the same six tiles on every account and
 *   at every moment of loading.
 *
 * The `Changed` animation on a figure that moves also survives, through
 * `MetricRow`'s `raw`.
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
  const metrics: Metric[] = [
    /*
     * "Copies", not "Cards", and the rename is the point.
     *
     * This tile was labelled `Cards` and counts COPIES. The tab strip roughly
     * 30px above it also says `Cards` and counts ROWS, because the grid under
     * it draws one tile per row. Any collection holding a playset therefore
     * read "Cards 420" in the tab and "Cards 1,180" in the tile, thirty pixels
     * apart, and the tile that actually matched the tab was the one beside it
     * labelled "Entries".
     *
     * Two numbers under one word is how somebody learns not to trust the
     * numbers, and this product asks people to trust an EDH power score. The
     * word "Cards" now appears once on the screen and has one value.
     */
    {
      id: 'cards',
      label: 'Copies',
      value: totalCards.toLocaleString(),
      raw: totalCards,
      subtext: 'Cards you physically own',
    },
    {
      id: 'unique',
      label: 'Entries',
      value: uniqueCards.toLocaleString(),
      raw: uniqueCards,
      subtext: 'Rows in your collection',
    },
    {
      id: 'value',
      label: 'Total value',
      /* A dash, never $0.00: the smallest real price in the database is 0.01,
         so a rendered zero is always invented. An empty collection is not worth
         nothing, it is worth nothing yet. */
      value: totalCards > 0 ? formatPriceCompact(totalValue) : '—',
      raw: totalValue,
      // Compact on the tile, exact on hover. $12.3k is readable at a glance and
      // $12,341.87 is the number somebody actually wants when they look twice.
      title: totalCards > 0 ? formatPrice(totalValue) : undefined,
    },
    /*
     * Sits beside the money because it qualifies the money, and it is always
     * drawn.
     *
     * A tile that appears only on some accounts is a tile that appears the
     * moment the rows land, shoving the other five sideways. A dash is how
     * `DecksSummaryStats` already reports a figure with nothing to say, and it
     * reads as "nothing to report" rather than as a zero somebody computed.
     */
    {
      id: 'unpriced',
      label: 'No price',
      value: unpricedCards > 0 ? unpricedCards.toLocaleString() : '—',
      raw: unpricedCards,
      subtext: unpricedCards > 0 ? 'Left out of the total' : 'Every copy is priced',
    },
    {
      id: 'average',
      label: 'Average card',
      value: totalCards > 0 ? formatPrice(avgCardValue) : '—',
      raw: avgCardValue,
    },
    {
      id: 'recent',
      label: 'New this week',
      value: recentlyAddedCount.toLocaleString(),
      raw: recentlyAddedCount,
      subtext: 'Added in the last 7 days',
    },
  ];

  return <MetricRow metrics={metrics} columns={6} loading={loading} />;
}
