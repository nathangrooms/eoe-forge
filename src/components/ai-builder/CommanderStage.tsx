import { CardImage } from '@/components/cards';
import { Loader2 } from 'lucide-react';
import { CommanderWall } from './CommanderWall';
import type { CommanderFilters } from './commander-query';

/**
 * Choosing a commander, step one of the deck generator.
 *
 * ## What this file is now
 *
 * The wall itself moved to `CommanderWall`, which `NewDeck` also mounts. This
 * screen and that page were the same surface written twice — same finder, same
 * borderless search box, same size slider, same grid of picks with the same
 * hover strip, same pager, same "a page turn starts at the top of the wall" —
 * and they had already drifted apart on card width, slider breakpoint and
 * debounce. So what is left here is the two things that are genuinely this
 * step's: what the heading says about where the cards came from, and the
 * analysing state.
 *
 * ## The layout argument, kept because it was paid for twice
 *
 * Two versions ago this step put twelve cards in a bordered box under a heading
 * and buried a second, differently styled results grid inside a finder card
 * below it. The fix moved the filters into a right-hand slide-out and gave the
 * grid the whole screen, which over-corrected: the first step of the flow
 * became an undifferentiated wall of 175 commanders with its only real control
 * hidden behind a button. Owner: *"doesn't need to show so many cards, worked
 * better when commander finder was actually on the screen not a right menu."*
 * and *"Deck generator filter should be at the top"*.
 *
 * The finder is therefore a row on the page, in `FilterBar`'s `facets` slot,
 * and the wall gets the whole width underneath it.
 */

export type CommanderSource = 'popular' | 'search' | 'finder';

export interface CommanderStageProps {
  cards: any[];
  loading: boolean;
  /** Total matches Scryfall reported, when it reported one. */
  total?: number | null;
  page: number;
  /** Null when no total came back. The pager then shows no page count. */
  pageCount: number | null;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  source: CommanderSource;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: CommanderFilters;
  onFiltersChange: (filters: CommanderFilters) => void;
  sortOrder: string;
  onSortOrderChange: (order: string) => void;
  /** Runs the finder's query. */
  onRunFinder: () => void;
  onClearFinder: () => void;
  /** True while the finder's own search is in flight. */
  finderSearching?: boolean;
  /** Matches the finder's last run reported, so the rail can say what it found. */
  finderResultCount?: number | null;
  onSelect: (card: any) => void;
  error?: string | null;
  /** Set while the commander's archetypes are being read. */
  analyzing?: boolean;
  analyzingCard?: any;
}

const SOURCE_LABEL: Record<CommanderSource, string> = {
  popular: 'Most played commanders',
  search: 'Search results',
  finder: 'Commander finder',
};

export function CommanderStage({
  cards,
  loading,
  total = null,
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  source,
  searchValue,
  onSearchChange,
  filters,
  onFiltersChange,
  sortOrder,
  onSortOrderChange,
  onRunFinder,
  onClearFinder,
  finderSearching = false,
  finderResultCount = null,
  onSelect,
  error = null,
  analyzing = false,
  analyzingCard,
}: CommanderStageProps) {
  /**
   * The analysing state is the chosen commander at full size and nothing else.
   * It used to be a spinner in a tinted box while the card you had just picked
   * vanished off screen.
   */
  if (analyzing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-10">
        {analyzingCard && (
          <div className="animate-pulse motion-reduce:animate-none">
            <CardImage card={analyzingCard} size="xl" eager hideFlip />
          </div>
        )}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:hidden" />
            Reading {analyzingCard?.name ?? 'your commander'}
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Matching the rules text against known archetypes to work out what this deck wants to
            do.
          </p>
        </div>
      </div>
    );
  }

  return (
    <CommanderWall
      cards={cards}
      loading={loading}
      error={error}
      total={total}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      filters={filters}
      onFiltersChange={onFiltersChange}
      sortOrder={sortOrder}
      onSortOrderChange={onSortOrderChange}
      onRunFinder={onRunFinder}
      onClearFinder={onClearFinder}
      finderSearching={finderSearching}
      finderResultCount={finderResultCount}
      sizeKey="ai-builder-commanders"
      defaultSize={168}
      heading={SOURCE_LABEL[source]}
      headingHint={source === 'popular' ? 'in EDHREC play order' : undefined}
      /* No ring: a click here moves to the next step, so there is nothing left
         on screen to mark. New Deck keeps you here and does show one. */
      onSelect={onSelect}
      selectVerb="Build a deck for"
    />
  );
}

export default CommanderStage;
