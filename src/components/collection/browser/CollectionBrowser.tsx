import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  LayoutGrid,
  Rows3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Table2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardGrid, CardSizeSlider, useCardSize } from '@/components/cards';
import {
  ActiveFilterChips,
  CardFilterSheet,
  useCardFilterState,
} from '@/components/filters';
import { matchesCardFilter } from '@/lib/cards/local-filter';
import { CollectionCardTile } from './CollectionCardTile';
import { CollectionCardRow } from './CollectionCardRow';
import { CollectionTable } from './CollectionTable';
import type { BrowserAction } from './actions';
import {
  CONDITIONS,
  EMPTY_OWNERSHIP,
  formatPrice,
  localCardOf,
  matchesOwnership,
  ownershipFilterCount,
  sortCards,
  valueOf,
  type BrowserCard,
  type BrowserViewMode,
  type ConditionGrade,
  type OwnershipFilterState,
  type SortDirection,
  type SortKey,
  SORT_OPTIONS,
} from './types';

/**
 * The browser every list of owned cards renders through.
 *
 * Two things changed here and they are the whole point:
 *
 * 1. **One filter.** The bespoke `CollectionFilterState` is gone. This drives
 *    the shared `CardFilterPanel` — the same control, with the same facets, as
 *    the card-search pages — and evaluates its `CardSearchState` locally via
 *    `matchesCardFilter`. Ownership questions the panel cannot ask (condition,
 *    foil, copies owned) sit beside it, because no Scryfall query can express
 *    "cards I own two of in Lightly Played".
 * 2. **One card renderer.** `CardImage` inside `CardGrid`, sized by a
 *    continuous `CardSizeSlider` rather than a five-step density enum.
 */

interface PersistedView {
  view: BrowserViewMode;
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
  /** localStorage key so view mode, card size and sort survive navigation. */
  storageKey?: string;
  onCardClick?: (card: BrowserCard) => void;
  actions?: BrowserAction[];
  /** Stepper on each tile/row. Omit to hide (e.g. read-only surfaces). */
  onQuantityChange?: (card: BrowserCard, delta: number) => void;
  /** Condition + foil-only controls; off for storage containers which lack them. */
  showOwnershipFilters?: boolean;
  /**
   * Mirror the card filter into the page URL so a filtered view is shareable.
   * Off inside dialogs, where the URL already means something else.
   */
  urlSync?: boolean;

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
  urlSync = true,
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
    () => loadView(storageKey, { view: 'grid', sortKey: 'name', sortDir: 'asc' }),
    [storageKey]
  );

  const filters = useCardFilterState({ urlSync });
  const [ownership, setOwnership] = useState<OwnershipFilterState>(EMPTY_OWNERSHIP);
  const [view, setView] = useState<BrowserViewMode>(initial.view);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [sortDir, setSortDir] = useState<SortDirection>(initial.sortDir);
  const [cardWidth, setCardWidth] = useCardSize(storageKey ?? 'collection', 176);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify({ view, sortKey, sortDir }));
  }, [storageKey, view, sortKey, sortDir]);

  /**
   * Projection is memoised on `cards`, not recomputed per keystroke — a
   * 4,000-row collection would otherwise re-derive every oracle string on every
   * character typed into the search box.
   */
  const projected = useMemo(
    () => cards.map(card => ({ card, local: localCardOf(card) })),
    [cards]
  );

  const visible = useMemo(() => {
    const kept = projected
      .filter(
        ({ card, local }) =>
          matchesCardFilter(local, filters.state) && matchesOwnership(card, ownership)
      )
      .map(({ card }) => card);
    return sortCards(kept, sortKey, sortDir);
  }, [projected, filters.state, ownership, sortKey, sortDir]);

  /**
   * Copies on screen, what they are worth, and how many of them we could not
   * price.
   *
   * The third number is the one that was missing. Prices are absent for
   * thousands of printings (5,186 of 52,130 rows carry no `usd` at all), and
   * those copies used to add 0 to this sum, so the total looked exact while
   * being quietly too low. The valuation rule itself is unchanged, because
   * changing it would move every user's reported collection value.
   */
  const visibleTotals = useMemo(() => {
    let copies = 0;
    let value = 0;
    let unpriced = 0;
    for (const card of visible) {
      copies += (card.quantity || 0) + (card.foil || 0);
      value += valueOf(card);
      if (!(card.unitPrice > 0)) unpriced += card.quantity || 0;
      if (!(card.foilPrice > 0)) unpriced += card.foil || 0;
    }
    return { copies, value, unpriced };
  }, [visible]);

  const ownedCount = ownershipFilterCount(ownership);
  const filterCount = filters.activeCount + ownedCount;
  const selected = selectedIds ?? new Set<string>();
  const allVisibleSelected =
    visible.length > 0 && visible.every(c => selected.has(c.rowId));

  const clearEverything = useCallback(() => {
    filters.reset();
    setOwnership(EMPTY_OWNERSHIP);
  }, [filters]);

  const commitText = useCallback(
    (next: string | undefined) => filters.patch({ text: next }),
    [filters.patch] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSortColumn = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'set' ? 'asc' : 'desc');
    }
  };

  const toggleCondition = (grade: ConditionGrade) =>
    setOwnership(o => ({
      ...o,
      conditions: o.conditions.includes(grade)
        ? o.conditions.filter(c => c !== grade)
        : [...o.conditions, grade],
    }));

  return (
    <div className="space-y-4">
      {/* Toolbar — a raised surface, not a boxed one. */}
      <div className="space-y-3 rounded-lg bg-card p-3 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBox value={filters.state.text ?? ''} onCommit={commitText} />

          <div className="flex items-center gap-2">
            <CardFilterSheet
              controller={filters}
              showSort={false}
              showChips={false}
              trigger={
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Filters
                  {filterCount > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold leading-none text-primary-foreground">
                      {filterCount}
                    </span>
                  )}
                </Button>
              }
            />

            <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
              <SelectTrigger
                className="h-9 w-[150px] border-0 bg-muted/50"
                aria-label="Sort by"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-0">
                {SORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="secondary"
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

        {/* Ownership facets — the questions a Scryfall query cannot ask. */}
        {showOwnershipFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
              Owned
            </span>
            {CONDITIONS.map(c => (
              <FacetChip
                key={c.value}
                selected={ownership.conditions.includes(c.value)}
                onClick={() => toggleCondition(c.value)}
                title={c.label}
              >
                {c.value}
              </FacetChip>
            ))}
            <FacetChip
              selected={ownership.foilOnly}
              onClick={() => setOwnership(o => ({ ...o, foilOnly: !o.foilOnly }))}
              title="Only entries with foil copies"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Foil
            </FacetChip>
            <FacetChip
              selected={ownership.minCopies >= 2}
              onClick={() =>
                setOwnership(o => ({ ...o, minCopies: o.minCopies >= 2 ? 0 : 2 }))
              }
              title="Entries with two or more copies"
            >
              2+ copies
            </FacetChip>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onToggleSelectionMode && (
              <>
                <Button
                  variant={selectionMode ? 'secondary' : 'ghost'}
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
                    variant="ghost"
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
          </div>

          <div className="flex items-center gap-3">
            {view === 'grid' && (
              <CardSizeSlider
                storageKey={storageKey ?? 'collection'}
                value={cardWidth}
                onValueChange={setCardWidth}
                showValue={false}
                className="hidden sm:flex"
              />
            )}

            <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
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

        {filterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActiveFilterChips controller={filters} />
            {ownership.conditions.map(grade => (
              <RemovableChip key={grade} onRemove={() => toggleCondition(grade)}>
                Condition: {grade}
              </RemovableChip>
            ))}
            {ownership.foilOnly && (
              <RemovableChip onRemove={() => setOwnership(o => ({ ...o, foilOnly: false }))}>
                Foil copies
              </RemovableChip>
            )}
            {ownership.minCopies > 0 && (
              <RemovableChip onRemove={() => setOwnership(o => ({ ...o, minCopies: 0 }))}>
                {ownership.minCopies}+ copies
              </RemovableChip>
            )}
          </div>
        )}
      </div>

      {toolbarSlot}

      {/* Result summary */}
      {!loading && cards.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {visible.length.toLocaleString()}
          </span>
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
          {visibleTotals.unpriced > 0 && (
            <span title="We hold no price for these copies, so the total above is lower than the real one.">
              {' · '}
              {visibleTotals.unpriced.toLocaleString()}
              {visibleTotals.unpriced === 1 ? ' copy' : ' copies'} with no price
            </span>
          )}
        </p>
      )}

      {/* Results */}
      {loading ? (
        <CardGrid width={cardWidth}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[488/680] w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
            />
          ))}
        </CardGrid>
      ) : visible.length === 0 ? (
        <div className="rounded-lg bg-muted/30 p-12 text-center">
          <h3 className="text-base font-semibold text-foreground">{emptyTitle}</h3>
          {emptyDescription && (
            <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
          )}
          {filterCount > 0 && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={clearEverything}>
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
        <CardGrid width={cardWidth}>
          {visible.map(card => (
            <CollectionCardTile
              key={card.rowId}
              card={card}
              width={cardWidth}
              onClick={onCardClick}
              actions={actions}
              selectionMode={selectionMode}
              selected={selected.has(card.rowId)}
              onToggleSelect={onToggleSelect ?? (() => {})}
              onQuantityChange={onQuantityChange}
              showCondition={showOwnershipFilters}
            />
          ))}
        </CardGrid>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toolbar pieces
 * ------------------------------------------------------------------ */

/**
 * Debounced so a 4,000-card collection is not re-filtered on every keystroke,
 * and reset from the outside when the filter is cleared elsewhere.
 */
function SearchBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);

  useEffect(() => {
    if (value !== committed) {
      setCommitted(value);
      setDraft(value);
    }
    // Adopts external changes only; typing is handled by the timer below.
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
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Name, type, or Scryfall syntax like t:creature mv<=3"
        aria-label="Search cards"
        spellCheck={false}
        className="border-0 bg-muted/50 pl-8 focus-visible:ring-1 focus-visible:ring-offset-0"
      />
    </div>
  );
}

function FacetChip({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function RemovableChip({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title="Remove filter"
      className="group inline-flex items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-2.5 pr-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{children}</span>
      <X className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}
