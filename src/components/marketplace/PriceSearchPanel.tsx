import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  ExternalLink, 
  TrendingUp, 
  TrendingDown, 
  Star,
  ShoppingCart,
  Sparkles,
  X,
  Loader2,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { CardPriceDetail } from './CardPriceDetail';
import { BuyOptionsModal } from './BuyOptionsModal';

interface PriceResult {
  marketplace: string;
  price: number | null;
  currency: string;
  url: string;
  inStock: boolean;
  condition?: string;
  logo?: string;
  color: string;
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
}

interface PriceSearchPanelProps {
  onAddToWatchlist?: (card: CardPriceData) => void;
  onAddToShoppingList?: (card: CardPriceData) => void;
}

type SortOption = 'name' | 'price-asc' | 'price-desc' | 'set';
type FilterOption = 'all' | 'standard' | 'art-variants';

interface MarketplacePreferences {
  sortBy: SortOption;
  filterBy: FilterOption;
  hideNoPrice: boolean;
  showFoil: boolean;
}

const PREFERENCES_KEY = 'marketplace-preferences';

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

// Helper to detect art variants based on collector number and set type
function isArtVariant(card: any): boolean {
  const collectorNumber = card.collector_number || '';
  const setType = card.set_type || '';
  const frame = card.frame_effects || [];
  
  // Art series, promos, special variants typically have special collector numbers
  const hasSpecialNumber = /[a-zA-Z]/.test(collectorNumber) || parseInt(collectorNumber) > 500;
  const isSpecialSet = ['masterpiece', 'promo', 'box', 'from_the_vault', 'spellbook', 'premium_deck', 'treasure_chest'].includes(setType);
  const hasSpecialFrame = frame.includes('showcase') || frame.includes('extendedart') || frame.includes('borderless');
  
  return hasSpecialNumber || isSpecialSet || hasSpecialFrame || card.promo === true;
}

export function PriceSearchPanel({ onAddToWatchlist, onAddToShoppingList }: PriceSearchPanelProps) {
  // Load initial preferences from localStorage
  const storedPrefs = getStoredPreferences();
  
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CardPriceData[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardPriceData | null>(null);
  const [showFoil, setShowFoil] = useState(storedPrefs.showFoil ?? false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyModalCard, setBuyModalCard] = useState<CardPriceData | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>(storedPrefs.sortBy ?? 'name');
  const [filterBy, setFilterBy] = useState<FilterOption>(storedPrefs.filterBy ?? 'all');
  const [hideNoPrice, setHideNoPrice] = useState(storedPrefs.hideNoPrice ?? true);

  // Save preferences whenever they change
  useEffect(() => {
    savePreferences({ sortBy, filterBy, hideNoPrice, showFoil });
  }, [sortBy, filterBy, hideNoPrice, showFoil]);

  // Debounced auto-search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      if (query.length === 0) setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchCards();
    }, 400);

    return () => clearTimeout(timer);
  }, [query, showFoil]);

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      const cardResults: CardPriceData[] = data.data.slice(0, 24).map((card: any) => {
        // Extract ALL prices from Scryfall
        const tcgPrice = parseFloat(card.prices?.usd || '0');
        const tcgFoilPrice = parseFloat(card.prices?.usd_foil || '0');
        const cardmarketPrice = parseFloat(card.prices?.eur || '0');
        const cardmarketFoilPrice = parseFloat(card.prices?.eur_foil || '0');
        const tixPrice = parseFloat(card.prices?.tix || '0');
        const etchedPrice = parseFloat(card.prices?.usd_etched || '0');
        
        const displayPrice = showFoil ? tcgFoilPrice : tcgPrice;
        
        const prices: PriceResult[] = [];
        
        // TCGPlayer - Primary source
        if (card.purchase_uris?.tcgplayer) {
          prices.push({
            marketplace: 'TCGPlayer',
            price: displayPrice || null,
            currency: 'USD',
            url: card.purchase_uris.tcgplayer,
            inStock: displayPrice > 0,
            color: 'blue'
          });
        }
        
        // CardMarket
        if (card.purchase_uris?.cardmarket) {
          const cmPrice = showFoil ? cardmarketFoilPrice : cardmarketPrice;
          prices.push({
            marketplace: 'CardMarket',
            price: cmPrice || null,
            currency: 'EUR',
            url: card.purchase_uris.cardmarket,
            inStock: cmPrice > 0,
            color: 'orange'
          });
        }

        // Cardhoarder (MTGO)
        if (card.purchase_uris?.cardhoarder && tixPrice > 0) {
          prices.push({
            marketplace: 'Cardhoarder',
            price: tixPrice,
            currency: 'TIX',
            url: card.purchase_uris.cardhoarder,
            inStock: true,
            color: 'cyan'
          });
        }
        
        // Card Kingdom
        if (card.purchase_uris?.cardkingdom) {
          prices.push({
            marketplace: 'Card Kingdom',
            price: null,
            currency: 'USD',
            url: card.purchase_uris.cardkingdom,
            inStock: true,
            color: 'purple'
          });
        }
        
        // eBay
        prices.push({
          marketplace: 'eBay',
          price: null,
          currency: 'USD',
          url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg ' + card.set_name)}`,
          inStock: true,
          color: 'yellow'
        });

        return {
          id: card.id,
          name: card.name,
          set_name: card.set_name,
          set_code: card.set,
          image_uri: card.image_uris?.normal || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.normal,
          prices,
          tcgplayerPrice: tcgPrice,
          tcgplayerFoilPrice: tcgFoilPrice,
          cardmarketPrice: cardmarketPrice,
          cardmarketFoilPrice: cardmarketFoilPrice,
          tixPrice: tixPrice,
          etchedPrice: etchedPrice,
          averagePrice: displayPrice,
          lowestPrice: displayPrice,
          tcgplayerUrl: card.purchase_uris?.tcgplayer,
          cardmarketUrl: card.purchase_uris?.cardmarket,
          cardkingdomUrl: card.purchase_uris?.cardkingdom,
          cardhoarderUrl: card.purchase_uris?.cardhoarder,
          scryfallData: card,
          isArtVariant: isArtVariant(card),
          collectorNumber: card.collector_number
        };
      });
      
      setResults(cardResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, showFoil]);

  const handleAddToWatchlist = (card: CardPriceData) => {
    onAddToWatchlist?.(card);
    showSuccess('Added to Watchlist', `${card.name} added to your price watchlist`);
  };

  const handleCardClick = (card: CardPriceData) => {
    setSelectedCard(card);
    setShowDetailPanel(true);
  };

  const handleBuyClick = (card: CardPriceData) => {
    setBuyModalCard(card);
    setShowBuyModal(true);
  };

  // Filter and sort results
  const filteredAndSortedResults = useMemo(() => {
    let filtered = [...results];
    
    // Hide cards without prices if enabled
    if (hideNoPrice) {
      filtered = filtered.filter(card => {
        const price = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
        const cmPrice = showFoil ? card.cardmarketFoilPrice : card.cardmarketPrice;
        return (price && price > 0) || (cmPrice && cmPrice > 0) || (card.tixPrice && card.tixPrice > 0);
      });
    }
    
    // Apply filter
    if (filterBy === 'standard') {
      filtered = filtered.filter(card => !card.isArtVariant);
    } else if (filterBy === 'art-variants') {
      filtered = filtered.filter(card => card.isArtVariant);
    }
    
    // Apply sort
    filtered.sort((a, b) => {
      const priceA = showFoil ? (a.tcgplayerFoilPrice || 0) : (a.tcgplayerPrice || 0);
      const priceB = showFoil ? (b.tcgplayerFoilPrice || 0) : (b.tcgplayerPrice || 0);
      
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

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-primary" />
            Search & Compare Prices
            <Badge variant="outline" className="ml-2 text-xs">
              Live TCGPlayer Data
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Start typing a card name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pr-10 text-base"
              />
              {loading ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
              ) : query ? (
                <button 
                  onClick={() => { setQuery(''); setResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                id="foil-toggle" 
                checked={showFoil} 
                onCheckedChange={setShowFoil}
              />
              <Label htmlFor="foil-toggle" className="text-sm">
                <Sparkles className="h-4 w-4 inline mr-1 text-yellow-500" />
                Foil
              </Label>
            </div>
          </div>
          
          {/* Filters and Sort Row */}
          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue placeholder="Filter versions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Versions ({results.length})</SelectItem>
                    <SelectItem value="standard">Standard ({standardCount})</SelectItem>
                    <SelectItem value="art-variants">Art Variants ({artVariantCount})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[150px] h-8">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    <SelectItem value="set">Set Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
                <Switch
                  id="hide-no-price"
                  checked={hideNoPrice}
                  onCheckedChange={setHideNoPrice}
                  className="scale-75"
                />
                <Label htmlFor="hide-no-price" className="text-xs cursor-pointer">
                  Hide no price {noPriceCount > 0 && `(${noPriceCount})`}
                </Label>
              </div>
              
              <div className="ml-auto text-xs text-muted-foreground">
                Showing {filteredAndSortedResults.length} of {results.length} results
              </div>
            </div>
          )}
          
          {query.length > 0 && query.length < 2 && (
            <p className="text-xs text-muted-foreground mt-2">Type at least 2 characters to search...</p>
          )}
        </CardContent>
      </Card>

      {/* Results Grid */}
      {loading && results.length === 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-64 w-full" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredAndSortedResults.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAndSortedResults.map((card) => {
            const displayPrice = showFoil ? card.tcgplayerFoilPrice : card.tcgplayerPrice;
            
            return (
              <Card
                key={card.id} 
                className="overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:scale-[1.02] group"
                onClick={() => handleCardClick(card)}
              >
                <div className="relative">
                  {card.image_uri ? (
                    <img 
                      src={card.image_uri} 
                      alt={card.name}
                      className="w-full h-64 object-contain bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted flex items-center justify-center">
                      <Search className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Badge className="bg-primary text-primary-foreground">
                      Click for Price Details
                    </Badge>
                  </div>
                  
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    {showFoil && (
                      <Badge className="bg-yellow-500">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Foil
                      </Badge>
                    )}
                    {card.isArtVariant && (
                      <Badge variant="outline" className="bg-purple-500/80 text-white border-purple-400 text-xs">
                        Art Variant
                      </Badge>
                    )}
                  </div>
                </div>
                
                <CardContent className="p-3">
                  <h3 className="font-semibold text-sm truncate">{card.name}</h3>
                  <p className="text-xs text-muted-foreground mb-2 truncate">
                    {card.set_name}
                  </p>
                  
                  {/* All Prices Summary */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {displayPrice && displayPrice > 0 && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                        ${displayPrice.toFixed(2)} TCG
                      </Badge>
                    )}
                    {card.cardmarketPrice && card.cardmarketPrice > 0 && (
                      <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/30">
                        €{(showFoil ? card.cardmarketFoilPrice : card.cardmarketPrice)?.toFixed(2)} CM
                      </Badge>
                    )}
                    {card.tixPrice && card.tixPrice > 0 && (
                      <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-600 border-cyan-500/30">
                        {card.tixPrice.toFixed(2)} tix
                      </Badge>
                    )}
                    {!displayPrice && !card.cardmarketPrice && !card.tixPrice && (
                      <span className="text-sm text-muted-foreground">No price data</span>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToWatchlist(card);
                      }}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Watch
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuyClick(card);
                      }}
                    >
                      <ShoppingCart className="h-3 w-3 mr-1" />
                      Buy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && results.length === 0 && query.length >= 2 && (
        <Card className="p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No cards found</h3>
          <p className="text-muted-foreground">Try a different search term</p>
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
        />
      )}

      {/* Buy Options Modal */}
      <BuyOptionsModal
        card={buyModalCard}
        isOpen={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        showFoil={showFoil}
        onAddToShoppingList={onAddToShoppingList}
      />
    </div>
  );
}
