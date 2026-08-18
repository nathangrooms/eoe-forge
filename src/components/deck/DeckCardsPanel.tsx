import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Rows3 } from 'lucide-react';
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
 */

export type DeckCardView = 'visual' | 'table';

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

  const viewToggle = (
    <div
      className="flex items-center rounded-md bg-muted p-0.5"
      role="group"
      aria-label="Card list view"
    >
      {/* `secondary` sits one lightness step from `muted`, so a selected
          `secondary` reads as unselected. Selected inverts instead. */}
      <Button
        variant={view === 'visual' ? 'default' : 'ghost'}
        size="sm"
        className="h-9 gap-2 px-3"
        aria-pressed={view === 'visual'}
        onClick={() => onViewChange('visual')}
      >
        <LayoutGrid className="h-4 w-4" />
        Visual
      </Button>
      <Button
        variant={view === 'table' ? 'default' : 'ghost'}
        size="sm"
        className="h-9 gap-2 px-3"
        aria-pressed={view === 'table'}
        onClick={() => onViewChange('table')}
      >
        <Rows3 className="h-4 w-4" />
        Table
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <DeckCardFilters
        facets={facets}
        state={filters}
        onChange={setFilters}
        shown={shown}
        total={total}
        action={viewToggle}
      />

      {view === 'visual' ? (
        <DeckCardGrid
          rows={filtered}
          onCardClick={onCardClick}
          collapsedByDefault={['lands']}
          playabilityFor={playabilityFor}
          manaProfile={engine.profile}
          empty={
            narrowed
              ? {
                  title: 'No cards match these filters',
                  body: 'Clear a filter above to widen the list.',
                }
              : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DeckCardTable
              rows={filtered}
              onCardClick={onCardClick}
              playabilityFor={playabilityFor}
              manaProfile={engine.profile}
              emptyMessage={
                narrowed
                  ? 'No cards match these filters. Clear a filter above to widen the list.'
                  : 'No cards in this deck yet.'
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DeckCardsPanel;
