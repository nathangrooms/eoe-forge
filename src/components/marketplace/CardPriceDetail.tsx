import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ManaCost } from '@/components/ui/mana-cost';
import {
  ExternalLink,
  Star,
  ShoppingCart,
  Plus,
  Package,
  Info,
} from 'lucide-react';
import { CardPriceData } from './PriceSearchPanel';
import { CardPriceHistoryChart } from './CardPriceHistoryChart';
import { BuyLinks } from './BuyLinks';

interface CardPriceDetailProps {
  card: CardPriceData;
  isOpen: boolean;
  onClose: () => void;
  showFoil?: boolean;
  onAddToWatchlist?: (card: CardPriceData) => void;
  onAddToShoppingList?: (card: CardPriceData) => void;
}

interface PrintingPrice {
  id: string;
  set_name: string;
  set_code: string;
  price: number | null;
  foilPrice: number | null;
  rarity: string;
  released_at: string;
  tcgplayerUrl?: string;
}

/** Rarity is a monochrome weight here — the palette is reserved for MTG colour. */
const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic',
  special: 'Special',
  bonus: 'Bonus',
};

export function CardPriceDetail({
  card,
  isOpen,
  onClose,
  showFoil = false,
  onAddToWatchlist,
  onAddToShoppingList,
}: CardPriceDetailProps) {
  const [allPrintings, setAllPrintings] = useState<PrintingPrice[]>([]);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [priceStats, setPriceStats] = useState<{
    lowest: number;
    highest: number;
    average: number;
    median: number;
  } | null>(null);

  const loadAllPrintings = useCallback(async () => {
    if (!card.scryfallData?.prints_search_uri) return;

    setLoadingPrintings(true);
    try {
      const response = await fetch(card.scryfallData.prints_search_uri);
      if (!response.ok) throw new Error('Failed to fetch printings');

      const data = await response.json();

      const printings: PrintingPrice[] = data.data
        .map((print: any) => ({
          id: print.id,
          set_name: print.set_name,
          set_code: print.set,
          price: parseFloat(print.prices?.usd || '0') || null,
          foilPrice: parseFloat(print.prices?.usd_foil || '0') || null,
          rarity: print.rarity,
          released_at: print.released_at,
          tcgplayerUrl: print.purchase_uris?.tcgplayer,
        }))
        .filter((p: PrintingPrice) => {
          const relevantPrice = showFoil ? p.foilPrice : p.price;
          return relevantPrice && relevantPrice > 0;
        })
        .sort((a: PrintingPrice, b: PrintingPrice) => {
          const priceA = showFoil ? a.foilPrice || 0 : a.price || 0;
          const priceB = showFoil ? b.foilPrice || 0 : b.price || 0;
          return priceA - priceB;
        });

      setAllPrintings(printings);

      if (printings.length > 0) {
        const prices = printings.map(p => (showFoil ? p.foilPrice || 0 : p.price || 0));
        const sorted = [...prices].sort((a, b) => a - b);
        const sum = prices.reduce((a, b) => a + b, 0);

        setPriceStats({
          lowest: sorted[0],
          highest: sorted[sorted.length - 1],
          average: sum / prices.length,
          median: sorted[Math.floor(sorted.length / 2)],
        });
      } else {
        setPriceStats(null);
      }
    } catch (error) {
      console.error('Error loading printings:', error);
    } finally {
      setLoadingPrintings(false);
    }
  }, [card.scryfallData?.prints_search_uri, showFoil]);

  useEffect(() => {
    if (isOpen && card) {
      loadAllPrintings();
    }
  }, [isOpen, card, loadAllPrintings]);

  const displayPrice = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
  const manaCost: string | undefined =
    card.scryfallData?.mana_cost || card.scryfallData?.card_faces?.[0]?.mana_cost;

  const stats = priceStats
    ? [
        { label: 'Lowest', value: priceStats.lowest },
        { label: 'Highest', value: priceStats.highest },
        { label: 'Average', value: priceStats.average },
        { label: 'Median', value: priceStats.median },
      ]
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Price details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Card Info */}
          <div className="flex gap-4">
            {card.image_uri && (
              <img
                src={card.image_uri}
                alt={card.name}
                className="h-auto w-32 shrink-0 rounded-lg border border-border"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{card.name}</h2>
                {manaCost && <ManaCost cost={manaCost} size="sm" />}
              </div>
              <p className="mb-2 text-sm text-muted-foreground">
                {card.set_name} ({card.set_code.toUpperCase()})
              </p>

              <div className="mb-3 flex items-center gap-2">
                {displayPrice && displayPrice > 0 ? (
                  <>
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                      ${displayPrice.toFixed(2)}
                    </span>
                    <Badge variant="outline">TCGplayer{showFoil ? ' foil' : ''}</Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground">No price data</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onAddToWatchlist?.(card)}>
                  <Star className="mr-1 h-4 w-4" />
                  Watch
                </Button>
                {onAddToShoppingList && (
                  <Button variant="outline" size="sm" onClick={() => onAddToShoppingList(card)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add to list
                  </Button>
                )}
                {card.tcgplayerUrl && (
                  <Button size="sm" asChild>
                    <a href={card.tcgplayerUrl} target="_blank" rel="noopener noreferrer">
                      <ShoppingCart className="mr-1 h-4 w-4" />
                      Buy
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Price History Chart */}
          {card.scryfallData?.id && (
            <CardPriceHistoryChart
              cardId={card.scryfallData.id}
              cardName={card.name}
              oracleId={card.scryfallData?.oracle_id}
              showFoil={showFoil}
            />
          )}

          {/* Price Statistics */}
          {stats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Across all printings with a price
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {stats.map(stat => (
                    <div key={stat.label} className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        ${stat.value.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Buy Links */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Where to buy</CardTitle>
            </CardHeader>
            <CardContent>
              <BuyLinks
                card={{
                  name: card.name,
                  set_name: card.set_name,
                  prices: card.scryfallData?.prices,
                  purchaseUris: card.scryfallData?.purchase_uris,
                }}
                showFoil={showFoil}
              />
            </CardContent>
          </Card>

          {/* All Printings with Prices */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4 text-muted-foreground" />
                All printings ({allPrintings.length})
                <Badge variant="outline" className="ml-auto font-normal">
                  Cheapest first
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPrintings ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : allPrintings.length > 0 ? (
                <div className="max-h-[400px] space-y-2 overflow-y-auto pr-2">
                  {allPrintings.map((printing, index) => {
                    const price = showFoil ? printing.foilPrice : printing.price;
                    const isCheapest = index === 0;

                    return (
                      <a
                        key={printing.id}
                        href={printing.tcgplayerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent ${
                          isCheapest ? 'border-foreground' : 'border-border'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">
                              {printing.set_name}
                            </p>
                            {isCheapest && (
                              <Badge variant="default" className="text-xs">
                                Cheapest
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{printing.set_code.toUpperCase()}</span>
                            <span>·</span>
                            <span>{RARITY_LABEL[printing.rarity] ?? printing.rarity}</span>
                            <span>·</span>
                            <span>{printing.released_at}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`tabular-nums ${
                              isCheapest ? 'font-semibold text-foreground' : 'text-foreground'
                            }`}
                          >
                            ${price?.toFixed(2)}
                          </span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  <Info className="mx-auto mb-2 h-8 w-8" />
                  <p className="text-sm">No printings with price data found</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Prices come from Scryfall&apos;s daily vendor feed and are indicative, not live
                listings. The 30-day chart above uses DeckMatrix&apos;s own price snapshots.
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
