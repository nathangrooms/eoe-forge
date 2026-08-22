import { Store, ExternalLink } from 'lucide-react';
import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';
import { MetricRow, type Metric } from '@/components/listing';

interface MarketplaceHeaderProps {
  watchlistCount: number;
  shoppingListCount: number;
  myListingsCount: number;
  totalListingValue: number;
  loading?: boolean;
}

const MARKETPLACES = [
  { name: 'TCGplayer', href: 'https://www.tcgplayer.com/' },
  { name: 'Cardmarket', href: 'https://www.cardmarket.com/' },
  { name: 'Card Kingdom', href: 'https://www.cardkingdom.com/' },
  { name: 'eBay', href: 'https://www.ebay.com/sch/i.html?_nkw=mtg' },
];

/**
 * Where prices come from, and the four figures this page is about.
 *
 * ## Why the figures grew back
 *
 * The previous version of this file folded all four into a 14px run of text
 * along the right of the links bar, and the reason it gave was floor space:
 * *"As a single flat row the same four numbers cost ~64px and the cards start
 * near the top of the viewport."*
 *
 * That is word for word the argument the collection's header made, and the
 * owner overruled it there: *"my decks has proper metric tiles, when on my
 * collection page we dont have these and they are much smaller due to the multi
 * menu system"*. Measured, a squeezed figure had 2,534 px² against a My Decks
 * tile's 19,447, with its number at 14px against 24px. The same squeeze was
 * here, for the same reason, and it gets the same answer: the room was going to
 * chrome, not to the figures, and shrinking the figures was fixing the wrong
 * thing.
 *
 * The links keep their strip, because four outbound links are not figures and a
 * price source is not something you count.
 */
export function MarketplaceHeader({
  watchlistCount,
  shoppingListCount,
  myListingsCount,
  totalListingValue,
  loading = false,
}: MarketplaceHeaderProps) {
  const metrics: Metric[] = [
    {
      id: 'watching',
      label: 'Watching',
      value: watchlistCount.toLocaleString(),
      raw: watchlistCount,
      subtext: 'Cards with a price you track',
    },
    {
      id: 'shopping',
      label: 'Shopping list',
      value: shoppingListCount.toLocaleString(),
      raw: shoppingListCount,
      subtext: 'Still to buy',
    },
    {
      id: 'listings',
      label: 'Listings',
      value: myListingsCount.toLocaleString(),
      raw: myListingsCount,
      subtext: 'Cards you have for sale',
    },
    {
      id: 'listing-value',
      label: 'Listing value',
      /* Compact on the tile, exact on hover, same rule as every other money
         figure in the product. A dash, never $0.00: with nothing listed there
         is no asking price, and a rendered zero would read as "your listings
         are worthless". */
      value: myListingsCount > 0 ? formatPriceCompact(totalListingValue) : '—',
      raw: totalListingValue,
      title: myListingsCount > 0 ? formatPrice(totalListingValue) : undefined,
      subtext: myListingsCount > 0 ? 'What you are asking for them' : 'Nothing listed yet',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-lg bg-card px-4 py-3 shadow-lg shadow-black/20">
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

      <MetricRow metrics={metrics} columns={4} loading={loading} />
    </div>
  );
}
