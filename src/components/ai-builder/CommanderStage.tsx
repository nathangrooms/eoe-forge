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
import { Loader2, Search, SlidersHorizontal, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countActiveFilters, describeFilters, type CommanderFilters } from './commander-query';

/**
 * Choosing a commander, as a wall of commanders.
 *
 * The old step 1 put twelve cards in a bordered box under a heading and a
 * search field, then buried a second, differently-styled results grid inside
 * the finder card below it. A commander is the single most consequential choice
 * in the whole flow and it is a *picture* — so this stage is one full-bleed
 * grid of full card images at whatever size the player likes, and everything
 * else (search, filters, sort) is chrome above it or in the right-hand panel.
 */

export type CommanderSource = 'popular' | 'search' | 'finder';

export interface CommanderStageProps {
  cards: any[];
  loading: boolean;
  loadingMore?: boolean;
  /** Total matches Scryfall reported, when it reported one. */
  total?: number | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  source: CommanderSource;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: CommanderFilters;
  onOpenFinder: () => void;
  onClearFinder: () => void;
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
 * Scryfall answers with 175 cards a page and every one of them was mounted at
 * once: 11,397px of grid, 175 `<img>` elements and — because the browser
 * pre-loads well ahead of the viewport — several megabytes of art for a screen
 * that shows ten cards. The rows are revealed as the reader reaches them, and
 * only when the window has caught up with everything already fetched does the
 * next Scryfall page get asked for. Two "load more" affordances collapse into
 * one continuous list.
 */
const WINDOW_SIZE = 30;

export function CommanderStage({
  cards,
  loading,
  loadingMore = false,
  total = null,
  hasMore = false,
  onLoadMore,
  source,
  searchValue,
  onSearchChange,
  filters,
  onOpenFinder,
  onClearFinder,
  onSelect,
  error = null,
  analyzing = false,
  analyzingCard,
}: CommanderStageProps) {
  const [cardWidth, setCardWidth] = useCardSize('ai-builder-commanders', 190);
  const activeFilters = countActiveFilters(filters);
  const filterSummary = describeFilters(filters);

  /**
   * `large` is a 672px scan. At the sizes this grid actually renders — 190px by
   * default, 218px once `1fr` stretches the track — that is four times the
   * pixels a 2× display can resolve, paid once per commander across a wall of
   * them. `normal` (488px) still over-samples every size below `xl`, which is
   * the only token this drops through to the default ladder for.
   */
  const imageQuality = cardSizeForWidth(cardWidth) === 'xl' ? undefined : ('normal' as const);

  /* ------------------------------------------------------------ windowing */

  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  /*
   * A fresh result set starts the window over. Keyed on `loading` rather than
   * on the array itself: `loadMore` appends, producing a new array on every
   * page, and resetting there would make the list unable to grow past one
   * window. Only a new *run* raises `loading`.
   */
  useEffect(() => {
    setWindowSize(WINDOW_SIZE);
  }, [source, searchValue, loading]);

  const shown = useMemo(() => cards.slice(0, windowSize), [cards, windowSize]);
  const moreToReveal = windowSize < cards.length;
  /** Something left to show, whether it is already in memory or still at Scryfall. */
  const canExtend = moreToReveal || hasMore;

  const extendRef = useRef<() => void>(() => {});
  extendRef.current = () => {
    if (moreToReveal) setWindowSize(current => current + WINDOW_SIZE);
    else if (hasMore && !loadingMore) onLoadMore?.();
  };

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canExtend) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) extendRef.current();
      },
      // 400px, not the 800 the precon grid uses. A commander row is ~265px
      // tall, so a wider margin trips twice on first paint and the window
      // settles at 60 cards before the reader has scrolled at all.
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canExtend, windowSize, cards.length]);

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
    <div className="space-y-4">
      {/* Control strip — search, finder, sizing. Full width, no box. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
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

        <Button
          variant={activeFilters > 0 ? 'default' : 'secondary'}
          onClick={onOpenFinder}
          className="h-11"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Commander finder
          {activeFilters > 0 && (
            <span className="ml-2 rounded bg-background/25 px-1.5 py-0.5 text-xs tabular-nums">
              {activeFilters}
            </span>
          )}
        </Button>

        <CardSizeSlider
          storageKey="ai-builder-commanders"
          value={cardWidth}
          onValueChange={setCardWidth}
          showValue={false}
          className="hidden lg:flex"
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
        {total !== null && total > 0 && (
          // "30 of 3,411" alone reads as "only 30 matched". The grid is
          // windowed now, so it has to say which of the two numbers is which.
          <span className="text-xs tabular-nums text-muted-foreground">
            Showing {shown.length} of {total.toLocaleString()}
          </span>
        )}
        {source === 'finder' && (
          <Button variant="ghost" size="sm" onClick={onClearFinder} className="h-7">
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <CardGridSkeleton width={cardWidth} count={18} />
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
          {shown.map((card: any, i: number) => (
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
                eager={i < 12}
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

      {!loading && cards.length > 0 && canExtend && (
        // Doubles as the observer target and a real control, so the list still
        // grows where the observer is throttled or never fires.
        <div ref={sentinel} className="flex justify-center pt-2">
          <Button
            variant="secondary"
            onClick={() => extendRef.current()}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : moreToReveal ? (
              `Show ${Math.min(WINDOW_SIZE, cards.length - windowSize)} more`
            ) : (
              'Load more commanders'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default CommanderStage;
