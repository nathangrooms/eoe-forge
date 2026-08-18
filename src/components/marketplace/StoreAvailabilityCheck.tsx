import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Store, ExternalLink, RefreshCw } from 'lucide-react';

/**
 * Real vendor prices and purchase links for a printing.
 *
 * This panel used to seed itself with a hardcoded array — TCGplayer $12.99,
 * Card Kingdom $13.50, ChannelFireball "out of stock", Star City Games $14.99 —
 * identical for every card in the app, with a "Refresh" button that only reset a
 * timestamp. Nothing was ever fetched. It now reads the printing's real
 * `prices` and `purchase_uris` from Scryfall and makes no stock claim at all,
 * because per-store inventory is not data we have.
 */

interface StoreAvailabilityCheckProps {
  cardName: string;
  cardId: string;
}

interface VendorRow {
  store: string;
  /** Formatted price, or null when the vendor publishes none for this printing. */
  price: string | null;
  priceNote?: string;
  url?: string;
}

interface ScryfallPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

interface ScryfallPurchaseUris {
  tcgplayer?: string;
  cardmarket?: string;
  cardhoarder?: string;
}

function money(value: string | null | undefined, symbol: string): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${symbol}${n.toFixed(2)}`;
}

export function StoreAvailabilityCheck({ cardName, cardId }: StoreAvailabilityCheckProps) {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response: Response | null = null;

      if (cardId) {
        response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(cardId)}`);
      }
      if ((!response || !response.ok) && cardName) {
        response = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`
        );
      }
      if (!response || !response.ok) throw new Error('lookup failed');

      const card = await response.json();
      const prices: ScryfallPrices = card.prices ?? {};
      const uris: ScryfallPurchaseUris = card.purchase_uris ?? {};

      const usd = money(prices.usd, '$');
      const usdFoil = money(prices.usd_foil, '$');
      const eur = money(prices.eur, '€');
      const eurFoil = money(prices.eur_foil, '€');
      const tix = prices.tix ? `${Number(prices.tix).toFixed(2)} tix` : null;

      const searchName = encodeURIComponent(card.name ?? cardName);

      setRows([
        {
          store: 'TCGplayer',
          price: usd,
          priceNote: usdFoil ? `foil ${usdFoil}` : undefined,
          url:
            uris.tcgplayer ??
            `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${searchName}`,
        },
        {
          store: 'Cardmarket',
          price: eur,
          priceNote: eurFoil ? `foil ${eurFoil}` : undefined,
          url:
            uris.cardmarket ??
            `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${searchName}`,
        },
        {
          store: 'Cardhoarder (MTGO)',
          price: tix,
          url: uris.cardhoarder ?? `https://www.cardhoarder.com/cards?data%5Bsearch%5D=${searchName}`,
        },
        {
          store: 'Card Kingdom',
          price: null,
          url: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${searchName}`,
        },
        {
          store: 'Star City Games',
          price: null,
          url: `https://starcitygames.com/search/?search_query=${searchName}`,
        },
      ]);
      setUpdatedAt(new Date());
    } catch (e) {
      console.error('Error loading vendor prices:', e);
      setError('Could not load vendor prices for this printing.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardId, cardName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Store className="h-4 w-4 text-muted-foreground" />
            Where to buy
          </CardTitle>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {loading ? (
          <>
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : (
          rows.map(row => (
            <a
              key={row.store}
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{row.store}</div>
                {row.priceNote && (
                  <div className="text-xs text-muted-foreground">{row.priceNote}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums text-foreground">
                  {row.price ?? <span className="text-muted-foreground">Search</span>}
                </span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            </a>
          ))
        )}

        <p className="pt-2 text-xs text-muted-foreground">
          Prices come from Scryfall&apos;s daily vendor feed for this exact printing and are
          indicative, not live inventory. Card Kingdom and Star City Games do not publish prices
          through that feed, so those rows link to a search instead.
          {updatedAt && ` Loaded ${updatedAt.toLocaleTimeString()}.`}
        </p>
      </CardContent>
    </Card>
  );
}
