import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Grid2x2, List, Rows, Filter, Zap } from 'lucide-react';
import { UniversalFilterPanel } from '@/components/universal/UniversalFilterPanel';
import { UniversalCardDisplay } from '@/components/universal/UniversalCardDisplay';

export type ViewMode = 'grid' | 'list' | 'compact';

interface Filters {
  colors: string[];
  types: string[];
  formats: string[];
  rarities: string[];
  cmc: [number, number];
  power: [number, number];
  toughness: [number, number];
  priceMin: number;
  priceMax: number;
}

interface EmptyState {
  title: string;
  description?: string;
  action?: () => void;
}

interface UniversalLocalSearchProps {
  cards: any[];
  loading?: boolean;
  initialQuery?: string;
  initialViewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onCardClick?: (card: any) => void;
  onCardAdd?: (card: any) => void;
  showWishlistButton?: boolean;
  emptyState?: EmptyState;
}

export function UniversalLocalSearch({
  cards,
  loading = false,
  initialQuery = '',
  initialViewMode = 'grid',
  onViewModeChange,
  onCardClick,
  onCardAdd,
  showWishlistButton = true,
  emptyState,
}: UniversalLocalSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>({
    colors: [],
    types: [],
    formats: [],
    rarities: [],
    cmc: [0, 20],
    power: [0, 20],
    toughness: [0, 20],
    priceMin: 0,
    priceMax: 0,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.colors.length) count++;
    if (filters.types.length) count++;
    if (filters.formats.length) count++;
    if (filters.rarities.length) count++;
    if (filters.cmc[0] > 0 || filters.cmc[1] < 20) count++;
    if (filters.power[0] > 0 || filters.power[1] < 20) count++;
    if (filters.toughness[0] > 0 || filters.toughness[1] < 20) count++;
    if (filters.priceMin > 0) count++;
    if (filters.priceMax > 0) count++;
    return count;
  }, [filters]);

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  const clearAll = () => {
    setQuery('');
    setFilters({
      colors: [],
      types: [],
      formats: [],
      rarities: [],
      cmc: [0, 20],
      power: [0, 20],
      toughness: [0, 20],
      priceMin: 0,
      priceMax: 0,
    });
  };

  const parseNumber = (val?: string | number | null) => {
    if (val == null) return undefined;
    const n = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(n) ? undefined : n;
    };

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();

    return cards.filter((card: any) => {
      // Text query
      if (q) {
        const inName = card.name?.toLowerCase().includes(q);
        const inType = card.type_line?.toLowerCase().includes(q);
        const inSet = card.set_code?.toLowerCase().includes(q);
        if (!inName && !inType && !inSet) return false;
      }

      // Colors
      if (filters.colors && filters.colors.length > 0) {
        const colors: string[] = card.colors || [];
        const overlaps = filters.colors.some((c) => colors.includes(c));
        if (!overlaps) return false;
      }

      // Types
      if (filters.types && filters.types.length > 0) {
        const tl = (card.type_line || '').toLowerCase();
        const ok = filters.types.some((t) => tl.includes(t.toLowerCase()));
        if (!ok) return false;
      }

      // Formats (use legalities if available)
      if (filters.formats && filters.formats.length > 0) {
        const legalities = card.legalities || {};
        const ok = filters.formats.some((f) => legalities[f] === 'legal');
        if (!ok) return false;
      }

      // Rarity
      if (filters.rarities && filters.rarities.length > 0) {
        if (!filters.rarities.includes(card.rarity)) return false;
      }

      // CMC
      if (filters.cmc) {
        const cmc = parseNumber(card.cmc) ?? 0;
        const [min, max] = filters.cmc;
        if (cmc < min || cmc > max) return false;
      }

      // Power/Toughness
      if (filters.power) {
        const power = parseNumber(card.power);
        if (power !== undefined) {
          const [min, max] = filters.power;
          if (power < min || power > max) return false;
        }
      }
      if (filters.toughness) {
        const toughness = parseNumber(card.toughness);
        if (toughness !== undefined) {
          const [min, max] = filters.toughness;
          if (toughness < min || toughness > max) return false;
        }
      }

      // Price
      if (filters.priceMin != null || filters.priceMax != null) {
        const price = parseNumber(card?.prices?.usd) ?? 0;
        if (filters.priceMin != null && price < filters.priceMin) return false;
        if (filters.priceMax != null && price > filters.priceMax) return false;
      }

      return true;
    });
  }, [cards, query, filters]);

  return (
    <div className="h-full flex flex-col">
      {/* Top controls */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-6 py-3 flex items-center gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search cards by name, type, or set..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search cards"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-2">
            <Filter className="h-4 w-4" />
            Filters {activeFilterCount > 0 && (<Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>)}
          </Button>
          <div className="flex items-center gap-1">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setMode('grid')} aria-label="Grid view">
              <Grid2x2 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setMode('list')} aria-label="List view">
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'compact' ? 'default' : 'outline'} size="icon" onClick={() => setMode('compact')} aria-label="Compact view">
              <Rows className="h-4 w-4" />
            </Button>
          </div>
          {activeFilterCount > 0 || query ? (
            <Button variant="ghost" onClick={clearAll}>Clear</Button>
          ) : null}
        </div>
        {showFilters && (
          <div className="px-6 pb-3">
            <UniversalFilterPanel
              filters={filters as any}
              onFiltersChange={setFilters as any}
              onClearFilters={clearAll}
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1,2,3,4,5,6,7,8].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-[63/88] bg-muted rounded mb-3"></div>
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">{emptyState?.title || 'No matching cards'}</h3>
              {emptyState?.description && (
                <p className="text-muted-foreground mb-6">{emptyState.description}</p>
              )}
              {emptyState?.action && (
                <Button onClick={emptyState.action}>Quick Add Cards</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-3 text-sm text-muted-foreground">{filteredCards.length} results</div>
            <UniversalCardDisplay
              cards={filteredCards}
              viewMode={viewMode}
              onCardClick={onCardClick}
              onCardAdd={onCardAdd}
              showWishlistButton={showWishlistButton}
            />
          </>
        )}
      </div>
    </div>
  );
}
