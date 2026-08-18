import { Store, ExternalLink } from 'lucide-react';

interface MarketplaceHeaderProps {
  watchlistCount: number;
  shoppingListCount: number;
  myListingsCount: number;
  totalListingValue: number;
}

const MARKETPLACES = [
  { name: 'TCGplayer', href: 'https://www.tcgplayer.com/' },
  { name: 'Cardmarket', href: 'https://www.cardmarket.com/' },
  { name: 'Card Kingdom', href: 'https://www.cardkingdom.com/' },
  { name: 'eBay', href: 'https://www.ebay.com/sch/i.html?_nkw=mtg' },
];

/**
 * One strip: outbound price sources on the left, the four counters on the right.
 *
 * These used to be two stacked blocks — a links bar, then a 2×4 grid of stat
 * tiles — which together burned ~190px at the top of the page and meant that for
 * a user with an empty watchlist the first thing on a card-trading page was four
 * large zeroes. As a single flat row the same four numbers cost ~64px and the
 * cards start near the top of the viewport. The numbers are unchanged and still
 * counted from the live lists.
 */
export function MarketplaceHeader({
  watchlistCount,
  shoppingListCount,
  myListingsCount,
  totalListingValue,
}: MarketplaceHeaderProps) {
  const stats: { label: string; value: string }[] = [
    { label: 'Watching', value: String(watchlistCount) },
    { label: 'Shopping list', value: String(shoppingListCount) },
    { label: 'Listings', value: String(myListingsCount) },
    { label: 'Listing value', value: `$${totalListingValue.toFixed(2)}` },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card px-4 py-3 shadow-lg shadow-black/20 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="mr-1 text-xs text-muted-foreground">Price sources</span>
        {MARKETPLACES.map(m => (
          <a
            key={m.name}
            href={m.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {m.name}
            <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </a>
        ))}
      </div>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {stats.map(stat => (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
