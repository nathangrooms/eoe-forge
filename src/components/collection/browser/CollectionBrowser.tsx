import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckSquare, LayoutGrid, Rows3, Sparkles, Square, Table2 } from 'lucide-react';
import {
  FacetChip,
  FilterBar,
  FilterButton,
  ListingFrame,
  ListingSearch,
  RemovableChip,
  ResultSummary,
  SortControl,
  matchedLabel,
  totalActiveFilters,
  useListingView,
  type ListingMode,
} from '@/components/listing';
import { usePagedItems } from '@/hooks/usePagination';
import { ActiveFilterChips, CardFilterSheet, useCardFilterState } from '@/components/filters';
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
  type ConditionGrade,
  type OwnershipFilterState,
  type SortKey,
  SORT_OPTIONS,
} from './types';

/**
 * The browser every list of owned cards renders through.
 *
 * Three things are true of it and they are the whole point:
 *
 * 1. **One filter.** It drives the shared `CardFilterPanel`, the same control
 *    with the same facets as the card-search pages, and evaluates its
 *    `CardSearchState` locally through `matchesCardFilter`. Ownership questions
 *    the panel cannot ask (condition, foil, copies owned) sit beside it,
 *    because no Scryfall query can express "cards I own two of in Lightly
 *    Played".
 * 2. **One card renderer.** `CardImage` inside `CardGrid`, sized by a
 *    continuous slider rather than a five-step density enum.
 * 3. **One set of listing controls.** Search, filter bar, view modes, size,
 *    paging and the count line come from `@/components/listing`. This file
 *    draws none of them any more. It says which modes exist, what a row is,
 *    and what its own facets are, and that is all a listing surface should
 *    have to decide.
 *
 * ## Two things moved, and nothing was removed
 *
 * The ownership chips share the control row with the size and view controls
 * now instead of holding a band of their own. The audit measured 449px of
 * chrome above the first card here against My Decks' 339px, and the extra came
 * from bands rather than from controls. The chips are a genuine difference and
 * they stay; a band to themselves was not.
 *
 * "Clear all" now clears the ownership facets too. It used to be
 * `ActiveFilterChips`' own control, which knows only about the shared half, so
 * clearing everything left the condition chips on and the grid stayed narrowed
 * with nothing on screen explaining why.
 */

/**
 * The three ways to look at owned cards.
 *
 * Not the same three as card search, deliberately. A table here carries
 * condition, quantity and value columns that a Scryfall result has no values
 * for, and card search's text list exists for copying a decklist out, which is
 * not something anybody does with a collection.
 */
const MODES: ListingMode[] = [
  { id: 'grid', label: 'Image grid', icon: LayoutGrid, layout: 'grid' },
  { id: 'list', label: 'List', icon: Rows3, layout: 'rows' },
  { id: 'table', label: 'Table', icon: Table2, layout: 'rows' },
];

export interface CollectionBrowserProps {
  cards: BrowserCard[];
  loading?: boolean;
  /** localStorage key so view mode, card size, sort and page size survive navigation. */
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
  /*
   * `storageKey` goes straight through as the surface name, so the keys this
   * reads are the keys it has always written: the view under the key itself,
   * card size under `dm.card-size.<key>`, page size under `dm.pageSize.<key>`.
   * Renaming it would silently reset every existing reader's preferences, and
   * `readListingView` still answers to the older `view` field for the same
   * reason.
   */
  const view = useListingView({
    surface: storageKey,
    modes: MODES,
    defaultMode: 'grid',
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
    defaultSize: 200,
  });
  /* The vocabulary keeps sort keys as strings because every surface sorts on a
     different set. This is the one place the collection's own set is named. */
  const sortKey = view.sortKey as SortKey;

  const filters = useCardFilterState({ urlSync });
  const [ownership, setOwnership] = useState<OwnershipFilterState>(EMPTY_OWNERSHIP);

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
    return sortCards(kept, sortKey, view.sortDir);
  }, [projected, filters.state, ownership, sortKey, view.sortDir]);

  /**
   * Copies on screen, what they are worth, and how many of them we could not
   * price.
   *
   * The third number is the one that was missing. Prices are absent for
   * thousands of printings, and those copies used to add 0 to this sum, so the
   * total looked exact while being quietly too low. The valuation rule itself
   * is unchanged, because changing it would move every user's reported
   * collection value.
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

  /**
   * Page the rows, after sorting and never before.
   *
   * The whole filtered set stays in hand because this screen reports figures
   * over all of it. What paging cuts is the drawing: a 1,200-row collection
   * used to put 1,200 card tiles and 20,029 elements into the document at once,
   * and every keystroke in the search box re-rendered all of them.
   *
   * `visible` is already sorted by `sortCards`, which breaks ties on the row id
   * so the order cannot shuffle between renders and put a card on two pages.
   */
  const resetKey = useMemo(
    () => JSON.stringify([filters.state, ownership, sortKey, view.sortDir]),
    [filters.state, ownership, sortKey, view.sortDir]
  );

  const paged = usePagedItems(visible, {
    pageSize: view.pageSize,
    resetKey,
    urlSync,
    key: 'page',
  });

  const ownedCount = ownershipFilterCount(ownership);
  const filterCount = totalActiveFilters(filters.activeCount, ownedCount);
  const selected = selectedIds ?? new Set<string>();
  const allVisibleSelected = visible.length > 0 && visible.every(c => selected.has(c.rowId));

  const clearEverything = useCallback(() => {
    filters.reset();
    setOwnership(EMPTY_OWNERSHIP);
  }, [filters]);

  const commitText = useCallback(
    (next: string | undefined) => filters.patch({ text: next }),
    [filters.patch] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleCondition = (grade: ConditionGrade) =>
    setOwnership(o => ({
      ...o,
      conditions: o.conditions.includes(grade)
        ? o.conditions.filter(c => c !== grade)
        : [...o.conditions, grade],
    }));

  /** The table's column headers sort too, and share one axis with the control. */
  const handleSortColumn = (key: SortKey) => {
    if (key === sortKey) view.toggleSortDir();
    else {
      view.setSortKey(key);
      view.setSortDir(key === 'name' || key === 'set' ? 'asc' : 'desc');
    }
  };

  /* `ResultSummary`, not `resultSentence`: the unpriced figure carries a
     caption saying the total above it is short, and a string throws that away.
     The caption was on screen as a `<span title>` before this page moved to the
     shared count line, and a valuation that is quietly low while looking exact
     is the one thing this figure must not be. */
  const summary = (
    <ResultSummary
      parts={[
        matchedLabel(visible.length, cards.length, 'entry', 'entries'),
        { value: visibleTotals.copies.toLocaleString(), label: 'cards' },
        /* Only when there is a price to state. `formatPrice(0)` returns
           "$0.00", and the smallest real price in the database is 0.01, so a
           rendered zero here is always invented. Filter the collection down to
           cards the catalogue has no price for and this line said the result
           was worth nothing; it is worth nothing KNOWN, which is what the
           "copies with no price" figure beside it is for. */
        visibleTotals.value > 0 && { value: formatPrice(visibleTotals.value) },
        visibleTotals.unpriced > 0 && {
          value: visibleTotals.unpriced.toLocaleString(),
          label: visibleTotals.unpriced === 1 ? 'copy with no price' : 'copies with no price',
          title: 'We hold no price for these copies, so the total above is lower than the real one.',
        },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      <FilterBar
        view={view}
        activeCount={filterCount}
        onClear={clearEverything}
        search={
          <ListingSearch
            value={filters.state.text ?? ''}
            onCommit={commitText}
            placeholder="Name, type, or Scryfall syntax like t:creature mv<=3"
            label="Search cards"
          />
        }
        filters={
          <CardFilterSheet
            controller={filters}
            showSort={false}
            showChips={false}
            trigger={<FilterButton count={filterCount} />}
          />
        }
        sort={
          <SortControl
            options={SORT_OPTIONS}
            value={sortKey}
            onValueChange={next => view.setSortKey(next)}
            dir={view.sortDir}
            onToggleDir={view.toggleSortDir}
          />
        }
        chips={
          filterCount > 0 ? (
            <>
              {/* The bar owns the one clear control, so the chips do not draw a
                  second one that would reset only half of what is on. */}
              <ActiveFilterChips controller={filters} showClear={false} />
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
            </>
          ) : null
        }
      >
        {/* Ownership facets and selection share this row with the size and view
            controls rather than each taking a band of their own. */}
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

        {onToggleSelectionMode && (
          <>
            <Button
              variant={selectionMode ? 'default' : 'ghost'}
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
                {/* Every row the filter matched, not just this page. On a paged
                    list "shown" would read as the 24 on screen. */}
                {allVisibleSelected
                  ? 'Deselect all'
                  : `Select all ${visible.length.toLocaleString()} matching`}
              </Button>
            )}
          </>
        )}
      </FilterBar>

      <ListingFrame
        view={view}
        count={paged.pageItems.length}
        loading={loading}
        /* Unconditional: `ListingFrame` reserves the line and decides when it
           has something to say. Suppressing it here left the box unreserved and
           the grid jumped by a line when the collection landed. */
        summary={summary}
        beforeResults={toolbarSlot}
        pager={{
          page: paged.page,
          pageCount: paged.pageCount,
          onPageChange: paged.setPage,
          total: paged.total,
          shown: paged.pageItems.length,
          noun: 'entry',
          nounPlural: 'entries',
          label: 'Collection pages',
        }}
        empty={{
          title: emptyTitle,
          description: emptyDescription,
          onClearFilters: filterCount > 0 ? clearEverything : undefined,
          action: cards.length === 0 ? emptyAction : undefined,
        }}
      >
        {view.mode === 'table' ? (
          <CollectionTable
            cards={paged.pageItems}
            sortKey={sortKey}
            sortDir={view.sortDir}
            onSort={handleSortColumn}
            onCardClick={onCardClick}
            actions={actions}
            selectionMode={selectionMode}
            selectedIds={selected}
            onToggleSelect={onToggleSelect ?? (() => {})}
            showCondition={showOwnershipFilters}
          />
        ) : view.mode === 'list' ? (
          <div className="space-y-2">
            {paged.pageItems.map(card => (
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
          /* A grid mode arrives inside `ListingFrame`'s `CardGrid` at the
             slider's width, so the tiles need no wrapper of their own. */
          paged.pageItems.map(card => (
            <CollectionCardTile
              key={card.rowId}
              card={card}
              width={view.size}
              onClick={onCardClick}
              actions={actions}
              selectionMode={selectionMode}
              selected={selected.has(card.rowId)}
              onToggleSelect={onToggleSelect ?? (() => {})}
              onQuantityChange={onQuantityChange}
              showCondition={showOwnershipFilters}
            />
          ))
        )}
      </ListingFrame>
    </div>
  );
}
