import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutGrid, Rows3, Search } from 'lucide-react';
import {
  FilterBar,
  ListingFrame,
  ListingSearch,
  matchedLabel,
  resultSentence,
  useListingView,
  type ListingMode,
  type ListingView,
} from '@/components/listing';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { PlayabilityEngine } from '@/lib/deck/playability';
import { rowToPlayabilityInput } from '@/lib/deck/playabilityView';
import {
  computeDeckCardFacets,
  EMPTY_DECK_CARD_FILTERS,
  filterDeckRows,
  isFilterActive,
  type DeckCardFilterState,
} from '@/lib/deck/deckCardFilters';
import { DeckCardFilters } from './DeckCardFilters';
import { DeckCardGrid } from './DeckCardGrid';
import { DeckCardTable } from './DeckCardTable';

/**
 * The Cards tab: the decklist and the controls that narrow it, and nothing
 * else.
 *
 * The curve used to sit above this, on the one tab whose whole job is the card
 * list — the owner's note was blunt: "Mana curve not needs on main cards
 * page." It now lives on the Mana tab beside the source analysis it belongs
 * with. Nothing was removed to do that.
 *
 * Visual and List were previously two separate top-level tabs showing the same
 * hundred cards. They are one tab with a view toggle here, so the tab strip
 * names questions ("what is in this deck?") rather than renderers, and both
 * renderers survive untouched.
 *
 * ## What the consistency pass changed
 *
 * The bar above the list is `FilterBar` now, the same object as the one above
 * My Collection and My Decks, and the results sit in `ListingFrame`. Five
 * things this page was drawing itself come from there instead: the search box,
 * which had no debounce and drew the shadcn `Input` with its hairline border;
 * the count line, which was one of six phrasings of "how many results" and now
 * reads `84 of 100 cards` from `matchedLabel`; the clear control; the view
 * toggle, which was a hand-rolled segmented control; and the surface the whole
 * band sits on.
 *
 * The facets stayed exactly where they were, always open, because they are
 * computed from the deck in your hand and carry live counts. See
 * `DeckCardFilters` for that argument in full.
 */

export type DeckCardView = 'visual' | 'table';

const CARD_MODES: ListingMode[] = [
  { id: 'visual', label: 'Visual', icon: LayoutGrid, layout: 'rows' },
  { id: 'table', label: 'Table', icon: Rows3, layout: 'rows' },
];

interface DeckCardsPanelProps {
  rows: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Memoised castability for this decklist. */
  engine: PlayabilityEngine;
  view: DeckCardView;
  onViewChange: (next: DeckCardView) => void;
}

export function DeckCardsPanel({
  rows,
  onCardClick,
  engine,
  view,
  onViewChange,
}: DeckCardsPanelProps) {
  const [filters, setFilters] = useState<DeckCardFilterState>(EMPTY_DECK_CARD_FILTERS);

  /*
   * The mode is the page's, not the vocabulary's.
   *
   * `?view=table` is in the URL on this page, deliberately: an old `?tab=list`
   * link still has to land on the table it used to open, and a decklist you
   * send somebody should arrive the way you were reading it. `useListingView`
   * remembers a mode in `localStorage`, which is the right home for a
   * preference and the wrong home for a place. So the hook supplies everything
   * else and the two mode fields are overridden with the URL-backed pair the
   * page already owns.
   *
   * No `surface`, because nothing else here is worth persisting: this page has
   * no card-size slider (`DeckCardGrid` lays itself out by card type) and no
   * pager (cutting a hundred-card decklist into pages would hide half of the
   * deck from the person reading it).
   */
  const base = useListingView({ modes: CARD_MODES });
  const listView: ListingView = useMemo(
    () => ({
      ...base,
      mode: view,
      activeMode: CARD_MODES.find(m => m.id === view) ?? CARD_MODES[0],
      setMode: (id: string) => onViewChange(id as DeckCardView),
    }),
    [base, view, onViewChange]
  );

  /**
   * One lookup, shared by the grid, the table, the facet counts and the
   * filter. The engine memoises on cost, so a hundred rows across four
   * consumers is still one solve per distinct mana cost.
   *
   * Sideboard rows get no figure at all. The engine's profile is built from
   * the mainboard — `rowsToPlayabilityInputs` drops sideboard rows, because a
   * card you cannot draw must not inflate source density — so scoring a
   * sideboard card against that profile prints a castability for a library the
   * card is not in. It also made the band chips disagree with the average in
   * the page header, which counts mainboard spells only. A dash is the honest
   * answer until the sideboard is solved against its own profile.
   */
  const playabilityFor = useMemo(
    () => (row: DeckCardRow) =>
      row.is_sideboard ? null : engine.card(rowToPlayabilityInput(row)),
    [engine]
  );

  // Facets come off the *unfiltered* rows on purpose. Deriving them from the
  // filtered set would make chips vanish as you clicked them, which turns a
  // filter bar into a maze.
  const facets = useMemo(
    () => computeDeckCardFacets(rows, playabilityFor),
    [rows, playabilityFor]
  );

  const filtered = useMemo(
    () => filterDeckRows(rows, filters, playabilityFor),
    [rows, filters, playabilityFor]
  );

  const total = rows.reduce((sum, row) => sum + (row.quantity || 1), 0);
  const shown = filtered.reduce((sum, row) => sum + (row.quantity || 1), 0);
  const narrowed = isFilterActive(filters);

  /*
   * How many facets are on, so the bar's clear control appears exactly when
   * something is narrowing the list. The search box counts as one, which is
   * what it counts as on every other surface.
   */
  const activeCount =
    (filters.search.trim() ? 1 : 0) +
    filters.categories.length +
    filters.colours.length +
    filters.manaValues.length +
    filters.rarities.length +
    filters.prices.length +
    filters.playability.length;

  const clearEverything = useCallback(() => setFilters(EMPTY_DECK_CARD_FILTERS), []);
  const commitSearch = useCallback(
    (next: string | undefined) => setFilters(prev => ({ ...prev, search: next ?? '' })),
    []
  );

  return (
    <div className="space-y-4">
      <FilterBar
        view={listView}
        activeCount={activeCount}
        onClear={clearEverything}
        search={
          <ListingSearch
            value={filters.search}
            onCommit={commitSearch}
            placeholder="Search this deck by name, type or rules text"
            label="Search cards in this deck"
          />
        }
        facets={<DeckCardFilters facets={facets} state={filters} onChange={setFilters} />}
      />

      <ListingFrame
        view={listView}
        count={filtered.length}
        /* `84 of 100 cards`, and only `100 cards` when nothing is narrowed.
           The same sentence every listing in the product uses. */
        summary={resultSentence([matchedLabel(shown, total, 'card')])}
        empty={{
          title: narrowed ? 'No cards match these filters' : 'No cards in this deck yet',
          description: narrowed
            ? 'Clear a filter above to widen the list.'
            : 'Add cards in the deck builder and they will appear here.',
          icon: Search,
          onClearFilters: narrowed ? clearEverything : undefined,
        }}
      >
        {view === 'visual' ? (
          <DeckCardGrid
            rows={filtered}
            onCardClick={onCardClick}
            collapsedByDefault={['lands']}
            playabilityFor={playabilityFor}
            manaProfile={engine.profile}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <DeckCardTable
                rows={filtered}
                onCardClick={onCardClick}
                playabilityFor={playabilityFor}
                manaProfile={engine.profile}
              />
            </CardContent>
          </Card>
        )}
      </ListingFrame>
    </div>
  );
}

export default DeckCardsPanel;
