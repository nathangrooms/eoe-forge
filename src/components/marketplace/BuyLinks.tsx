import { ExternalLink } from 'lucide-react';

/**
 * The single buy-links renderer for the marketplace area.
 *
 * There used to be three independent copies of this list: BuyOptionsModal built
 * a `platforms` array with per-vendor Tailwind colour strings, CardPriceDetail
 * hardcoded the same four destinations as inline anchor blocks with the same
 * copy, and PriceSearchPanel built a third `PriceResult[]` whose `color` field
 * no consumer ever read.
 */

export interface BuyLinksCard {
  name: string;
  set_name: string;
  /** Raw Scryfall `prices` object for this printing. */
  prices?: Record<string, string | null | undefined>;
  /** Raw Scryfall `purchase_uris` object for this printing. */
  purchaseUris?: Record<string, string | undefined>;
}

interface BuyLinksProps {
  card: BuyLinksCard;
  showFoil?: boolean;
}

interface Row {
  name: string;
  note: string;
  price: string | null;
  url: string;
}

function num(value: string | null | undefined): number {
  const n = Number(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function buildBuyRows(card: BuyLinksCard, showFoil = false): Row[] {
  const prices = card.prices ?? {};
  const uris = card.purchaseUris ?? {};
  const rows: Row[] = [];

  const usd = showFoil ? num(prices.usd_foil) : num(prices.usd);
  const eur = showFoil ? num(prices.eur_foil) : num(prices.eur);
  const tix = num(prices.tix);

  if (uris.tcgplayer) {
    rows.push({
      name: 'TCGplayer',
      note: 'US marketplace',
      price: usd > 0 ? `$${usd.toFixed(2)}` : null,
      url: uris.tcgplayer,
    });
  }
  if (uris.cardmarket) {
    rows.push({
      name: 'Cardmarket',
      note: 'EU marketplace',
      price: eur > 0 ? `€${eur.toFixed(2)}` : null,
      url: uris.cardmarket,
    });
  }
  if (uris.cardhoarder && tix > 0) {
    rows.push({
      name: 'Cardhoarder',
      note: 'MTGO digital',
      price: `${tix.toFixed(2)} tix`,
      url: uris.cardhoarder,
    });
  }
  if (uris.cardkingdom) {
    rows.push({
      name: 'Card Kingdom',
      note: 'US retailer',
      price: null,
      url: uris.cardkingdom,
    });
  }
  rows.push({
    name: 'eBay',
    note: 'Auctions and Buy It Now',
    price: null,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
      `${card.name} mtg ${card.set_name}`
    )}`,
  });

  return rows;
}

export function BuyLinks({ card, showFoil = false }: BuyLinksProps) {
  const rows = buildBuyRows(card, showFoil);

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <a
          key={row.name}
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.note}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm tabular-nums text-foreground">
              {row.price ?? <span className="text-muted-foreground">Check price</span>}
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        </a>
      ))}
    </div>
  );
}
