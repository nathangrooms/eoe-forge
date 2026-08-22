import { useMemo } from 'react';
import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';
import { readAmount, totalPrices, describeGapsShort } from '@/lib/pricing';
import { MetricRow, type Metric } from '@/components/listing';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  target_price_usd?: number;
  alert_enabled?: boolean;
  card?: { prices?: { usd?: string } };
}

interface WishlistQuickStatsProps {
  items: WishlistItem[];
  /** Card ids one of the user's decks is genuinely short of. */
  neededByDeck?: Set<string>;
  /** Copies of each card already in the collection. */
  ownedByCard?: Map<string, number>;
  loading?: boolean;
}

/**
 * The wishlist's figures, in the tiles My Decks and My Collection use.
 *
 * ## What changed
 *
 * This row was four hand-built boxes with a 40px icon each and an 18px number.
 * The icons go, because the owner ruled on them for the identical row on My
 * Decks: *"Deck manage metrics dont need icons - makes it look like ai slop"*.
 * The number is the thing and the label already says what it is. `MetricRow`
 * has no `icon` prop for that reason.
 *
 * ## What is kept, deliberately
 *
 * The previous version's argument still holds and is worth restating, because
 * it is the reason this is not simply the six biggest numbers available:
 * *"Alerts active"* and *"At or below target"* read zero for every account that
 * has never set a target price, which is all of them, so a row that led with
 * them led with two structural zeroes. That reasoning survives as the last
 * tile, which asks for a target price when none exists and reports against one
 * once it does.
 *
 * The highlight survives too. A card that has fallen to the price you said you
 * would pay is a prompt rather than a figure, and it is the one place in the
 * product where that treatment was earned. It is `Metric.emphasis` now instead
 * of a hand-built tile, so it cannot drift away from the row it sits in.
 *
 * Nothing was dropped. `Alerts active` moved from a tile of its own to the line
 * under the target figure, which is where its denominator belongs, and
 * `Entries` was added because the page header used to say "94 cards" meaning
 * rows while this row said "Cards" meaning copies. Two different figures under
 * one word.
 */
export function WishlistQuickStats({
  items,
  neededByDeck,
  ownedByCard,
  loading = false,
}: WishlistQuickStatsProps) {
  const stats = useMemo(() => {
    /* `totalPrices` adds up only the copies it could price and counts the rest,
       instead of adding a missing price as zero and reporting a confident total
       that is quietly too low. 588 of 38,603 printings carry no price at all. */
    const value = totalPrices(
      items.map(item => ({ prices: item.card?.prices, quantity: item.quantity })),
      'USD'
    );

    const priceDrops = items.filter(item => {
      const current = readAmount(item.card?.prices?.usd);
      return Boolean(item.target_price_usd && current != null && current <= item.target_price_usd);
    }).length;

    return {
      totalValue: value.amount,
      unpriced: describeGapsShort(value),
      pricedCopies: value.pricedCopies,
      totalCards: items.reduce((sum, item) => sum + item.quantity, 0),
      entries: items.length,
      alertsActive: items.filter(i => i.alert_enabled && i.target_price_usd).length,
      priceDrops,
      targetsSet: items.filter(i => i.target_price_usd).length,
      deckDemand: neededByDeck ? items.filter(i => neededByDeck.has(i.card_id)).length : 0,
      alreadyOwned: ownedByCard
        ? items.filter(i => (ownedByCard.get(i.card_id) ?? 0) > 0).length
        : 0,
    };
  }, [items, neededByDeck, ownedByCard]);

  const metrics: Metric[] = [
    { id: 'cards', label: 'Cards', value: stats.totalCards.toLocaleString(), raw: stats.totalCards },
    {
      id: 'entries',
      label: 'Entries',
      value: stats.entries.toLocaleString(),
      raw: stats.entries,
      subtext: 'Rows on your list',
    },
    {
      id: 'value',
      label: 'Total value',
      /* Compact on the tile, exact on hover. Same rule as the collection: $4.7k
         is readable at a glance and $4,676.12 is what somebody wants on a
         second look. A dash rather than $0.00 when nothing could be priced,
         because a rendered zero is always invented. */
      value: stats.pricedCopies > 0 ? formatPriceCompact(stats.totalValue) : '—',
      raw: stats.totalValue,
      title: stats.pricedCopies > 0 ? formatPrice(stats.totalValue) : undefined,
      subtext: stats.unpriced ?? 'Every copy is priced',
    },
    {
      id: 'deck-demand',
      label: 'A deck is short of',
      value: stats.deckDemand.toLocaleString(),
      raw: stats.deckDemand,
      subtext: 'Waiting on in a real deck',
    },
    {
      id: 'owned',
      label: 'Already in collection',
      value: stats.alreadyOwned.toLocaleString(),
      raw: stats.alreadyOwned,
      subtext: 'You own a copy of these',
    },
    stats.targetsSet > 0
      ? {
          id: 'target',
          label: 'At or below target',
          value: stats.priceDrops.toLocaleString(),
          raw: stats.priceDrops,
          emphasis: stats.priceDrops > 0,
          subtext: stats.alertsActive === 1 ? '1 alert on' : `${stats.alertsActive} alerts on`,
        }
      : {
          id: 'target',
          label: 'Price alerts',
          value: '—',
          subtext: 'Set a target price on a card',
        },
  ];

  return <MetricRow metrics={metrics} columns={6} loading={loading} />;
}
