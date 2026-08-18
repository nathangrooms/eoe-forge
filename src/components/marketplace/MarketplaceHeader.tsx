import { Store, ExternalLink } from 'lucide-react';

interface MarketplaceHeaderProps {
  totalWatchlist?: number;
}

const MARKETPLACES = [
  { name: 'TCGplayer', href: 'https://www.tcgplayer.com/' },
  { name: 'Cardmarket', href: 'https://www.cardmarket.com/' },
  { name: 'Card Kingdom', href: 'https://www.cardkingdom.com/' },
  { name: 'eBay', href: 'https://www.ebay.com/sch/i.html?_nkw=mtg' },
];

/**
 * Sits directly beneath the page title, so it deliberately carries no heading
 * of its own — the previous version emitted a second <h1> with a near-duplicate
 * description under the real page title. It is now just the outbound price
 * sources plus the watch counter.
 */
export function MarketplaceHeader({ totalWatchlist = 0 }: MarketplaceHeaderProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="mr-1 text-xs text-muted-foreground">Price sources</span>
        {MARKETPLACES.map((m) => (
          <a
            key={m.name}
            href={m.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {m.name}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        ))}
      </div>

      <div className="shrink-0 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{totalWatchlist}</span>{' '}
        {totalWatchlist === 1 ? 'card' : 'cards'} watched
      </div>
    </div>
  );
}
