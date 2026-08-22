import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Grid3X3, LayoutList, Search, Type as TypeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import {
  FIELD,
  FilterBar,
  FilterButton,
  ListingFrame,
  ListingSearch,
  SURFACE,
  SortControl,
  matchedLabel,
  resultSentence,
  useListingView,
  type ListingMode,
  type ListingView,
} from '@/components/listing';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import { serializeDeck } from '@/lib/deck/deckSerialize';
import {
  DECK_SORT_OPTIONS,
  GROUP_AXIS_LABEL,
  groupDeckRows,
  sortDeckRows,
  type DeckGroupAxis,
  type DeckSortAxis,
} from '@/lib/deck/deckCardGroups';
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
import type { DeckCardEditing } from './DeckCardEditing';
import {
  DECK_BUILD_VIEW_SURFACE,
  useDeckGroupBy,
} from '@/components/deck-builder/deck-view-prefs';

/**
 * The decklist, and everything that changes it.
 *
 * ## One surface where there were two
 *
 * `/deck/:id` had this shell — the shared `FilterBar`, the shared
 * `ListingFrame`, the shared count sentence, the shared empty state,
 * castability on every card, `PriceTag`, the canonical categoriser and the view
 * mode in the URL. `/deck-builder` had the controls — quantity, replace,
 * remove, group by, sort, card size and a plain-text mode. Neither was a
 * superset. The shell is the harder half to rebuild and it was already the
 * shared vocabulary, so the controls came here.
 *
 * ## The filters are closed by default
 *
 * Six controls above the deck on every visit, when almost every visit is "look
 * at my deck" rather than "narrow my deck". Owner: "dont need all those filters
 * by default". One control opens them and carries the count, so a narrowed list
 * is never a mystery. Behind it are the same facet rows as before, every chip
 * computed from the deck in your hand and carrying its real count — a map of
 * the deck rather than a query builder.
 *
 * ## Where each control applies
 *
 * Group by and sort drive the visual grid; the size slider belongs to the
 * visual mode alone, through `ListingMode.sized`. The table sorts on its own
 * column headers, which is better than an external axis picker and is why it
 * does not get one. Text is the decklist as text, so grouping and sorting would
 * only rearrange something you are about to paste elsewhere. A control that
 * would do nothing is not drawn.
 *
 * ## The commander is not in this list
 *
 * It is drawn whole and large above, with its oracle text and its own Change
 * control. Repeating it here as a thumbnail pushed the deck down a row for
 * nothing. Owner: "dont need to show the commander row - start with creatures -
 * we already show commander at the top". It is still in the text decklist,
 * because a decklist without its commander is not the decklist.
 */

export type DeckCardView = 'visual' | 'table' | 'text';

const CARD_MODES: ListingMode[] = [
  { id: 'visual', label: 'Visual', icon: Grid3X3, layout: 'rows', sized: true },
  { id: 'table', label: 'Table', icon: LayoutList, layout: 'rows' },
  { id: 'text', label: 'Text', icon: TypeIcon, layout: 'rows' },
];

/**
 * Card width on a first visit.
 *
 * 230, not the build surface's old 150. 230 sits in `CardImage`'s `lg` band,
 * which is what the read-only decklist drew at and is the size this merge is
 * meant to keep — five cards across the content band, at a size you can read a
 * name and a mana cost off at arm's length. The owner's most repeated note
 * across this project is that everything renders too small.
 *
 * A reader who has moved the slider keeps their width: `useCardSize` reads the
 * stored value first and this is only the fallback.
 */
const DEFAULT_CARD_SIZE = 230;

interface DeckCardsPanelProps {
  /** What the list shows and filters. The commander is not among these. */
  rows: DeckCardRow[];
  /** Carried into the text decklist only, so an export is a whole deck. */
  commanderRow?: DeckCardRow | null;
  deckName: string;
  onCardClick?: (row: DeckCardRow) => void;
  /** Memoised castability for this decklist. */
  engine: PlayabilityEngine;
  view: DeckCardView;
  onViewChange: (next: DeckCardView) => void;
  /** Quantity, replace and remove. Omit for a decklist nobody can change. */
  editing?: DeckCardEditing;
}

export function DeckCardsPanel({
  rows,
  commanderRow,
  deckName,
  onCardClick,
  engine,
  view,
  onViewChange,
  editing,
}: DeckCardsPanelProps) {
  const [filters, setFilters] = useState<DeckCardFilterState>(EMPTY_DECK_CARD_FILTERS);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [groupBy, setGroupBy] = useDeckGroupBy();

  /*
   * The mode is the page's; everything else is remembered.
   *
   * `?view=table` is in the URL on this page, deliberately: an old `?tab=list`
   * link still has to land on the table it used to open, and a decklist you
   * send somebody should arrive the way you were reading it. `useListingView`
   * remembers a mode in `localStorage`, which is the right home for a
   * preference and the wrong home for a place. So the hook supplies the sort
   * axis, the direction and the card width — under the key the build surface
   * has always written, so nobody's choice resets — and the two mode fields are
   * overridden with the URL-backed pair the page owns.
   */
  const base = useListingView({
    surface: DECK_BUILD_VIEW_SURFACE,
    modes: CARD_MODES,
    defaultMode: 'visual',
    defaultSortKey: 'cmc',
    defaultSortDir: 'asc',
    defaultSize: DEFAULT_CARD_SIZE,
  });
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

  const sorted = useMemo(
    () => sortDeckRows(filtered, base.sortKey as DeckSortAxis, base.sortDir),
    [filtered, base.sortKey, base.sortDir]
  );

  const groups = useMemo(
    () => groupDeckRows(sorted, groupBy as DeckGroupAxis),
    [sorted, groupBy]
  );

  const total = rows.reduce((sum, row) => sum + (row.quantity || 1), 0);
  const shown = filtered.reduce((sum, row) => sum + (row.quantity || 1), 0);
  const narrowed = isFilterActive(filters);

  /*
   * How many facets are on, so the trigger carries a count and the bar's clear
   * control appears exactly when something is narrowing the list. The search
   * box counts as one, which is what it counts as on every other surface.
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

  /**
   * The decklist as text, from `serializeDeck` — the one serialiser every
   * export surface uses. The build surface wrote its own, which was two
   * plain-text decklists for one deck and exactly the duplicate this merge
   * exists to remove.
   */
  const decklistText = useMemo(
    () => serializeDeck(commanderRow ? [commanderRow, ...filtered] : filtered, 'text', deckName),
    [commanderRow, filtered, deckName]
  );

  const copyDecklist = () => {
    navigator.clipboard
      ?.writeText(decklistText)
      .then(() => showSuccess('Copied', 'Decklist copied to the clipboard'))
      .catch(() => showError('Copy failed', 'Your browser blocked clipboard access'));
  };

  const arranging = view === 'visual';

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
        presets={
          arranging ? (
            /* Grouping is this surface's own control and no other listing has
               one, so it is passed in rather than built into the bar. */
            <Select value={groupBy} onValueChange={value => setGroupBy(value as DeckGroupAxis)}>
              <SelectTrigger className={cn(FIELD, 'h-9 w-[150px]')} aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SURFACE}>
                {(Object.keys(GROUP_AXIS_LABEL) as DeckGroupAxis[]).map(axis => (
                  <SelectItem key={axis} value={axis}>
                    {GROUP_AXIS_LABEL[axis]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
        filters={
          <FilterButton
            count={activeCount}
            label={facetsOpen ? 'Hide filters' : 'Filters'}
            aria-expanded={facetsOpen}
            onClick={() => setFacetsOpen(open => !open)}
          />
        }
        sort={
          arranging ? (
            <SortControl
              options={DECK_SORT_OPTIONS}
              value={base.sortKey}
              onValueChange={base.setSortKey}
              dir={base.sortDir}
              onToggleDir={base.toggleSortDir}
              label="Sort cards by"
            />
          ) : undefined
        }
        facets={
          facetsOpen ? (
            <DeckCardFilters facets={facets} state={filters} onChange={setFilters} />
          ) : undefined
        }
      />

      <ListingFrame
        view={listView}
        /* Text mode has one body whatever the row count is, so it must not fall
           through to the empty state while the deck still has cards in it. */
        count={view === 'text' ? (filtered.length > 0 ? 1 : 0) : filtered.length}
        summary={resultSentence([matchedLabel(shown, total, 'card')])}
        empty={{
          title: narrowed ? 'No cards match these filters' : 'No cards in this deck yet',
          description: narrowed
            ? 'Clear a filter above to widen the list.'
            : 'Search on the Add tab and the cards land here.',
          icon: Search,
          onClearFilters: narrowed ? clearEverything : undefined,
        }}
      >
        {view === 'visual' ? (
          <DeckCardGrid
            rows={sorted}
            groups={groups}
            onCardClick={onCardClick}
            collapsedByDefault={['lands']}
            playabilityFor={playabilityFor}
            manaProfile={engine.profile}
            width={listView.size}
            editing={editing}
          />
        ) : view === 'table' ? (
          <Card>
            <CardContent className="p-0">
              <DeckCardTable
                rows={filtered}
                onCardClick={onCardClick}
                playabilityFor={playabilityFor}
                manaProfile={engine.profile}
                editing={editing}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={copyDecklist}>
                <Copy className="mr-2 h-4 w-4" />
                Copy decklist
              </Button>
            </div>
            <Textarea
              readOnly
              value={decklistText}
              className="min-h-[420px] font-mono text-xs"
              aria-label="Plain-text decklist"
            />
          </div>
        )}
      </ListingFrame>
    </div>
  );
}

export default DeckCardsPanel;
