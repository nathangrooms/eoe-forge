import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import { cardDetailPath, CardGrid, CardGridSkeleton, CardImage, CardSizeSlider, useCardSize } from '@/components/cards';
import { ActiveFilterChips, CardFilterPanel, useCardFilterState } from '@/components/filters';
import { getBestCardImage } from '@/lib/scryfall/card-utils';
import { CardPriceDetail } from './CardPriceDetail';
import { useMarketplaceSeed } from './useMarketplaceSeed';
import { NO_PRICE } from '@/lib/pricing';

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
    // The quality ladder, not `normal`: a price comparison is a *looking* task,
    // and this URL is what the detail drawer blows up to full size.
    image_uri: getBestCardImage(card, 'large'),
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

/**
 * Price search.
 *
 * This used to be a name box: whatever you typed was sent to Scryfall verbatim
 * and that was the entire query surface. It now drives the shared
 * `CardFilterPanel`, so every facet available on the card-search pages — colour
 * identity, mana value, format legality, rarity, set, price bounds — is
 * available when shopping, which is exactly where a price ceiling matters most.
 * The marketplace's own axes (foil pricing, printing variants, "hide no price")
 * stay beside it because they are properties of the *listing*, not the card.
 */
export function PriceSearchPanel({ onAddToWatchlist, onAddToShoppingList }: PriceSearchPanelProps) {
  const navigate = useNavigate();
  const storedPrefs = getStoredPreferences();

  const filters = useCardFilterState();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cardWidth, setCardWidth] = useCardSize('marketplace', 190);

  /* Real cards to show before a query exists — the user's own wishlist and
     collection, priced. See `useMarketplaceSeed`. */
  const { seeds, loading: seedLoading } = useMarketplaceSeed();
  const [seedId, setSeedId] = useState<string | null>(null);
  const activeSeed = seeds.find(s => s.id === seedId) ?? seeds[0] ?? null;

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [results, setResults] = useState<CardPriceData[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CardPriceData | null>(null);
  const [showFoil, setShowFoil] = useState(storedPrefs.showFoil ?? false);
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

  /**
   * `'*'` is what the builder emits for an empty state, and asking Scryfall for
   * every card ever printed is not a search. A bare one-character name is also
   * refused, exactly as before.
   */
  const searchUrl = useMemo(() => {
    const q = filters.query;
    const text = (filters.state.text ?? '').trim();
    if (q === '*') return null;
    if (filters.activeCount === 1 && text.length > 0 && text.length < 2) return null;

    const url = new URL('https://api.scryfall.com/cards/search');
    url.searchParams.set('q', q);
    // Printings, newest first, unless the filter says otherwise — this is a
    // price comparison, so the different printings ARE the answer.
    url.searchParams.set('unique', filters.params.unique ?? 'prints');
    url.searchParams.set('order', filters.params.order ?? 'released');
    url.searchParams.set('dir', filters.params.dir ?? 'desc');
    return url.toString();
  }, [filters.query, filters.params, filters.state.text, filters.activeCount]);

  useEffect(() => {
    if (!searchUrl) {
      setResults([]);
      setNextPage(null);
      setTotalCards(0);
      return;
    }
    const timer = setTimeout(() => runSearch(searchUrl, false), 400);
    return () => clearTimeout(timer);
  }, [searchUrl, runSearch]);

  const handleAddToWatchlist = (card: CardPriceData) => {
    onAddToWatchlist?.(card);
    showSuccess('Added to watchlist', `${card.name} added to your price watchlist`);
  };

  const handleAddToShoppingList = (card: CardPriceData) => {
    onAddToShoppingList?.(card);
  };

  /**
   * Owner: *"Marketplace doesnt let you click into a card detail page"*.
   *
   * So the card itself — art or row — goes to `/cards/:id`, the same as every
   * other grid in the product. The cross-platform price breakdown is still
   * here; it is now reached by its own "Prices" control, because it is a
   * comparison of the *listings* for a card rather than a view of the card.
   */
  const openCardPage = (card: CardPriceData) => {
    const path = cardDetailPath(card);
    if (path) navigate(path);
  };

  const handleShowPrices = (card: CardPriceData) => {
    setSelectedCard(prev => (prev?.id === card.id ? null : card));
  };

  /**
   * The grid's source. A query owns the grid the moment there is one; until
   * then the seed does, so the page arrives full of the user's own cards rather
   * than as an empty form.
   */
  const activeResults = useMemo(
    () =>
      searchUrl
        ? results
        : (activeSeed?.cards ?? []).map(c => toCardPriceData(c, showFoil)),
    [searchUrl, results, activeSeed, showFoil]
  );

  const filteredAndSortedResults = useMemo(() => {
    let filtered = [...activeResults];

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
  }, [activeResults, filterBy, sortBy, showFoil, hideNoPrice]);

  const standardCount = activeResults.filter(c => !c.isArtVariant).length;
  const artVariantCount = activeResults.filter(c => c.isArtVariant).length;
  const noPriceCount = activeResults.filter(c => {
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

  const commitText = useCallback(
    (next: string | undefined) => filters.patch({ text: next }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.patch]
  );

  return (
    <div className="space-y-6">
      {/* Search + filters */}
      <div className="space-y-4 rounded-lg bg-card p-4 shadow-lg shadow-black/20">
        <h2 className="text-base font-semibold text-foreground">Search and compare prices</h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PriceSearchBox
            value={filters.state.text ?? ''}
            onCommit={commitText}
            loading={loading}
          />

          <Button
            variant="secondary"
            className="shrink-0 gap-2"
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {filters.activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold leading-none text-primary-foreground">
                {filters.activeCount}
              </span>
            )}
          </Button>

          <div className="flex shrink-0 items-center gap-2">
            <Switch id="foil-toggle" checked={showFoil} onCheckedChange={setShowFoil} />
            <Label htmlFor="foil-toggle" className="text-sm">
              Foil prices
            </Label>
          </div>
        </div>

        {/* Filters expand in place under the search row — no Sheet sliding over
            the results they are filtering. */}
        {filtersOpen && (
          <div className="rounded-lg bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Filters
              </h3>
              {filters.activeCount > 0 && (
                <button
                  type="button"
                  onClick={filters.reset}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
            <CardFilterPanel controller={filters} showSort={false} showChips={false} />
          </div>
        )}

        {filters.activeCount > 0 && <ActiveFilterChips controller={filters} />}

        {/* Which real list is filling the grid, while there is no query. More
            than one only when the user has both a wishlist and a collection. */}
        {!searchUrl && seeds.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {seeds.map(seed => (
              <Button
                key={seed.id}
                variant={seed.id === activeSeed?.id ? 'default' : 'secondary'}
                size="sm"
                className="h-8"
                onClick={() => setSeedId(seed.id)}
                aria-pressed={seed.id === activeSeed?.id}
              >
                {seed.label}
              </Button>
            ))}
          </div>
        )}

        {!searchUrl && activeSeed && (
          <p className="text-sm text-muted-foreground">{activeSeed.caption}</p>
        )}

        {/* Listing-level controls — printings, sort, density, view. */}
        {activeResults.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Select value={filterBy} onValueChange={v => setFilterBy(v as FilterOption)}>
                <SelectTrigger className="h-8 w-[170px] border-0 bg-muted/50">
                  <SelectValue placeholder="Filter versions" />
                </SelectTrigger>
                <SelectContent className="border-0">
                  <SelectItem value="all">All versions ({activeResults.length})</SelectItem>
                  <SelectItem value="standard">Standard ({standardCount})</SelectItem>
                  <SelectItem value="art-variants">Alt art ({artVariantCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-8 w-[160px] border-0 bg-muted/50">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent className="border-0">
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                  <SelectItem value="set">Set name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="hide-no-price" checked={hideNoPrice} onCheckedChange={setHideNoPrice} />
              <Label htmlFor="hide-no-price" className="cursor-pointer text-xs">
                Hide no price {noPriceCount > 0 && `(${noPriceCount})`}
              </Label>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {viewMode === 'grid' && (
                <CardSizeSlider
                  storageKey="marketplace"
                  value={cardWidth}
                  onValueChange={setCardWidth}
                  showValue={false}
                  className="hidden sm:flex"
                />
              )}
              <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
                {(
                  [
                    { mode: 'grid' as const, icon: LayoutGrid, label: 'Card grid' },
                    { mode: 'list' as const, icon: List, label: 'List' },
                  ]
                ).map(({ mode, icon: Icon, label }) => (
                  <Button
                    key={mode}
                    size="icon"
                    variant={viewMode === mode ? 'secondary' : 'ghost'}
                    className="h-7 w-7"
                    onClick={() => setViewMode(mode)}
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    title={label}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="w-full text-xs text-muted-foreground sm:w-auto">
              Showing {filteredAndSortedResults.length} of {activeResults.length} loaded
              {searchUrl && totalCards > results.length && ` · ${totalCards} printings match`}
            </div>
          </div>
        )}
      </div>

      {/* Price detail — an inline pane above the results it is compared
          against, not a Sheet sliding over them. */}
      {selectedCard && (
        <CardPriceDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          showFoil={showFoil}
          onAddToWatchlist={handleAddToWatchlist}
          onAddToShoppingList={onAddToShoppingList ? handleAddToShoppingList : undefined}
        />
      )}

      {(loading || (!searchUrl && seedLoading)) && activeResults.length === 0 && (
        <CardGridSkeleton width={cardWidth} count={12} />
      )}

      {/* Results — grid */}
      {!loading && filteredAndSortedResults.length > 0 && viewMode === 'grid' && (
        <CardGrid width={cardWidth}>
          {filteredAndSortedResults.map(card => {
            const price = priceLabel(card);

            return (
              <div key={card.id} className="group/price flex flex-col gap-1.5">
                <CardImage
                  card={card.scryfallData ?? { name: card.name, image_uris: { large: card.image_uri } }}
                  width={cardWidth}
                  fill
                  onClick={() => openCardPage(card)}
                  title={`Open ${card.name}`}
                >
                  {card.isArtVariant && (
                    <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      Alt art
                    </span>
                  )}
                  {/* Price rides the art — it is the reason this page exists. */}
                  <span
                    className={cn(
                      'pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold tabular-nums backdrop-blur-sm',
                      price ? 'text-white' : 'text-white/60'
                    )}
                  >
                    {price ?? 'No price'}
                  </span>
                </CardImage>

                <div className="flex flex-col gap-0.5 px-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {card.name}
                    </h3>
                    {card.manaCost && <ManaCost cost={card.manaCost} size="xs" />}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {card.set_name} · {card.set_code.toUpperCase()}
                  </p>

                  {/*
                    `min-w-0` here is load-bearing, not tidying.

                    A flex item defaults to `min-width: auto`, so `flex-1` alone
                    could not shrink these three below their content width. The
                    row measured ~238px inside a 219px tile at 1680x1050 and ran
                    19px past the grid, which `StandardPageLayout`'s
                    `overflow-x-hidden` then clipped silently: the last column's
                    "+ List" was cut in half with no scrollbar to reveal it, and
                    every row's controls ran into the next tile's.
                    Before/after: .shots/audit/marketplace-1680.png — see
                    docs/overhaul/VISUAL-AUDIT.md.
                  */}
                  <div className="mt-1 flex gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 min-w-0 flex-1 px-2 text-xs"
                      onClick={() => handleShowPrices(card)}
                      aria-pressed={selectedCard?.id === card.id}
                    >
                      <Tag className="mr-1 h-3 w-3" aria-hidden="true" />
                      Prices
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 min-w-0 flex-1 px-2 text-xs"
                      onClick={() => handleAddToWatchlist(card)}
                    >
                      <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                      Watch
                    </Button>
                    {onAddToShoppingList && (
                      <Button
                        size="sm"
                        className="h-7 min-w-0 flex-1 px-2 text-xs"
                        onClick={() => handleAddToShoppingList(card)}
                      >
                        <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                        List
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardGrid>
      )}

      {/* Results — table */}
      {!loading && filteredAndSortedResults.length > 0 && viewMode === 'list' && (
        <div className="overflow-x-auto rounded-lg bg-card shadow-lg shadow-black/20">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-12 px-3 py-2 font-medium" />
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
                  className="cursor-pointer transition-colors odd:bg-muted/20 hover:bg-muted/50"
                  onClick={() => openCardPage(card)}
                >
                  <td className="py-1.5 pl-3 pr-0">
                    <CardImage
                      card={
                        card.scryfallData ?? {
                          name: card.name,
                          image_uris: { large: card.image_uri },
                        }
                      }
                      width={36}
                      hideFlip
                      interactive={false}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{card.name}</span>
                    {card.isArtVariant && (
                      <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                        Alt art
                      </span>
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
                    {/* A dash in the price column reads as a rendering gap. Say
                        it, in the same words the rest of the product uses. */}
                    {priceLabel(card) ?? (
                      <span className="text-xs font-normal text-muted-foreground">{NO_PRICE}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={e => {
                        e.stopPropagation();
                        handleShowPrices(card);
                      }}
                      aria-label={`Price breakdown for ${card.name}`}
                    >
                      <Tag className="h-3.5 w-3.5" />
                    </Button>
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
      )}

      {/* Pagination */}
      {!loading && nextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => runSearch(nextPage, true)} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Load more printings
          </Button>
        </div>
      )}

      {!loading && results.length === 0 && searchUrl && (
        <div className="rounded-lg bg-muted/30 p-12 text-center">
          <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="mb-2 text-lg font-medium text-foreground">No cards found</h3>
          <p className="text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      )}

      {!loading && activeResults.length > 0 && filteredAndSortedResults.length === 0 && (
        <div className="rounded-lg bg-muted/30 p-12 text-center">
          <h3 className="mb-2 text-lg font-medium text-foreground">
            Every result is filtered out
          </h3>
          <p className="text-sm text-muted-foreground">
            Loosen the version filter or turn off &ldquo;hide no price&rdquo;.
          </p>
        </div>
      )}

    </div>
  );
}

/** Debounced name/syntax box. The request itself is debounced downstream too. */
function PriceSearchBox({
  value,
  onCommit,
  loading,
}: {
  value: string;
  onCommit: (next: string | undefined) => void;
  loading: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);

  useEffect(() => {
    if (value !== committed) {
      setCommitted(value);
      setDraft(value);
    }
    // Adopts external changes (chip removal, clear all) without stomping typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (draft === committed) return;
    const id = window.setTimeout(() => {
      setCommitted(draft);
      onCommit(draft.trim() ? draft : undefined);
    }, 250);
    return () => window.clearTimeout(id);
  }, [draft, committed, onCommit]);

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        placeholder="Card name, or Scryfall syntax"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        spellCheck={false}
        className="border-0 bg-muted/50 pr-10 text-base focus-visible:ring-1 focus-visible:ring-offset-0"
        aria-label="Card name"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : draft ? (
        <button
          type="button"
          onClick={() => setDraft('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
    </div>
  );
}
