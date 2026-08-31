import { useCallback, useMemo } from 'react';
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
  type ListingMode,
  type ListingView,
} from '@/components/listing';
/* `useListingView` from its own module rather than through the folder's
   barrel, and this is not style. `@/components/listing/index.ts` re-exports the
   hook, the hook imports `@/components/cards`, and `CardDetail` in there imports
   the listing barrel back: two barrels in a cycle. Rollup reports it as
   "will end up in different chunks ... will likely lead to broken execution
   order", and this file is a lazily loaded chunk, which is exactly the case it
   is warning about. Everything else still comes from the barrel. */
import { useListingView } from '@/components/listing/useListingView';
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
  /**
   * The filter state, held by the page.
   *
   * ## Why this stopped being local state
   *
   * It was local, and that was right while this panel was the only thing that
   * could narrow the list. The Mana tab's curve is a second author now:
   * pressing the 4-drop bar means "show me those cards", and the only honest
   * way to answer it is to set `manaValues` here and switch tabs. State with
   * two authors in two different components has to be held by something that
   * contains both, which is the page. The same shape and the same reason as
   * `view`, which lives in the URL because a link is its second author.
   *
   * Everything this panel narrows by is still in this one object and the page
   * does nothing with it except hold it and hand it back.
   */
  filters: DeckCardFilterState;
  onFiltersChange: (next: DeckCardFilterState) => void;
  /**
   * Whether the facet rows are open, for the same reason. Arriving from the
   * curve with a mana value already on has to show the chip that says so, or
   * the list is short and nothing on screen explains why.
   */
  facetsOpen: boolean;
  onFacetsOpenChange: (open: boolean) => void;
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
  filters,
  onFiltersChange: setFilters,
  facetsOpen,
  onFacetsOpenChange: setFacetsOpen,
}: DeckCardsPanelProps) {
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

  const clearEverything = useCallback(() => setFilters(EMPTY_DECK_CARD_FILTERS), [setFilters]);
  /* `ListingSearch` keys its debounce timer on this callback, so its identity
     matters: a fresh closure on every render would restart the timer forever
     and the box would never commit, which is the failure that file's own
     comment warns about. This one changes when `filters` changes, and `filters`
     only changes at the moment a commit lands — by which point the timer has
     already fired and the effect's `draft === committed` guard returns early.
     Typing does not touch `filters`, so the timer is never restarted mid-word.
     The page's `onFiltersChange` is memoised for the same reason. */
  const commitSearch = useCallback(
    (next: string | undefined) => setFilters({ ...filters, search: next ?? '' }),
    [filters, setFilters]
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
            onClick={() => setFacetsOpen(!facetsOpen)}
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
        /* TWO SENTENCES ABOUT ONE DECK THAT DID NOT ADD UP.
           The tab strip a few pixels above reads `Cards 100`: that is
           `computeDeckStats`, every non-sideboard row, commander included,
           because the deck has a hundred cards in it. This line read `99
           cards`, because `listRows` filters the commander out — it is drawn
           whole in the hero instead of sitting in the list. Both are right
           about different questions, so nothing is re-derived here. The card
           that is missing from the list is named, and 99 + 1 is visibly the
           100 above. */
        summary={resultSentence([
          matchedLabel(shown, total, 'card'),
          commanderRow ? { value: '1', label: 'commander, drawn above' } : null,
        ])}
        empty={{
          title: narrowed ? 'No cards match these filters' : 'No cards in this deck yet',
          description: narrowed
            ? 'Clear a filter above to widen the list.'
            : 'Search on the Add tab and the cards land here.',
          icon: Search,
          onClearFilters: narrowed ? clearEverything : undefined,
        }}
      >
        {/*
          * LANDS ARE NOT COLLAPSED, AND THEY WERE, ON THIS VIEW ONLY.
          *
          * `collapsedByDefault={['lands']}` was passed here and nowhere else:
          * the table and text views list every land, and the VISUAL view — the
          * one whose whole job is showing you your cards — hid a third of the
          * deck behind a chevron. Measured on the fixture: 99 cards in the
          * list, 68 drawn, and 99 minus 32 lands plus the commander is exactly
          * 68.
          *
          * It arrived incidentally, in a commit about castability maths and the
          * tab rebuild, and carried no reasoning. In Commander a mana base is
          * not filler: duals, fetches and utility lands are the most scrutinised
          * choices in a list after the commander itself.
          *
          * The prop stays on `DeckCardGrid` for a caller that has a reason.
          */}
        {view === 'visual' ? (
          <DeckCardGrid
            rows={sorted}
            groups={groups}
            onCardClick={onCardClick}
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
            {/* AS TALL AS THE LIST, so the page scrolls rather than the box.
                `min-h-[420px]` put a hundred cards in a 418px window: measured
                by `clip-audit`, 1,150px of decklist hidden inside a page that
                simply ended at 1,627px with "1x Birds of Paradise" cut in half.
                A window you scroll inside a page you also scroll is the "weird
                small window" the brief names, and this one is the whole point
                of the view — Text is where you go to READ the list.

                `rows` from the line count rather than a taller fixed minimum,
                because the right height is a property of the deck: a
                sixty-card list should not sit in a hundred-card box either. */}
            <Textarea
              readOnly
              rows={decklistText.split('\n').length + 1}
              value={decklistText}
              className="resize-none overflow-hidden font-mono text-xs"
              aria-label="Plain-text decklist"
            />
          </div>
        )}
      </ListingFrame>
    </div>
  );
}

export default DeckCardsPanel;
