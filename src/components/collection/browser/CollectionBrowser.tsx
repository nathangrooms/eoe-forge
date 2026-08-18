import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Filter,
  LayoutGrid,
  Rows3,
  Search,
  Square,
  Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollectionFilterPanel, ActiveFilterChips } from './CollectionFilterPanel';
import { CollectionCardTile } from './CollectionCardTile';
import { CollectionCardRow } from './CollectionCardRow';
import { CollectionTable } from './CollectionTable';
import type { BrowserAction } from './actions';
import {
  DEFAULT_DENSITY,
  DENSITY_STEPS,
  EMPTY_FILTERS,
  activeFilterCount,
  formatPrice,
  matchesFilter,
  sortCards,
  valueOf,
  type BrowserCard,
  type BrowserViewMode,
  type CollectionFilterState,
  type SortDirection,
  type SortKey,
  SORT_OPTIONS,
} from './types';

interface PersistedView {
  view: BrowserViewMode;
  density: number;
  sortKey: SortKey;
  sortDir: SortDirection;
}

function loadView(key: string | undefined, fallback: PersistedView): PersistedView {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedView>;
    return {
      view: parsed.view ?? fallback.view,
      density: typeof parsed.density === 'number' ? parsed.density : fallback.density,
      sortKey: parsed.sortKey ?? fallback.sortKey,
      sortDir: parsed.sortDir ?? fallback.sortDir,
    };
  } catch {
    return fallback;
  }
}

export interface CollectionBrowserProps {
  cards: BrowserCard[];
  loading?: boolean;
  /** localStorage key so view mode, density and sort survive navigation. */
  storageKey?: string;
  onCardClick?: (card: BrowserCard) => void;
  actions?: BrowserAction[];
  /** Stepper on each tile/row. Omit to hide (e.g. read-only surfaces). */
  onQuantityChange?: (card: BrowserCard, delta: number) => void;
  /** Condition + foil-only controls; off for storage containers which lack them. */
  showOwnershipFilters?: boolean;

  selectionMode?: boolean;
  onToggleSelectionMode?: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (rowId: string) => void;
  /** Receives the ids of the currently VISIBLE (filtered) rows — never the whole set. */
  onSelectVisible?: (rowIds: string[]) => void;
  onClearSelection?: () => void;
  /** Rendered between the toolbar and the results (e.g. a bulk-action bar). */
  toolbarSlot?: React.ReactNode;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
}

export function CollectionBrowser({
  cards,
  loading = false,
  storageKey,
  onCardClick,
  actions = [],
  onQuantityChange,
  showOwnershipFilters = true,
  selectionMode = false,
  onToggleSelectionMode,
  selectedIds,
  onToggleSelect,
  onSelectVisible,
  onClearSelection,
  toolbarSlot,
  emptyTitle = 'No cards match these filters',
  emptyDescription,
  emptyAction,
}: CollectionBrowserProps) {
  const initial = useMemo(
    () =>
      loadView(storageKey, {
        view: 'grid',
        density: DEFAULT_DENSITY,
        sortKey: 'name',
        sortDir: 'asc',
      }),
    [storageKey]
  );

  const [filters, setFilters] = useState<CollectionFilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<BrowserViewMode>(initial.view);
  const [density, setDensity] = useState(initial.density);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [sortDir, setSortDir] = useState<SortDirection>(initial.sortDir);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ view, density, sortKey, sortDir })
    );
  }, [storageKey, view, density, sortKey, sortDir]);

  const availableSets = useMemo(
    () =>
      Array.from(new Set(cards.map(c => c.setCode).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [cards]
  );

  const visible = useMemo(() => {
    const filtered = cards.filter(c => matchesFilter(c, filters));
    return sortCards(filtered, sortKey, sortDir);
  }, [cards, filters, sortKey, sortDir]);

  const visibleTotals = useMemo(() => {
    let copies = 0;
    let value = 0;
    for (const card of visible) {
      copies += (card.quantity || 0) + (card.foil || 0);
      value += valueOf(card);
    }
    return { copies, value };
  }, [visible]);

  const filterCount = activeFilterCount(filters);
  const hasQuery = filters.query.trim().length > 0;
  const selected = selectedIds ?? new Set<string>();
  const allVisibleSelected =
    visible.length > 0 && visible.every(c => selected.has(c.rowId));

  const handleSortColumn = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'set' ? 'asc' : 'desc');
    }
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${DENSITY_STEPS[density]}px, 1fr))`,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filters.query}
              onChange={e => setFilters({ ...filters, query: e.target.value })}
              placeholder="Search name, type, set or collector number"
              aria-label="Search cards"
              className="pl-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(s => !s)}
              aria-expanded={showFilters}
              className="gap-1.5"
            >
              <Filter className="h-4 w-4" />
              Filters
              {filterCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 px-1.5">
                  {filterCount}
                </Badge>
              )}
            </Button>

            <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onToggleSelectionMode && (
              <>
                <Button
                  variant={selectionMode ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={onToggleSelectionMode}
                  className="gap-1.5"
                  aria-pressed={selectionMode}
                >
                  {selectionMode ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  Select
                </Button>
                {selectionMode && onSelectVisible && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      allVisibleSelected
                        ? onClearSelection?.()
                        : onSelectVisible(visible.map(c => c.rowId))
                    }
                  >
                    {allVisibleSelected
                      ? 'Deselect all'
                      : `Select all ${visible.length} shown`}
                  </Button>
                )}
              </>
            )}
            {(filterCount > 0 || hasQuery) && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {view === 'grid' && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-muted-foreground">Size</span>
                <Slider
                  value={[density]}
                  min={0}
                  max={DENSITY_STEPS.length - 1}
                  step={1}
                  onValueChange={v => setDensity(v[0])}
                  className="w-24"
                  aria-label="Card size"
                />
              </div>
            )}

            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              {(
                [
                  { mode: 'grid' as const, icon: LayoutGrid, label: 'Image grid' },
                  { mode: 'list' as const, icon: Rows3, label: 'List' },
                  { mode: 'table' as const, icon: Table2, label: 'Table' },
                ]
              ).map(({ mode, icon: Icon, label }) => (
                <Button
                  key={mode}
                  variant={view === mode ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setView(mode)}
                  aria-label={label}
                  aria-pressed={view === mode}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
        </div>

        <ActiveFilterChips filters={filters} onChange={setFilters} />
      </div>

      {showFilters && (
        <CollectionFilterPanel
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTERS)}
          availableSets={availableSets}
          showOwnershipFilters={showOwnershipFilters}
        />
      )}

      {toolbarSlot}

      {/* Result summary */}
      {!loading && cards.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{visible.length.toLocaleString()}</span>
          {' of '}
          {cards.length.toLocaleString()} entries
          {' · '}
          <span className="font-medium text-foreground">
            {visibleTotals.copies.toLocaleString()}
          </span>{' '}
          cards
          {' · '}
          <span className="font-medium text-foreground">
            {formatPrice(visibleTotals.value)}
          </span>
        </p>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid gap-3" style={gridStyle}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[5/7] animate-pulse rounded-lg bg-muted" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <h3 className="text-base font-semibold text-foreground">{emptyTitle}</h3>
          {emptyDescription && (
            <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
          )}
          {(filterCount > 0 || hasQuery) && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </Button>
          )}
          {emptyAction && cards.length === 0 && (
            <Button size="sm" className="mt-4" onClick={emptyAction.onClick}>
              {emptyAction.label}
            </Button>
          )}
        </div>
      ) : view === 'table' ? (
        <CollectionTable
          cards={visible}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSortColumn}
          onCardClick={onCardClick}
          actions={actions}
          selectionMode={selectionMode}
          selectedIds={selected}
          onToggleSelect={onToggleSelect ?? (() => {})}
          showCondition={showOwnershipFilters}
        />
      ) : view === 'list' ? (
        <div className="space-y-2">
          {visible.map(card => (
            <CollectionCardRow
              key={card.rowId}
              card={card}
              onClick={onCardClick}
              actions={actions}
              selectionMode={selectionMode}
              selected={selected.has(card.rowId)}
              onToggleSelect={onToggleSelect ?? (() => {})}
              onQuantityChange={onQuantityChange}
              showCondition={showOwnershipFilters}
            />
          ))}
        </div>
      ) : (
        <div className={cn('grid gap-3')} style={gridStyle}>
          {visible.map(card => (
            <CollectionCardTile
              key={card.rowId}
              card={card}
              onClick={onCardClick}
              actions={actions}
              selectionMode={selectionMode}
              selected={selected.has(card.rowId)}
              onToggleSelect={onToggleSelect ?? (() => {})}
              onQuantityChange={onQuantityChange}
              showCondition={showOwnershipFilters}
            />
          ))}
        </div>
      )}
    </div>
  );
}
