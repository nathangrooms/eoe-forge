import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ManaCost } from '@/components/ui/mana-cost';
import {
  Search,
  Star,
  Plus,
  X,
  Loader2,
  ArrowUpDown,
  Filter,
  LayoutGrid,
  List,
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { CardPriceDetail } from './CardPriceDetail';

interface PriceResult {
  marketplace: string;
  price: number | null;
  currency: string;
  url: string;
}

export interface CardPriceData {
  id: string;
  name: string;
  set_name: string;
  set_code: string;
  image_uri?: string;
  prices: PriceResult[];
  tcgplayerPrice?: number;
  tcgplayerFoilPrice?: number;
  cardmarketPrice?: number;
  cardmarketFoilPrice?: number;
  tixPrice?: number;
  etchedPrice?: number;
  averagePrice: number;
  lowestPrice: number;
  priceChange7d?: number;
  tcgplayerUrl?: string;
  cardmarketUrl?: string;
  cardkingdomUrl?: string;
  cardhoarderUrl?: string;
  scryfallData?: any;
  isArtVariant?: boolean;
  collectorNumber?: string;
  manaCost?: string;
  rarity?: string;
}

interface PriceSearchPanelProps {
  onAddToWatchlist?: (card: CardPriceData) => void;
  onAddToShoppingList?: (card: CardPriceData) => void;
}

type SortOption = 'name' | 'price-asc' | 'price-desc' | 'set';
type FilterOption = 'all' | 'standard' | 'art-variants';
type ViewMode = 'grid' | 'list';

interface MarketplacePreferences {
  sortBy: SortOption;
  filterBy: FilterOption;
  hideNoPrice: boolean;
  showFoil: boolean;
  viewMode: ViewMode;
}

const PREFERENCES_KEY = 'marketplace-preferences';
const PAGE_SIZE = 60;

const getStoredPreferences = (): Partial<MarketplacePreferences> => {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const savePreferences = (prefs: MarketplacePreferences) => {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
};

/**
 * An alternate-art printing, judged from the fields Scryfall actually publishes
 * for that purpose. The previous version guessed from the collector number
 * ("contains a letter, or is above 500"), which misclassifies a large share of
 * ordinary high-number cards in modern sets.
 */
function isArtVariant(card: any): boolean {
  const frames: string[] = card.frame_effects ?? [];
  return (
    card.promo === true ||
    card.full_art === true ||
    card.textless === true ||
    card.border_color === 'borderless' ||
    frames.includes('showcase') ||
    frames.includes('extendedart') ||
    frames.includes('etched') ||
    frames.includes('inverted')
  );
}

function toCardPriceData(card: any, showFoil: boolean): CardPriceData {
  const tcgPrice = parseFloat(card.prices?.usd || '0');
  const tcgFoilPrice = parseFloat(card.prices?.usd_foil || '0');
  const cardmarketPrice = parseFloat(card.prices?.eur || '0');
  const cardmarketFoilPrice = parseFloat(card.prices?.eur_foil || '0');
  const tixPrice = parseFloat(card.prices?.tix || '0');
  const etchedPrice = parseFloat(card.prices?.usd_etched || '0');

  const displayPrice = showFoil ? tcgFoilPrice : tcgPrice;

  const prices: PriceResult[] = [];
  if (card.purchase_uris?.tcgplayer) {
    prices.push({
      marketplace: 'TCGplayer',
      price: displayPrice || null,
      currency: 'USD',
      url: card.purchase_uris.tcgplayer,
    });
  }
  if (card.purchase_uris?.cardmarket) {
    const cmPrice = showFoil ? cardmarketFoilPrice : cardmarketPrice;
    prices.push({
      marketplace: 'Cardmarket',
      price: cmPrice || null,
      currency: 'EUR',
      url: card.purchase_uris.cardmarket,
    });
  }
  if (card.purchase_uris?.cardhoarder && tixPrice > 0) {
    prices.push({
      marketplace: 'Cardhoarder',
      price: tixPrice,
      currency: 'TIX',
      url: card.purchase_uris.cardhoarder,
    });
  }
  if (card.purchase_uris?.cardkingdom) {
    prices.push({
      marketplace: 'Card Kingdom',
      price: null,
      currency: 'USD',
      url: card.purchase_uris.cardkingdom,
    });
  }

  return {
    id: card.id,
    name: card.name,
    set_name: card.set_name,
    set_code: card.set,
    image_uri:
      card.image_uris?.normal ||
      card.image_uris?.small ||
      card.card_faces?.[0]?.image_uris?.normal,
    prices,
    tcgplayerPrice: tcgPrice,
    tcgplayerFoilPrice: tcgFoilPrice,
    cardmarketPrice,
    cardmarketFoilPrice,
    tixPrice,
    etchedPrice,
    averagePrice: displayPrice,
    lowestPrice: displayPrice,
    tcgplayerUrl: card.purchase_uris?.tcgplayer,
    cardmarketUrl: card.purchase_uris?.cardmarket,
    cardkingdomUrl: card.purchase_uris?.cardkingdom,
    cardhoarderUrl: card.purchase_uris?.cardhoarder,
    scryfallData: card,
    isArtVariant: isArtVariant(card),
    collectorNumber: card.collector_number,
    manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost,
    rarity: card.rarity,
  };
}

export function PriceSearchPanel({ onAddToWatchlist, onAddToShoppingList }: PriceSearchPanelProps) {
  const storedPrefs = getStoredPreferences();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [results, setResults] = useState<CardPriceData[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CardPriceData | null>(null);
  const [showFoil, setShowFoil] = useState(storedPrefs.showFoil ?? false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(storedPrefs.sortBy ?? 'name');
  const [filterBy, setFilterBy] = useState<FilterOption>(storedPrefs.filterBy ?? 'all');
  const [hideNoPrice, setHideNoPrice] = useState(storedPrefs.hideNoPrice ?? true);
  const [viewMode, setViewMode] = useState<ViewMode>(storedPrefs.viewMode ?? 'grid');

  // Guards against an earlier in-flight request overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    savePreferences({ sortBy, filterBy, hideNoPrice, showFoil, viewMode });
  }, [sortBy, filterBy, hideNoPrice, showFoil, viewMode]);

  const runSearch = useCallback(
    async (url: string, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 404) {
            if (id === requestId.current) {
              setResults([]);
              setNextPage(null);
              setTotalCards(0);
            }
            return;
          }
          throw new Error('Search failed');
        }

        const data = await response.json();
        if (id !== requestId.current) return;

        const page: CardPriceData[] = data.data
          .slice(0, PAGE_SIZE)
          .map((c: any) => toCardPriceData(c, showFoil));

        setResults(prev => (append ? [...prev, ...page] : page));
        setNextPage(data.has_more ? data.next_page : null);
        setTotalCards(data.total_cards ?? page.length);
      } catch (error) {
        console.error('Search error:', error);
        if (id === requestId.current && !append) {
          setResults([]);
          setNextPage(null);
          setTotalCards(0);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [showFoil]
  );

  // Debounced auto-search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      if (query.length === 0) {
        setResults([]);
        setNextPage(null);
        setTotalCards(0);
      }
      return;
    }

    const timer = setTimeout(() => {
      runSearch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
          query
        )}&unique=prints&order=released&dir=desc`,
        false
      );
    }, 400);

    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const handleAddToWatchlist = (card: CardPriceData) => {
    onAddToWatchlist?.(card);
    showSuccess('Added to watchlist', `${card.name} added to your price watchlist`);
  };

  const handleAddToShoppingList = (card: CardPriceData) => {
    onAddToShoppingList?.(card);
  };

  const handleCardClick = (card: CardPriceData) => {
    setSelectedCard(card);
    setShowDetailPanel(true);
  };

  const filteredAndSortedResults = useMemo(() => {
    let filtered = [...results];

    if (hideNoPrice) {
      filtered = filtered.filter(card => {
        const price = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
        const cmPrice = showFoil ? card.cardmarketFoilPrice : card.cardmarketPrice;
        return (price && price > 0) || (cmPrice && cmPrice > 0) || (card.tixPrice && card.tixPrice > 0);
      });
    }

    if (filterBy === 'standard') {
      filtered = filtered.filter(card => !card.isArtVariant);
    } else if (filterBy === 'art-variants') {
      filtered = filtered.filter(card => card.isArtVariant);
    }

    filtered.sort((a, b) => {
      const priceA = showFoil ? a.tcgplayerFoilPrice || 0 : a.tcgplayerPrice || 0;
      const priceB = showFoil ? b.tcgplayerFoilPrice || 0 : b.tcgplayerPrice || 0;

      switch (sortBy) {
        case 'price-asc':
          return priceA - priceB;
        case 'price-desc':
          return priceB - priceA;
        case 'set':
          return a.set_name.localeCompare(b.set_name);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [results, filterBy, sortBy, showFoil, hideNoPrice]);

  const standardCount = results.filter(c => !c.isArtVariant).length;
  const artVariantCount = results.filter(c => c.isArtVariant).length;
  const noPriceCount = results.filter(c => {
    const price = showFoil ? c.tcgplayerFoilPrice : c.tcgplayerPrice;
    const cmPrice = showFoil ? c.cardmarketFoilPrice : c.cardmarketPrice;
    return !((price && price > 0) || (cmPrice && cmPrice > 0) || (c.tixPrice && c.tixPrice > 0));
  }).length;

  const priceLabel = (card: CardPriceData) => {
    const usd = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
    if (usd && usd > 0) return `$${usd.toFixed(2)}`;
    const eur = showFoil ? card.cardmarketFoilPrice : card.cardmarketPrice;
    if (eur && eur > 0) return `€${eur.toFixed(2)}`;
    if (card.tixPrice && card.tixPrice > 0) return `${card.tixPrice.toFixed(2)} tix`;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Search and compare prices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Input
                placeholder="Start typing a card name..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pr-10 text-base"
                aria-label="Card name"
              />
              {loading ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : query ? (
                <button
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    setNextPage(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="foil-toggle" checked={showFoil} onCheckedChange={setShowFoil} />
              <Label htmlFor="foil-toggle" className="text-sm">
                Foil prices
              </Label>
            </div>
          </div>

          {/* Filters, sort, view mode */}
          {results.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterBy} onValueChange={v => setFilterBy(v as FilterOption)}>
                  <SelectTrigger className="h-8 w-[170px]">
                    <SelectValue placeholder="Filter versions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All versions ({results.length})</SelectItem>
                    <SelectItem value="standard">Standard ({standardCount})</SelectItem>
                    <SelectItem value="art-variants">Alt art ({artVariantCount})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="price-asc">Price: low to high</SelectItem>
                    <SelectItem value="price-desc">Price: high to low</SelectItem>
                    <SelectItem value="set">Set name</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="hide-no-price"
                  checked={hideNoPrice}
                  onCheckedChange={setHideNoPrice}
                />
                <Label htmlFor="hide-no-price" className="cursor-pointer text-xs">
                  Hide no price {noPriceCount > 0 && `(${noPriceCount})`}
                </Label>
              </div>

              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={viewMode}
                onValueChange={v => v && setViewMode(v as ViewMode)}
                className="ml-auto"
              >
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="w-full text-xs text-muted-foreground sm:w-auto">
                Showing {filteredAndSortedResults.length} of {results.length} loaded
                {totalCards > results.length && ` · ${totalCards} printings match`}
              </div>
            </div>
          )}

          {query.length > 0 && query.length < 2 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && results.length === 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[63/88] w-full" />
              <CardContent className="space-y-2 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results — grid */}
      {!loading && filteredAndSortedResults.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredAndSortedResults.map(card => {
            const price = priceLabel(card);

            return (
              <Card
                key={card.id}
                className="cursor-pointer overflow-hidden transition-colors hover:border-foreground/40"
                onClick={() => handleCardClick(card)}
              >
                <div className="relative bg-muted">
                  {card.image_uri ? (
                    <img
                      src={card.image_uri}
                      alt={card.name}
                      className="aspect-[63/88] w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex aspect-[63/88] w-full items-center justify-center">
                      <Search className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  {card.isArtVariant && (
                    <Badge variant="secondary" className="absolute right-2 top-2 text-xs">
                      Alt art
                    </Badge>
                  )}
                </div>

                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-medium text-foreground">{card.name}</h3>
                    {card.manaCost && <ManaCost cost={card.manaCost} size="xs" />}
                  </div>
                  <p className="mb-2 truncate text-xs text-muted-foreground">
                    {card.set_name} · {card.set_code.toUpperCase()}
                  </p>

                  <p className="mb-2 text-sm font-semibold tabular-nums text-foreground">
                    {price ?? <span className="font-normal text-muted-foreground">No price data</span>}
                  </p>

                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={e => {
                        e.stopPropagation();
                        handleAddToWatchlist(card);
                      }}
                    >
                      <Star className="mr-1 h-3 w-3" />
                      Watch
                    </Button>
                    {onAddToShoppingList && (
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={e => {
                          e.stopPropagation();
                          handleAddToShoppingList(card);
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        List
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Results — table */}
      {!loading && filteredAndSortedResults.length > 0 && viewMode === 'list' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Card</th>
                  <th scope="col" className="px-4 py-2 font-medium">Cost</th>
                  <th scope="col" className="px-4 py-2 font-medium">Set</th>
                  <th scope="col" className="px-4 py-2 font-medium">Rarity</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedResults.map(card => (
                  <tr
                    key={card.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
                    onClick={() => handleCardClick(card)}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium text-foreground">{card.name}</span>
                      {card.isArtVariant && (
                        <Badge variant="secondary" className="ml-2 text-xs">Alt art</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {card.manaCost ? <ManaCost cost={card.manaCost} size="xs" /> : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {card.set_code.toUpperCase()}
                    </td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">
                      {card.rarity ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-foreground">
                      {priceLabel(card) ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={e => {
                          e.stopPropagation();
                          handleAddToWatchlist(card);
                        }}
                        aria-label={`Watch ${card.name}`}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                      {onAddToShoppingList && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={e => {
                            e.stopPropagation();
                            handleAddToShoppingList(card);
                          }}
                          aria-label={`Add ${card.name} to shopping list`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {!loading && nextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => runSearch(nextPage, true)} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load more printings
          </Button>
        </div>
      )}

      {!loading && results.length === 0 && query.length >= 2 && (
        <Card className="p-12 text-center">
          <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium text-foreground">No cards found</h3>
          <p className="text-sm text-muted-foreground">Try a different search term.</p>
        </Card>
      )}

      {!loading && results.length > 0 && filteredAndSortedResults.length === 0 && (
        <Card className="p-12 text-center">
          <h3 className="mb-2 text-lg font-medium text-foreground">
            Every result is filtered out
          </h3>
          <p className="text-sm text-muted-foreground">
            Loosen the version filter or turn off &ldquo;hide no price&rdquo;.
          </p>
        </Card>
      )}

      {/* Price Detail Panel */}
      {selectedCard && (
        <CardPriceDetail
          card={selectedCard}
          isOpen={showDetailPanel}
          onClose={() => setShowDetailPanel(false)}
          showFoil={showFoil}
          onAddToWatchlist={handleAddToWatchlist}
          onAddToShoppingList={onAddToShoppingList ? handleAddToShoppingList : undefined}
        />
      )}
    </div>
  );
}
