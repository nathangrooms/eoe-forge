import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CardImage,
  CardGrid,
  CardGridSkeleton,
  CardSizeSlider,
  cardSizeForWidth,
  useCardSize,
} from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Loader2, Search, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pager } from '@/components/ui/pagination';
import { CommanderFinder } from './CommanderFinder';
import { countActiveFilters, describeFilters, type CommanderFilters } from './commander-query';

/**
 * Choosing a commander — the finder and the results, side by side, on the page.
 *
 * Two versions ago this step put twelve cards in a bordered box under a heading
 * and buried a second, differently-styled results grid inside a finder card
 * below it. The fix moved the filters into a right-hand slide-out and gave the
 * grid the whole screen, which over-corrected: the first step of the flow
 * became an undifferentiated wall of 175 commanders with its only real control
 * hidden behind a button. Owner: *"doesn't need to show so many cards, worked
 * better when commander finder was actually on the screen not a right menu."*
 *
 * So: the finder is a rail on the page, the wall starts at one screen's worth
 * of commanders rather than six, and it grows on request.
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

/**
 * Cards drawn per window.
 *
 * Scryfall answers with 175 cards a page and every one of them used to be
 * mounted at once: 11,397px of grid, 175 `<img>` elements and — because the
 * browser pre-loads well ahead of the viewport — several megabytes of art for a
 * screen that shows ten cards. Windowing fixed the cost; twelve rather than
 * thirty fixes the *volume*, which is what the owner was actually looking at.
 * One screen of commanders, then more only if you ask.
 */
const WINDOW_SIZE = 12;

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
  const [cardWidth, setCardWidth] = useCardSize('ai-builder-commanders', 168);
  const activeFilters = countActiveFilters(filters);
  const filterSummary = describeFilters(filters);

  /**
   * `large` is a 672px scan. At the sizes this grid actually renders that is
   * four times the pixels a 2× display can resolve, paid once per commander
   * across a wall of them. `normal` (488px) still over-samples every size below
   * `xl`, which is the only token this drops through to the default ladder for.
   */
  const imageQuality = cardSizeForWidth(cardWidth) === 'xl' ? undefined : ('normal' as const);

  /** A page turn starts at the top of the wall. */
  const wallTop = useRef<HTMLDivElement | null>(null);
  const goToPage = (next: number) => {
    onPageChange(next);
    const top = wallTop.current;
    if (!top) return;
    const y = top.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  };

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
            Matching the rules text against known archetypes to work out what this
            deck wants to do.
          </p>
        </div>
      </div>
    );
  }

  return (
    /* FILTERS ACROSS THE TOP, COMMANDERS UNDERNEATH AT FULL WIDTH.

       This was a 19rem sticky sidebar with the results squeezed into what was
       left, which at 1280 showed barely two commanders beside a column of chips.
       Owner: "Deck generator filter should be at the top" and "should be more
       like new deck page". The new deck page is right: its configuration is a
       horizontal row and the commander wall gets the whole width, which is what
       you are actually looking at.

       The filters read as one row of controls rather than a panel competing
       with the cards for attention. */
    <div className="space-y-4">
      <CommanderFinder
        filters={filters}
        onFiltersChange={onFiltersChange}
        sortOrder={sortOrder}
        onSortOrderChange={onSortOrderChange}
        onSearch={onRunFinder}
        onClear={onClearFinder}
        searching={finderSearching}
        resultCount={finderResultCount}
      />

      <div className="min-w-0 space-y-4">
        {/* Name search and sizing. Full width of the results column, no box. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search commanders, partners and backgrounds…"
              className="h-11 border-0 bg-muted/50 pl-9 pr-9 text-base shadow-none focus-visible:ring-1"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <CardSizeSlider
            storageKey="ai-builder-commanders"
            value={cardWidth}
            onValueChange={setCardWidth}
            showValue={false}
            className="hidden xl:flex"
          />
        </div>

        {/* What the grid is showing, and why. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {source === 'popular' && <TrendingUp className="h-4 w-4 text-muted-foreground" />}
            {SOURCE_LABEL[source]}
          </h2>
          {source === 'popular' && (
            <span className="text-xs text-muted-foreground">in EDHREC play order</span>
          )}
          {source === 'finder' && filterSummary && (
            <Badge variant="secondary" className="font-normal">
              {filterSummary}
            </Badge>
          )}
          {/* The count and the range live in the pager below, which is the one
              place that knows whether Scryfall reported a total at all. */}
          {source === 'finder' && activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearFinder} className="h-7">
              Clear filters
            </Button>
          )}
        </div>

        {error && <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{error}</p>}

        <div ref={wallTop} className="h-px" aria-hidden />

        {loading ? (
          <CardGridSkeleton width={cardWidth} count={Math.min(pageSize, 12)} />
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <Search className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {source === 'search'
                ? `No commanders match “${searchValue}”.`
                : 'No commanders match those filters. Try removing one.'}
            </p>
          </div>
        ) : (
          <CardGrid width={cardWidth}>
            {cards.map((card: any, i: number) => (
              <button
                key={card.id ?? card.name}
                type="button"
                onClick={() => onSelect(card)}
                className={cn(
                  'group/pick block w-full text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
                title={`Build a deck for ${card.name}`}
              >
                <CardImage
                  card={card}
                  width={cardWidth}
                  quality={imageQuality}
                  fill
                  interactive
                  eager={i < 8}
                  hideFlip
                >
                  {/* Sits on card art, so light-on-dark is correct here. */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-200 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.7rem] font-semibold text-white">
                        {card.name}
                      </span>
                      {typeof card.edhrec_rank === 'number' && (
                        <span className="block text-[0.65rem] tabular-nums text-white/70">
                          EDHREC #{card.edhrec_rank.toLocaleString()}
                        </span>
                      )}
                    </span>
                    <ColorIdentity colors={card.color_identity} size="xs" />
                  </span>
                </CardImage>
              </button>
            ))}
          </CardGrid>
        )}

        {!loading && cards.length > 0 && (
          <Pager
            page={page}
            pageCount={pageCount}
            onPageChange={goToPage}
            total={total}
            shown={cards.length}
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            noun="commander"
            label="Commander pages"
          />
        )}

      </div>
    </div>
  );
}

export default CommanderStage;
