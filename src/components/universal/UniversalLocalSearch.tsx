import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Grid3x3, List, Rows3, Filter, Search, CheckSquare, Square } from 'lucide-react';
import {
  UniversalFilterPanel,
  EMPTY_LOCAL_FILTERS,
  type LocalCardFilters,
} from '@/components/universal/UniversalFilterPanel';
import { UniversalCardDisplay } from '@/components/universal/UniversalCardDisplay';
import { getOracleText, getSetCode, getTypeLine } from '@/lib/scryfall/card-utils';

export type ViewMode = 'grid' | 'list' | 'compact';

interface EmptyState {
  title: string;
  description?: string;
  action?: () => void;
  actionLabel?: string;
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
  selectionMode?: boolean;
  selectedCards?: Set<string>;
  onToggleSelectionMode?: () => void;
  onSelectAll?: () => void;
}

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof Grid3x3 }[] = [
  { mode: 'grid', label: 'Card grid', icon: Grid3x3 },
  { mode: 'list', label: 'Table', icon: List },
  { mode: 'compact', label: 'Text list', icon: Rows3 },
];

const DENSITY_STEPS = [
  { value: 0, label: 'L' },
  { value: 2, label: 'M' },
  { value: 4, label: 'S' },
];

const toNumber = (val?: string | number | null): number | undefined => {
  if (val == null) return undefined;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? undefined : n;
};

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
  selectionMode = false,
  selectedCards = new Set(),
  onToggleSelectionMode,
  onSelectAll,
}: UniversalLocalSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<LocalCardFilters>(EMPTY_LOCAL_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [density, setDensity] = useState(2);

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
    setFilters(EMPTY_LOCAL_FILTERS);
  };

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();

    return cards.filter((card: any) => {
      // Text search covers oracle text too — it is the thing MTG players
      // search for most often and it was previously excluded.
      if (q) {
        const haystack = [
          card.name ?? '',
          getTypeLine(card),
          getSetCode(card),
          getOracleText(card),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Colours are uppercase WUBRG; 'C' means "no colours at all".
      if (filters.colors.length > 0) {
        const cardColors: string[] = (card.colors ?? []).map((c: string) => String(c).toUpperCase());
        const wants = filters.colors;
        const matchesColorless = wants.includes('C') && cardColors.length === 0;
        const matchesColor = wants.some(c => c !== 'C' && cardColors.includes(c));
        if (!matchesColorless && !matchesColor) return false;
      }

      if (filters.types.length > 0) {
        const tl = getTypeLine(card).toLowerCase();
        if (!filters.types.some(t => tl.includes(t.toLowerCase()))) return false;
      }

      if (filters.formats.length > 0) {
        const legalities = card.legalities || {};
        if (!filters.formats.some(f => legalities[f] === 'legal')) return false;
      }

      if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;

      const cmc = toNumber(card.cmc) ?? 0;
      if (cmc < filters.cmc[0] || cmc > filters.cmc[1]) return false;

      const power = toNumber(card.power);
      if (power !== undefined && (power < filters.power[0] || power > filters.power[1])) return false;

      const toughness = toNumber(card.toughness);
      if (
        toughness !== undefined &&
        (toughness < filters.toughness[0] || toughness > filters.toughness[1])
      ) {
        return false;
      }

      if (filters.priceMin > 0 || filters.priceMax > 0) {
        const price = toNumber(card?.prices?.usd) ?? 0;
        if (filters.priceMin > 0 && price < filters.priceMin) return false;
        if (filters.priceMax > 0 && price > filters.priceMax) return false;
      }

      return true;
    });
  }, [cards, query, filters]);

  return (
    <div className="flex w-full max-w-full flex-col overflow-x-hidden">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="space-y-3 px-3 py-3 sm:px-6">
          <div className="flex w-full items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="Search name, type, set or rules text…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search cards"
                className="w-full pl-10 text-base"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(s => !s)}
              className="shrink-0 gap-1"
              aria-expanded={showFilters}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {onToggleSelectionMode && (
                <>
                  <Button
                    variant={selectionMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={onToggleSelectionMode}
                  >
                    {selectionMode ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Select</span>
                  </Button>
                  {selectionMode && onSelectAll && (
                    <Button variant="outline" size="sm" onClick={onSelectAll}>
                      All
                    </Button>
                  )}
                </>
              )}
              {(activeFilterCount > 0 || query) && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  Clear
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {viewMode === 'grid' && (
                <div className="flex items-center rounded-md border border-border" role="group" aria-label="Card size">
                  {DENSITY_STEPS.map(step => (
                    <Button
                      key={step.label}
                      variant={density === step.value ? 'default' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 rounded-sm p-0 text-xs"
                      onClick={() => setDensity(step.value)}
                      aria-pressed={density === step.value}
                      title={`${step.label} cards`}
                    >
                      {step.label}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex items-center rounded-md border border-border">
                {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 rounded-sm px-2"
                    onClick={() => setMode(mode)}
                    aria-pressed={viewMode === mode}
                    title={label}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="px-3 pb-3 sm:px-6">
            <UniversalFilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={clearAll}
            />
          </div>
        )}
      </div>

      <div className="px-3 py-6 sm:px-6">
        {loading ? (
          // Structurally identical to a real grid tile so nothing jumps on swap.
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border bg-card">
                <div className="aspect-[63/88] w-full rounded-t-lg bg-muted" />
                <div className="space-y-1.5 p-2">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
              <h3 className="mb-2 text-base font-medium text-foreground">
                {emptyState?.title || 'No matching cards'}
              </h3>
              {emptyState?.description && (
                <p className="mb-6 text-sm text-muted-foreground">{emptyState.description}</p>
              )}
              {emptyState?.action && (
                <Button onClick={emptyState.action}>
                  {emptyState.actionLabel || 'Add cards'}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {filteredCards.length.toLocaleString()}
              {filteredCards.length === cards.length ? '' : ` of ${cards.length.toLocaleString()}`}{' '}
              {filteredCards.length === 1 ? 'card' : 'cards'}
            </p>
            <UniversalCardDisplay
              cards={filteredCards}
              viewMode={viewMode}
              density={density}
              onCardClick={onCardClick}
              onCardAdd={onCardAdd}
              showWishlistButton={showWishlistButton}
              selectionMode={selectionMode}
              selectedCards={selectedCards}
            />
          </>
        )}
      </div>
    </div>
  );
}
